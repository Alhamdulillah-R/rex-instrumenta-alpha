package plugintool

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

//go:embed sdk
var sdkFS embed.FS

// handler 服务 /plugins/* :
//   /plugins/__sdk__/<file>  → 内嵌 SDK(monet.css / rex-plugin.js / vue.js / DOC.md)
//   /plugins/<id>/<path>     → 磁盘上该插件文件夹(以文件夹为根 = 工作目录)
type handler struct {
	mgr *manager
	sdk http.Handler
}

func newHandler(mgr *manager) *handler {
	sub, _ := fs.Sub(sdkFS, "sdk")
	return &handler{mgr: mgr, sdk: http.FileServer(http.FS(sub))}
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/plugins/") {
		http.NotFound(w, r)
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/plugins/")

	// ─── 内嵌 SDK ───
	if strings.HasPrefix(rest, "__sdk__/") {
		sdkPath := strings.TrimPrefix(rest, "__sdk__/")
		if sdkPath == "vue.js" {
			sdkPath = "vue.global.prod.js" // 友好别名
		}
		r.URL.Path = "/" + sdkPath
		h.sdk.ServeHTTP(w, r)
		return
	}

	// ─── 插件文件: /plugins/<id>/<path> ───
	slash := strings.IndexByte(rest, '/')
	if slash <= 0 {
		http.NotFound(w, r)
		return
	}
	id := rest[:slash]
	file := rest[slash+1:]
	if id == "" || strings.Contains(id, "..") {
		http.NotFound(w, r)
		return
	}

	base := filepath.Join(h.mgr.root(), id)
	// path.Clean 去掉 ../ 后再 join, 并做前缀 jail 防越界读盘
	target := filepath.Join(base, filepath.FromSlash(path.Clean("/"+file)))
	if target != base && !strings.HasPrefix(target, base+string(os.PathSeparator)) {
		http.NotFound(w, r)
		return
	}

	if info, err := os.Stat(target); err == nil && info.IsDir() {
		target = filepath.Join(target, "index.html")
	}

	// 用 ServeContent 而非 ServeFile —— ServeFile 对 /index.html 会 301 重定向到目录, iframe 里多一跳;
	// ServeContent 直接给内容(Content-Type 按扩展名自动设).
	f, err := os.Open(target)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

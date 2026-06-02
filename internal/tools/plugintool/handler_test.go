package plugintool

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func serve(h http.Handler, target string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", target, nil))
	return w
}

func TestHandler_ServesSDK(t *testing.T) {
	h := newHandler(newManager())

	css := serve(h, "/plugins/__sdk__/monet.css")
	if css.Code != http.StatusOK {
		t.Fatalf("monet.css status %d", css.Code)
	}
	if !strings.Contains(css.Body.String(), "--rex-primary") {
		t.Fatal("monet.css 未含 --rex-primary")
	}

	// vue.js 别名 → vue.global.prod.js
	vue := serve(h, "/plugins/__sdk__/vue.js")
	if vue.Code != http.StatusOK || vue.Body.Len() < 1000 {
		t.Fatalf("vue.js status %d len %d", vue.Code, vue.Body.Len())
	}

	js := serve(h, "/plugins/__sdk__/rex-plugin.js")
	if js.Code != http.StatusOK || !strings.Contains(js.Body.String(), "RexPlugin") {
		t.Fatalf("rex-plugin.js status %d", js.Code)
	}
}

func TestHandler_ServesPluginFile(t *testing.T) {
	m := newManager()
	m.dir = filepath.Join(t.TempDir(), "plugins")
	if err := os.MkdirAll(filepath.Join(m.dir, "demo"), 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(m.dir, "demo", "index.html"), []byte("<h1>hi plugin</h1>"), 0o644)

	h := newHandler(m)
	w := serve(h, "/plugins/demo/index.html")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "hi plugin") {
		t.Fatalf("插件文件 status %d body %q", w.Code, w.Body.String())
	}

	// 目录请求 → index.html
	wd := serve(h, "/plugins/demo/")
	if wd.Code != http.StatusOK || !strings.Contains(wd.Body.String(), "hi plugin") {
		t.Fatalf("目录默认 index 失败 status %d", wd.Code)
	}
}

func TestHandler_BlocksTraversal(t *testing.T) {
	m := newManager()
	base := t.TempDir()
	m.dir = filepath.Join(base, "plugins")
	os.MkdirAll(filepath.Join(m.dir, "demo"), 0o755)
	os.WriteFile(filepath.Join(base, "secret.txt"), []byte("SECRET"), 0o644)

	h := newHandler(m)
	w := serve(h, "/plugins/demo/../../secret.txt")
	if w.Code == http.StatusOK && strings.Contains(w.Body.String(), "SECRET") {
		t.Fatal("路径穿越未被拦截, 读到了 plugins 目录外的文件")
	}
}

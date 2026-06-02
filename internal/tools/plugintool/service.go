// Package plugintool 实现插件系统: 用户导入一个静态站文件夹, 整棵拷进 app 自管的
// plugins 目录, 通过 AssetServer Handler 以该文件夹为根(=工作目录)在 /plugins/<id>/ 提供服务,
// 前端用 iframe 渲染. 另暴露 /plugins/__sdk__/ 的莫奈 CSS + Vue + 运行时, 供插件复用同色系与 Vue.
package plugintool

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ImportResult / RemoveResult 把最新插件列表 + 可能的错误一起回前端.
type ImportResult struct {
	Plugins []Plugin `json:"plugins"`
	NewID   string   `json:"newId"`
	Error   string   `json:"error,omitempty"`
}

type RemoveResult struct {
	Plugins []Plugin `json:"plugins"`
	Error   string   `json:"error,omitempty"`
}

// Service 是 Wails 绑定 + 插件文件服务的入口.
type Service struct {
	ctx context.Context
	mgr *manager
}

func New() *Service {
	return &Service{mgr: newManager()}
}

// Startup 由 Wails 回调: 存 ctx, 在用户配置目录下建 plugins 根并加载清单.
func (s *Service) Startup(ctx context.Context) {
	s.ctx = ctx
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		base, _ = os.Getwd()
	}
	_ = s.mgr.init(filepath.Join(base, "RexInstrumenta"))
}

// Import 弹目录对话框, 把选中的文件夹导入(拷贝)成一个插件.
// 用户取消 → 返回当前列表、无错.
func (s *Service) Import() ImportResult {
	dir, err := runtime.OpenDirectoryDialog(s.ctx, runtime.OpenDialogOptions{
		Title: "选择插件文件夹(需含 index.html)",
	})
	if err != nil {
		return ImportResult{Plugins: s.mgr.list(), Error: "打开目录失败: " + err.Error()}
	}
	if dir == "" {
		return ImportResult{Plugins: s.mgr.list()}
	}

	p, err := s.mgr.importDir(dir)
	if err != nil {
		return ImportResult{Plugins: s.mgr.list(), Error: err.Error()}
	}
	return ImportResult{Plugins: s.mgr.list(), NewID: p.ID}
}

// List 返回已导入插件.
func (s *Service) List() []Plugin {
	return s.mgr.list()
}

// Remove 删除插件, 返回最新列表.
func (s *Service) Remove(id string) RemoveResult {
	if err := s.mgr.remove(id); err != nil {
		return RemoveResult{Plugins: s.mgr.list(), Error: err.Error()}
	}
	return RemoveResult{Plugins: s.mgr.list()}
}

// Middleware 拦截 /plugins/* 自己服务, 其余放行给 Wails 资源 handler.
// 必须用 Middleware 而非 AssetServer.Handler —— Handler 只在资源 404 时才触发, 但前端 SPA
// 有 index.html 兜底, /plugins/<id>/index.html 会被当成 SPA 路由返回 app 自己(iframe 里就出现
// "导入的插件是 app 本身"). Middleware 在资源服务之前拦截, 才能真正服务到插件文件.
func (s *Service) Middleware() func(http.Handler) http.Handler {
	h := newHandler(s.mgr)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/plugins/") {
				h.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

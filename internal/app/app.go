package app

import (
	"context"
	"runtime"
	"sync/atomic"

	"github.com/wailsapp/wails/v2/pkg/options"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// AppMeta 暴露给前端的应用元信息, 供 TopBar / 关于面板展示.
type AppMeta struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	GoVersion string `json:"goVersion"`
}

// App 持有应用生命周期上下文, 作为 Wails 顶层绑定. 后续平台级窗口控制也挂这里.
type App struct {
	ctx      context.Context
	name     string
	version  string
	quitting atomic.Bool
}

// New 创建 App 实例.
// @param name    应用展示名
// @param version 版本号
// @return App 实例
func New(name, version string) *App {
	return &App{name: name, version: version}
}

// Startup 由 Wails 在窗口就绪时回调, 保存 ctx 以便后续调用 runtime 方法.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// RequestQuit 由托盘"退出"菜单调用: 先置退出标志再真正结束进程.
// 必须先置标志 —— 否则 Quit 触发的 OnBeforeClose 又把窗口收回托盘, 永远退不出.
func (a *App) RequestQuit() {
	a.quitting.Store(true)
	wailsruntime.Quit(a.ctx)
}

// ShouldHideOnClose 报告关闭窗口时是否收起到托盘(true)而非真正退出.
// 托盘"退出"已置 quitting → 返回 false, 放行退出.
func (a *App) ShouldHideOnClose() bool {
	return !a.quitting.Load()
}

// OnSecondInstance 单实例锁回调: 再次启动本程序时, 把已有窗口(可能最小化或已收起托盘)拉回前台.
func (a *App) OnSecondInstance(_ options.SecondInstanceData) {
	wailsruntime.WindowUnminimise(a.ctx)
	wailsruntime.WindowShow(a.ctx)
}

// Meta 返回应用名 / 版本 / Go 版本.
func (a *App) Meta() AppMeta {
	return AppMeta{
		Name:      a.name,
		Version:   a.version,
		GoVersion: runtime.Version(),
	}
}

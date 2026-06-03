package main

import (
	"context"
	"embed"

	"rex-instrumenta-alpha/internal/app"
	"rex-instrumenta-alpha/internal/platform"
	"rex-instrumenta-alpha/internal/tools/jsonstore"
	"rex-instrumenta-alpha/internal/tools/jsontool"
	"rex-instrumenta-alpha/internal/tools/plugintool"
	"rex-instrumenta-alpha/internal/tray"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/trayicon.ico
var trayIcon []byte

const (
	appName    = "Rex Instrumenta"
	appVersion = "0.1.0-alpha"
)

// main 组装平台服务并启动 Wails. 新增工具 = 在这里多绑一个 service struct.
func main() {
	application := app.New(appName, appVersion)
	platformSvc := platform.New()
	jsonSvc := jsontool.New()
	jsonStoreSvc := jsonstore.New()
	pluginSvc := plugintool.New()

	err := wails.Run(&options.App{
		Title:     appName + " α",
		Width:     1280,
		Height:    860,
		MinWidth:  960,
		MinHeight: 640,
		// 无边框 — 顶部用前端自绘标题栏(可拖拽 + 自定义窗口控制), Win11 圆角由 DWM 自动给
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
			// 用 Middleware 在资源服务前拦截 /plugins/*(Handler 只在 404 时调, 会被 SPA index.html 兜底抢走)
			Middleware: pluginSvc.Middleware(),
		},
		// 莫奈三 dark bg #0f0f1a — 防止启动白屏闪烁
		BackgroundColour: &options.RGBA{R: 15, G: 15, B: 26, A: 1},
		OnStartup: func(ctx context.Context) {
			application.Startup(ctx)
			platformSvc.Startup(ctx)
			jsonStoreSvc.Startup(ctx)
			pluginSvc.Startup(ctx)
			tray.Start(ctx, trayIcon, appName, application.RequestQuit)
		},
		// 点关闭默认收起到托盘(不退出); 仅当托盘"退出"已置 quitting 标志时放行, 真正结束进程
		OnBeforeClose: func(ctx context.Context) bool {
			if application.ShouldHideOnClose() {
				wailsruntime.WindowHide(ctx)
				return true
			}
			return false
		},
		// 单实例: 再次启动本程序不开新窗口, 而是把已有实例窗口拉回前台(见 App.OnSecondInstance)
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "com.rex.instrumenta-alpha",
			OnSecondInstanceLaunch: application.OnSecondInstance,
		},
		Bind: []interface{}{
			application,
			platformSvc,
			jsonSvc,
			jsonStoreSvc,
			pluginSvc,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}

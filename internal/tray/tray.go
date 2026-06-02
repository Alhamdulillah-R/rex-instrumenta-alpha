// Package tray 在 Wails 旁挂一个系统托盘图标. 用 energye/systray 的 RunWithExternalLoop
// 拿非阻塞 start, 不抢 Wails 主事件循环 —— 关闭窗口收起到托盘, 托盘菜单才真正退出.
package tray

import (
	"context"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Start 启动托盘. 在 Wails OnStartup 里调一次.
// @param ctx     Wails runtime ctx(窗口显示/退出要用)
// @param icon    .ico 字节(Windows 托盘需 ICO 格式)
// @param appName 托盘标题 / tooltip
// @param onQuit  托盘"退出"菜单回调(应置退出标志并结束进程)
func Start(ctx context.Context, icon []byte, appName string, onQuit func()) {
	onReady := func() {
		if len(icon) > 0 {
			systray.SetIcon(icon)
		}
		systray.SetTitle(appName)
		systray.SetTooltip(appName)

		mShow := systray.AddMenuItem("显示主窗口", "show main window")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("退出", "quit")

		mShow.Click(func() { runtime.WindowShow(ctx) })
		// 退出: 先走 onQuit(置 quitting 标志 + Quit 真正结束进程), 再移除托盘图标
		mQuit.Click(func() {
			onQuit()
			systray.Quit()
		})

		// 左键点托盘图标恢复主窗口
		systray.SetOnClick(func(_ systray.IMenu) { runtime.WindowShow(ctx) })
	}

	start, _ := systray.RunWithExternalLoop(onReady, func() {})
	start()
}

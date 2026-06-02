import { isWails } from './native'
import {
  WindowMinimise,
  WindowToggleMaximise,
  WindowSetBackgroundColour,
  Quit,
} from '@bindings/runtime/runtime'

/**
 * 窗口控制封装 —— 无边框标题栏的最小化/最大化/关闭走 Wails runtime.
 * 浏览器预览(无 Wails)下静默 no-op, 不报错.
 */
export const appWindow = {
  minimize(): void {
    if (isWails()) WindowMinimise()
  },
  toggleMaximize(): void {
    if (isWails()) WindowToggleMaximise()
  },
  // 关闭 —— Go 侧 OnBeforeClose 会拦截改成收起到托盘(托盘菜单才真正退出)
  close(): void {
    if (isWails()) Quit()
  },
  // 把窗口背景同步成主题色 —— frameless 窗口边缘露出的底色随主题, 消除 light 下的黑边
  setBackground(r: number, g: number, b: number): void {
    if (isWails()) WindowSetBackgroundColour(r, g, b, 255)
  },
}

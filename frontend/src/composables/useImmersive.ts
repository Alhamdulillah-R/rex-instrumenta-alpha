import { ref } from 'vue'

/**
 * 沉浸模式(全屏看 JSON 树)的 app 级单例状态.
 * 模块级 ref → 各组件共享同一份: JsonToolView 收 tabs、App 收导航栏与工具标题、
 * ParsePane 收输入/浮搜索框/把 actions teleport 到标题栏、TitleBar 接收这些 actions.
 */
const immersive = ref(false)

// 沉浸切换是一段 ~500ms 的布局动画(--rex-motion-emphasized), 期间 canvas 容器尺寸每帧变.
// 发一个冻结信号: canvas 渲染器据此在动画期间钉住尺寸、不每帧重建后备缓冲(否则按 Q 巨卡),
// 动画结束后只 resize 一次. 普通窗口拖拽不发此信号, 照常实时跟随.
const FREEZE_MS = 560

function signalTransition(): void {
  window.dispatchEvent(new CustomEvent('rex-canvas-freeze', { detail: { ms: FREEZE_MS } }))
}

export function useImmersive() {
  function enter() {
    if (immersive.value) return
    immersive.value = true
    signalTransition()
  }
  function exit() {
    if (!immersive.value) return
    immersive.value = false
    signalTransition()
  }
  function toggle() {
    immersive.value = !immersive.value
    signalTransition()
  }
  return { immersive, enter, exit, toggle }
}

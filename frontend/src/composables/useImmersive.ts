import { ref } from 'vue'

/**
 * 沉浸模式(全屏看 JSON 树)的 app 级单例状态.
 * 模块级 ref → 各组件共享同一份: JsonToolView 收 tabs、App 收导航栏与工具标题、
 * ParsePane 收输入/浮搜索框/把 actions teleport 到标题栏、TitleBar 接收这些 actions.
 */
const immersive = ref(false)

export function useImmersive() {
  function enter() {
    immersive.value = true
  }
  function exit() {
    immersive.value = false
  }
  function toggle() {
    immersive.value = !immersive.value
  }
  return { immersive, enter, exit, toggle }
}

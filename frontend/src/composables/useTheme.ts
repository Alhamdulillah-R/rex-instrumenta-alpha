import { computed, watch } from 'vue'
import { useTheme } from 'vuetify'
import { appWindow } from '@/platform/window'

const STORAGE_KEY = 'ria-theme'
export const THEME_SYNC_EVENT = 'rex-theme-sync'
export type ThemeName = 'rexDark' | 'rexLight'

interface RevealOrigin {
  x: number
  y: number
}

// startViewTransition 是 Chromium 111+ 能力(WebView2 evergreen 支持). 类型上 DOM lib 可能没声明.
type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { ready: Promise<void>; finished: Promise<void> }
}

// ─── 揭示过渡的模块级单例状态 ───
// View Transitions 是文档级的, 全局同时只能有一个 active transition, 故状态放模块级而非闭包.
// 动画进行中再次点击 → 反转当前圆"退回"(reverseReveal), 而不是再起 transition(会被 API skip → 瞬闪).
let revealBusy = false // 一次揭示过渡生命周期内为 true(同步置位, 拦截并发点击)
let revealAnim: Animation | null = null // 揭示 clip-path 动画句柄(transition.ready 后才创建)
let revealToDark = false // 当前揭示动画的目标主题是暗色? reverse 时翻转, 决定真实主题切回哪边

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * useAppTheme 包一层 Vuetify theme: 暴露 isDark + 切换 + 持久化 + Telegram 圆形揭示动效.
 * 关键: 把 .rex-theme--* 同步到 document.documentElement —— CSS 自定义属性会继承,
 * teleport 到 body 的内容(右键菜单等)也拿得到 --rex-* 变量.
 */
export function useAppTheme() {
  const theme = useTheme()
  const isDark = computed(() => theme.global.current.value.dark)

  function syncRootClass(dark: boolean) {
    const root = document.documentElement
    root.classList.toggle('rex-theme--dark', dark)
    root.classList.toggle('rex-theme--light', !dark)
  }
  function syncWindowBg(dark: boolean) {
    if (dark) appWindow.setBackground(15, 15, 26)
    else appWindow.setBackground(248, 251, 255)
  }
  // 初始 + 后续主题变化都同步 root class 与窗口背景(消除 frameless 边缘黑边)
  watch(
    isDark,
    (dark) => {
      syncRootClass(dark)
      syncWindowBg(dark)
    },
    { immediate: true },
  )

  function setTheme(name: ThemeName) {
    theme.global.name.value = name
    localStorage.setItem(STORAGE_KEY, name)
    // 同步切 root class, 让 CSS 变量立即生效; 再同步通知 canvas 渲染器立即重绘(读新色)
    const dark = name === 'rexDark'
    syncRootClass(dark)
    window.dispatchEvent(new Event(THEME_SYNC_EVENT))
    syncWindowBg(dark)
  }

  /**
   * reverseReveal 在揭示动画进行中再次点击时调用: 反转当前圆的方向(放大↔收缩), 让它沿原圆心
   * "退回", 同时把真实主题切回. 关键: 不动 data-theme-reveal 的 z-index 叠放 —— 两层快照在
   * transition 开始时已定死, 上层那个圆收缩回去自然露出底层, 即与动画终态一致, 无需翻转叠放.
   */
  function reverseReveal() {
    revealAnim!.reverse()
    setTheme(revealToDark ? 'rexLight' : 'rexDark')
    revealToDark = !revealToDark
  }

  /**
   * toggleTheme 切换主题. 给了点击坐标且浏览器支持 View Transitions 时, 做 Telegram 式
   * 圆形揭示: 切暗 → 新主题从点击点放大铺满; 切亮 → 旧主题圆收缩到点击点露出新主题.
   * 动画未结束时再次点击 → 反转当前圆"退回"(见 reverseReveal), 来回拉扯不瞬闪.
   * 不支持 / reduce-motion / 无坐标 → 直接瞬切.
   * @param origin 揭示圆心(通常是主题按钮的点击坐标)
   */
  function toggleTheme(origin?: RevealOrigin) {
    const doc = document as ViewTransitionDoc
    const canReveal = !!origin && typeof doc.startViewTransition === 'function' && !prefersReducedMotion()

    // 揭示过渡进行中再次点击:
    //   anim 已就绪(动画可见期, 主场景) → 反转, 沿原圆心退回;
    //   anim 未就绪(ready 还没 resolve 的极短窗口) → 安全忽略, 不再起 transition(否则被 API skip → 瞬闪).
    if (revealBusy) {
      if (revealAnim) reverseReveal()
      return
    }

    const next: ThemeName = isDark.value ? 'rexLight' : 'rexDark'
    if (!canReveal) {
      setTheme(next)
      return
    }

    const goingDark = next === 'rexDark'
    const { x, y } = origin!
    revealToDark = goingDark
    revealBusy = true

    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const root = document.documentElement
    root.dataset.themeReveal = goingDark ? 'expand' : 'shrink'

    // done 幂等: onfinish 与 transition.finished 都可能触发, 重复清理无害
    const done = () => {
      revealBusy = false
      revealAnim = null
      delete root.dataset.themeReveal
    }

    // 回调必须同步! 快照准备期 await 会死锁卡死. setTheme 内同步切 class + 派发 rex-theme-sync,
    // 让 canvas 立即重绘, 新快照里所有内容(含 canvas)都是新主题.
    const transition = doc.startViewTransition!(() => {
      setTheme(next)
    })

    transition.ready
      .then(() => {
        const small = `circle(0px at ${x}px ${y}px)`
        const full = `circle(${endRadius}px at ${x}px ${y}px)`
        // 暗: new(暗)圆放大铺满; 亮: old(亮)圆收缩露出底层 new(亮). 叠放由 data-theme-reveal 的 z-index 定.
        const frames = goingDark ? [small, full] : [full, small]
        revealAnim = root.animate(
          { clipPath: frames },
          {
            duration: 480,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            // both: 正向完成保持 full、反向(reverse 退回)完成保持 small —— 两端都不回弹整圆, 消除结尾闪一帧
            fill: 'both',
            pseudoElement: goingDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
          },
        )
        revealAnim.onfinish = done // 动画停在任一端点(正向 full / 反向 small)→ 收尾
      })
      .catch(done) // ready reject(并发已被 revealBusy 拦截, 理论不达)→ 兜底收尾防卡死

    transition.finished.finally(done) // transition 整体结束(撤快照)双保险
  }

  return { isDark, setTheme, toggleTheme }
}

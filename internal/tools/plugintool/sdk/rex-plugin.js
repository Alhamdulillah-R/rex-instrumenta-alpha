/* Rex Instrumenta — plugin SDK runtime.
 * <script src="/plugins/__sdk__/rex-plugin.js"></script>
 * 负责: 跟宿主同步明暗主题(在 <html> 上切 .rex-dark / .rex-light), 暴露 window.RexPlugin.
 */
(function () {
  function applyTheme(dark) {
    var r = document.documentElement
    r.classList.toggle('rex-dark', !!dark)
    r.classList.toggle('rex-light', !dark)
  }

  // 默认暗色, 等宿主推真实主题
  applyTheme(true)

  window.addEventListener('message', function (e) {
    var d = e.data
    if (d && d.type === 'rex-theme') applyTheme(!!d.dark)
  })

  // 通知宿主已就绪, 宿主收到后回推当前主题
  try {
    parent.postMessage({ type: 'rex-plugin-ready' }, '*')
  } catch (err) {
    /* 顶层打开时无 parent, 忽略 */
  }

  window.RexPlugin = {
    applyTheme: applyTheme,
    isDark: function () {
      return document.documentElement.classList.contains('rex-dark')
    },
    /** onTheme(cb): 主题变化回调, cb(dark:boolean). */
    onTheme: function (cb) {
      window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'rex-theme') cb(!!e.data.dark)
      })
    },
  }
})()

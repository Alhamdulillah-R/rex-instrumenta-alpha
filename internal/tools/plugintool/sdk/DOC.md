# Rex Instrumenta 插件开发文档

插件就是一个**静态网站文件夹**(含 `index.html`)。在 app 里「Plugins → 导入插件」选中文件夹,
它会被整棵拷进 app 自管的 plugins 目录,并在 iframe 中渲染。**该文件夹就是工作目录**,
`index.html` 里的相对路径(`./style.css`、`./js/app.js`、`./img/a.png`)都正常解析。

## 最小结构

```
my-plugin/
├── index.html      # 入口(必须)
├── style.css       # 可选
└── app.js          # 可选
```

## SDK(同色系 / Vue / 字体)

通过绝对路径引用内置 SDK(无需联网):

```html
<!-- 莫奈三同色系样式: 变量 + 卡片/按钮/chip/输入 等组件 -->
<link rel="stylesheet" href="/plugins/__sdk__/monet.css" />
<!-- 运行时: 自动跟宿主同步明暗主题, 暴露 window.RexPlugin -->
<script src="/plugins/__sdk__/rex-plugin.js"></script>
<!-- 可选: Vue 3 (global build), 写 Vue.createApp(...) -->
<script src="/plugins/__sdk__/vue.js"></script>
```

### 可用 CSS 变量(节选)

`--rex-bg` `--rex-surface` `--rex-surface-container` `--rex-primary` `--rex-on-surface`
`--rex-on-surface-variant` `--rex-error` `--rex-outline-variant` `--rex-radius-md/lg/full`
`--rex-font` `--rex-mono`。明暗主题由宿主推送、`rex-plugin.js` 在 `<html>` 切 `.rex-dark`/`.rex-light`,
变量随之变化,你用 `var(--rex-*)` 即自动跟随。

### 可用组件类

`rex-card` · `rex-btn` / `rex-btn--tonal` / `rex-btn--text` / `rex-btn--danger` ·
`rex-chip`(+ `.active`)· `rex-input` · `rex-textarea` · `rex-title` · `rex-muted` · `rex-mono`。

### 主题回调(JS)

```js
RexPlugin.onTheme((dark) => console.log('dark?', dark))
RexPlugin.isDark()
```

## 示例(原生)

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="/plugins/__sdk__/monet.css" />
  <script src="/plugins/__sdk__/rex-plugin.js"></script>
</head>
<body style="padding:24px">
  <h1 class="rex-title">我的工具</h1>
  <div class="rex-card">
    <input class="rex-input" placeholder="输入…" />
    <button class="rex-btn" style="margin-top:12px" onclick="alert('hi')">运行</button>
  </div>
</body>
</html>
```

## 示例(Vue)

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="/plugins/__sdk__/monet.css" />
  <script src="/plugins/__sdk__/rex-plugin.js"></script>
  <script src="/plugins/__sdk__/vue.js"></script>
</head>
<body style="padding:24px">
  <div id="app">
    <h1 class="rex-title">{{ msg }}</h1>
    <button class="rex-btn" @click="n++">点了 {{ n }} 次</button>
  </div>
  <script>
    Vue.createApp({
      data: () => ({ msg: 'Vue 插件', n: 0 }),
    }).mount('#app')
  </script>
</body>
</html>
```

字体已在 `monet.css` 里通过 `--rex-font` / `--rex-mono` 提供同款字族(系统回退),
直接 `font-family: var(--rex-font)` 即与宿主一致。

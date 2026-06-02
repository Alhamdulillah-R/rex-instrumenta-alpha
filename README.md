# Rex Instrumenta α

可扩展的桌面工具套件(Wails + Go + Vue3 + Vuetify),莫奈三(Material Design 3 Expressive)设计。
第一个内置工具是 **JSON 工具**:超高性能 canvas 树渲染,支持解析 / 折叠 / 搜索 / 复制 / 对比。

## 技术栈

- **后端**: Go 1.23+ / Wails v2 —— 文件对话框、剪贴板、结构化 JSON diff(大整数精度无损)
- **前端**: Vue 3 + TypeScript + Vuetify 3 + Vite —— 外壳 DOM,树渲染走 canvas
- **渲染核心**: 框架无关的 TS(`tools/json/core` + `render`),typed-array 展平模型 + canvas 虚拟渲染,百万节点不卡

## 目录结构

```
rex-instrumenta-alpha/
├── main.go                         # Wails 入口, 绑定各服务 (加工具 = 多绑一个 service)
├── internal/
│   ├── app/        app.go          # 应用生命周期 + 元信息
│   ├── platform/   platform.go     # 跨工具共享: 文件对话框 / 剪贴板
│   └── tools/
│       └── jsontool/               # JSON 工具的 Go 侧 (diff 引擎 + 测试)
│           ├── service.go  diff.go  value.go  diff_test.go
└── frontend/
    └── src/
        ├── main.ts  App.vue        # 引导 + 根外壳
        ├── plugins/vuetify.ts      # 莫奈三主题 (rexDark / rexLight)
        ├── router/                 # 路由由工具注册表生成
        ├── shell/                  # 平台外壳: SideNav / TopBar / 工具注册表
        │   ├── tool.ts             # ToolDef 接口
        │   └── registry.ts         # TOOLS[] —— 唯一扩展点
        ├── styles/                 # tokens(令牌) / base / shell
        ├── platform/native.ts      # Go 调用封装 (带浏览器预览 fallback)
        └── tools/
            └── json/               # JSON 工具 (自包含)
                ├── index.ts        # 工具注册声明
                ├── JsonToolView.vue
                ├── core/           # 框架无关: model / fold / search / stats / format (+ 单测)
                ├── render/         # canvas: TreeRenderer / DiffRenderer / viewport / theme / layout
                └── components/     # ParsePane / CompareView / 搜索栏 / 右键菜单 / 统计条 ...
```

## 开发 / 构建

```powershell
# 实时开发 (热重载)
wails dev

# 构建可分发的 .exe → build/bin/rex-instrumenta-alpha.exe
wails build

# 前端单测 (核心纯逻辑)
cd frontend ; npm run test

# Go 单测 (diff 引擎)
go test ./internal/...

# 仅前端浏览器预览 (无 Go 后端, diff 走提示兜底)
cd frontend ; npm run dev   # http://localhost:5180
```

## 扩展新工具

1. 在 `frontend/src/tools/<name>/` 建工具目录,导出 `ToolDef`(见 `tools/json/index.ts`)。
2. 在 `frontend/src/shell/registry.ts` 的 `TOOLS[]` 里 push 它 —— 侧边导航与路由自动包含。
3. 工具的 Go 侧服务放 `internal/tools/<name>/`,在 `main.go` 的 `Bind` 里多绑一个 struct。

`core/` 是框架无关的纯 TS(可单测),`render/` 是 canvas 渲染,`components/` 是 Vue 薄壳 —— 沿用这个分层。

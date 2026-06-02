// 首屏示例 — 覆盖各种类型/嵌套/数组/unicode, 让用户一进来就看到树渲染效果.
export const SAMPLE_JSON = JSON.stringify(
  {
    app: 'Rex Instrumenta',
    version: '0.1.0-alpha',
    active: true,
    released: null,
    window: { width: 1280, height: 860, theme: 'monet-dark' },
    tools: [
      { id: 'json', title: 'JSON 工具', icon: 'mdi-code-json', features: ['parse', 'fold', 'search', 'copy', 'diff'] },
    ],
    metrics: { nodes: 0, maxDepth: 4, sizeKB: 1.2, ratios: [0.1, 0.25, 0.5, 0.9] },
    author: { name: 'mignon', langs: ['Go', 'Rust', 'Python', 'TS'], 主页: 'github.com/mignon' },
    note: '把任意 JSON 粘贴进左侧，右侧 canvas 实时渲染。支持折叠、搜索、右键复制子项。',
  },
  null,
  2,
)

// 对比演示用的左右两份样本.
export const SAMPLE_LEFT = JSON.stringify(
  { name: 'service', port: 8080, replicas: 3, tags: ['web', 'prod'], db: { host: 'a.db', pool: 10 } },
  null,
  2,
)

export const SAMPLE_RIGHT = JSON.stringify(
  { name: 'service', port: 9090, replicas: 3, tags: ['web', 'canary'], db: { host: 'a.db', pool: 20, ssl: true } },
  null,
  2,
)

// JSON 文档存储的前端类型. 与 Go 端 jsonstore.Doc 结构对齐, 但不直接依赖生成的
// 绑定类型, 让纯逻辑 / localStorage 回退能脱离 Wails 在 node 测试环境里跑.

export interface JsonDoc {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  size: number
  preview: string
  pinned: boolean
}

// DocMutation 是新增/改名/删除的统一返回: 最新列表 + 受影响 id + 可能的错误.
export interface DocMutation {
  docs: JsonDoc[]
  id?: string
  error?: string
}

// Package jsontool 是 "JSON 工具" 的 Go 侧服务. 目前提供结构化 diff —
// CPU 密集型工作放后端跑, 产出的展平 diff 行比双份原文紧凑, 过 Wails 桥便宜.
package jsontool

// Service 暴露 JSON 工具的 Go 侧能力, 作为 Wails 绑定.
type Service struct{}

// New 创建 Service 实例.
func New() *Service {
	return &Service{}
}

// Diff 对两份 JSON 文本做结构化对比, 返回展平的 diff 行 + 汇总统计.
// 任一侧解析失败时 DiffResult.Error 带错误信息, Rows 为空.
// @param leftText  左侧(样本 A) JSON 文本
// @param rightText 右侧(样本 B) JSON 文本
// @param opts      数组对齐选项(智能主键/值匹配 vs 按下标; 可指定主键字段)
// @return 展平 diff 结果(行 + 统计 + 可能的错误)
func (s *Service) Diff(leftText, rightText string, opts DiffOptions) DiffResult {
	return diffTexts(leftText, rightText, opts)
}

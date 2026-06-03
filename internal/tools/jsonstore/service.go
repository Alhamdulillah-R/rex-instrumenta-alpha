// Package jsonstore 是 "JSON 工具" 的持久化存储: 把用户导入/编辑的 JSON 文档存到
// 用户配置目录(<UserConfigDir>/RexInstrumenta/json-docs), 切换工具、关闭窗口、重启
// app 都不丢. 正文落盘没有 localStorage 的配额上限, 适合存大份 JSON 历史.
package jsonstore

import (
	"context"
	"os"
	"path/filepath"
)

// Result 把变更后的最新文档列表 + 可能的错误一起回前端.
type Result struct {
	Docs  []Doc  `json:"docs"`
	Error string `json:"error,omitempty"`
}

// SaveResult 在 Result 基础上带回被保存文档的 id(新建时前端据此设为当前).
type SaveResult struct {
	Docs  []Doc  `json:"docs"`
	ID    string `json:"id"`
	Error string `json:"error,omitempty"`
}

// Payload 是 Get 的返回: 元信息 + 正文 + 是否存在.
type Payload struct {
	Doc     Doc    `json:"doc"`
	Content string `json:"content"`
	Found   bool   `json:"found"`
	Error   string `json:"error,omitempty"`
}

// Service 暴露 JSON 文档存储的 Go 侧能力, 作为 Wails 绑定.
type Service struct {
	ctx context.Context
	mgr *manager
}

// New 创建 Service 实例.
func New() *Service {
	return &Service{mgr: newManager()}
}

// Startup 由 Wails 回调: 存 ctx, 在用户配置目录下建文档根并加载清单.
func (s *Service) Startup(ctx context.Context) {
	s.ctx = ctx
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		base, _ = os.Getwd()
	}
	_ = s.mgr.init(filepath.Join(base, "RexInstrumenta"))
}

// List 返回全部文档元信息(按最近编辑倒序).
func (s *Service) List() []Doc {
	return s.mgr.list()
}

// Get 取一篇文档的元信息与正文.
// @param id 文档 id
// @return 元信息 + 正文 + 是否存在(读盘失败时带 Error)
func (s *Service) Get(id string) Payload {
	doc, content, found, err := s.mgr.get(id)
	if err != nil {
		return Payload{Error: err.Error()}
	}
	return Payload{Doc: doc, Content: content, Found: found}
}

// Save 新建或更新文档, 返回最新列表 + 该文档 id.
// @param id      文档 id, 空表示新建
// @param name    文档名, 空表示自动命名(新建)/保留原名(更新)
// @param content 正文
func (s *Service) Save(id, name, content string) SaveResult {
	doc, err := s.mgr.save(id, name, content)
	if err != nil {
		return SaveResult{Docs: s.mgr.list(), Error: err.Error()}
	}
	return SaveResult{Docs: s.mgr.list(), ID: doc.ID}
}

// Rename 改文档名(空名回落到自动命名), 返回最新列表.
func (s *Service) Rename(id, name string) Result {
	if err := s.mgr.rename(id, name); err != nil {
		return Result{Docs: s.mgr.list(), Error: err.Error()}
	}
	return Result{Docs: s.mgr.list()}
}

// Remove 删文档, 返回最新列表.
func (s *Service) Remove(id string) Result {
	if err := s.mgr.remove(id); err != nil {
		return Result{Docs: s.mgr.list(), Error: err.Error()}
	}
	return Result{Docs: s.mgr.list()}
}

// SetPin 固定/取消固定一篇文档, 返回最新列表(固定的排最前).
func (s *Service) SetPin(id string, pinned bool) Result {
	if err := s.mgr.setPin(id, pinned); err != nil {
		return Result{Docs: s.mgr.list(), Error: err.Error()}
	}
	return Result{Docs: s.mgr.list()}
}

// RemoveMany 批量删文档(多选清理 / 清空非固定), 返回最新列表.
func (s *Service) RemoveMany(ids []string) Result {
	if err := s.mgr.removeMany(ids); err != nil {
		return Result{Docs: s.mgr.list(), Error: err.Error()}
	}
	return Result{Docs: s.mgr.list()}
}

package platform

import (
	"context"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// FileResult 是 OpenTextFile 的返回, 同时带回路径与内容(取消选择时两者皆空).
type FileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// Platform 提供跨工具复用的 OS 能力: 文件对话框、剪贴板.
// 所有方法依赖 Wails runtime, 必须在 Startup 注入 ctx 之后调用.
type Platform struct {
	ctx context.Context
}

// New 创建 Platform 实例.
func New() *Platform {
	return &Platform{}
}

// Startup 由 Wails 在窗口就绪时回调, 注入 runtime ctx.
func (p *Platform) Startup(ctx context.Context) {
	p.ctx = ctx
}

// OpenTextFile 弹原生文件选择框, 读取并返回文件文本内容.
// 桌面端读大文件比浏览器 FileReader 快得多, 且不阻塞前端主线程(Wails 调用本身异步).
// @return 选中文件的路径与内容; 用户取消时返回空 FileResult、nil error
func (p *Platform) OpenTextFile() (FileResult, error) {
	path, err := runtime.OpenFileDialog(p.ctx, runtime.OpenDialogOptions{
		Title: "打开 JSON 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON / 文本", Pattern: "*.json;*.jsonl;*.ndjson;*.txt"},
			{DisplayName: "所有文件", Pattern: "*.*"},
		},
	})
	if err != nil {
		return FileResult{}, fmt.Errorf("open dialog: %w", err)
	}

	// 用户取消选择 — 非异常, 返回空结果让前端无动作
	if path == "" {
		return FileResult{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return FileResult{}, fmt.Errorf("read file %s: %w", path, err)
	}
	return FileResult{Path: path, Content: string(data)}, nil
}

// SaveTextFile 弹原生保存框, 把内容写入用户选择的路径.
// @param defaultName 默认文件名
// @param content     要保存的文本
// @return 实际保存路径(用户取消为空字符串)
func (p *Platform) SaveTextFile(defaultName, content string) (string, error) {
	path, err := runtime.SaveFileDialog(p.ctx, runtime.SaveDialogOptions{
		Title:           "保存",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON", Pattern: "*.json"},
			{DisplayName: "所有文件", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("save dialog: %w", err)
	}
	if path == "" {
		return "", nil
	}

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("write file %s: %w", path, err)
	}
	return path, nil
}

// SetClipboard 把文本写入系统剪贴板. WebView2 的 navigator.clipboard 在桌面端
// 受 secure-context / 焦点限制时不可靠, 走 runtime 原生剪贴板更稳.
func (p *Platform) SetClipboard(text string) error {
	if err := runtime.ClipboardSetText(p.ctx, text); err != nil {
		return fmt.Errorf("set clipboard: %w", err)
	}
	return nil
}

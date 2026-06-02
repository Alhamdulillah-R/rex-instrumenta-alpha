package plugintool

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Plugin 是一个已导入的插件(一个静态站文件夹).
type Plugin struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Entry      string `json:"entry"`      // 入口文件, 通常 index.html
	ImportedAt int64  `json:"importedAt"` // unix ms
}

// manager 管插件存储: 把导入的文件夹整棵拷进 <baseDir>/plugins/<id>/, 清单存 plugins.json.
type manager struct {
	mu      sync.Mutex
	dir     string // plugins 根目录
	plugins []Plugin
}

func newManager() *manager {
	return &manager{}
}

// init 设定 plugins 根目录(<baseDir>/plugins), 建目录并加载清单.
func (m *manager) init(baseDir string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dir = filepath.Join(baseDir, "plugins")
	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return fmt.Errorf("mkdir plugins dir: %w", err)
	}
	m.loadLocked()
	return nil
}

func (m *manager) root() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.dir
}

func (m *manager) list() []Plugin {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Plugin, len(m.plugins))
	copy(out, m.plugins)
	return out
}

func (m *manager) manifestPath() string {
	return filepath.Join(m.dir, "plugins.json")
}

// loadLocked 读清单(调用方需持锁). 文件不存在 → 空列表.
func (m *manager) loadLocked() {
	data, err := os.ReadFile(m.manifestPath())
	if err != nil {
		m.plugins = nil
		return
	}
	var list []Plugin
	if err := json.Unmarshal(data, &list); err != nil {
		m.plugins = nil
		return
	}
	m.plugins = list
}

func (m *manager) saveLocked() error {
	data, err := json.MarshalIndent(m.plugins, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.manifestPath(), data, 0o644)
}

// importDir 把 src 文件夹整棵拷进 <dir>/<id>/, 登记进清单并返回新插件.
func (m *manager) importDir(src string) (Plugin, error) {
	info, err := os.Stat(src)
	if err != nil || !info.IsDir() {
		return Plugin{}, fmt.Errorf("源不是有效文件夹: %s", src)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	name := filepath.Base(src)
	id := m.uniqueIDLocked(sanitizeID(name))
	dst := filepath.Join(m.dir, id)
	if err := copyTree(src, dst); err != nil {
		os.RemoveAll(dst)
		return Plugin{}, fmt.Errorf("拷贝插件失败: %w", err)
	}

	p := Plugin{
		ID:         id,
		Name:       name,
		Entry:      detectEntry(dst),
		ImportedAt: time.Now().UnixMilli(),
	}
	m.plugins = append(m.plugins, p)
	if err := m.saveLocked(); err != nil {
		return Plugin{}, fmt.Errorf("写清单失败: %w", err)
	}
	return p, nil
}

// remove 删插件文件夹 + 清单条目.
func (m *manager) remove(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := m.plugins[:0]
	found := false
	for _, p := range m.plugins {
		if p.ID == id {
			found = true
			continue
		}
		out = append(out, p)
	}
	if !found {
		return fmt.Errorf("插件不存在: %s", id)
	}
	m.plugins = out

	if err := os.RemoveAll(filepath.Join(m.dir, id)); err != nil {
		return fmt.Errorf("删除插件目录失败: %w", err)
	}
	return m.saveLocked()
}

// uniqueIDLocked 保证 id 不与已有插件冲突(冲突追加 -2/-3…). 调用方需持锁.
func (m *manager) uniqueIDLocked(base string) string {
	exists := func(id string) bool {
		for _, p := range m.plugins {
			if p.ID == id {
				return true
			}
		}
		return false
	}
	if base == "" {
		base = "plugin"
	}
	if !exists(base) {
		return base
	}
	for i := 2; ; i++ {
		cand := fmt.Sprintf("%s-%d", base, i)
		if !exists(cand) {
			return cand
		}
	}
}

// sanitizeID 把文件夹名转成安全的 url/路径 id(小写, 非字母数字转 -).
func sanitizeID(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

// detectEntry 找入口: 根目录有 index.html 用它, 否则取根目录第一个 .html, 都没有默认 index.html.
func detectEntry(dir string) string {
	if _, err := os.Stat(filepath.Join(dir, "index.html")); err == nil {
		return "index.html"
	}
	entries, err := os.ReadDir(dir)
	if err == nil {
		names := make([]string, 0)
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".html") {
				names = append(names, e.Name())
			}
		}
		sort.Strings(names)
		if len(names) > 0 {
			return names[0]
		}
	}
	return "index.html"
}

// copyTree 递归拷贝目录(仅普通文件 + 目录, 跳过符号链接).
func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if !d.Type().IsRegular() {
			return nil // 跳过符号链接等
		}
		return copyFile(path, target)
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

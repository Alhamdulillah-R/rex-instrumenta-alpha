package jsonstore

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Doc 是一条已保存 JSON 文档的元信息(不含正文). 正文按 <id>.json 单独存盘,
// 让清单 docs.json 始终小巧, 列表加载不必读全部正文.
type Doc struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt int64  `json:"createdAt"` // unix ms
	UpdatedAt int64  `json:"updatedAt"` // unix ms
	Size      int64  `json:"size"`      // 正文字节数
	Preview   string `json:"preview"`   // 正文单行预览, 列表副标题用
	Pinned    bool   `json:"pinned"`    // 固定: 排在最前, 且"清空非固定"时保留
}

// manager 管 JSON 文档存储: 元信息清单存 docs.json, 每篇正文存 <id>.json.
type manager struct {
	mu   sync.Mutex
	dir  string
	docs []Doc
}

func newManager() *manager {
	return &manager{}
}

// init 设定文档根目录(<baseDir>/json-docs), 建目录并加载清单.
// @param baseDir app 配置根目录
// @return 建目录失败的 error
func (m *manager) init(baseDir string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dir = filepath.Join(baseDir, "json-docs")
	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return fmt.Errorf("mkdir json-docs dir: %w", err)
	}
	m.loadLocked()
	return nil
}

// list 返回元信息副本: 固定的排在最前, 其余按 UpdatedAt 倒序(最近编辑在前).
func (m *manager) list() []Doc {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Doc, len(m.docs))
	copy(out, m.docs)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Pinned != out[j].Pinned {
			return out[i].Pinned
		}
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out
}

// get 读取一篇文档的元信息与正文.
// @param id 文档 id
// @return 元信息、正文、是否存在、读盘 error
func (m *manager) get(id string) (Doc, string, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	idx := m.indexOfLocked(id)
	if idx < 0 {
		return Doc{}, "", false, nil
	}

	data, err := os.ReadFile(m.contentPath(id))
	if err != nil {
		// 元信息在但正文文件丢失 — 返回空正文而非报错, 让前端仍能选中该条
		if os.IsNotExist(err) {
			return m.docs[idx], "", true, nil
		}
		return Doc{}, "", false, fmt.Errorf("read content %s: %w", id, err)
	}
	return m.docs[idx], string(data), true, nil
}

// save 新建或更新一篇文档. id 为空走新建(自动生成 uuid); name 为空时:
// 新建按 defaultName 自动命名, 更新则保留原名(便于编辑时只存正文).
// @param id      文档 id, 空表示新建
// @param name    文档名, 空表示自动命名(新建)/不改名(更新)
// @param content 正文
// @return 保存后的文档元信息、error
func (m *manager) save(id, name, content string) (Doc, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now().UnixMilli()
	idx := m.indexOfLocked(id)

	if idx < 0 {
		newID := uuid.NewString()
		if err := m.writeContentLocked(newID, content); err != nil {
			return Doc{}, err
		}

		doc := Doc{
			ID:        newID,
			Name:      m.resolveNameLocked(name),
			CreatedAt: now,
			UpdatedAt: now,
			Size:      int64(len(content)),
			Preview:   previewOf(content),
		}
		m.docs = append(m.docs, doc)
		if err := m.saveLocked(); err != nil {
			return Doc{}, err
		}
		return doc, nil
	}

	doc := m.docs[idx]
	if strings.TrimSpace(name) != "" {
		doc.Name = strings.TrimSpace(name)
	}
	doc.UpdatedAt = now
	doc.Size = int64(len(content))
	doc.Preview = previewOf(content)

	if err := m.writeContentLocked(doc.ID, content); err != nil {
		return Doc{}, err
	}
	m.docs[idx] = doc
	if err := m.saveLocked(); err != nil {
		return Doc{}, err
	}
	return doc, nil
}

// rename 改文档名. 空名回落到 defaultName 自动命名.
func (m *manager) rename(id, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	idx := m.indexOfLocked(id)
	if idx < 0 {
		return fmt.Errorf("文档不存在: %s", id)
	}

	n := strings.TrimSpace(name)
	if n == "" {
		n = m.uniqueNameLocked(defaultName(time.Now()))
	}
	m.docs[idx].Name = n
	return m.saveLocked()
}

// remove 删文档(正文文件 + 清单条目).
func (m *manager) remove(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	idx := m.indexOfLocked(id)
	if idx < 0 {
		return fmt.Errorf("文档不存在: %s", id)
	}

	m.docs = append(m.docs[:idx], m.docs[idx+1:]...)
	if err := os.Remove(m.contentPath(id)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("删除正文失败: %w", err)
	}
	return m.saveLocked()
}

// setPin 设置/取消固定.
func (m *manager) setPin(id string, pinned bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	idx := m.indexOfLocked(id)
	if idx < 0 {
		return fmt.Errorf("文档不存在: %s", id)
	}
	m.docs[idx].Pinned = pinned
	return m.saveLocked()
}

// removeMany 批量删文档(正文 + 清单条目). 用于多选清理 / 清空非固定.
// 不存在的 id 跳过; 个别正文删除失败不中断整批, 清单照常更新, 末尾返回首个错误.
func (m *manager) removeMany(ids []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(ids) == 0 {
		return nil
	}

	idset := make(map[string]bool, len(ids))
	for _, id := range ids {
		idset[id] = true
	}

	var firstErr error
	kept := m.docs[:0]
	for _, d := range m.docs {
		if idset[d.ID] {
			if err := os.Remove(m.contentPath(d.ID)); err != nil && !os.IsNotExist(err) && firstErr == nil {
				firstErr = fmt.Errorf("删除正文 %s: %w", d.ID, err)
			}
			continue
		}
		kept = append(kept, d)
	}
	m.docs = kept

	if err := m.saveLocked(); err != nil {
		return err
	}
	return firstErr
}

func (m *manager) indexOfLocked(id string) int {
	if id == "" {
		return -1
	}
	for i := range m.docs {
		if m.docs[i].ID == id {
			return i
		}
	}
	return -1
}

// resolveNameLocked 决定新建文档的名字: 有名直接用, 无名按时间自动命名并去重.
func (m *manager) resolveNameLocked(name string) string {
	n := strings.TrimSpace(name)
	if n != "" {
		return n
	}
	return m.uniqueNameLocked(defaultName(time.Now()))
}

// uniqueNameLocked 保证名字不与已有文档重复(冲突追加 " (2)"/" (3)"…).
func (m *manager) uniqueNameLocked(base string) string {
	exists := func(n string) bool {
		for _, d := range m.docs {
			if d.Name == n {
				return true
			}
		}
		return false
	}
	if !exists(base) {
		return base
	}
	for i := 2; ; i++ {
		cand := fmt.Sprintf("%s (%d)", base, i)
		if !exists(cand) {
			return cand
		}
	}
}

func (m *manager) contentPath(id string) string {
	return filepath.Join(m.dir, id+".json")
}

func (m *manager) writeContentLocked(id, content string) error {
	if err := os.WriteFile(m.contentPath(id), []byte(content), 0o644); err != nil {
		return fmt.Errorf("写正文 %s: %w", id, err)
	}
	return nil
}

func (m *manager) manifestPath() string {
	return filepath.Join(m.dir, "docs.json")
}

// loadLocked 读清单(调用方需持锁). 文件缺失或损坏 → 空列表.
func (m *manager) loadLocked() {
	data, err := os.ReadFile(m.manifestPath())
	if err != nil {
		m.docs = nil
		return
	}
	var list []Doc
	if err := json.Unmarshal(data, &list); err != nil {
		m.docs = nil
		return
	}
	m.docs = list
}

func (m *manager) saveLocked() error {
	data, err := json.MarshalIndent(m.docs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.manifestPath(), data, 0o644)
}

// defaultName 给无名文档按 "yyyy-mm-dd-HH:mm导入的json" 生成默认名.
// @param t 命名基准时间
func defaultName(t time.Time) string {
	return t.Format("2006-01-02-15:04") + "导入的json"
}

// previewOf 取正文做单行预览: 折叠空白、截断到 80 个字符、超长加省略号.
func previewOf(content string) string {
	const maxRunes = 80
	var b strings.Builder
	count := 0
	pendingSpace := false
	truncated := false

	for _, r := range content {
		if r == '\n' || r == '\r' || r == '\t' || r == ' ' {
			if b.Len() > 0 {
				pendingSpace = true
			}
			continue
		}
		if count >= maxRunes {
			truncated = true
			break
		}
		if pendingSpace {
			b.WriteByte(' ')
			pendingSpace = false
		}
		b.WriteRune(r)
		count++
	}

	if truncated {
		b.WriteString("…")
	}
	return b.String()
}

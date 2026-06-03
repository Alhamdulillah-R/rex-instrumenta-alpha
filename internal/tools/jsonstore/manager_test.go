package jsonstore

import (
	"os"
	"regexp"
	"testing"
	"time"
)

// autoNamePattern 校验自动命名形如 2026-06-03-14:30导入的json (允许去重后缀 " (2)").
var autoNamePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}-\d{2}:\d{2}导入的json( \(\d+\))?$`)

func newTestManager(t *testing.T) *manager {
	t.Helper()
	m := newManager()
	if err := m.init(t.TempDir()); err != nil {
		t.Fatalf("init: %v", err)
	}
	return m
}

func TestSaveAndGetRoundtrip(t *testing.T) {
	m := newTestManager(t)

	doc, err := m.save("", "alpha", `{"a":1}`)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if doc.ID == "" {
		t.Fatal("新建文档应分配非空 id")
	}
	if doc.Name != "alpha" {
		t.Fatalf("name = %q, want alpha", doc.Name)
	}
	if doc.Size != int64(len(`{"a":1}`)) {
		t.Fatalf("size = %d", doc.Size)
	}

	got, content, found, err := m.get(doc.ID)
	if err != nil || !found {
		t.Fatalf("get: err=%v found=%v", err, found)
	}
	if content != `{"a":1}` {
		t.Fatalf("content = %q", content)
	}
	if got.ID != doc.ID {
		t.Fatalf("get id 不一致")
	}
}

func TestSaveAutoNameWhenEmpty(t *testing.T) {
	m := newTestManager(t)

	doc, err := m.save("", "", "  \n\t hello world ")
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if !autoNamePattern.MatchString(doc.Name) {
		t.Fatalf("自动命名格式不符: %q", doc.Name)
	}
}

func TestDefaultNameFormat(t *testing.T) {
	got := defaultName(time.Date(2026, 6, 3, 14, 30, 0, 0, time.UTC))
	want := "2026-06-03-14:30导入的json"
	if got != want {
		t.Fatalf("defaultName = %q, want %q", got, want)
	}
}

func TestUniqueNameLocked(t *testing.T) {
	m := &manager{docs: []Doc{{Name: "foo"}, {Name: "foo (2)"}}}

	if got := m.uniqueNameLocked("foo"); got != "foo (3)" {
		t.Fatalf("uniqueName(foo) = %q, want foo (3)", got)
	}
	if got := m.uniqueNameLocked("bar"); got != "bar" {
		t.Fatalf("uniqueName(bar) = %q, want bar", got)
	}
}

func TestUpdateKeepsNameAndId(t *testing.T) {
	m := newTestManager(t)

	first, _ := m.save("", "doc", "old")
	updated, err := m.save(first.ID, "", "brand new content")
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.ID != first.ID {
		t.Fatalf("更新不应换 id: %s != %s", updated.ID, first.ID)
	}
	if updated.Name != "doc" {
		t.Fatalf("空 name 更新应保留原名, got %q", updated.Name)
	}
	if updated.Size != int64(len("brand new content")) {
		t.Fatalf("size 未更新: %d", updated.Size)
	}

	_, content, _, _ := m.get(first.ID)
	if content != "brand new content" {
		t.Fatalf("正文未更新: %q", content)
	}
	if len(m.list()) != 1 {
		t.Fatalf("更新不应新增文档, 现有 %d 篇", len(m.list()))
	}
}

func TestListSortedByUpdatedDesc(t *testing.T) {
	m := newTestManager(t)

	a, _ := m.save("", "a", "1")
	time.Sleep(5 * time.Millisecond)
	b, _ := m.save("", "b", "2")

	if list := m.list(); list[0].ID != b.ID {
		t.Fatalf("最近的应排在前, got %s", list[0].Name)
	}

	time.Sleep(5 * time.Millisecond)
	m.save(a.ID, "", "1-updated")
	if list := m.list(); list[0].ID != a.ID {
		t.Fatalf("更新后 a 应排在前, got %s", list[0].Name)
	}
}

func TestRename(t *testing.T) {
	m := newTestManager(t)

	doc, _ := m.save("", "orig", "x")
	if err := m.rename(doc.ID, "newname"); err != nil {
		t.Fatalf("rename: %v", err)
	}
	if m.list()[0].Name != "newname" {
		t.Fatalf("rename 未生效: %q", m.list()[0].Name)
	}

	// 改名传空 → 回落自动命名
	if err := m.rename(doc.ID, "   "); err != nil {
		t.Fatalf("rename empty: %v", err)
	}
	if !autoNamePattern.MatchString(m.list()[0].Name) {
		t.Fatalf("空改名应自动命名, got %q", m.list()[0].Name)
	}

	if err := m.rename("nope", "x"); err == nil {
		t.Fatal("改不存在的文档应报错")
	}
}

func TestRemove(t *testing.T) {
	m := newTestManager(t)

	doc, _ := m.save("", "gone", "bye")
	path := m.contentPath(doc.ID)

	if err := m.remove(doc.ID); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if len(m.list()) != 0 {
		t.Fatalf("remove 后应为空, 现有 %d", len(m.list()))
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("正文文件应被删, stat err=%v", err)
	}
	if err := m.remove(doc.ID); err == nil {
		t.Fatal("删不存在的文档应报错")
	}
}

func TestPersistAcrossReload(t *testing.T) {
	dir := t.TempDir()

	m1 := newManager()
	if err := m1.init(dir); err != nil {
		t.Fatalf("init m1: %v", err)
	}
	saved, _ := m1.save("", "persisted", `{"keep":true}`)

	m2 := newManager()
	if err := m2.init(dir); err != nil {
		t.Fatalf("init m2: %v", err)
	}
	got, content, found, err := m2.get(saved.ID)
	if err != nil || !found {
		t.Fatalf("重载后取不到: err=%v found=%v", err, found)
	}
	if got.Name != "persisted" || content != `{"keep":true}` {
		t.Fatalf("重载后数据不一致: name=%q content=%q", got.Name, content)
	}
}

func TestSetPinSortsFirst(t *testing.T) {
	m := newTestManager(t)

	a, _ := m.save("", "a", "1")
	time.Sleep(5 * time.Millisecond)
	b, _ := m.save("", "b", "2")

	// b 更新 → 默认在前
	if m.list()[0].ID != b.ID {
		t.Fatalf("置顶前应是 b 在前")
	}

	if err := m.setPin(a.ID, true); err != nil {
		t.Fatalf("setPin: %v", err)
	}
	list := m.list()
	if list[0].ID != a.ID || !list[0].Pinned {
		t.Fatalf("固定后 a 应排最前且 Pinned, got %+v", list[0])
	}

	if err := m.setPin(a.ID, false); err != nil {
		t.Fatalf("unpin: %v", err)
	}
	if m.list()[0].ID != b.ID {
		t.Fatalf("取消固定后应回到 b 在前")
	}

	if err := m.setPin("nope", true); err == nil {
		t.Fatal("固定不存在的文档应报错")
	}
}

func TestRemoveMany(t *testing.T) {
	m := newTestManager(t)

	a, _ := m.save("", "a", "1")
	b, _ := m.save("", "b", "2")
	c, _ := m.save("", "c", "3")
	pathA, pathC := m.contentPath(a.ID), m.contentPath(c.ID)

	if err := m.removeMany([]string{a.ID, c.ID, "nope"}); err != nil {
		t.Fatalf("removeMany: %v", err)
	}

	list := m.list()
	if len(list) != 1 || list[0].ID != b.ID {
		t.Fatalf("应只剩 b, got %+v", list)
	}
	if _, err := os.Stat(pathA); !os.IsNotExist(err) {
		t.Fatal("a 正文应被删")
	}
	if _, err := os.Stat(pathC); !os.IsNotExist(err) {
		t.Fatal("c 正文应被删")
	}
	if _, _, found, _ := m.get(b.ID); !found {
		t.Fatal("b 应保留")
	}
}

func TestRemoveManyEmptyNoop(t *testing.T) {
	m := newTestManager(t)
	m.save("", "a", "1")
	if err := m.removeMany(nil); err != nil {
		t.Fatalf("空批删除应无错: %v", err)
	}
	if len(m.list()) != 1 {
		t.Fatalf("空批删除不应改动, 现有 %d", len(m.list()))
	}
}

func TestPreviewOf(t *testing.T) {
	if got := previewOf("  {\n  \"a\": 1\n}\n"); got != `{ "a": 1 }` {
		t.Fatalf("preview 折叠空白错误: %q", got)
	}

	long := make([]byte, 0, 200)
	for i := 0; i < 200; i++ {
		long = append(long, 'x')
	}
	got := previewOf(string(long))
	if []rune(got)[len([]rune(got))-1] != '…' {
		t.Fatalf("超长预览应以省略号结尾: %q", got)
	}
}

package jsontool

import (
	"testing"
)

// findRow 按 path 找第一条匹配行, 找不到返回 nil.
func findRow(rows []DiffRow, path string) *DiffRow {
	for i := range rows {
		if rows[i].Path == path {
			return &rows[i]
		}
	}
	return nil
}

func TestDiff_IdenticalObjects(t *testing.T) {
	left := `{"a":1,"b":"x","c":[1,2,3]}`
	res := diffTexts(left, left)

	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if res.Stats.Changed != 0 || res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("expected all same, got %+v", res.Stats)
	}
	root := findRow(res.Rows, "$")
	if root == nil || root.Status != statusSame {
		t.Fatalf("root should be same, got %+v", root)
	}
}

func TestDiff_ChangedScalar(t *testing.T) {
	res := diffTexts(`{"a":1}`, `{"a":2}`)

	row := findRow(res.Rows, "$.a")
	if row == nil {
		t.Fatal("missing $.a row")
	}
	if row.Status != statusChanged {
		t.Fatalf("expected changed, got %s", row.Status)
	}
	if row.Left != "1" || row.Right != "2" {
		t.Fatalf("preview mismatch: left=%s right=%s", row.Left, row.Right)
	}
	if res.Stats.Changed < 1 {
		t.Fatalf("stats.Changed should be >=1, got %d", res.Stats.Changed)
	}
}

func TestDiff_AddedAndRemovedKeys(t *testing.T) {
	// 左有 onlyLeft, 右有 onlyRight
	res := diffTexts(`{"shared":1,"onlyLeft":9}`, `{"shared":1,"onlyRight":8}`)

	removed := findRow(res.Rows, "$.onlyLeft")
	if removed == nil || removed.Status != statusRemoved {
		t.Fatalf("onlyLeft should be removed, got %+v", removed)
	}
	if removed.Left != "9" || removed.Right != "" {
		t.Fatalf("removed preview should fill left only, got left=%q right=%q", removed.Left, removed.Right)
	}

	added := findRow(res.Rows, "$.onlyRight")
	if added == nil || added.Status != statusAdded {
		t.Fatalf("onlyRight should be added, got %+v", added)
	}
	if added.Right != "8" || added.Left != "" {
		t.Fatalf("added preview should fill right only, got left=%q right=%q", added.Left, added.Right)
	}

	shared := findRow(res.Rows, "$.shared")
	if shared == nil || shared.Status != statusSame {
		t.Fatalf("shared should be same, got %+v", shared)
	}
}

func TestDiff_NestedChangePropagates(t *testing.T) {
	left := `{"outer":{"inner":{"v":1},"keep":"yes"}}`
	right := `{"outer":{"inner":{"v":2},"keep":"yes"}}`
	res := diffTexts(left, right)

	leaf := findRow(res.Rows, "$.outer.inner.v")
	if leaf == nil || leaf.Status != statusChanged {
		t.Fatalf("leaf v should be changed, got %+v", leaf)
	}
	inner := findRow(res.Rows, "$.outer.inner")
	if inner == nil || inner.Status != statusChanged {
		t.Fatalf("inner container should propagate changed, got %+v", inner)
	}
	outer := findRow(res.Rows, "$.outer")
	if outer == nil || outer.Status != statusChanged {
		t.Fatalf("outer container should propagate changed, got %+v", outer)
	}
	keep := findRow(res.Rows, "$.outer.keep")
	if keep == nil || keep.Status != statusSame {
		t.Fatalf("untouched sibling should stay same, got %+v", keep)
	}
}

func TestDiff_ArrayLengthMismatch(t *testing.T) {
	res := diffTexts(`{"arr":[1,2]}`, `{"arr":[1,2,3]}`)

	extra := findRow(res.Rows, "$.arr[2]")
	if extra == nil || extra.Status != statusAdded {
		t.Fatalf("arr[2] should be added, got %+v", extra)
	}
	arr := findRow(res.Rows, "$.arr")
	if arr == nil || arr.Status != statusChanged {
		t.Fatalf("arr should be changed due to length mismatch, got %+v", arr)
	}
}

func TestDiff_TypeChange(t *testing.T) {
	res := diffTexts(`{"v":{"x":1}}`, `{"v":"now a string"}`)

	row := findRow(res.Rows, "$.v")
	if row == nil || row.Status != statusChanged {
		t.Fatalf("type change should be changed, got %+v", row)
	}
	// 类型变化不下钻, 不应再有 $.v.x
	if child := findRow(res.Rows, "$.v.x"); child != nil {
		t.Fatalf("type change should not descend, but found %+v", child)
	}
}

func TestDiff_BigIntegerPrecision(t *testing.T) {
	// 超出 float64 安全整数范围, 两个不同大整数若按 float 比会误判相等
	left := `{"id":9223372036854775807}`
	right := `{"id":9223372036854775806}`
	res := diffTexts(left, right)

	row := findRow(res.Rows, "$.id")
	if row == nil || row.Status != statusChanged {
		t.Fatalf("big integers differ, should be changed, got %+v", row)
	}
}

func TestDiff_NumberOneEqualsOnePointZero(t *testing.T) {
	res := diffTexts(`{"v":1}`, `{"v":1.0}`)

	row := findRow(res.Rows, "$.v")
	if row == nil || row.Status != statusSame {
		t.Fatalf("1 vs 1.0 should be same, got %+v", row)
	}
}

func TestDiff_UnicodeKeys(t *testing.T) {
	res := diffTexts(`{"名字":"张三"}`, `{"名字":"李四"}`)

	row := findRow(res.Rows, "$.名字")
	if row == nil || row.Status != statusChanged {
		t.Fatalf("unicode key row should be changed, got %+v", row)
	}
}

func TestDiff_SpecialCharKeyPath(t *testing.T) {
	res := diffTexts(`{"a.b":1}`, `{"a.b":2}`)

	// 含点的 key 应该用 ["a.b"] 形式, 不能拼成 $.a.b
	if row := findRow(res.Rows, `$["a.b"]`); row == nil || row.Status != statusChanged {
		t.Fatalf(`expected $["a.b"] changed row, got %+v`, row)
	}
}

func TestDiff_EmptyContainers(t *testing.T) {
	res := diffTexts(`{"o":{},"a":[]}`, `{"o":{},"a":[]}`)

	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	o := findRow(res.Rows, "$.o")
	if o == nil || o.Status != statusSame || o.HasChildren {
		t.Fatalf("empty object should be same w/o children, got %+v", o)
	}
}

func TestDiff_ParseErrors(t *testing.T) {
	if res := diffTexts(`{bad`, `{}`); res.Error == "" {
		t.Fatal("expected left parse error")
	}
	if res := diffTexts(`{}`, `not json`); res.Error == "" {
		t.Fatal("expected right parse error")
	}
	if res := diffTexts(``, `{}`); res.Error == "" {
		t.Fatal("empty input should be a parse error")
	}
}

func TestDiff_StatsConsistency(t *testing.T) {
	res := diffTexts(`{"a":1,"b":2,"gone":3}`, `{"a":1,"b":99,"new":4}`)

	sum := res.Stats.Same + res.Stats.Changed + res.Stats.Added + res.Stats.Removed
	if sum != res.Stats.Total {
		t.Fatalf("status counts %d should sum to total %d", sum, res.Stats.Total)
	}
	if res.Stats.Total != len(res.Rows) {
		t.Fatalf("total %d should equal row count %d", res.Stats.Total, len(res.Rows))
	}
}

func TestDiff_TopLevelArray(t *testing.T) {
	res := diffTexts(`[1,2,3]`, `[1,9,3]`)

	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	row := findRow(res.Rows, "$[1]")
	if row == nil || row.Status != statusChanged {
		t.Fatalf("$[1] should be changed, got %+v", row)
	}
}

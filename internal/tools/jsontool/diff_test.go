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
	res := diffTexts(left, left, DiffOptions{})

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
	res := diffTexts(`{"a":1}`, `{"a":2}`, DiffOptions{})

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
	res := diffTexts(`{"shared":1,"onlyLeft":9}`, `{"shared":1,"onlyRight":8}`, DiffOptions{})

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
	res := diffTexts(left, right, DiffOptions{})

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
	res := diffTexts(`{"arr":[1,2]}`, `{"arr":[1,2,3]}`, DiffOptions{})

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
	res := diffTexts(`{"v":{"x":1}}`, `{"v":"now a string"}`, DiffOptions{})

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
	res := diffTexts(left, right, DiffOptions{})

	row := findRow(res.Rows, "$.id")
	if row == nil || row.Status != statusChanged {
		t.Fatalf("big integers differ, should be changed, got %+v", row)
	}
}

func TestDiff_NumberOneEqualsOnePointZero(t *testing.T) {
	res := diffTexts(`{"v":1}`, `{"v":1.0}`, DiffOptions{})

	row := findRow(res.Rows, "$.v")
	if row == nil || row.Status != statusSame {
		t.Fatalf("1 vs 1.0 should be same, got %+v", row)
	}
}

func TestDiff_UnicodeKeys(t *testing.T) {
	res := diffTexts(`{"名字":"张三"}`, `{"名字":"李四"}`, DiffOptions{})

	row := findRow(res.Rows, "$.名字")
	if row == nil || row.Status != statusChanged {
		t.Fatalf("unicode key row should be changed, got %+v", row)
	}
}

func TestDiff_SpecialCharKeyPath(t *testing.T) {
	res := diffTexts(`{"a.b":1}`, `{"a.b":2}`, DiffOptions{})

	// 含点的 key 应该用 ["a.b"] 形式, 不能拼成 $.a.b
	if row := findRow(res.Rows, `$["a.b"]`); row == nil || row.Status != statusChanged {
		t.Fatalf(`expected $["a.b"] changed row, got %+v`, row)
	}
}

func TestDiff_EmptyContainers(t *testing.T) {
	res := diffTexts(`{"o":{},"a":[]}`, `{"o":{},"a":[]}`, DiffOptions{})

	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	o := findRow(res.Rows, "$.o")
	if o == nil || o.Status != statusSame || o.HasChildren {
		t.Fatalf("empty object should be same w/o children, got %+v", o)
	}
}

func TestDiff_ParseErrors(t *testing.T) {
	if res := diffTexts(`{bad`, `{}`, DiffOptions{}); res.Error == "" {
		t.Fatal("expected left parse error")
	}
	if res := diffTexts(`{}`, `not json`, DiffOptions{}); res.Error == "" {
		t.Fatal("expected right parse error")
	}
	if res := diffTexts(``, `{}`, DiffOptions{}); res.Error == "" {
		t.Fatal("empty input should be a parse error")
	}
}

func TestDiff_StatsConsistency(t *testing.T) {
	res := diffTexts(`{"a":1,"b":2,"gone":3}`, `{"a":1,"b":99,"new":4}`, DiffOptions{})

	sum := res.Stats.Same + res.Stats.Changed + res.Stats.Added + res.Stats.Removed
	if sum != res.Stats.Total {
		t.Fatalf("status counts %d should sum to total %d", sum, res.Stats.Total)
	}
	if res.Stats.Total != len(res.Rows) {
		t.Fatalf("total %d should equal row count %d", res.Stats.Total, len(res.Rows))
	}
}

func TestDiff_TopLevelArray(t *testing.T) {
	// index 模式: 按下标对位, 第 2 个元素 1→9 算 changed
	res := diffTexts(`[1,2,3]`, `[1,9,3]`, DiffOptions{ArrayMode: "index"})

	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	row := findRow(res.Rows, "$[1]")
	if row == nil || row.Status != statusChanged {
		t.Fatalf("$[1] should be changed, got %+v", row)
	}
}

// ─── 智能匹配(默认 key 模式)─────────────────────────────

func TestDiff_ScalarReorderIsSame(t *testing.T) {
	// 标量列表乱序 → 按值匹配 → 全一致
	res := diffTexts(`[1,2,3]`, `[3,2,1]`, DiffOptions{})

	if res.Stats.Changed != 0 || res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("乱序标量应全一致, got %+v", res.Stats)
	}
	if root := findRow(res.Rows, "$"); root == nil || root.Status != statusSame {
		t.Fatalf("根数组应 same, got %+v", root)
	}
}

func TestDiff_ObjectArrayReorderByAutoID(t *testing.T) {
	left := `{"users":[{"id":1,"name":"a"},{"id":2,"name":"b"}]}`
	right := `{"users":[{"id":2,"name":"b"},{"id":1,"name":"a"}]}`
	res := diffTexts(left, right, DiffOptions{})

	if res.Stats.Changed != 0 || res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("按 id 配对后乱序应一致, got %+v", res.Stats)
	}
	if u := findRow(res.Rows, "$.users"); u == nil || u.Status != statusSame {
		t.Fatalf("users 数组应 same, got %+v", u)
	}
}

func TestDiff_ObjectArraySameIDFieldChanged(t *testing.T) {
	left := `{"users":[{"id":1,"name":"a"},{"id":2,"name":"b"}]}`
	right := `{"users":[{"id":2,"name":"b"},{"id":1,"name":"A"}]}`
	res := diffTexts(left, right, DiffOptions{})

	// id=1 的 name 变了 → 应是 changed, 而不是一删一增
	row := findRow(res.Rows, `$.users[id=1].name`)
	if row == nil || row.Status != statusChanged {
		t.Fatalf("$.users[id=1].name 应 changed, got %+v", row)
	}
	if res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("同 id 改字段不应产生增删, got %+v", res.Stats)
	}
}

func TestDiff_ObjectArrayAddRemoveByID(t *testing.T) {
	left := `{"users":[{"id":1},{"id":2}]}`
	right := `{"users":[{"id":2},{"id":3}]}`
	res := diffTexts(left, right, DiffOptions{})

	if r := findRow(res.Rows, `$.users[id=1]`); r == nil || r.Status != statusRemoved {
		t.Fatalf("id=1 应 removed, got %+v", r)
	}
	if r := findRow(res.Rows, `$.users[id=3]`); r == nil || r.Status != statusAdded {
		t.Fatalf("id=3 应 added, got %+v", r)
	}
	if r := findRow(res.Rows, `$.users[id=2]`); r == nil || r.Status != statusSame {
		t.Fatalf("id=2 应 same, got %+v", r)
	}
}

func TestDiff_ExplicitKeyField(t *testing.T) {
	// sku 不在自动候选里, 需手动指定才能按它配对
	left := `{"items":[{"sku":"A","q":1}]}`
	right := `{"items":[{"sku":"A","q":2}]}`

	// 无主键(sku 不在候选): 整体值不等 → 旧记录 removed、新记录 added(不是字段级 changed)
	auto := diffTexts(left, right, DiffOptions{})
	if r := findRow(auto.Rows, "$.items[0]"); r == nil || r.Status != statusRemoved {
		t.Fatalf("无主键: 旧记录应 removed, got %+v", r)
	}
	if r := findRow(auto.Rows, "$.items[1]"); r == nil || r.Status != statusAdded {
		t.Fatalf("无主键: 新记录应 added, got %+v", r)
	}

	keyed := diffTexts(left, right, DiffOptions{ArrayKey: "sku"})
	row := findRow(keyed.Rows, `$.items[sku="A"].q`)
	if row == nil || row.Status != statusChanged {
		t.Fatalf(`指定 sku 后 $.items[sku="A"].q 应 changed, got %+v`, row)
	}
}

func TestDiff_DuplicateKeysFallBackToValue(t *testing.T) {
	// id 有重复 → 不当主键 → 回退整体值匹配, 不应 panic
	left := `[{"id":1,"v":"x"},{"id":1,"v":"y"}]`
	res := diffTexts(left, left, DiffOptions{})

	if res.Error != "" {
		t.Fatalf("unexpected error: %s", res.Error)
	}
	if res.Stats.Changed != 0 || res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("相同输入应全一致, got %+v", res.Stats)
	}
}

func TestDiff_IndexModeStrictPositional(t *testing.T) {
	res := diffTexts(`{"a":[1,2,3]}`, `{"a":[3,2,1]}`, DiffOptions{ArrayMode: "index"})

	if r := findRow(res.Rows, "$.a[0]"); r == nil || r.Status != statusChanged {
		t.Fatalf("index 模式 $.a[0] 应 changed, got %+v", r)
	}
	if r := findRow(res.Rows, "$.a[1]"); r == nil || r.Status != statusSame {
		t.Fatalf("index 模式 $.a[1] 应 same, got %+v", r)
	}
}

// ─── 嵌套路径主键(routing 按 fromSegments.flightNo 配对)──────

func TestDiff_NestedPathKey(t *testing.T) {
	left := `{"routing":[{"fromSegments":[{"flightNo":"OZ1085"}],"price":100},{"fromSegments":[{"flightNo":"KE001"}],"price":200}]}`
	right := `{"routing":[{"fromSegments":[{"flightNo":"KE001"}],"price":200},{"fromSegments":[{"flightNo":"OZ1085"}],"price":150}]}`
	res := diffTexts(left, right, DiffOptions{ArrayKey: "fromSegments.flightNo"})

	// 乱序 + OZ1085 改价 → 按航班号配对后只 price 变, 无增删
	row := findRow(res.Rows, `$.routing[flightNo="OZ1085"].price`)
	if row == nil || row.Status != statusChanged {
		t.Fatalf(`$.routing[flightNo="OZ1085"].price 应 changed, got %+v`, row)
	}
	if res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("按 flightNo 配对不应有增删, got %+v", res.Stats)
	}
}

func TestDiff_WildcardPathKeyMultiSegment(t *testing.T) {
	// 多段航班: 把各段 flightNo 拼成 key, 联程相同则配对
	left := `{"r":[{"fromSegments":[{"flightNo":"A1"},{"flightNo":"A2"}],"p":1}]}`
	right := `{"r":[{"fromSegments":[{"flightNo":"A1"},{"flightNo":"A2"}],"p":2}]}`
	res := diffTexts(left, right, DiffOptions{ArrayKey: "fromSegments[*].flightNo"})

	if res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("联程 key 相同应配对(无增删), got %+v", res.Stats)
	}
	if res.Stats.Changed == 0 {
		t.Fatalf("p 改了应有 changed, got %+v", res.Stats)
	}
}

func TestDiff_PathKeyRelevanceFallback(t *testing.T) {
	// 全局路径键只作用于 routing; users 不含 fromSegments → 自动回退按 id 配对
	left := `{"routing":[{"fromSegments":[{"flightNo":"X1"}],"p":1}],"users":[{"id":1,"n":"a"},{"id":2,"n":"b"}]}`
	right := `{"routing":[{"fromSegments":[{"flightNo":"X1"}],"p":2}],"users":[{"id":2,"n":"b"},{"id":1,"n":"a"}]}`
	res := diffTexts(left, right, DiffOptions{ArrayKey: "fromSegments.flightNo"})

	if r := findRow(res.Rows, "$.users[id=1]"); r == nil || r.Status != statusSame {
		t.Fatalf("users 应回退按 id 配对(乱序仍 same), got %+v", r)
	}
	if r := findRow(res.Rows, `$.routing[flightNo="X1"].p`); r == nil || r.Status != statusChanged {
		t.Fatalf("routing 应按 flightNo 配对, p 变 changed, got %+v", r)
	}
	if res.Stats.Added != 0 || res.Stats.Removed != 0 {
		t.Fatalf("两数组都正确配对, 不应有增删, got %+v", res.Stats)
	}
}

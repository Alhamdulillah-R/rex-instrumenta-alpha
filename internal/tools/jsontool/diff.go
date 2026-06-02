package jsontool

import (
	"bytes"
	"encoding/json"
	"math/big"
	"sort"
	"strconv"
	"unicode"
)

// diff status 取值. 与前端汇总 chip 对齐: removed = 仅左, added = 仅右.
const (
	statusSame    = "same"
	statusChanged = "changed"
	statusAdded   = "added"   // 仅右侧存在
	statusRemoved = "removed" // 仅左侧存在
)

// DiffRow 是展平 diff 树的一行, 直接喂给 canvas 渲染.
type DiffRow struct {
	Path        string `json:"path"`
	Key         string `json:"key"`
	Depth       int    `json:"depth"`
	Status      string `json:"status"`
	Kind        string `json:"kind"`
	Left        string `json:"left"`
	Right       string `json:"right"`
	HasChildren bool   `json:"hasChildren"`
	ChildCount  int    `json:"childCount"`
}

// DiffStats 是各状态行数的汇总, 驱动前端汇总 chip.
type DiffStats struct {
	Total   int `json:"total"`
	Same    int `json:"same"`
	Changed int `json:"changed"`
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

// DiffResult 是 Diff 的完整返回. Error 非空时 Rows 为空.
type DiffResult struct {
	Rows  []DiffRow `json:"rows"`
	Stats DiffStats `json:"stats"`
	Error string    `json:"error,omitempty"`
}

// side 表示某个 key/index 在一侧的取值与是否存在.
type side struct {
	v       interface{}
	present bool
}

type differ struct {
	rows []DiffRow
}

// diffTexts 解析两份文本并产出展平 diff. 任一侧解析失败 → 返回带 Error 的空结果.
func diffTexts(leftText, rightText string) DiffResult {
	left, err := parseJSON(leftText)
	if err != nil {
		return DiffResult{Error: "左侧 JSON 解析失败: " + err.Error()}
	}

	right, err := parseJSON(rightText)
	if err != nil {
		return DiffResult{Error: "右侧 JSON 解析失败: " + err.Error()}
	}

	d := &differ{rows: make([]DiffRow, 0, 256)}
	d.walk("$", "root", 0, side{left, true}, side{right, true})

	return DiffResult{Rows: d.rows, Stats: d.computeStats()}
}

// parseJSON 用 UseNumber 解析, 避免大整数被 float64 截断, 保留数字原貌.
func parseJSON(text string) (interface{}, error) {
	dec := json.NewDecoder(bytes.NewReader([]byte(text)))
	dec.UseNumber()

	var v interface{}
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	return v, nil
}

// walk 递归对比一个节点, 把行追加进 d.rows, 返回该子树是否完全一致.
// 容器节点先占位再回填 status —— 子树是否一致要等所有孩子比完才知道.
func (d *differ) walk(path, key string, depth int, l, r side) bool {
	if l.present && !r.present {
		d.emitOneSided(path, key, depth, l.v, statusRemoved, true)
		return false
	}
	if !l.present && r.present {
		d.emitOneSided(path, key, depth, r.v, statusAdded, false)
		return false
	}

	lk, rk := kindOf(l.v), kindOf(r.v)

	// 类型变了(如 object → string): 当作 changed 叶子, 左右各显其值, 不再下钻
	if lk != rk {
		d.rows = append(d.rows, DiffRow{
			Path:   path,
			Key:    key,
			Depth:  depth,
			Status: statusChanged,
			Kind:   lk,
			Left:   preview(l.v),
			Right:  preview(r.v),
		})
		return false
	}

	switch lk {
	case "object":
		return d.walkObject(path, key, depth, l.v.(map[string]interface{}), r.v.(map[string]interface{}))
	case "array":
		return d.walkArray(path, key, depth, l.v.([]interface{}), r.v.([]interface{}))
	default:
		same := scalarEqual(l.v, r.v)
		d.rows = append(d.rows, DiffRow{
			Path:   path,
			Key:    key,
			Depth:  depth,
			Status: statusOf(same),
			Kind:   lk,
			Left:   preview(l.v),
			Right:  preview(r.v),
		})
		return same
	}
}

// walkObject 按 key 的有序并集对齐两侧对象, 缺失的 key 走 added/removed 分支.
func (d *differ) walkObject(path, key string, depth int, lm, rm map[string]interface{}) bool {
	idx := len(d.rows)
	d.rows = append(d.rows, DiffRow{
		Path:        path,
		Key:         key,
		Depth:       depth,
		Kind:        "object",
		HasChildren: len(lm) > 0 || len(rm) > 0,
		Left:        preview(lm),
		Right:       preview(rm),
	})

	keys := sortedUnion(lm, rm)
	allSame := len(lm) == len(rm)
	for _, k := range keys {
		lv, lok := lm[k]
		rv, rok := rm[k]
		childSame := d.walk(joinPath(path, k), k, depth+1, side{lv, lok}, side{rv, rok})
		allSame = allSame && childSame
	}

	d.rows[idx].ChildCount = len(keys)
	d.rows[idx].Status = statusOf(allSame)
	return allSame
}

// walkArray 按下标对齐两侧数组, 超出较短一侧的元素走 added/removed 分支.
func (d *differ) walkArray(path, key string, depth int, la, ra []interface{}) bool {
	idx := len(d.rows)
	d.rows = append(d.rows, DiffRow{
		Path:        path,
		Key:         key,
		Depth:       depth,
		Kind:        "array",
		HasChildren: len(la) > 0 || len(ra) > 0,
		Left:        preview(la),
		Right:       preview(ra),
	})

	n := max(len(la), len(ra))
	allSame := len(la) == len(ra)
	for i := 0; i < n; i++ {
		ls := side{}
		if i < len(la) {
			ls = side{la[i], true}
		}
		rs := side{}
		if i < len(ra) {
			rs = side{ra[i], true}
		}
		childKey := "[" + strconv.Itoa(i) + "]"
		childSame := d.walk(path+childKey, childKey, depth+1, ls, rs)
		allSame = allSame && childSame
	}

	d.rows[idx].ChildCount = n
	d.rows[idx].Status = statusOf(allSame)
	return allSame
}

// emitOneSided 把单侧存在的子树整棵按给定 status 展开. fromLeft 决定预览填左还是右.
func (d *differ) emitOneSided(path, key string, depth int, v interface{}, status string, fromLeft bool) {
	row := DiffRow{
		Path:   path,
		Key:    key,
		Depth:  depth,
		Status: status,
		Kind:   kindOf(v),
	}
	if p := preview(v); fromLeft {
		row.Left = p
	} else {
		row.Right = p
	}

	switch t := v.(type) {
	case map[string]interface{}:
		row.HasChildren = len(t) > 0
		row.ChildCount = len(t)
		d.rows = append(d.rows, row)
		for _, k := range sortedKeys(t) {
			d.emitOneSided(joinPath(path, k), k, depth+1, t[k], status, fromLeft)
		}
	case []interface{}:
		row.HasChildren = len(t) > 0
		row.ChildCount = len(t)
		d.rows = append(d.rows, row)
		for i, cv := range t {
			ck := "[" + strconv.Itoa(i) + "]"
			d.emitOneSided(path+ck, ck, depth+1, cv, status, fromLeft)
		}
	default:
		d.rows = append(d.rows, row)
	}
}

func (d *differ) computeStats() DiffStats {
	st := DiffStats{Total: len(d.rows)}
	for _, row := range d.rows {
		switch row.Status {
		case statusSame:
			st.Same++
		case statusChanged:
			st.Changed++
		case statusAdded:
			st.Added++
		case statusRemoved:
			st.Removed++
		}
	}
	return st
}

func statusOf(same bool) string {
	if same {
		return statusSame
	}
	return statusChanged
}

// sortedUnion 返回两个对象 key 的有序并集.
func sortedUnion(a, b map[string]interface{}) []string {
	seen := make(map[string]struct{}, len(a)+len(b))
	keys := make([]string, 0, len(a)+len(b))
	for k := range a {
		seen[k] = struct{}{}
		keys = append(keys, k)
	}
	for k := range b {
		if _, ok := seen[k]; !ok {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	return keys
}

func sortedKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// joinPath 拼对象属性路径: 合法标识符 key 用 .key, 含特殊字符的 key 用 ["..."].
func joinPath(parent, key string) string {
	if isIdent(key) {
		return parent + "." + key
	}
	return parent + "[" + strconv.Quote(key) + "]"
}

// isIdent 判断 key 是否可直接用 .key 拼路径. 接受 unicode 字母(如中文 key →
// $.名字 比 $["名字"] 更干净), 含点/空格/纯数字开头等则退回 ["..."] 形式.
func isIdent(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if r == '_' || unicode.IsLetter(r) {
			continue
		}
		if i > 0 && unicode.IsDigit(r) {
			continue
		}
		return false
	}
	return true
}

// scalarEqual 比较两个标量 JSON 值是否相等(数字按规范化后比较).
func scalarEqual(a, b interface{}) bool {
	switch av := a.(type) {
	case json.Number:
		bv, ok := b.(json.Number)
		return ok && numberEqual(av, bv)
	case string:
		bv, ok := b.(string)
		return ok && av == bv
	case bool:
		bv, ok := b.(bool)
		return ok && av == bv
	case nil:
		return b == nil
	default:
		return false
	}
}

// numberEqual 比较两个 json.Number.
//   1. 字面量相同直接相等
//   2. 都是整数形 → big.Int 精确比较, 避免大整数走 float 丢精度被误判相等
//   3. 含小数 / 指数 → float64 比较, 覆盖 1 与 1.0、1e3 与 1000
func numberEqual(a, b json.Number) bool {
	if a.String() == b.String() {
		return true
	}

	ai, aok := new(big.Int).SetString(a.String(), 10)
	bi, bok := new(big.Int).SetString(b.String(), 10)
	if aok && bok {
		return ai.Cmp(bi) == 0
	}

	af, aerr := a.Float64()
	bf, berr := b.Float64()
	return aerr == nil && berr == nil && af == bf
}

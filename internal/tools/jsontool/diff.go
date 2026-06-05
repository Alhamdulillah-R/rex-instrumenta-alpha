package jsontool

import (
	"bytes"
	"encoding/json"
	"math/big"
	"sort"
	"strconv"
	"strings"
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

// DiffOptions 控制数组(列表)如何对齐.
//   ArrayMode="index": 严格按下标对位(顺序敏感, 旧行为);
//   其它(默认): 智能匹配 —— 对象按主键配对、标量按值配对, 顺序无关、增删不级联.
//   ArrayKey: 对象数组的主键字段; 空则在 id/_id/uuid/key/name… 里自动探测.
type DiffOptions struct {
	ArrayMode string `json:"arrayMode"`
	ArrayKey  string `json:"arrayKey"`
}

// keyMode 报告是否走智能匹配(默认走; 仅显式 "index" 走按下标).
func (o DiffOptions) keyMode() bool {
	return o.ArrayMode != "index"
}

// side 表示某个 key/index 在一侧的取值与是否存在.
type side struct {
	v       interface{}
	present bool
}

type differ struct {
	rows []DiffRow
	opts DiffOptions
}

// diffTexts 解析两份文本并产出展平 diff. 任一侧解析失败 → 返回带 Error 的空结果.
func diffTexts(leftText, rightText string, opts DiffOptions) DiffResult {
	left, err := parseJSON(leftText)
	if err != nil {
		return DiffResult{Error: "左侧 JSON 解析失败: " + err.Error()}
	}

	right, err := parseJSON(rightText)
	if err != nil {
		return DiffResult{Error: "右侧 JSON 解析失败: " + err.Error()}
	}

	d := &differ{rows: make([]DiffRow, 0, 256), opts: opts}
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

// walkArray 对比两数组. 默认智能匹配(主键/值对齐), ArrayMode=index 时按下标对位.
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

	var childCount int
	var allSame bool
	if d.opts.keyMode() {
		childCount, allSame = d.walkArrayMatched(path, depth, la, ra)
	} else {
		childCount, allSame = d.walkArrayIndexed(path, depth, la, ra)
	}

	d.rows[idx].ChildCount = childCount
	d.rows[idx].Status = statusOf(allSame)
	return allSame
}

// walkArrayIndexed 按下标对齐两数组, 超出较短一侧的元素走 added/removed.
func (d *differ) walkArrayIndexed(path string, depth int, la, ra []interface{}) (int, bool) {
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
	return n, allSame
}

// walkArrayMatched 先把两数组对齐成槽位(主键/值匹配), 再逐槽 walk.
func (d *differ) walkArrayMatched(path string, depth int, la, ra []interface{}) (int, bool) {
	slots := d.alignArray(la, ra)
	allSame := true
	for _, s := range slots {
		childSame := d.walk(path+s.childKey, s.childKey, depth+1, s.l, s.r)
		allSame = allSame && childSame
	}
	return len(slots), allSame
}

// slot 是数组对齐后的一个槽位: 左右两侧(可能缺一侧)+ 展示用 child key.
type slot struct {
	l, r     side
	childKey string
}

// alignArray 把两数组对齐成有序槽位:
//  1. 能确定主键时(指定字段或自动探测), 对象按主键配对;
//  2. 其余元素(无主键 / 标量)按"整体值相等"做多重集合配对;
//  3. 配不上的, 左侧记 removed、右侧记 added.
//
// 槽位顺序: 先按左序出匹配/删除, 再补右侧新增. child key: 有主键用 [字段=值], 否则 [序号].
func (d *differ) alignArray(la, ra []interface{}) []slot {
	// 指定的主键(可为嵌套路径)只在两侧都有元素能解析它时生效; 否则回退自动探测.
	// 这样一个路径键(如 fromSegments.flightNo)只作用于相关数组, 别的数组照样自动认 id.
	keyField := d.opts.ArrayKey
	if keyField == "" || !keyApplies(la, keyField) || !keyApplies(ra, keyField) {
		keyField = detectKey(la, ra)
	}

	usedR := make([]bool, len(ra))
	var slots []slot
	var leftRest []int
	seq := 0

	if keyField != "" {
		rByKey := map[string][]int{}
		for j, rv := range ra {
			if kv, _, ok := keyVal(rv, keyField); ok {
				rByKey[kv] = append(rByKey[kv], j)
			}
		}
		for i, lv := range la {
			kv, ck, ok := keyVal(lv, keyField)
			if !ok {
				leftRest = append(leftRest, i)
				continue
			}
			q := rByKey[kv]
			if len(q) == 0 {
				leftRest = append(leftRest, i)
				continue
			}
			j := q[0]
			rByKey[kv] = q[1:]
			usedR[j] = true
			slots = append(slots, slot{
				l:        side{lv, true},
				r:        side{ra[j], true},
				childKey: ck,
			})
		}
	} else {
		for i := range la {
			leftRest = append(leftRest, i)
		}
	}

	var rightRest []int
	for j := range ra {
		if !usedR[j] {
			rightRest = append(rightRest, j)
		}
	}

	// 剩余元素按整体值相等配对(标量列表 / 无主键对象)
	usedRR := make([]bool, len(rightRest))
	for _, li := range leftRest {
		matched := -1
		for ri, rj := range rightRest {
			if !usedRR[ri] && valueEqual(la[li], ra[rj]) {
				matched = ri
				break
			}
		}
		if matched >= 0 {
			usedRR[matched] = true
			slots = append(slots, slot{
				l:        side{la[li], true},
				r:        side{ra[rightRest[matched]], true},
				childKey: slotKey(la[li], keyField, &seq),
			})
		} else {
			slots = append(slots, slot{
				l:        side{la[li], true},
				childKey: slotKey(la[li], keyField, &seq),
			})
		}
	}
	for ri, rj := range rightRest {
		if usedRR[ri] {
			continue
		}
		slots = append(slots, slot{
			r:        side{ra[rj], true},
			childKey: slotKey(ra[rj], keyField, &seq),
		})
	}

	return slots
}

// keyCandidates 是自动探测主键时的候选字段(按优先级).
var keyCandidates = []string{"id", "_id", "uuid", "guid", "key", "name", "code", "slug"}

// detectKey 在候选字段里挑一个能当主键的: 两侧都是非空对象数组、且该字段在各侧都存在且取值唯一.
func detectKey(la, ra []interface{}) string {
	if len(la) == 0 || len(ra) == 0 || !allObjects(la) || !allObjects(ra) {
		return ""
	}
	for _, c := range keyCandidates {
		if uniqueKey(la, c) && uniqueKey(ra, c) {
			return c
		}
	}
	return ""
}

func allObjects(a []interface{}) bool {
	for _, v := range a {
		if _, ok := v.(map[string]interface{}); !ok {
			return false
		}
	}
	return true
}

// uniqueKey 报告字段 c 在数组每个对象里都存在、且取值互不相同(可作主键).
func uniqueKey(a []interface{}, c string) bool {
	seen := make(map[string]struct{}, len(a))
	for _, v := range a {
		cv, _, ok := keyVal(v, c)
		if !ok {
			return false
		}
		if _, dup := seen[cv]; dup {
			return false
		}
		seen[cv] = struct{}{}
	}
	return true
}

// keyApplies 报告主键 key 在数组里是否"相关"(至少有一个元素能解析出它).
// 用来判断指定的路径键该不该作用于这个数组.
func keyApplies(a []interface{}, key string) bool {
	for _, v := range a {
		if _, _, ok := keyVal(v, key); ok {
			return true
		}
	}
	return false
}

// keyVal 取对象在主键 key 处的值. key 可为简单字段(id)或嵌套路径
// (fromSegments.flightNo / fromSegments[0].flightNo / fromSegments[*].flightNo).
// 返回(匹配用规范化串, 展示用 child key 形如 [flightNo="OZ1085"], 是否可用作主键).
func keyVal(v interface{}, key string) (string, string, bool) {
	leaves, lastField, ok := resolveKeyPath(v, key)
	if !ok || len(leaves) == 0 {
		return "", "", false
	}

	var canon, disp strings.Builder
	for i, lf := range leaves {
		c, d, ok := scalarKey(lf)
		if !ok {
			return "", "", false // 叶子是 null/容器 → 不能当主键
		}
		if i > 0 {
			canon.WriteByte(0x1f)
			disp.WriteByte('+')
		}
		canon.WriteString(c)
		disp.WriteString(d)
	}
	return canon.String(), "[" + lastField + "=" + disp.String() + "]", true
}

// scalarKey 把一个标量叶子转成(规范化串带类型前缀, 展示字面量, 是否标量).
func scalarKey(v interface{}) (string, string, bool) {
	switch t := v.(type) {
	case string:
		return "s:" + t, strconv.Quote(t), true
	case json.Number:
		return "n:" + t.String(), t.String(), true
	case bool:
		if t {
			return "b:true", "true", true
		}
		return "b:false", "false", true
	default:
		return "", "", false
	}
}

type pathSeg struct {
	field string
	mode  int // 0 普通字段, 1 下标 [n], 2 通配 [*]
	index int
}

// parsePath 解析主键路径成段. 容忍前导 $ / . ; 段形如 name / name[0] / name[*].
func parsePath(key string) ([]pathSeg, bool) {
	s := strings.TrimPrefix(strings.TrimPrefix(key, "$"), ".")
	if s == "" {
		return nil, false
	}
	parts := strings.Split(s, ".")
	segs := make([]pathSeg, 0, len(parts))
	for _, p := range parts {
		seg := pathSeg{}
		if i := strings.IndexByte(p, '['); i >= 0 {
			if !strings.HasSuffix(p, "]") {
				return nil, false
			}
			seg.field = p[:i]
			inner := p[i+1 : len(p)-1]
			if inner == "*" {
				seg.mode = 2
			} else {
				n, err := strconv.Atoi(inner)
				if err != nil || n < 0 {
					return nil, false
				}
				seg.mode, seg.index = 1, n
			}
		} else {
			seg.field = p
		}
		if seg.field == "" {
			return nil, false
		}
		segs = append(segs, seg)
	}
	return segs, true
}

// resolveKeyPath 沿路径取叶子值. 字段访问遇数组隐式 map 到各元素(让 fromSegments.flightNo
// 直接拿到所有段的 flightNo); [n] 取指定段, [*] 展开全部段. 返回叶子列表 + 末段字段名.
func resolveKeyPath(v interface{}, key string) ([]interface{}, string, bool) {
	segs, ok := parsePath(key)
	if !ok {
		return nil, "", false
	}

	current := []interface{}{v}
	for _, seg := range segs {
		var afterField []interface{}
		for _, cur := range current {
			switch c := cur.(type) {
			case map[string]interface{}:
				if fv, ok := c[seg.field]; ok {
					afterField = append(afterField, fv)
				}
			case []interface{}:
				for _, el := range c { // 数组隐式 map
					if m, ok := el.(map[string]interface{}); ok {
						if fv, ok := m[seg.field]; ok {
							afterField = append(afterField, fv)
						}
					}
				}
			}
		}
		current = afterField

		switch seg.mode {
		case 1:
			var next []interface{}
			for _, cur := range current {
				if arr, ok := cur.([]interface{}); ok && seg.index < len(arr) {
					next = append(next, arr[seg.index])
				}
			}
			current = next
		case 2:
			var next []interface{}
			for _, cur := range current {
				if arr, ok := cur.([]interface{}); ok {
					next = append(next, arr...)
				}
			}
			current = next
		}
	}

	if len(current) == 0 {
		return nil, "", false
	}
	return current, segs[len(segs)-1].field, true
}

// slotKey 给无主键配对的元素取 child key: 能解析主键就用它, 否则 [递增序号].
func slotKey(v interface{}, keyField string, seq *int) string {
	if keyField != "" {
		if _, ck, ok := keyVal(v, keyField); ok {
			return ck
		}
	}
	k := "[" + strconv.Itoa(*seq) + "]"
	*seq++
	return k
}

// valueEqual 深度比较两个 JSON 值是否完全相等(数字规范化; 数组按位、顺序敏感).
// 仅用于数组里"整体相等"的配对判定, 与逐层 diff 互不影响.
func valueEqual(a, b interface{}) bool {
	ak, bk := kindOf(a), kindOf(b)
	if ak != bk {
		return false
	}
	switch ak {
	case "object":
		am := a.(map[string]interface{})
		bm := b.(map[string]interface{})
		if len(am) != len(bm) {
			return false
		}
		for k, av := range am {
			bv, ok := bm[k]
			if !ok || !valueEqual(av, bv) {
				return false
			}
		}
		return true
	case "array":
		aa := a.([]interface{})
		ba := b.([]interface{})
		if len(aa) != len(ba) {
			return false
		}
		for i := range aa {
			if !valueEqual(aa[i], ba[i]) {
				return false
			}
		}
		return true
	default:
		return scalarEqual(a, b)
	}
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

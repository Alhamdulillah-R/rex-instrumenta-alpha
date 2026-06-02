package jsontool

import (
	"encoding/json"
	"strconv"
)

// kindOf 返回 JSON 值的种类标签, 与前端 canvas 配色 / diff 行 Kind 对齐.
func kindOf(v interface{}) string {
	switch v.(type) {
	case map[string]interface{}:
		return "object"
	case []interface{}:
		return "array"
	case string:
		return "string"
	case json.Number:
		return "number"
	case bool:
		return "bool"
	case nil:
		return "null"
	default:
		return "unknown"
	}
}

const previewMaxLen = 120

// preview 把任意 JSON 值压成一行短预览, 供 diff 行左右两侧对照展示.
// 容器输出 key/item 计数概览, 标量输出其字面值, 过长按 rune 截断.
func preview(v interface{}) string {
	switch t := v.(type) {
	case map[string]interface{}:
		return "{ " + strconv.Itoa(len(t)) + " keys }"
	case []interface{}:
		return "[ " + strconv.Itoa(len(t)) + " items ]"
	case string:
		return clip(strconv.Quote(t))
	case json.Number:
		return t.String()
	case bool:
		if t {
			return "true"
		}
		return "false"
	case nil:
		return "null"
	default:
		return "?"
	}
}

// clip 按 rune 截断, 避免切断多字节 UTF-8 字符.
func clip(s string) string {
	r := []rune(s)
	if len(r) <= previewMaxLen {
		return s
	}
	return string(r[:previewMaxLen]) + "…"
}

import { SetClipboard, OpenTextFile, SaveTextFile } from '@bindings/go/platform/Platform'

/**
 * isWails 判断是否跑在 Wails 桌面壳里(window.go 由 Wails 注入). 否则是 vite 浏览器预览.
 */
export function isWails(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { go?: unknown }).go
}

/**
 * copyText 复制文本到剪贴板. 桌面端走 Go 原生剪贴板(WebView2 的 navigator.clipboard
 * 受焦点 / secure-context 限制不稳), 浏览器预览回退 navigator.clipboard / execCommand.
 * @return 是否成功
 */
export async function copyText(text: string): Promise<boolean> {
  if (isWails()) {
    try {
      await SetClipboard(text)
      return true
    } catch {
      // 落到浏览器回退
    }
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续 execCommand 兜底
  }

  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export interface OpenedFile {
  path: string
  content: string
}

/**
 * openTextFile 打开文本文件. 桌面端用 Go 原生对话框读盘(大文件快且不阻塞主线程);
 * 浏览器预览回退 <input type=file>. 用户取消返回 null.
 */
export async function openTextFile(): Promise<OpenedFile | null> {
  if (isWails()) {
    const res = await OpenTextFile()
    if (!res || !res.path) return null
    return { path: res.path, content: res.content }
  }
  return openViaInput()
}

function openViaInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.jsonl,.ndjson,.txt'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve({ path: file.name, content: String(reader.result ?? '') })
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}

/**
 * saveTextFile 保存文本. 桌面端 Go 原生保存框; 浏览器预览回退 Blob 下载.
 * @return 是否保存(浏览器下载视为成功; 桌面端用户取消为 false)
 */
export async function saveTextFile(defaultName: string, content: string): Promise<boolean> {
  if (isWails()) {
    const path = await SaveTextFile(defaultName, content)
    return !!path
  }

  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  a.click()
  URL.revokeObjectURL(url)
  return true
}

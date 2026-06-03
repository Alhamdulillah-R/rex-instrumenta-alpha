import { ref, computed } from 'vue'
import {
  listDocs,
  getDoc,
  saveDoc,
  renameDoc,
  removeDoc,
  setPinDoc,
  removeManyDocs,
  type JsonDoc,
} from '../store/docStore'

const ACTIVE_KEY = 'ria-json-active-id'

/**
 * useJsonLibrary 管 JSON 工具的文档库: 文档列表 + 当前活动文档. 正文持久化交给
 * docStore(桌面端落盘 / 浏览器回退 localStorage), 活动 id 这个小指针存 localStorage.
 * 让"切换工具 / 关闭重开"能恢复上次正在看的 JSON, 并支持从历史里再导入.
 */
export function useJsonLibrary() {
  const docs = ref<JsonDoc[]>([])
  const activeId = ref(localStorage.getItem(ACTIVE_KEY) || '')
  const error = ref('')

  const activeDoc = computed(() => docs.value.find((d) => d.id === activeId.value) ?? null)

  function setActive(id: string): void {
    activeId.value = id
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  }

  /**
   * init 加载文档列表并恢复上次活动文档的正文. 库为空时用 seed 建首篇示例文档,
   * 保留"一进来就有树可看"的首屏体验.
   * @param seed 库为空时作为示例文档的正文
   * @return 应显示在编辑器里的正文
   */
  async function init(seed: string): Promise<string> {
    docs.value = await listDocs()

    let id = activeId.value
    if (!id || !docs.value.some((d) => d.id === id)) {
      id = docs.value[0]?.id ?? ''
    }

    if (!id) {
      const r = await saveDoc('', 'json 样本', seed)
      if (!r.error) {
        docs.value = r.docs
        setActive(r.id ?? docs.value[0]?.id ?? '')
      }
      return seed
    }

    setActive(id)
    const got = await getDoc(id)
    return got?.content ?? ''
  }

  /**
   * load 切到某篇历史文档, 返回其正文供编辑器加载.
   */
  async function load(id: string): Promise<string> {
    const got = await getDoc(id)
    setActive(id)
    return got?.content ?? ''
  }

  /**
   * save 把正文存进当前活动文档(无活动文档则自动新建并设为活动). 不改名.
   * 供编辑/格式化/粘贴后的防抖自动保存调用.
   */
  async function save(content: string): Promise<void> {
    const r = await saveDoc(activeId.value, '', content)
    if (r.error) {
      error.value = r.error
      return
    }
    docs.value = r.docs
    if (r.id) setActive(r.id)
  }

  /**
   * create 新建一篇文档并设为活动. name 为空则按时间自动命名.
   */
  async function create(name: string, content: string): Promise<void> {
    const r = await saveDoc('', name, content)
    if (r.error) {
      error.value = r.error
      return
    }
    docs.value = r.docs
    if (r.id) setActive(r.id)
  }

  /**
   * rename 给某篇文档改名(空名回落到自动命名).
   */
  async function rename(id: string, name: string): Promise<void> {
    const r = await renameDoc(id, name)
    if (r.error) {
      error.value = r.error
      return
    }
    docs.value = r.docs
  }

  /**
   * remove 删一篇文档. 删的是当前活动文档时, 切到最近一篇并返回其正文(供编辑器加载);
   * 否则返回 null 表示编辑器无需变化.
   * @return 需要加载到编辑器的正文, 或 null
   */
  async function remove(id: string): Promise<string | null> {
    const r = await removeDoc(id)
    if (r.error) {
      error.value = r.error
      return null
    }
    docs.value = r.docs
    if (activeId.value !== id) return null

    const next = docs.value[0]?.id ?? ''
    setActive(next)
    if (!next) return ''
    const got = await getDoc(next)
    return got?.content ?? ''
  }

  /**
   * setPin 固定/取消固定一篇文档(固定的排最前, 清空时保留).
   */
  async function setPin(id: string, pinned: boolean): Promise<void> {
    const r = await setPinDoc(id, pinned)
    if (r.error) {
      error.value = r.error
      return
    }
    docs.value = r.docs
  }

  /**
   * removeMany 批量删文档(多选清理 / 清空非固定). 删到当前活动文档时切到剩下最前一篇
   * 并返回其正文(供编辑器加载); 否则返回 null 表示编辑器无需变化.
   * @return 需要加载到编辑器的正文, 或 null
   */
  async function removeMany(ids: string[]): Promise<string | null> {
    const r = await removeManyDocs(ids)
    if (r.error) {
      error.value = r.error
      return null
    }
    docs.value = r.docs
    if (!ids.includes(activeId.value)) return null

    const next = docs.value[0]?.id ?? ''
    setActive(next)
    if (!next) return ''
    const got = await getDoc(next)
    return got?.content ?? ''
  }

  return { docs, activeId, activeDoc, error, init, load, save, create, rename, remove, setPin, removeMany }
}

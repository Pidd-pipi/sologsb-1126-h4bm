/** 表单草稿：写在浏览器 localStorage，刷新或误关页面后可恢复。 */

const PREFIX = 'gbcampsite:draft:'

export type DraftKey = 'site-new' | 'veto-new' | 'scoring-profile'

function fullKey(key: string): string {
  return `${PREFIX}${key}`
}

/** 保存草稿；序列化失败时静默忽略，不影响主流程。 */
export function saveDraft<T>(key: DraftKey | string, value: T): void {
  try {
    window.localStorage.setItem(
      fullKey(key),
      JSON.stringify({ savedAt: new Date().toISOString(), value })
    )
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/** 读取草稿，返回 null 表示没有可用草稿。 */
export function loadDraft<T>(key: DraftKey | string): T | null {
  try {
    const raw = window.localStorage.getItem(fullKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value?: T }
    return (parsed && 'value' in parsed ? (parsed.value as T) : null) ?? null
  } catch {
    return null
  }
}

/** 草稿保存时间。 */
export function draftSavedAt(key: DraftKey | string): string {
  try {
    const raw = window.localStorage.getItem(fullKey(key))
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { savedAt?: string }
    return parsed?.savedAt ?? ''
  } catch {
    return ''
  }
}

/** 清除草稿。 */
export function clearDraft(key: DraftKey | string): void {
  try {
    window.localStorage.removeItem(fullKey(key))
  } catch {
    /* ignore */
  }
}

/** 列出全部草稿键，供页面测试与调试确认 localStorage 落盘。 */
export function listDraftKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
  } catch {
    /* ignore */
  }
  return keys
}

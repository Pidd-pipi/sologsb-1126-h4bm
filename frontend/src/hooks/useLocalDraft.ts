/**
 * useLocalDraft —— 把「表单 ↔ localStorage 草稿」的同步逻辑收在一处。
 * 自动保存按防抖触发；刷新后可恢复、也可手动清除。
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { clearDraft, draftSavedAt, loadDraft, saveDraft, type DraftKey } from '@/utils/draft'
import { formatDateTime } from '@/utils/format'

export interface LocalDraftOptions<T> {
  key: DraftKey | string
  /** 参与草稿的响应式数据源 */
  source: Ref<T>
  /** 是否自动保存（默认 true） */
  auto?: boolean
  /** 防抖毫秒数 */
  delay?: number
  /** 恢复草稿时的回调，便于页面做提示或补齐表单 */
  onRestore?: (value: T) => void
}

export interface LocalDraftState<T> {
  savedAt: Ref<string>
  restored: Ref<boolean>
  /** 最近一次恢复出来的草稿内容 */
  restoredValue: Ref<T | null>
  save: () => void
  restore: () => T | null
  clear: () => void
  savedAtText: Ref<string>
}

export function useLocalDraft<T>(options: LocalDraftOptions<T>): LocalDraftState<T> {
  const savedAt = ref(draftSavedAt(options.key))
  const restored = ref(false)
  const restoredValue = ref<T | null>(null) as Ref<T | null>
  let timer: number | null = null

  const savedAtText = ref(savedAt.value ? formatDateTime(savedAt.value) : '')

  function save(): void {
    saveDraft(options.key, options.source.value)
    savedAt.value = draftSavedAt(options.key)
    savedAtText.value = formatDateTime(savedAt.value)
  }

  function restore(): T | null {
    const value = loadDraft<T>(options.key)
    if (value == null) {
      restored.value = false
      return null
    }
    restoredValue.value = value
    restored.value = true
    options.source.value = value
    options.onRestore?.(value)
    savedAt.value = draftSavedAt(options.key)
    savedAtText.value = formatDateTime(savedAt.value)
    return value
  }

  function clear(): void {
    clearDraft(options.key)
    savedAt.value = ''
    savedAtText.value = ''
    restored.value = false
    restoredValue.value = null
  }

  if (options.auto !== false) {
    watch(
      options.source,
      () => {
        if (timer !== null) window.clearTimeout(timer)
        const delay = options.delay ?? 400
        timer = window.setTimeout(() => {
          save()
        }, delay)
      },
      { deep: true }
    )
  }

  onBeforeUnmount(() => {
    if (timer !== null) window.clearTimeout(timer)
  })

  return { savedAt, restored, restoredValue, savedAtText, save, restore, clear }
}

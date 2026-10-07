/** 营位与因子评估的本地读写。写库前统一脱掉响应式 Proxy，避免 DataCloneError。 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  addFactorAssessment,
  db,
  notifyDataChange,
  onDataChange,
  toPlain,
  type AddFactorResult
} from '@/utils/db'
import type { Campsite } from '@/types/campsite'
import type { FactorAssessment, FactorAssessmentInput } from '@/types/factor'
import { compareAssessments } from '@/types/factor'
import { useUiStore } from '@/stores/uiStore'
import { nextSerialNo, nowIso } from '@/utils/format'

export const useSiteStore = defineStore('site', () => {
  const list = ref<Campsite[]>([])
  const factors = ref<FactorAssessment[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      list.value = await db.sites.orderBy('code').toArray()
      factors.value = await db.factors.toArray()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** 两个页面同时操作时，收到其他页面的提交后立即刷新内存中的名次依据。 */
  onDataChange((event) => {
    if (event.table === 'sites' || event.table === 'factors') void load()
    if (event.table === 'sites' || event.table === 'vetos') {
      useUiStore().loadVetos().catch(() => undefined)
    }
  })

  /** 生成下一个营位编号，如 CS-0007。 */
  function nextCode(): string {
    return nextSerialNo('CS-', list.value.map((s) => s.code))
  }

  async function createSite(input: Campsite): Promise<number> {
    const now = nowIso()
    const record = toPlain({ ...input, createdAt: now, updatedAt: now }) as Campsite
    delete record.id
    const id = await db.sites.add(record)
    await load()
    notifyDataChange('sites')
    return id
  }

  async function updateSite(id: number, patch: Partial<Campsite>): Promise<void> {
    await db.sites.update(id, toPlain({ ...patch, updatedAt: nowIso() }))
    await load()
    notifyDataChange('sites')
  }

  async function removeSite(id: number): Promise<void> {
    await db.sites.delete(id)
    const own = factors.value.filter((f) => f.siteId === id)
    await db.factors.bulkDelete(
      own.map((f) => f.id).filter((v): v is number => typeof v === 'number')
    )
    const vetoIds = (await db.vetos.where('siteId').equals(id).toArray())
      .map((v) => v.id)
      .filter((v): v is number => typeof v === 'number')
    await db.vetos.bulkDelete(vetoIds)
    await load()
    notifyDataChange('sites')
    notifyDataChange('vetos')
  }

  /**
   * 追加因子评估。事务内重新读取库中最新一轮：
   * 晚到且日期不更新时不覆盖，返回差异供页面确认；确认后作为历史补录保留。
   */
  async function addFactor(input: FactorAssessmentInput, force = false): Promise<AddFactorResult> {
    const result = await addFactorAssessment(input, force)
    await load()
    if (result.outcome === 'added') notifyDataChange('factors')
    return result
  }

  async function removeFactor(id: number): Promise<void> {
    await db.factors.delete(id)
    await load()
    notifyDataChange('factors')
  }

  function byId(id: number | null | undefined): Campsite | null {
    if (id == null || Number.isNaN(id)) return null
    return list.value.find((s) => s.id === id) ?? null
  }

  /** 取某营位最新一轮因子评估（按评估日期、同日期按提交次序倒序）。 */
  function latestFactor(siteId: number | null | undefined): FactorAssessment | null {
    if (siteId == null) return null
    const rows = factors.value
      .filter((f) => f.siteId === siteId)
      .sort((a, b) => compareAssessments(b, a))
    return rows[0] ?? null
  }

  /** 取某营位全部因子评估（按补录先后展示，旧记录仍可查）。 */
  function factorsOf(siteId: number | null | undefined): FactorAssessment[] {
    if (siteId == null) return []
    return [...factors.value.filter((f) => f.siteId === siteId)].sort((a, b) => {
      const hasSequenceA = typeof a.sequence === 'number'
      const hasSequenceB = typeof b.sequence === 'number'
      if (hasSequenceA !== hasSequenceB) return hasSequenceA ? -1 : 1
      if (hasSequenceA && hasSequenceB && a.sequence !== b.sequence) {
        return a.sequence - b.sequence
      }
      return compareAssessments(a, b)
    })
  }

  const camps = computed(() => Array.from(new Set(list.value.map((s) => s.campName))))
  const total = computed(() => list.value.length)

  return {
    list,
    factors,
    loading,
    loaded,
    total,
    camps,
    load,
    nextCode,
    createSite,
    updateSite,
    removeSite,
    addFactor,
    removeFactor,
    byId,
    latestFactor,
    factorsOf
  }
})

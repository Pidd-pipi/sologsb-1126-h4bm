/** 营位与因子评估的本地读写。写库前统一脱掉响应式 Proxy，避免 DataCloneError。 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db, toPlain } from '@/utils/db'
import type { Campsite } from '@/types/campsite'
import type { FactorAssessment } from '@/types/factor'
import { nextSerialNo, nowIso, todayIso } from '@/utils/format'

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
    return id
  }

  async function updateSite(id: number, patch: Partial<Campsite>): Promise<void> {
    await db.sites.update(id, toPlain({ ...patch, updatedAt: nowIso() }))
    await load()
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
  }

  async function addFactor(input: FactorAssessment): Promise<number> {
    const now = nowIso()
    const record = toPlain({
      ...input,
      assessedAt: input.assessedAt || todayIso(),
      createdAt: now,
      updatedAt: now
    }) as FactorAssessment
    delete record.id
    const id = await db.factors.add(record)
    await load()
    return id
  }

  async function removeFactor(id: number): Promise<void> {
    await db.factors.delete(id)
    await load()
  }

  function byId(id: number | null | undefined): Campsite | null {
    if (id == null || Number.isNaN(id)) return null
    return list.value.find((s) => s.id === id) ?? null
  }

  /** 取某营位最新一条因子评估（按评估日期倒序）。 */
  function latestFactor(siteId: number | null | undefined): FactorAssessment | null {
    if (siteId == null) return null
    const rows = factors.value
      .filter((f) => f.siteId === siteId)
      .sort((a, b) => (a.assessedAt < b.assessedAt ? 1 : -1))
    return rows[0] ?? null
  }

  /** 取某营位全部因子评估（多轮复核对比用）。 */
  function factorsOf(siteId: number | null | undefined): FactorAssessment[] {
    if (siteId == null) return []
    return factors.value
      .filter((f) => f.siteId === siteId)
      .sort((a, b) => (a.assessedAt < b.assessedAt ? 1 : -1))
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

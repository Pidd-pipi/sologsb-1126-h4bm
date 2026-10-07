/** 营位与因子评估的本地读写。写库前统一脱掉响应式 Proxy，避免 DataCloneError。 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db, toPlain } from '@/utils/db'
import type { Campsite } from '@/types/campsite'
import type { FactorAssessment } from '@/types/factor'
import { nextSerialNo, nowIso } from '@/utils/format'
import {
  compareAssessment,
  submitFactorAssessment,
  type SubmitFactorResult
} from '@/utils/factorHistory'
import { notifyDbChange, subscribeDbChange } from '@/utils/sync'

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

  // 其它标签页写入后静默重载，保证本页「先跟库里最新一轮比」时读到的是最新数据。
  subscribeDbChange((table) => {
    if (table === 'sites' || table === 'factors') void load()
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
    notifyDbChange('sites')
    await load()
    return id
  }

  async function updateSite(id: number, patch: Partial<Campsite>): Promise<void> {
    await db.sites.update(id, toPlain({ ...patch, updatedAt: nowIso() }))
    notifyDbChange('sites')
    await load()
  }

  async function removeSite(id: number): Promise<void> {
    await db.sites.delete(id)
    const own = factors.value.filter((f) => f.siteId === id)
    await db.factors.bulkDelete(
      own.map((f) => f.id).filter((v): v is number => typeof v === 'number')
    )
    notifyDbChange('sites')
    notifyDbChange('factors')
    await load()
  }

  /**
   * 追加一轮因子评估（带并发保护）：
   * 在单事务内先取库内最新一轮比日期——日期不更新且未强制确认时不写入，
   * 返回 stale 由页面列出差异；正常追加时轮次号自动接续，旧记录原样保留。
   */
  async function submitFactor(
    input: FactorAssessment,
    options?: { force?: boolean }
  ): Promise<SubmitFactorResult> {
    const result = await submitFactorAssessment(input, options)
    if (result.status === 'accepted') {
      notifyDbChange('factors')
      await load()
    }
    return result
  }

  /** 兼容新增营位页的首轮评估：该营位此前无记录，必为 accepted。 */
  async function addFactor(input: FactorAssessment): Promise<number> {
    const result = await submitFactor(input)
    if (result.status !== 'accepted') {
      throw new Error('该营位已存在更新的因子评估，请刷新后重试')
    }
    return result.id
  }

  /** 删除某一轮后，把该营位剩余各轮重新连续编号（第 1、2、… 轮不留空号）。 */
  async function removeFactor(id: number): Promise<void> {
    await db.transaction('rw', db.factors, async () => {
      const target = await db.factors.get(id)
      if (!target) return
      await db.factors.delete(id)
      const rest = (await db.factors.where('siteId').equals(target.siteId).toArray()).sort(
        (a, b) => compareAssessment(a, b)
      )
      const renumbered = rest.map((f, idx) =>
        f.round === idx + 1 ? null : { ...f, round: idx + 1, updatedAt: nowIso() }
      )
      const changed = renumbered.filter(
        (f): f is FactorAssessment => f !== null
      )
      if (changed.length) await db.factors.bulkPut(changed)
    })
    notifyDbChange('factors')
    await load()
  }

  function byId(id: number | null | undefined): Campsite | null {
    if (id == null || Number.isNaN(id)) return null
    return list.value.find((s) => s.id === id) ?? null
  }

  /** 取某营位最新一条因子评估（评估日期→录入时间→id 取最大）。评分只认它。 */
  function latestFactor(siteId: number | null | undefined): FactorAssessment | null {
    return factorsOf(siteId)[0] ?? null
  }

  /** 取某营位全部因子评估，最新一轮在前（多轮复核对比用），旧记录均可查。 */
  function factorsOf(siteId: number | null | undefined): FactorAssessment[] {
    if (siteId == null) return []
    // compareAssessment(a,b) < 0 表示 a 更早；降序（新→旧）即比较 (b,a)
    return factors.value
      .filter((f) => f.siteId === siteId)
      .sort((a, b) => compareAssessment(b, a))
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
    submitFactor,
    addFactor,
    removeFactor,
    byId,
    latestFactor,
    factorsOf
  }
})

/** 权重方案（ScoreProfile）的本地读写与启用切换。 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db, toPlain } from '@/utils/db'
import type { FactorWeights, ScoreProfile } from '@/types/score'
import { DEFAULT_WEIGHTS } from '@/types/score'
import { nowIso } from '@/utils/format'

export const useProfileStore = defineStore('profile', () => {
  const list = ref<ScoreProfile[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  const activeProfile = computed<ScoreProfile | null>(
    () => list.value.find((p) => p.active) ?? list.value[0] ?? null
  )

  const activeWeights = computed<FactorWeights>(() => ({
    ...DEFAULT_WEIGHTS,
    ...(activeProfile.value?.weights ?? {})
  }))

  async function load(): Promise<void> {
    loading.value = true
    try {
      list.value = await db.profiles.orderBy('id').toArray()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function createProfile(input: ScoreProfile): Promise<number> {
    const now = nowIso()
    const record = toPlain({
      ...input,
      weights: { ...DEFAULT_WEIGHTS, ...input.weights },
      thresholds: { ...input.thresholds },
      createdAt: now,
      updatedAt: now
    }) as ScoreProfile
    delete record.id
    const id = await db.profiles.add(record)
    await load()
    return id
  }

  async function updateProfile(id: number, patch: Partial<ScoreProfile>): Promise<void> {
    await db.profiles.update(id, toPlain({ ...patch, updatedAt: nowIso() }))
    await load()
  }

  /** 另存为新方案（复制当前方案、改名、可选切换季节）。 */
  async function duplicateProfile(id: number, name: string, season?: string): Promise<number> {
    const src = list.value.find((p) => p.id === id)
    const payload: ScoreProfile = {
      name,
      weights: { ...DEFAULT_WEIGHTS, ...(src?.weights ?? {}) },
      normalize: src?.normalize ?? 'minmax',
      thresholds: { ...(src?.thresholds ?? { gradeA: 78, gradeB: 58 }) },
      season: season ?? src?.season ?? '四季通用',
      active: false,
      note: src?.note ? `由「${src.name}」复制：${src.note}` : `由「${src?.name ?? '默认方案'}」复制`,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    return createProfile(payload)
  }

  async function removeProfile(id: number): Promise<void> {
    await db.profiles.delete(id)
    await load()
  }

  /** 启用某个方案：其余方案自动取消启用。 */
  async function activate(id: number): Promise<void> {
    const now = nowIso()
    await db.transaction('rw', db.profiles, async () => {
      for (const p of list.value) {
        if (typeof p.id !== 'number') continue
        await db.profiles.update(p.id, { active: p.id === id, updatedAt: now })
      }
    })
    await load()
  }

  function byId(id: number | null | undefined): ScoreProfile | null {
    if (id == null) return null
    return list.value.find((p) => p.id === id) ?? null
  }

  const total = computed(() => list.value.length)

  return {
    list,
    loading,
    loaded,
    total,
    activeProfile,
    activeWeights,
    load,
    createProfile,
    updateProfile,
    duplicateProfile,
    removeProfile,
    activate,
    byId
  }
})

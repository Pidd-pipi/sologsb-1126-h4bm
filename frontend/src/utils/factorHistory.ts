/**
 * 因子评估的留痕与并发保护工具：
 *  - compareAssessment：定义「哪条评估更新」的总次序（评估日期 → 录入时间 → id）；
 *  - diffAssessment：列出待提交评估与库里最新一轮的逐字段差异，供用户确认；
 *  - submitFactorAssessment：在单个 IndexedDB 事务内「先比对、后追加」，
 *    两个页面同时提交同一营位时，后到的一次会以库内最新一条为准做比较，
 *    日期不更新则不写入，改由调用方展示差异。
 *
 * 评分始终只认最新一轮（compareAssessment 取最大者），历史各轮原样保留。
 */
import { db, toPlain } from '@/utils/db'
import type { FactorAssessment } from '@/types/factor'
import { nowIso, todayIso } from '@/utils/format'

/**
 * 评估先后次序（标准升序比较器）：先比评估日期（YYYY-MM-DD 可直接按字符串比较），
 * 同日再比录入时间戳，仍相同则比自增 id。
 * 返回负数表示 a 更早（b 更新），0 表示相同；null 一律视为最早。
 */
export function compareAssessment(
  a: FactorAssessment | null | undefined,
  b: FactorAssessment | null | undefined
): number {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  if (a.assessedAt !== b.assessedAt) return a.assessedAt < b.assessedAt ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return (a.id ?? 0) - (b.id ?? 0)
}

/** 是否为严格意义上「更新」的一轮：评估日期晚于基准（同日同日不算更新）。 */
export function isNewerAssessment(incoming: FactorAssessment, latest: FactorAssessment | null): boolean {
  if (!latest) return true
  return incoming.assessedAt > latest.assessedAt
}

/** 逐字段差异行的字段定义（评估人、日期 + 9 项实测因子）。 */
export interface AssessmentFieldDef {
  key: keyof FactorAssessment
  label: string
  /** 展示值时追加的单位后缀 */
  unit?: string
}

export const ASSESSMENT_FIELDS: AssessmentFieldDef[] = [
  { key: 'waterDistance', label: '水源距离', unit: ' m' },
  { key: 'windDir', label: '风向' },
  { key: 'windForce', label: '风力', unit: ' 级' },
  { key: 'signalBars', label: '信号强度', unit: ' 格' },
  { key: 'sunHours', label: '日照时长', unit: ' h' },
  { key: 'rockfallRisk', label: '落石落枝风险' },
  { key: 'shade', label: '植被遮蔽度' },
  { key: 'distanceToCar', label: '离车距离', unit: ' m' },
  { key: 'distanceToTrail', label: '离步道距离', unit: ' m' },
  { key: 'assessor', label: '评估人' },
  { key: 'assessedAt', label: '评估日期' }
]

export interface AssessmentDiff {
  key: keyof FactorAssessment
  label: string
  oldValue: string
  newValue: string
}

function formatFieldValue(def: AssessmentFieldDef, row: FactorAssessment): string {
  const value = row[def.key]
  return `${value ?? '—'}${def.unit ?? ''}`
}

/** 比较待提交评估与最新一轮，返回所有取值不同的字段（无差异时为空数组）。 */
export function diffAssessment(
  incoming: FactorAssessment,
  latest: FactorAssessment | null
): AssessmentDiff[] {
  if (!latest) {
    return ASSESSMENT_FIELDS.map((def) => ({
      key: def.key,
      label: def.label,
      oldValue: '—',
      newValue: formatFieldValue(def, incoming)
    }))
  }
  return ASSESSMENT_FIELDS.filter((def) => {
    const a = latest[def.key]
    const b = incoming[def.key]
    return String(a ?? '') !== String(b ?? '')
  }).map((def) => ({
    key: def.key,
    label: def.label,
    oldValue: formatFieldValue(def, latest),
    newValue: formatFieldValue(def, incoming)
  }))
}

/** 提交结果：accepted 已落库为新一轮；stale 表示被库内更新的一轮顶下，未写入。 */
export type SubmitFactorResult =
  | { status: 'accepted'; id: number; round: number; latest: FactorAssessment }
  | { status: 'stale'; latest: FactorAssessment; diffs: AssessmentDiff[] }

interface SubmitOptions {
  /**
   * 用户看过差异后确认仍要追加。为 true 时即使评估日期不更新也照写，
   * 但轮次仍排到最新一轮之后，且不覆盖任何旧记录。
   */
  force?: boolean
}

/**
 * 在同一个读写事务内完成「取最新 → 比日期 → 追加」。
 * IndexedDB 事务串行提交，因此两个页面/标签页同时提交同一营位时，
 * 后提交的事务一定能看到先提交的那一轮，天然避免互相覆盖。
 */
export async function submitFactorAssessment(
  input: FactorAssessment,
  options: SubmitOptions = {}
): Promise<SubmitFactorResult> {
  const record = toPlain({
    ...input,
    assessedAt: input.assessedAt || todayIso()
  }) as FactorAssessment
  delete record.id

  return db.transaction('rw', db.factors, async () => {
    const existing = await db.factors.where('siteId').equals(record.siteId).toArray()
    const latest = existing.reduce<FactorAssessment | null>((acc, cur) =>
      // compareAssessment(acc, cur) < 0 表示 cur 更新，则取 cur
      compareAssessment(acc, cur) < 0 ? cur : acc
    , null)

    if (latest && !isNewerAssessment(record, latest) && !options.force) {
      return { status: 'stale', latest, diffs: diffAssessment(record, latest) }
    }

    const now = nowIso()
    record.round = existing.length > 0 ? Math.max(...existing.map((f) => f.round || 0)) + 1 : 1
    record.createdAt = now
    record.updatedAt = now
    const id = await db.factors.add(record)
    return { status: 'accepted', id, round: record.round, latest: { ...record, id } }
  })
}

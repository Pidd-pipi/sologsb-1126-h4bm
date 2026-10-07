/**
 * useRanking —— 读取营位、因子、权重与否决记录，算出归一化得分与名次。
 * 被 `/`（名次表）、`/scoring`（拖动权重实时重排）共同消费。
 *
 * 入参统一用 getter 函数，兼容 ref / computed / store 派生值，
 * 内部在独立 effectScope 中求值，保证 computed 依赖追踪正常且不泄漏。
 */
import { computed, effectScope, type ComputedRef } from 'vue'
import type { Campsite } from '@/types/campsite'
import type { FactorAssessment } from '@/types/factor'
import type { FactorKey, FactorWeights, GradeThresholds, NormalizeMethod } from '@/types/score'
import {
  buildFactorRows,
  buildNormalizedMatrix,
  gradeOf,
  rawValuesOf,
  weightedTotal,
  type Grade,
  type RawFactorValues,
  type SiteScore
} from '@/utils/score'

export interface RankingInput {
  /** 参与排名的营位集合 */
  sites: () => Campsite[]
  /** siteId -> 用于评分的因子记录（通常取最新一轮评估） */
  factorOf: (siteId: number) => FactorAssessment | null
  weights: () => FactorWeights
  normalize: () => NormalizeMethod
  thresholds: () => GradeThresholds
  /** 命中否决项的营位 id 集合 */
  vetoedIds: () => number[]
}

export interface RankingRow extends SiteScore {
  site: Campsite
  rank: number
  raw: RawFactorValues
  vetoTypes: string[]
}

export interface RankingState {
  /** 已按得分降序排列的名次 */
  ranked: ComputedRef<RankingRow[]>
  scoreOf: (siteId: number) => RankingRow | null
  gradeOfSite: (siteId: number) => Grade
  best: ComputedRef<RankingRow | null>
}

export function useRanking(input: RankingInput): RankingState {
  const scope = effectScope(true)

  const ranked = scope.run(() =>
    computed<RankingRow[]>(() => {
      const sites = input.sites() ?? []
      const normalize = input.normalize()
      const weights = input.weights()
      const thresholds = input.thresholds()
      const vetoSet = new Set(input.vetoedIds() ?? [])

      const list = sites.filter((s): s is Campsite & { id: number } => typeof s.id === 'number')

      // 关键：极差归一必须**同批营位一起比较**，逐条归一的话单条样本跨度为零会全部得 100。
      // 因此先收集全部原始指标，一次性归一化，再回填到每个营位。
      const entries = list.map((site) => ({
        siteId: site.id,
        values: rawValuesOf(site, input.factorOf(site.id))
      }))
      const matrix = buildNormalizedMatrix(entries, normalize)

      const rows: RankingRow[] = list.map((site, idx) => {
        const siteId = site.id
        const raw = entries[idx].values
        const normalized = matrix.get(siteId) ?? ({} as Record<FactorKey, number>)
        const vetoed = vetoSet.has(siteId)
        const total = weightedTotal(normalized, weights)
        return {
          site,
          siteId,
          total,
          grade: gradeOf(total, thresholds, vetoed),
          vetoed,
          vetoTypes: [],
          rows: buildFactorRows(normalized, weights).map((row) => ({ ...row, raw: raw[row.key] })),
          raw,
          rank: 0
        } satisfies RankingRow
      })

      const sorted = rows.sort((a, b) => b.total - a.total)
      sorted.forEach((row, idx) => {
        row.rank = idx + 1
      })
      return sorted
    })
  ) as ComputedRef<RankingRow[]>

  function scoreOf(siteId: number): RankingRow | null {
    return ranked.value.find((r) => r.siteId === siteId) ?? null
  }

  function gradeOfSite(siteId: number): Grade {
    return scoreOf(siteId)?.grade ?? 'C'
  }

  const best = scope.run(() => computed<RankingRow | null>(() => ranked.value[0] ?? null)) as
    | ComputedRef<RankingRow | null>
    | undefined

  return {
    ranked,
    scoreOf,
    gradeOfSite,
    best: best ?? computed<RankingRow | null>(() => ranked.value[0] ?? null)
  }
}

/**
 * FactorAssessment（因子评估）—— 逐项打分所需的现场实测因子。
 * 一轮评估 = 一条记录；sequence 表示补录次序，评分只取日期最新的一轮。
 */

/** 落石落枝风险等级 */
export type RockfallRisk = '无' | '低' | '中' | '高'

/** 风力等级（蒲福风级取整段） */
export type WindForce = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** 风向 */
export type WindDir = '北' | '东北' | '东' | '东南' | '南' | '西南' | '西' | '西北'

export interface FactorAssessment {
  /** 主键，自增 */
  id?: number
  /** 所属营位 id */
  siteId: number
  /** 同一营位内的补录次序，从 1 开始 */
  sequence: number
  /** 水源距离（米） */
  waterDistance: number
  /** 风向 */
  windDir: WindDir
  /** 风力等级 */
  windForce: WindForce
  /** 通信信号强度（格，0-5） */
  signalBars: number
  /** 日照时长（小时） */
  sunHours: number
  /** 落石落枝风险 */
  rockfallRisk: RockfallRisk
  /** 植被遮蔽度（0-100，越高越阴凉） */
  shade: number
  /** 离车距离（米） */
  distanceToCar: number
  /** 离步道距离（米） */
  distanceToTrail: number
  /** 评估人 */
  assessor: string
  /** 评估日期（YYYY-MM-DD） */
  assessedAt: string
  /** 录入时间（ISO） */
  createdAt: string
  updatedAt: string
}

/** 新建评估时由数据库补 id、录入时间与轮次。 */
export type FactorAssessmentInput = Omit<
  FactorAssessment,
  'id' | 'sequence' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<FactorAssessment, 'sequence' | 'createdAt' | 'updatedAt'>>

export const WIND_DIRS: WindDir[] = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']

export const WIND_FORCES: WindForce[] = [0, 1, 2, 3, 4, 5, 6]

export const ROCKFALL_RISKS: RockfallRisk[] = ['无', '低', '中', '高']

/** 落石落枝风险对应的适宜度（越高越安全） */
export const ROCKFALL_SCORE: Record<RockfallRisk, number> = {
  无: 100,
  低: 82,
  中: 48,
  高: 15
}

type AssessmentComparable = Pick<FactorAssessment, 'assessedAt' | 'createdAt'> &
  Partial<Pick<FactorAssessment, 'id'>>

/**
 * 按评估日期升序；同日时以更晚入库的一轮为准。
 * 未经确认的同日/旧日期提交不会走到写入分支。
 */
export function compareAssessments(a: AssessmentComparable, b: AssessmentComparable): number {
  if (a.assessedAt !== b.assessedAt) {
    return a.assessedAt < b.assessedAt ? -1 : 1
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1
  }

  const ia = a.id ?? 0
  const ib = b.id ?? 0
  return ia === ib ? 0 : ia < ib ? 1 : -1
}

type DifferenceField =
  | 'waterDistance'
  | 'windDir'
  | 'windForce'
  | 'signalBars'
  | 'sunHours'
  | 'rockfallRisk'
  | 'shade'
  | 'distanceToCar'
  | 'distanceToTrail'
  | 'assessor'

export interface FactorAssessmentDifference {
  field: DifferenceField
  label: string
  /** 库中最新一轮的值 */
  latest: string | number
  /** 本次晚到提交的值 */
  incoming: string | number
}

const DIFF_FIELDS: Array<{
  field: DifferenceField
  label: string
  unit?: string
}> = [
  { field: 'waterDistance', label: '水源距离', unit: 'm' },
  { field: 'windDir', label: '风向' },
  { field: 'windForce', label: '风力', unit: '级' },
  { field: 'signalBars', label: '信号强度', unit: '格' },
  { field: 'sunHours', label: '日照时长', unit: 'h' },
  { field: 'rockfallRisk', label: '落石落枝风险' },
  { field: 'shade', label: '植被遮蔽度' },
  { field: 'distanceToCar', label: '离车距离', unit: 'm' },
  { field: 'distanceToTrail', label: '离步道距离', unit: 'm' },
  { field: 'assessor', label: '评估人' }
]

function differenceValue(
  record: FactorAssessment | FactorAssessmentInput,
  field: DifferenceField
): string | number {
  const value = record[field]
  const meta = DIFF_FIELDS.find((item) => item.field === field)
  return meta?.unit ? `${String(value)} ${meta.unit}` : String(value)
}

/** 列出晚到提交与库中最新一轮的实质差异；评估日期在提示区单独展示。 */
export function diffFactorAssessments(
  incoming: FactorAssessment | FactorAssessmentInput,
  latest: FactorAssessment
): FactorAssessmentDifference[] {
  return DIFF_FIELDS.filter(({ field }) => incoming[field] !== latest[field]).map(({ field, label }) => ({
    field,
    label,
    latest: differenceValue(latest, field),
    incoming: differenceValue(incoming, field)
  }))
}

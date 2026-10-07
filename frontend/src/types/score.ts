/**
 * ScoreProfile（权重方案）—— 各因子权重、归一化方式与 A/B/C 等级阈值。
 * 拖动权重 → 名次实时重算；方案可另存为季节方案。
 */

/** 参与加权的因子键（与 Factors 字段一一对应） */
export type FactorKey =
  | 'slope'
  | 'flatness'
  | 'aspect'
  | 'waterDistance'
  | 'wind'
  | 'signal'
  | 'sun'
  | 'rockfall'
  | 'shade'
  | 'distanceToCar'
  | 'distanceToTrail'

/** 归一化方式 */
export type NormalizeMethod = 'minmax' | 'threshold'

/** 因子权重表：每项 0-100 */
export type FactorWeights = Record<FactorKey, number>

/** 等级阈值：综合得分 ≥ gradeA 为 A，≥ gradeB 为 B，其余为 C */
export interface GradeThresholds {
  gradeA: number
  gradeB: number
}

export interface ScoreProfile {
  /** 主键，自增 */
  id?: number
  /** 方案名 */
  name: string
  /** 各因子权重（0-100） */
  weights: FactorWeights
  /** 归一化方式：极差归一 / 阈值分段 */
  normalize: NormalizeMethod
  /** 等级阈值 A/B/C */
  thresholds: GradeThresholds
  /** 适用季节 */
  season: string
  /** 是否为当前启用方案 */
  active: boolean
  note: string
  createdAt: string
  updatedAt: string
}

/** 因子的展示元数据：中文名、单位、方向（desc = 值越小越好） */
export interface FactorMeta {
  key: FactorKey
  label: string
  unit: string
  higherIsBetter: boolean
  /** 阈值分段模式下各档位的分界值（对应 100/80/60/40/20 分） */
  breaks: number[]
}

export const FACTOR_META: FactorMeta[] = [
  { key: 'slope', label: '地形坡度', unit: '°', higherIsBetter: false, breaks: [3, 6, 10, 15] },
  { key: 'flatness', label: '平整度', unit: '分', higherIsBetter: true, breaks: [60, 70, 80, 90] },
  { key: 'aspect', label: '坡向光照', unit: '分', higherIsBetter: true, breaks: [50, 60, 72, 85] },
  {
    key: 'waterDistance',
    label: '水源距离',
    unit: 'm',
    higherIsBetter: false,
    breaks: [80, 150, 300, 500]
  },
  { key: 'wind', label: '风力遮蔽', unit: '级', higherIsBetter: false, breaks: [1, 2, 3, 4] },
  { key: 'signal', label: '通信信号', unit: '格', higherIsBetter: true, breaks: [1, 2, 3, 4] },
  { key: 'sun', label: '日照时长', unit: 'h', higherIsBetter: true, breaks: [2, 3, 4, 5] },
  { key: 'rockfall', label: '落石落枝', unit: '分', higherIsBetter: true, breaks: [30, 50, 70, 88] },
  {
    key: 'shade',
    label: '植被遮蔽',
    unit: '分',
    higherIsBetter: true,
    breaks: [20, 35, 50, 65]
  },
  {
    key: 'distanceToCar',
    label: '离车距离',
    unit: 'm',
    higherIsBetter: false,
    breaks: [50, 120, 250, 400]
  },
  {
    key: 'distanceToTrail',
    label: '离步道距离',
    unit: 'm',
    higherIsBetter: false,
    breaks: [30, 80, 150, 300]
  }
]

export const FACTOR_KEYS: FactorKey[] = FACTOR_META.map((m) => m.key)

/** 均衡型默认权重（合计 100） */
export const DEFAULT_WEIGHTS: FactorWeights = {
  slope: 14,
  flatness: 10,
  aspect: 6,
  waterDistance: 14,
  wind: 10,
  signal: 8,
  sun: 7,
  rockfall: 12,
  shade: 5,
  distanceToCar: 8,
  distanceToTrail: 6
}

export const SEASONS: string[] = ['春季', '夏季', '秋季', '冬季', '四季通用']

export const NORMALIZE_LABELS: Record<NormalizeMethod, string> = {
  minmax: '极差归一',
  threshold: '阈值分段'
}

/** 权重预设：均衡型 / 雨季防风 / 亲子舒适 / 重装野营（每组合计 100）。 */
export const WEIGHT_PRESETS: Record<string, FactorWeights> = {
  balanced: { ...DEFAULT_WEIGHTS },
  typhoon: {
    slope: 12,
    flatness: 8,
    aspect: 4,
    waterDistance: 18,
    wind: 18,
    signal: 6,
    sun: 4,
    rockfall: 14,
    shade: 4,
    distanceToCar: 8,
    distanceToTrail: 4
  },
  family: {
    slope: 12,
    flatness: 16,
    aspect: 6,
    waterDistance: 16,
    wind: 6,
    signal: 12,
    sun: 8,
    rockfall: 10,
    shade: 6,
    distanceToCar: 6,
    distanceToTrail: 2
  },
  wild: {
    slope: 8,
    flatness: 6,
    aspect: 10,
    waterDistance: 14,
    wind: 12,
    signal: 2,
    sun: 10,
    rockfall: 12,
    shade: 10,
    distanceToCar: 8,
    distanceToTrail: 8
  }
}

/** 取预设权重；未命中时回落到均衡型。返回副本，避免调用方改动共享对象。 */
export function weightSumGuard(name: string): FactorWeights {
  const preset = WEIGHT_PRESETS[name] ?? DEFAULT_WEIGHTS
  return { ...preset }
}

export function emptyWeights(): FactorWeights {
  return FACTOR_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as FactorWeights)
}

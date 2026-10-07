/**
 * Campsite（营位）—— 候选营位的基础地理与场地信息。
 * 与地形/坡度/容量相关，被名次表、地图、详情页共同消费。
 */

/** 地表类型 */
export type SurfaceType = '草地' | '碎石' | '林地' | '沙地'

/** 进出方式 */
export type AccessMode = '车行' | '步行'

/** 坡向（八方位 + 平缓） */
export type AspectType =
  | '北'
  | '东北'
  | '东'
  | '东南'
  | '南'
  | '西南'
  | '西'
  | '西北'
  | '平缓'

export interface Campsite {
  /** 主键，自增 */
  id?: number
  /** 营位编号，如 CS-0001 */
  code: string
  /** 营位名称 */
  name: string
  /** 所属营地 */
  campName: string
  /** 经度（WGS84 近似值，用于地图与网格换算） */
  lng: number
  /** 纬度 */
  lat: number
  /** 海拔（米） */
  elevation: number
  /** 地形坡度（度） */
  slope: number
  /** 坡向 */
  aspect: AspectType
  /** 地表类型 */
  surface: SurfaceType
  /** 可容帐篷数 */
  tentCapacity: number
  /** 平整度评分（0-100） */
  flatness: number
  /** 进出方式 */
  access: AccessMode
  /** 该营位默认采用的权重方案 id（v3 迁移时回填） */
  defaultProfileId: number | null
  /** 备注 */
  note: string
  createdAt: string
  updatedAt: string
}

/** 地表类型的可选值，供筛选器与表单复用 */
export const SURFACE_TYPES: SurfaceType[] = ['草地', '碎石', '林地', '沙地']

/** 进出方式可选值 */
export const ACCESS_MODES: AccessMode[] = ['车行', '步行']

/** 坡向可选值 */
export const ASPECT_TYPES: AspectType[] = [
  '北',
  '东北',
  '东',
  '东南',
  '南',
  '西南',
  '西',
  '西北',
  '平缓'
]

/** 坡向对应的理想光照系数（东南/南向最适宜扎营） */
export const ASPECT_SCORE: Record<AspectType, number> = {
  南: 100,
  东南: 90,
  西南: 80,
  东: 78,
  平缓: 74,
  西: 66,
  东北: 62,
  西北: 54,
  北: 48
}

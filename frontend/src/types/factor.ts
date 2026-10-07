/**
 * FactorAssessment（因子评估）—— 逐项打分所需的现场实测因子。
 * 一轮评估 = 一条记录：补录永远**追加**新行，从不覆盖旧行；
 * 评分只认「最新一轮」（按评估日期、录入时间、id 依次比大小），历史各轮仍可逐轮查询。
 * `round` 是该营位内从 1 起的连续轮次号，便于列表展示「第 N 轮」。
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
  /** 该营位内的轮次号，从 1 起连续编号；评分取轮次号最大者 */
  round: number
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
  createdAt: string
  updatedAt: string
}

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

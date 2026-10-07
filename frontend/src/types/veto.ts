/**
 * RiskVeto（风险否决项）—— 命中即标红该营位并禁止评 A。
 * 属于「一票否决」类硬约束，与得分体系解耦。
 */

/** 否决类型 */
export type VetoType = '河道内' | '山洪沟' | '孤树下' | '崖底落石区' | '陡坡'

export interface RiskVeto {
  /** 主键，自增 */
  id?: number
  /** 被否决的营位 id */
  siteId: number
  /** 否决类型 */
  type: VetoType
  /** 说明（现场情况、判定依据） */
  description: string
  /** 判定人 */
  judge: string
  /** 判定日期（YYYY-MM-DD） */
  judgedAt: string
  createdAt: string
  updatedAt: string
}

export const VETO_TYPES: VetoType[] = ['河道内', '山洪沟', '孤树下', '崖底落石区', '陡坡']

/** 各否决类型的现场判定提示，表单内联展示 */
export const VETO_HINTS: Record<VetoType, string> = {
  河道内: '位于常水位河道或滩地内，暴雨时无法及时撤离。',
  山洪沟: '处于汇水沟口，短时强降雨易形成山洪直冲营位。',
  孤树下: '孤立高树下扎营，雷击与断枝落枝风险不可控。',
  崖底落石区: '崖壁正下方，存在落石历史痕迹或新鲜碎屑。',
  陡坡: '坡度超出营地允许范围，帐篷无法稳定铺设。'
}

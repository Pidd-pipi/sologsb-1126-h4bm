/**
 * 展示格式化工具：因子数值单位、日期、序号生成。
 * 与评分逻辑无关，仅负责把数字变成可读文本。
 */
import type { FactorKey } from '@/types/score'

/** 带单位的数值文本，自动处理小数位。 */
export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Number(value.toFixed(digits))
  return String(rounded)
}

/** 按因子键输出带单位的文本。 */
export function formatFactorValue(key: FactorKey, raw: number): string {
  switch (key) {
    case 'slope':
      return `${formatNumber(raw, 1)} °`
    case 'flatness':
    case 'aspect':
    case 'rockfall':
    case 'shade':
      return `${formatNumber(raw, 0)} 分`
    case 'waterDistance':
    case 'distanceToCar':
    case 'distanceToTrail':
      return `${formatNumber(raw, 0)} m`
    case 'wind':
      return `${formatNumber(raw, 0)} 级`
    case 'signal':
      return `${formatNumber(raw, 0)} 格`
    case 'sun':
      return `${formatNumber(raw, 1)} h`
    default:
      return formatNumber(raw, 1)
  }
}

/** 0-100 得分文本。 */
export function formatScore(value: number): string {
  return formatNumber(value, 1)
}

/** 0-1 比例转百分比文本。 */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '0%'
  return `${(ratio * 100).toFixed(digits)}%`
}

/** 生成下一个流水编号，如 CS-0007。 */
export function nextSerialNo(prefix: string, existing: string[]): string {
  let max = 0
  for (const no of existing) {
    const m = /(\d+)\s*$/.exec(no ?? '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/** 当前时间的 ISO 字符串。 */
export function nowIso(): string {
  return new Date().toISOString()
}

/** 当前日期 YYYY-MM-DD。 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** ISO / 日期文本转本地展示。 */
export function formatDateTime(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

/** 评估日期展示（只取日期部分）。 */
export function formatDate(value: string): string {
  if (!value) return '—'
  return value.slice(0, 10)
}

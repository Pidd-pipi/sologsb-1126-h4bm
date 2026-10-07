/**
 * 地理工具：经纬度距离计算 + SVG 网格视图坐标换算。
 * 网格视图用于未配置 VITE_AMAP_KEY 时的降级展示，不请求任何外部服务。
 */

export interface LngLat {
  lng: number
  lat: number
}

export interface Bounds {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

export interface GridPoint {
  x: number
  y: number
}

const EARTH_RADIUS_M = 6371008.8

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Haversine 距离（米）。 */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 人类可读的距离：<1000m 显示米，否则显示公里。 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

/** 计算一组点的最小外接经纬度范围，附带最小跨度避免单点时除零。 */
export function boundsOf(points: LngLat[]): Bounds {
  if (points.length === 0) {
    return { minLng: 119.8, maxLng: 120.2, minLat: 30.4, maxLat: 30.8 }
  }
  const lngs = points.map((p) => p.lng)
  const lats = points.map((p) => p.lat)
  let minLng = Math.min(...lngs)
  let maxLng = Math.max(...lngs)
  let minLat = Math.min(...lats)
  let maxLat = Math.max(...lats)
  const minSpan = 0.01
  if (maxLng - minLng < minSpan) {
    const center = (minLng + maxLng) / 2
    minLng = center - minSpan / 2
    maxLng = center + minSpan / 2
  }
  if (maxLat - minLat < minSpan) {
    const center = (minLat + maxLat) / 2
    minLat = center - minSpan / 2
    maxLat = center + minSpan / 2
  }
  const padLng = (maxLng - minLng) * 0.12
  const padLat = (maxLat - minLat) * 0.14
  return {
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
    minLat: minLat - padLat,
    maxLat: maxLat + padLat
  }
}

/**
 * 经纬度 → SVG 网格坐标。
 * 注意：纬度越大越靠北，SVG 的 y 轴向下，因此做一次翻转。
 */
export function projectToGrid(point: LngLat, bounds: Bounds, width: number, height: number): GridPoint {
  const spanLng = Math.max(1e-9, bounds.maxLng - bounds.minLng)
  const spanLat = Math.max(1e-9, bounds.maxLat - bounds.minLat)
  const x = ((point.lng - bounds.minLng) / spanLng) * width
  const y = height - ((point.lat - bounds.minLat) / spanLat) * height
  return {
    x: Math.min(width, Math.max(0, Math.round(x * 10) / 10)),
    y: Math.min(height, Math.max(0, Math.round(y * 10) / 10))
  }
}

/** SVG 网格坐标 → 经纬度（用于降级视图上点选登记营位）。 */
export function unprojectFromGrid(
  grid: GridPoint,
  bounds: Bounds,
  width: number,
  height: number
): LngLat {
  const spanLng = bounds.maxLng - bounds.minLng
  const spanLat = bounds.maxLat - bounds.minLat
  const lng = bounds.minLng + (grid.x / Math.max(1, width)) * spanLng
  const lat = bounds.minLat + ((height - grid.y) / Math.max(1, height)) * spanLat
  return { lng: Math.round(lng * 1e5) / 1e5, lat: Math.round(lat * 1e5) / 1e5 }
}

/** 经度格式化为东经/西经文本。 */
export function formatLng(lng: number): string {
  return `${lng >= 0 ? 'E' : 'W'} ${Math.abs(lng).toFixed(5)}°`
}

/** 纬度格式化为北纬/南纬文本。 */
export function formatLat(lat: number): string {
  return `${lat >= 0 ? 'N' : 'S'} ${Math.abs(lat).toFixed(5)}°`
}

/** 经纬度是否落在合理范围内。 */
export function isValidLngLat(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90
  )
}

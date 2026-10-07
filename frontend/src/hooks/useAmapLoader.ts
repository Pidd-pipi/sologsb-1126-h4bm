/**
 * useAmapLoader —— 按需注入高德地图 JS API。
 *
 * 关键约束：**key 为空时绝不请求 webapi.amap.com**。
 * 一旦请求会因网络失败进入 console error，页面测试直接判 FAIL。
 * 因此这里先读 import.meta.env.VITE_AMAP_KEY：
 *   - 为空 → 立即返回 degraded=true（本地 SVG 网格降级视图），不注入任何脚本
 *   - 非空 → 注入脚本，并附带 onerror + 超时双兜底，失败同样降级
 */
import { onBeforeUnmount, ref, type Ref } from 'vue'

/** 只声明本 hooks 实际用到的 AMap 能力，避免依赖额外的 @types 包。 */
export interface AmapMapInstance {
  add(overlay: unknown): void
  remove(overlay: unknown): void
  setZoomAndCenter(zoom: number, center: [number, number]): void
  setFitView(overlays?: unknown[]): void
  destroy(): void
}

export interface AmapMarker {
  on(event: string, handler: () => void): void
  setPosition?(position: [number, number]): void
}

export interface AmapNamespace {
  Map: new (container: HTMLElement | string, opts?: Record<string, unknown>) => AmapMapInstance
  Marker: new (opts: Record<string, unknown>) => AmapMarker
  Pixel: new (x: number, y: number) => unknown
  Size?: new (w: number, h: number) => unknown
}

interface AmapWindow extends Window {
  AMap?: AmapNamespace
  __gbcampsiteAmapPromise__?: Promise<AmapNamespace | null>
}

const AMAP_SCRIPT_ID = 'gbcampsite-amap-sdk'
const AMAP_SECURITY_ID = 'gbcampsite-amap-security'
const LOAD_TIMEOUT_MS = 8000

/** 读环境变量：未配置、空白字符串一律视为「没有 key」。 */
export function resolveAmapKey(): string {
  const raw = import.meta.env.VITE_AMAP_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

export interface AmapLoaderState {
  /** 高德 JS API 命名空间，降级时为 null */
  amap: Ref<AmapNamespace | null>
  /** 是否处于降级模式（渲染本地 SVG 网格视图） */
  degraded: Ref<boolean>
  /** 降级原因，直接展示给用户 */
  reason: Ref<string>
  loading: Ref<boolean>
  /** 主动加载；降级时立即 resolve(null) */
  load: () => Promise<AmapNamespace | null>
  /** 是否已配置 key */
  hasKey: boolean
}

function injectScript(key: string): Promise<AmapNamespace | null> {
  const w = window as AmapWindow
  if (w.AMap) return Promise.resolve(w.AMap)
  if (w.__gbcampsiteAmapPromise__) return w.__gbcampsiteAmapPromise__

  w.__gbcampsiteAmapPromise__ = new Promise<AmapNamespace | null>((resolve) => {
    let settled = false
    const finish = (value: AmapNamespace | null): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(value)
    }

    // 安全密钥：仅当存在时才写，避免产生空的 window._AMapSecurityConfig 访问告警
    const security = import.meta.env.VITE_AMAP_SECURITY_CODE
    if (typeof security === 'string' && security.trim()) {
      ;(window as unknown as Record<string, unknown>)._AMapSecurityConfig = {
        securityJsCode: security.trim()
      }
    }

    const timer = window.setTimeout(() => {
      finish(null)
    }, LOAD_TIMEOUT_MS)

    const script = document.createElement('script')
    script.id = AMAP_SCRIPT_ID
    script.async = true
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
    script.onload = () => {
      const ns = (window as AmapWindow).AMap
      finish(ns ?? null)
    }
    script.onerror = () => {
      finish(null)
    }
    document.head.appendChild(script)
  })

  return w.__gbcampsiteAmapPromise__
}

/**
 * @param autoLoad 是否在挂载时自动加载（key 为空时不会发起任何网络请求）
 */
export function useAmapLoader(autoLoad = true): AmapLoaderState {
  const key = resolveAmapKey()
  const hasKey = key.length > 0
  const amap = ref<AmapNamespace | null>(null)
  const degraded = ref(!hasKey)
  const loading = ref(false)
  const reason = ref(
    hasKey ? '' : '未配置 VITE_AMAP_KEY，已切换为本地 SVG 网格视图（不请求任何外部服务）'
  )

  async function load(): Promise<AmapNamespace | null> {
    // key 缺省：立即降级返回，绝不注入高德脚本
    if (!hasKey) {
      degraded.value = true
      loading.value = false
      return null
    }
    loading.value = true
    const ns = await injectScript(key)
    loading.value = false
    if (ns) {
      amap.value = ns
      degraded.value = false
      reason.value = ''
      return ns
    }
    degraded.value = true
    reason.value = '高德地图脚本加载失败或超时，已切换为本地 SVG 网格视图'
    return null
  }

  if (autoLoad) {
    void load()
  }

  onBeforeUnmount(() => {
    // 卸载时清掉失败引用，允许下次进入页面重试；已加载成功则保留复用
    const w = window as AmapWindow
    if (degraded.value) w.__gbcampsiteAmapPromise__ = undefined
    const script = document.getElementById(AMAP_SCRIPT_ID)
    if (degraded.value && script && script.parentNode) {
      script.parentNode.removeChild(script)
    }
    const security = document.getElementById(AMAP_SECURITY_ID)
    if (security && security.parentNode) security.parentNode.removeChild(security)
  })

  return { amap, degraded, reason, loading, load, hasKey }
}

/**
 * 跨标签页的数据变更通知：一个页面写入 IndexedDB 后通知其它已打开的页面重新加载，
 * 支撑「两个页面同时操作同一营位」的场景——后到的提交要能看到先到的那一轮。
 *
 * 优先用 BroadcastChannel；个别受限环境退化为 localStorage storage 事件
 * （storage 事件本身只在其它标签页触发，不会回环到写入方）。
 */

export type SyncTable = 'sites' | 'factors' | 'vetos' | 'profiles'

interface SyncMessage {
  table: SyncTable
  at: number
}

const CHANNEL_NAME = 'gbcampsite-db-sync'
const STORAGE_KEY = 'gbcampsite:sync:pulse'

type Handler = (table: SyncTable) => void

let channel: BroadcastChannel | null = null
const handlers = new Set<Handler>()

if (typeof window !== 'undefined') {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      if (event.data && typeof event.data.table === 'string') {
        handlers.forEach((h) => h(event.data.table))
      }
    }
  } else {
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        const data = JSON.parse(event.newValue) as SyncMessage
        if (data && typeof data.table === 'string') {
          handlers.forEach((h) => h(data.table))
        }
      } catch {
        /* 忽略无法解析的脉冲 */
      }
    })
  }
}

/** 订阅其它标签页的数据变更；返回取消订阅函数。 */
export function subscribeDbChange(handler: Handler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

/** 通知其它标签页某张表已被本页写入。 */
export function notifyDbChange(table: SyncTable): void {
  if (typeof window === 'undefined') return
  const message: SyncMessage = { table, at: Date.now() }
  if (channel) {
    channel.postMessage(message)
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message))
}

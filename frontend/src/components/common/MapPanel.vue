<script setup lang="ts">
/**
 * MapPanel —— 地图容器，封装高德 JS API 与本地 SVG 网格降级两种模式。
 *
 * 降级策略：`useAmapLoader()` 检测到 VITE_AMAP_KEY 为空时**不会请求 webapi.amap.com**，
 * 直接返回 degraded=true，此处立即渲染本地 SVG 网格视图（可点选、可查看详情）。
 * 被 `/sites/new`、`/sites/:id`、`/map` 消费。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Campsite } from '@/types/campsite'
import type { Grade } from '@/utils/score'
import { GRADE_COLOR } from '@/utils/score'
import { boundsOf, formatLat, formatLng, projectToGrid, unprojectFromGrid } from '@/utils/geo'
import { useAmapLoader, type AmapMapInstance, type AmapMarker } from '@/hooks/useAmapLoader'

const props = withDefaults(
  defineProps<{
    /** 要展示的营位 */
    sites: Campsite[]
    /** 当前选中营位 id */
    selectedId?: number | null
    /** 每个营位的等级，用于着色 */
    gradeOf?: (siteId: number) => Grade
    /** pick 模式下点击空白处会抛出经纬度（用于选点登记） */
    mode?: 'view' | 'pick'
    /** 地图高度 */
    height?: string
    /** 标题 */
    title?: string
  }>(),
  {
    selectedId: null,
    gradeOf: undefined,
    mode: 'view',
    height: '420px',
    title: '营位分布'
  }
)

const emit = defineEmits<{
  (e: 'select', siteId: number): void
  (e: 'pick', point: { lng: number; lat: number }): void
  (e: 'mode', payload: { degraded: boolean; reason: string }): void
}>()

const { amap, degraded, reason, loading: amapLoading } = useAmapLoader(true)

const GRID_W = 760
const GRID_H = 420

const mapEl = ref<HTMLElement | null>(null)
const mapReady = ref(false)
let mapInstance: AmapMapInstance | null = null
let markers: AmapMarker[] = []

const bounds = computed(() => boundsOf(props.sites.map((s) => ({ lng: s.lng, lat: s.lat }))))

const points = computed(() =>
  props.sites.map((site) => {
    const pt = projectToGrid({ lng: site.lng, lat: site.lat }, bounds.value, GRID_W, GRID_H)
    const grade: Grade = props.gradeOf ? props.gradeOf(site.id ?? -1) : 'C'
    return { site, x: pt.x, y: pt.y, color: GRADE_COLOR[grade], grade }
  })
)

const activeSite = computed(
  () => props.sites.find((s) => s.id === props.selectedId) ?? null
)

const fallbackLabel = computed(() =>
  props.mode === 'pick' ? '点击网格任意位置即可拾取经纬度' : '点击任意营地标记查看详情'
)

function onGridClick(event: MouseEvent): void {
  if (props.mode !== 'pick') return
  const target = event.currentTarget as SVGSVGElement
  const rect = target.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * GRID_W
  const y = ((event.clientY - rect.top) / rect.height) * GRID_H
  emit('pick', unprojectFromGrid({ x, y }, bounds.value, GRID_W, GRID_H))
}

function destroyMap(): void {
  if (mapInstance) {
    try {
      mapInstance.destroy()
    } catch {
      /* 高德内部销毁异常不影响页面 */
    }
  }
  mapInstance = null
  markers = []
  mapReady.value = false
}

function renderAmapMarkers(): void {
  const ns = amap.value
  const instance = mapInstance
  if (!ns || !instance) return
  for (const marker of markers) {
    try {
      instance.remove(marker)
    } catch {
      /* ignore */
    }
  }
  markers = []
  if (props.sites.length === 0) return
  for (const item of points.value) {
    const marker = new ns.Marker({
      position: [item.site.lng, item.site.lat],
      title: `${item.site.code} ${item.site.name}`,
      content: `<div class="gb-amap-pin" style="--pin:${item.color}"><span>${item.site.code.slice(-2)}</span><em>${item.grade}</em></div>`,
      offset: new ns.Pixel(-16, -16)
    })
    marker.on('click', () => emit('select', item.site.id as number))
    instance.add(marker)
    markers.push(marker)
  }
}

function initAmap(): void {
  const ns = amap.value
  if (!ns || !mapEl.value) return
  destroyMap()
  const center: [number, number] = props.sites.length
    ? [props.sites[0].lng, props.sites[0].lat]
    : [119.89, 30.53]
  const instance = new ns.Map(mapEl.value, {
    zoom: 13,
    center,
    viewMode: '2D',
    resizeEnable: true
  })
  mapInstance = instance
  mapReady.value = true
  renderAmapMarkers()
  try {
    instance.setFitView(markers)
  } catch {
    /* ignore */
  }
}

watch(
  [amap, degraded],
  () => {
    if (degraded.value) {
      destroyMap()
      emit('mode', { degraded: true, reason: reason.value })
      if (mapEl.value) mapEl.value.innerHTML = ''
      return
    }
    if (amap.value) {
      emit('mode', { degraded: false, reason: '' })
      initAmap()
    }
  },
  { immediate: true }
)

watch(
  () => props.sites.map((s) => `${s.id}:${s.lng}:${s.lat}`).join('|'),
  () => {
    if (amap.value && !degraded.value) renderAmapMarkers()
  }
)

onBeforeUnmount(() => {
  destroyMap()
})
</script>

<template>
  <section class="map-panel">
    <header class="map-panel__head">
      <div class="map-panel__title">
        <h3>{{ title }}</h3>
        <span class="map-panel__count">{{ sites.length }} 个营位</span>
      </div>
      <div class="map-panel__mode">
        <el-tag v-if="degraded" type="warning" effect="plain" size="small">
          SVG 网格降级视图
        </el-tag>
        <el-tag v-else-if="amapLoading" type="info" effect="plain" size="small">
          高德 JS API 加载中
        </el-tag>
        <el-tag v-else type="success" effect="plain" size="small">高德 JS API</el-tag>
      </div>
    </header>

    <p v-if="degraded" class="map-panel__notice">{{ reason }}</p>
    <p v-else-if="!sites.length" class="map-panel__notice">暂无营位，先登记一个营位再看分布。</p>

    <!-- 降级：本地 SVG 网格视图（不请求任何外部服务） -->
    <div
      v-if="degraded"
      class="map-panel__svg"
      :style="{ height }"
      data-testid="map-fallback"
    >
      <svg
        :viewBox="`0 0 ${GRID_W} ${GRID_H}`"
        class="map-panel__grid"
        :class="{ 'is-pickable': mode === 'pick' }"
        role="img"
        aria-label="营位分布网格视图"
        @click="onGridClick"
      >
        <defs>
          <pattern id="gbGridMinor" width="38" height="38" patternUnits="userSpaceOnUse">
            <path d="M38 0 H0 V38" fill="none" stroke="#dfe9e1" stroke-width="1" />
          </pattern>
          <pattern id="gbGridMajor" width="190" height="190" patternUnits="userSpaceOnUse">
            <rect width="190" height="190" fill="url(#gbGridMinor)" />
            <path d="M190 0 H0 V190" fill="none" stroke="#c4d6c9" stroke-width="1.5" />
          </pattern>
        </defs>
        <rect :width="GRID_W" :height="GRID_H" fill="#f5faf6" />
        <rect :width="GRID_W" :height="GRID_H" fill="url(#gbGridMajor)" />

        <!-- 等高线示意，纯装饰 -->
        <path
          d="M0 300 C150 250 260 330 420 280 C560 236 660 300 760 262"
          fill="none"
          stroke="#cbe0d0"
          stroke-width="2"
        />
        <path
          d="M0 200 C140 160 250 230 400 186 C545 145 655 205 760 168"
          fill="none"
          stroke="#cbe0d0"
          stroke-width="2"
        />
        <text :x="GRID_W - 12" y="22" text-anchor="end" class="map-panel__axis">
          正北 ↑
        </text>
        <text x="12" :y="GRID_H - 12" class="map-panel__axis">
          {{ formatLng(bounds.minLng) }} ~ {{ formatLng(bounds.maxLng) }}
        </text>
        <text :x="GRID_W - 12" :y="GRID_H - 12" text-anchor="end" class="map-panel__axis">
          {{ formatLat(bounds.minLat) }} ~ {{ formatLat(bounds.maxLat) }}
        </text>

        <g
          v-for="pt in points"
          :key="`pt-${pt.site.id}`"
          class="map-panel__node"
          :class="{ 'is-active': pt.site.id === selectedId }"
          tabindex="0"
          role="button"
          :aria-label="`${pt.site.code} ${pt.site.name}`"
          @click.stop="emit('select', pt.site.id as number)"
        >
          <circle :cx="pt.x" :cy="pt.y" r="16" :fill="pt.color" opacity="0.16" />
          <circle :cx="pt.x" :cy="pt.y" r="9" :fill="pt.color" stroke="#ffffff" stroke-width="2" />
          <text :x="pt.x" :y="pt.y + 3.5" text-anchor="middle" class="map-panel__nodeText">
            {{ pt.grade }}
          </text>
          <text :x="pt.x + 14" :y="pt.y - 10" class="map-panel__nodeLabel">
            {{ pt.site.code }}
          </text>
        </g>
      </svg>

      <ul class="map-panel__legend">
        <li v-for="pt in points" :key="`lg-${pt.site.id}`">
          <button
            type="button"
            class="map-panel__legendBtn"
            :class="{ 'is-active': pt.site.id === selectedId }"
            @click="emit('select', pt.site.id as number)"
          >
            <i :style="{ background: pt.color }" />
            {{ pt.site.code }} · {{ pt.site.name }}
          </button>
        </li>
        <li v-if="!points.length" class="map-panel__legendEmpty">暂无营位</li>
      </ul>
      <p class="map-panel__hint">{{ fallbackLabel }}</p>
    </div>

    <!-- 正常：高德 JS API 地图容器 -->
    <div v-else class="map-panel__amap" :style="{ height }">
      <div ref="mapEl" class="map-panel__canvas" :style="{ height }" />
      <p v-if="!mapReady" class="map-panel__loading">正在初始化高德地图…</p>
    </div>

    <div v-if="activeSite" class="map-panel__focus">
      <strong>{{ activeSite.code }} {{ activeSite.name }}</strong>
      <span>{{ activeSite.campName }}</span>
      <span>{{ formatLng(activeSite.lng) }} / {{ formatLat(activeSite.lat) }}</span>
      <span>海拔 {{ activeSite.elevation }} m · 坡度 {{ activeSite.slope }}°</span>
      <span>{{ activeSite.surface }} · 容 {{ activeSite.tentCapacity }} 帐 · {{ activeSite.access }}</span>
    </div>
    <div v-else-if="sites.length" class="map-panel__focus map-panel__focus--idle">
      <span>{{ fallbackLabel }}</span>
    </div>
  </section>
</template>

<style scoped>
.map-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: #ffffff;
  border: 1px solid var(--gb-line);
  border-radius: 12px;
}
.map-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.map-panel__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.map-panel__title h3 {
  margin: 0;
  font-size: 15px;
  color: var(--gb-ink);
}
.map-panel__count {
  font-size: 12px;
  color: var(--gb-muted);
}
.map-panel__notice {
  margin: 0;
  padding: 7px 10px;
  font-size: 12px;
  color: #92400e;
  background: #fff8e6;
  border: 1px solid #f5e0ae;
  border-radius: 7px;
}
.map-panel__svg {
  position: relative;
  border: 1px solid var(--gb-line);
  border-radius: 10px;
  overflow: hidden;
  background: #f5faf6;
}
.map-panel__grid {
  display: block;
  width: 100%;
  height: 100%;
}
.map-panel__grid.is-pickable {
  cursor: crosshair;
}
.map-panel__axis {
  font-size: 11px;
  fill: #7d907f;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.map-panel__node {
  cursor: pointer;
  outline: none;
}
.map-panel__nodeText {
  font-size: 10px;
  font-weight: 700;
  fill: #ffffff;
  pointer-events: none;
}
.map-panel__nodeLabel {
  font-size: 11px;
  fill: #3d5442;
  pointer-events: none;
}
.map-panel__node.is-active circle:nth-child(2) {
  stroke: #14532d;
  stroke-width: 3;
}
.map-panel__legend {
  position: absolute;
  top: 10px;
  left: 10px;
  margin: 0;
  padding: 6px;
  list-style: none;
  max-height: 55%;
  overflow: auto;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--gb-line);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.map-panel__legendBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 7px;
  font-size: 11px;
  color: var(--gb-ink);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.map-panel__legendBtn i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.map-panel__legendBtn.is-active {
  border-color: #14532d;
  background: #eef6f0;
}
.map-panel__legendEmpty {
  font-size: 11px;
  color: var(--gb-muted);
  padding: 3px 7px;
}
.map-panel__hint {
  position: absolute;
  right: 10px;
  bottom: 8px;
  margin: 0;
  font-size: 11px;
  color: var(--gb-muted);
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 8px;
  border-radius: 6px;
}
.map-panel__amap {
  position: relative;
  border: 1px solid var(--gb-line);
  border-radius: 10px;
  overflow: hidden;
}
.map-panel__canvas {
  width: 100%;
}
.map-panel__loading {
  position: absolute;
  inset: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--gb-muted);
  background: #f5faf6;
}
.map-panel__focus {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--gb-muted);
  background: var(--gb-surface);
  border-radius: 8px;
}
.map-panel__focus strong {
  color: var(--gb-ink);
  font-size: 13px;
}
.map-panel__focus--idle {
  color: var(--gb-muted);
}
</style>

<style>
/* 高德标记内容不能用 scoped，单独写在全局 */
.gb-amap-pin {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50% 50% 50% 6px;
  background: var(--pin, #15803d);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(20, 83, 45, 0.32);
  transform: rotate(-45deg);
}
.gb-amap-pin span,
.gb-amap-pin em {
  transform: rotate(45deg);
  font-style: normal;
}
.gb-amap-pin em {
  position: absolute;
  right: -8px;
  top: -8px;
  background: #fff;
  color: var(--pin, #15803d);
  border-radius: 5px;
  font-size: 10px;
  padding: 0 3px;
  border: 1px solid var(--pin, #15803d);
}
</style>

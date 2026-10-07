<script setup lang="ts">
/**
 * `/map` 营位地图 —— 高德 JS API 渲染营位标记并按等级着色；
 * 未配置 VITE_AMAP_KEY 时退化为**本地 SVG 网格视图**（不请求任何外部服务），仍可点选查看详情。
 * 消费 Campsite、RiskVeto；复用 <MapPanel>、<GradeBadge>、<EmptyState>。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import MapPanel from '@/components/common/MapPanel.vue'
import GradeBadge from '@/components/common/GradeBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useSiteStore } from '@/stores/siteStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import { useRanking } from '@/hooks/useRanking'
import type { Grade } from '@/utils/score'
import { useAmapLoader } from '@/hooks/useAmapLoader'
import { SURFACE_TYPES } from '@/types/campsite'
import { formatLat, formatLng, distanceMeters, formatDistance } from '@/utils/geo'
import { formatDate } from '@/utils/format'

const router = useRouter()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const uiStore = useUiStore()

/** 与 MapPanel 内保持一致的降级判定，用于页面顶部的模式说明 */
const { hasKey, degraded: loaderDegraded, reason } = useAmapLoader(false)
const panelDegraded = ref(loaderDegraded.value)
const panelReason = ref(reason.value)

const filterSurface = ref<string>('')
const gradeFilter = ref<string>('')
const selectedId = ref<number | null>(null)

const visibleSites = computed(() =>
  siteStore.list.filter((s) => {
    if (filterSurface.value && s.surface !== filterSurface.value) return false
    return true
  })
)

const { ranked, scoreOf } = useRanking({
  sites: () => siteStore.list,
  factorOf: (id: number) => siteStore.latestFactor(id),
  weights: () => profileStore.activeWeights,
  normalize: () => profileStore.activeProfile?.normalize ?? 'minmax',
  thresholds: () => profileStore.activeProfile?.thresholds ?? { gradeA: 78, gradeB: 58 },
  vetoedIds: () => uiStore.vetoedSiteIds
})

const panelSites = computed(() =>
  visibleSites.value.filter((s) => {
    if (!gradeFilter.value) return true
    const grade = s.id != null ? scoreOf(s.id)?.grade : undefined
    return grade === gradeFilter.value
  })
)

const selectedSite = computed(() =>
  selectedId.value == null ? null : siteStore.byId(selectedId.value)
)

const selectedRow = computed(() =>
  selectedId.value == null ? null : scoreOf(selectedId.value)
)

const selectedVetos = computed(() => uiStore.vetosOf(selectedId.value))

/** 选中营位到最近营位的距离，作为现场通行参考 */
const nearest = computed(() => {
  const cur = selectedSite.value
  if (!cur) return null
  let best: { name: string; code: string; meters: number } | null = null
  for (const s of siteStore.list) {
    if (s.id === cur.id) continue
    const meters = distanceMeters({ lng: cur.lng, lat: cur.lat }, { lng: s.lng, lat: s.lat })
    if (!best || meters < best.meters) {
      best = { name: s.name, code: s.code, meters }
    }
  }
  return best
})

function onPanelMode(payload: { degraded: boolean; reason: string }): void {
  panelDegraded.value = payload.degraded
  panelReason.value = payload.reason
}

function gradeOfSite(id: number): Grade {
  return scoreOf(id)?.grade ?? 'C'
}

function selectSite(id: number): void {
  selectedId.value = id
  uiStore.focusedSiteId = id
}

const gradeStats = computed(() => {
  const rows = ranked.value
  return [
    { grade: 'A' as const, count: rows.filter((r) => r.grade === 'A').length, color: '#15803d' },
    { grade: 'B' as const, count: rows.filter((r) => r.grade === 'B').length, color: '#d97706' },
    { grade: 'C' as const, count: rows.filter((r) => r.grade === 'C').length, color: '#b91c1c' }
  ]
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="page-head__title">
        <h1>营位地图</h1>
        <p>
          按推荐等级给营位标记着色，命中风险否决项的营位以红点提示；
          点击任一标记可查看该营位的得分构成、因子实测与否决记录。
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="router.push('/')">返回名次表</el-button>
        <el-button type="primary" @click="router.push('/sites/new')">新增营位</el-button>
      </div>
    </div>

    <el-alert
      :type="panelDegraded ? 'warning' : 'success'"
      :closable="false"
      show-icon
      :title="
        panelDegraded
          ? '当前为本地 SVG 网格降级视图'
          : '当前为高德 JS API 地图模式'
      "
      :description="
        panelDegraded
          ? panelReason || '未配置 VITE_AMAP_KEY，已使用本地 SVG 网格视图渲染营位分布，不请求任何外部服务。'
          : '已配置 VITE_AMAP_KEY，标记按等级着色并可点击查看详情。'
      "
    />

    <div class="stat-row">
      <div v-for="g in gradeStats" :key="g.grade" class="stat-card">
        <div class="stat-card__label">{{ g.grade }} 级营位</div>
        <div class="stat-card__value" :style="{ color: g.color }">{{ g.count }}</div>
        <div class="stat-card__extra">共 {{ ranked.length }} 个候选营位</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">否决标记</div>
        <div class="stat-card__value" :style="{ color: uiStore.vetoTotal ? '#b91c1c' : undefined }">
          {{ uiStore.vetoedSiteIds.length }}
        </div>
        <div class="stat-card__extra">共 {{ uiStore.vetoTotal }} 条否决记录</div>
      </div>
    </div>

    <section class="panel">
      <div class="panel__head">
        <h2>筛选显示</h2>
        <span class="weight-note">
          {{ hasKey ? 'key 已配置' : 'key 未配置（降级视图）' }} · 当前显示
          {{ panelSites.length }} / {{ siteStore.total }} 个营位
        </span>
      </div>
      <div class="filters">
        <el-select v-model="filterSurface" placeholder="全部地表类型" clearable style="width: 170px">
          <el-option v-for="s in SURFACE_TYPES" :key="s" :label="s" :value="s" />
        </el-select>
        <el-radio-group v-model="gradeFilter">
          <el-radio-button value="">全部等级</el-radio-button>
          <el-radio-button value="A">A 级</el-radio-button>
          <el-radio-button value="B">B 级</el-radio-button>
          <el-radio-button value="C">C 级</el-radio-button>
        </el-radio-group>
        <el-button
          text
          @click="
            () => {
              filterSurface = ''
              gradeFilter = ''
            }
          "
        >
          清空
        </el-button>
      </div>
    </section>

    <MapPanel
      v-if="siteStore.list.length"
      :sites="panelSites"
      :selected-id="selectedId"
      :grade-of="gradeOfSite"
      height="460px"
      title="营位分布与等级着色"
      @select="selectSite"
      @mode="onPanelMode"
    />

    <section v-else class="panel">
      <EmptyState
        title="还没有可在地图上展示的营位"
        description="地图按经纬度摆放营位标记，先登记至少一个营位，随后即可在此查看等级着色与分布关系。"
        action-text="新增营位"
        hint="未配置 VITE_AMAP_KEY 时会自动渲染本地 SVG 网格视图"
        @action="router.push('/sites/new')"
      />
    </section>

    <section v-if="selectedSite" class="panel">
      <div class="panel__head">
        <h2>{{ selectedSite.code }} · {{ selectedSite.name }}</h2>
        <GradeBadge
          :grade="selectedRow?.grade ?? 'C'"
          :score="selectedRow?.total"
          :vetoed="selectedVetos.length > 0"
        />
      </div>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-item__label">所属营地</span>
          <span>{{ selectedSite.campName }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item__label">坐标</span>
          <span>{{ formatLng(selectedSite.lng) }} / {{ formatLat(selectedSite.lat) }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item__label">海拔 / 坡度</span>
          <span>{{ selectedSite.elevation }} m / {{ selectedSite.slope }}°</span>
        </div>
        <div class="detail-item">
          <span class="detail-item__label">坡向 / 地表</span>
          <span>{{ selectedSite.aspect }} / {{ selectedSite.surface }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item__label">容量 / 进出</span>
          <span>{{ selectedSite.tentCapacity }} 帐 / {{ selectedSite.access }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item__label">平整度</span>
          <span>{{ selectedSite.flatness }} 分</span>
        </div>
        <div class="detail-item">
          <span class="detail-item__label">最近营位</span>
          <span>{{ nearest ? `${nearest.code} · ${formatDistance(nearest.meters)}` : '唯一营位' }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item__label">最近评估</span>
          <span>
            {{
              siteStore.latestFactor(selectedSite.id)
                ? `${formatDate(siteStore.latestFactor(selectedSite.id)?.assessedAt ?? '')} · ${siteStore.latestFactor(selectedSite.id)?.assessor}`
                : '暂无评估'
            }}
          </span>
        </div>
      </div>
      <p v-if="selectedSite.note" class="panel__hint">现场备注：{{ selectedSite.note }}</p>
      <div v-if="selectedVetos.length" class="veto-block">
        <el-tag v-for="v in selectedVetos" :key="v.id" type="danger" size="small" class="mr6">
          {{ v.type }}
        </el-tag>
        <span class="weight-note">{{ selectedVetos.map((v) => v.description).join(' ｜ ') }}</span>
      </div>
      <div class="detail-actions">
        <el-button type="primary" size="small" @click="router.push(`/sites/${selectedSite.id}`)">
          打开详情
        </el-button>
        <el-button size="small" @click="router.push('/veto')">登记否决</el-button>
      </div>
    </section>

    <section v-else class="panel">
      <p class="panel__hint" style="margin: 0">
        在上方地图中点击任一营位标记或在左侧清单中选择营位，即可在此查看该营位的得分、因子与否决情况。
      </p>
    </section>
  </div>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 8px 18px;
}
.detail-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  font-size: 13px;
  background: var(--gb-surface);
  border-radius: 8px;
}
.detail-item__label {
  color: var(--gb-muted);
}
.detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.veto-block {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.mr6 {
  margin-right: 6px;
}
</style>

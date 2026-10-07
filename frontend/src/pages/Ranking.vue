<script setup lang="ts">
/**
 * `/` 营位名次表 —— 按综合得分从高到低排序，展示坡度、水源距离、信号与等级，
 * 可按营地 / 地表类型 / 进出方式筛选，命中否决项的营位整行标红。
 * 消费 Campsite、FactorAssessment、RiskVeto；复用 <GradeBadge>、<EmptyState>。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSiteStore } from '@/stores/siteStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import { useRanking } from '@/hooks/useRanking'
import { FACTOR_META } from '@/types/score'
import { SURFACE_TYPES, ACCESS_MODES } from '@/types/campsite'
import GradeBadge from '@/components/common/GradeBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatScore } from '@/utils/format'
import { NORMALIZE_LABELS } from '@/types/score'

const router = useRouter()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const uiStore = useUiStore()

const inputSites = computed(() =>
  siteStore.list.filter((site) => {
    if (uiStore.filterCamp && site.campName !== uiStore.filterCamp) return false
    if (uiStore.filterSurface && site.surface !== uiStore.filterSurface) return false
    if (uiStore.filterAccess && site.access !== uiStore.filterAccess) return false
    const kw = uiStore.keyword.trim()
    if (kw) {
      const hay = `${site.code} ${site.name} ${site.campName} ${site.note}`
      if (!hay.includes(kw)) return false
    }
    return true
  })
)

const { ranked } = useRanking({
  sites: () => inputSites.value,
  factorOf: (siteId: number) => siteStore.latestFactor(siteId),
  weights: () => profileStore.activeWeights,
  normalize: () => profileStore.activeProfile?.normalize ?? 'minmax',
  thresholds: () => profileStore.activeProfile?.thresholds ?? { gradeA: 78, gradeB: 58 },
  vetoedIds: () => uiStore.vetoedSiteIds
})

const factorMetaOf = (key: string) => FACTOR_META.find((m) => m.key === key)

/** 从某行的因子明细里取某一项的归一化得分，供表格单元格内联展示 */
function normalizedOf(
  row: { rows: Array<{ key: string; normalized: number }> },
  key: string
): number | string {
  return row.rows.find((r) => r.key === key)?.normalized ?? '—'
}

/** 命中否决项的营位整行标红 */
function rowClass({ row }: { row: { vetoed: boolean } }): string {
  return row.vetoed ? 'veto-row' : ''
}

const stats = computed(() => {
  const rows = ranked.value
  return {
    total: rows.length,
    gradeA: rows.filter((r) => r.grade === 'A').length,
    vetoed: rows.filter((r) => r.vetoed).length,
    top: rows[0]?.total ?? 0,
    topName: rows[0] ? `${rows[0].site.code} ${rows[0].site.name}` : '—'
  }
})

const activeProfileName = computed(() => profileStore.activeProfile?.name ?? '—')
const activeNormalize = computed(() =>
  profileStore.activeProfile ? NORMALIZE_LABELS[profileStore.activeProfile.normalize] : '—'
)

function openDetail(siteId: number | undefined): void {
  if (typeof siteId !== 'number') return
  void router.push(`/sites/${siteId}`)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="page-head__title">
        <h1>营位名次表</h1>
        <p>
          按当前权重方案对全部候选营位加权求和后降序排列，实时给出 A/B/C 推荐等级；
          命中风险否决项的营位整行标红并自动降为 C 级。
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="router.push('/scoring')">调权重</el-button>
        <el-button @click="router.push('/map')">看地图</el-button>
        <el-button type="primary" @click="router.push('/sites/new')">新增营位</el-button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-card__label">候选营位</div>
        <div class="stat-card__value" data-testid="stat-total">{{ stats.total }}</div>
        <div class="stat-card__extra">共 {{ siteStore.total }} 个已登记</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">A 级推荐</div>
        <div class="stat-card__value">{{ stats.gradeA }}</div>
        <div class="stat-card__extra">阈值来自当前方案</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">命中否决</div>
        <div class="stat-card__value" :style="{ color: stats.vetoed ? '#b91c1c' : undefined }">
          {{ stats.vetoed }}
        </div>
        <div class="stat-card__extra">否决后禁止评 A</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">最高综合得分</div>
        <div class="stat-card__value">{{ formatScore(stats.top) }}</div>
        <div class="stat-card__extra">{{ stats.topName }}</div>
      </div>
    </div>

    <section class="panel">
      <div class="panel__head">
        <h2>筛选条件</h2>
        <span class="weight-note">
          当前方案：{{ activeProfileName }} · 归一方式：{{ activeNormalize }}
        </span>
      </div>
      <div class="filters">
        <el-select v-model="uiStore.filterCamp" placeholder="全部营地" clearable style="width: 190px">
          <el-option v-for="c in siteStore.camps" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select
          v-model="uiStore.filterSurface"
          placeholder="全部地表类型"
          clearable
          style="width: 170px"
        >
          <el-option v-for="s in SURFACE_TYPES" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select
          v-model="uiStore.filterAccess"
          placeholder="全部进出方式"
          clearable
          style="width: 170px"
        >
          <el-option v-for="a in ACCESS_MODES" :key="a" :label="a" :value="a" />
        </el-select>
        <el-input
          v-model="uiStore.keyword"
          placeholder="搜索编号 / 名称 / 备注"
          clearable
          style="width: 230px"
        />
        <el-button text @click="uiStore.resetFilters()">清空筛选</el-button>
      </div>
    </section>

    <section class="panel">
      <div class="panel__head">
        <h2>名次与得分</h2>
        <span class="weight-note">共 {{ ranked.length }} 行</span>
      </div>

      <el-table
        v-if="ranked.length"
        data-testid="ranking-table"
        :data="ranked"
        :row-class-name="rowClass"
        size="default"
        border
        stripe
      >
        <el-table-column label="名次" width="76" align="center">
          <template #default="{ row }">
            <span class="rank-no" :class="{ 'rank-no--top': row.rank <= 3 }">{{ row.rank }}</span>
          </template>
        </el-table-column>
        <el-table-column label="营位" min-width="210">
          <template #default="{ row }">
            <div class="site-cell">
              <el-link type="primary" underline="never" @click="openDetail(row.site.id)">
                {{ row.site.code }} · {{ row.site.name }}
              </el-link>
              <span class="site-cell__sub">
                {{ row.site.campName }} · 海拔 {{ row.site.elevation }} m · 容 {{ row.site.tentCapacity }} 帐
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="地表 / 进出" width="130">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.site.surface }}</el-tag>
            <el-tag size="small" effect="plain" type="info" class="ml6">{{ row.site.access }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="坡度" width="92" align="right">
          <template #default="{ row }">
            {{ row.raw.slope.toFixed(1) }}°
            <div class="cell-sub">归一 {{ normalizedOf(row, 'slope') }}</div>
          </template>
        </el-table-column>
        <el-table-column label="水源距离" width="104" align="right">
          <template #default="{ row }">
            {{ row.raw.waterDistance }} m
            <div class="cell-sub">归一 {{ normalizedOf(row, 'waterDistance') }}</div>
          </template>
        </el-table-column>
        <el-table-column label="信号" width="92" align="right">
          <template #default="{ row }">
            {{ row.raw.signal }} 格
            <div class="cell-sub">归一 {{ normalizedOf(row, 'signal') }}</div>
          </template>
        </el-table-column>
        <el-table-column label="风力" width="88" align="right">
          <template #default="{ row }">
            {{ row.raw.wind }} 级
            <div class="cell-sub">{{ siteStore.latestFactor(row.siteId)?.windDir ?? '—' }}向</div>
          </template>
        </el-table-column>
        <el-table-column label="日照" width="86" align="right">
          <template #default="{ row }">{{ row.raw.sun.toFixed(1) }} h</template>
        </el-table-column>
        <el-table-column label="综合得分" width="104" align="right">
          <template #default="{ row }">
            <strong class="total-score">{{ formatScore(row.total) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="210">
          <template #default="{ row }">
            <GradeBadge :grade="row.grade" :score="row.total" :vetoed="row.vetoed" />
          </template>
        </el-table-column>
        <el-table-column label="否决项" min-width="180">
          <template #default="{ row }">
            <template v-if="row.vetoed">
              <el-tag v-for="v in uiStore.vetosOf(row.siteId)" :key="v.id" type="danger" size="small" class="mr6">
                {{ v.type }}
              </el-tag>
            </template>
            <span v-else class="muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="132" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row.site.id)">详情</el-button>
            <el-button size="small" text @click="router.push('/veto')">登记否决</el-button>
          </template>
        </el-table-column>
      </el-table>

      <EmptyState
        v-else
        title="还没有可评估的营位"
        description="先登记候选营位并录入因子（坡度、水源距离、信号、日照等），名次表会自动按得分排序并给出 A/B/C 等级。"
        action-text="新增营位"
        :hint="`因子维度共 ${FACTOR_META.length} 项，全部可在评分页调整权重`"
        @action="router.push('/sites/new')"
      />
    </section>
  </div>
</template>

<style scoped>
.rank-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--gb-surface);
  color: var(--gb-muted);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.rank-no--top {
  background: #e6f4ea;
  color: var(--gb-accent-strong);
}
.site-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.site-cell__sub {
  font-size: 11px;
  color: var(--gb-muted);
}
.cell-sub {
  font-size: 11px;
  color: var(--gb-muted);
}
.total-score {
  font-size: 15px;
  color: var(--gb-accent-strong);
  font-variant-numeric: tabular-nums;
}
.ml6 {
  margin-left: 6px;
}
.mr6 {
  margin-right: 6px;
}
</style>

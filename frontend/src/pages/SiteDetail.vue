<script setup lang="ts">
/**
 * `/sites/:id` 营位详情 —— 上部地图定位与基本信息，中部因子打分表，下部否决记录与多轮复核。
 * 消费四个模型；复用 <MapPanel>、<FactorScoreBar>、<GradeBadge>。
 */
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MapPanel from '@/components/common/MapPanel.vue'
import FactorScoreBar from '@/components/common/FactorScoreBar.vue'
import GradeBadge from '@/components/common/GradeBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useSiteStore } from '@/stores/siteStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import { useRanking } from '@/hooks/useRanking'
import { FACTOR_META, NORMALIZE_LABELS } from '@/types/score'
import { ASPECT_TYPES, SURFACE_TYPES, ACCESS_MODES } from '@/types/campsite'
import type { AspectType, AccessMode, SurfaceType } from '@/types/campsite'
import type { Grade } from '@/utils/score'
import type { FactorAssessmentInput, RockfallRisk, WindDir, WindForce } from '@/types/factor'
import type { AddFactorResult } from '@/utils/db'
import { ROCKFALL_RISKS, WIND_DIRS, WIND_FORCES } from '@/types/factor'
import { VETO_TYPES, VETO_HINTS } from '@/types/veto'
import type { VetoType } from '@/types/veto'
import { formatDate, formatDateTime, todayIso } from '@/utils/format'
import { formatLat, formatLng } from '@/utils/geo'

const route = useRoute()
const router = useRouter()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const uiStore = useUiStore()

const siteId = computed(() => Number(route.params.id))
const site = computed(() => siteStore.byId(siteId.value))

const { scoreOf } = useRanking({
  sites: () => siteStore.list,
  factorOf: (id: number) => siteStore.latestFactor(id),
  weights: () => profileStore.activeWeights,
  normalize: () => profileStore.activeProfile?.normalize ?? 'minmax',
  thresholds: () => profileStore.activeProfile?.thresholds ?? { gradeA: 78, gradeB: 58 },
  vetoedIds: () => uiStore.vetoedSiteIds
})

const scoreRow = computed(() => scoreOf(siteId.value))

/** 供 MapPanel 与地图标记回调使用（避免在模板里写带类型标注的箭头函数） */
function gradeOfSite(id: number): Grade {
  return scoreOf(id)?.grade ?? 'C'
}

function openSite(id: number): void {
  void router.push(`/sites/${id}`)
}
const grade = computed(() => scoreRow.value?.grade ?? 'C')
const factorHistory = computed(() => siteStore.factorsOf(siteId.value))
const vetoList = computed(() => uiStore.vetosOf(siteId.value))

/* --------------------------- 多轮因子复核录入 --------------------------- */
const showFactorForm = ref(false)
const factorForm = reactive({
  waterDistance: 60,
  windDir: '东南' as WindDir,
  windForce: 1 as WindForce,
  signalBars: 4,
  sunHours: 5,
  rockfallRisk: '无' as RockfallRisk,
  shade: 35,
  distanceToCar: 40,
  distanceToTrail: 50,
  assessor: '',
  assessedAt: todayIso()
})
const factorConflict = ref<AddFactorResult | null>(null)
const submittingFactor = ref(false)

function clearFactorConflict(): void {
  factorConflict.value = null
}

function prefillFactor(): void {
  const latest = siteStore.latestFactor(siteId.value)
  if (latest) {
    factorForm.waterDistance = latest.waterDistance
    factorForm.windDir = latest.windDir
    factorForm.windForce = latest.windForce
    factorForm.signalBars = latest.signalBars
    factorForm.sunHours = latest.sunHours
    factorForm.rockfallRisk = latest.rockfallRisk
    factorForm.shade = latest.shade
    factorForm.distanceToCar = latest.distanceToCar
    factorForm.distanceToTrail = latest.distanceToTrail
    factorForm.assessor = latest.assessor
  }
  factorForm.assessedAt = todayIso()
  clearFactorConflict()
}

function buildFactorInput(): FactorAssessmentInput {
  return {
    siteId: siteId.value,
    waterDistance: Number(factorForm.waterDistance),
    windDir: factorForm.windDir,
    windForce: factorForm.windForce,
    signalBars: Number(factorForm.signalBars),
    sunHours: Number(factorForm.sunHours),
    rockfallRisk: factorForm.rockfallRisk,
    shade: Number(factorForm.shade),
    distanceToCar: Number(factorForm.distanceToCar),
    distanceToTrail: Number(factorForm.distanceToTrail),
    assessor: factorForm.assessor.trim() || '未署名',
    assessedAt: factorForm.assessedAt || todayIso()
  }
}

async function submitFactor(force = false): Promise<void> {
  if (!site.value) return
  submittingFactor.value = true
  try {
    const result = await siteStore.addFactor(buildFactorInput(), force)
    if (result.outcome === 'added') {
      showFactorForm.value = false
      clearFactorConflict()
      ElMessage.success(
        result.changedLatest
          ? '已追加最新评估，名次与等级已立即重算'
          : '已作为历史补录留存，当前名次仍采用日期最新的评估'
      )
      return
    }

    factorConflict.value = result
    if (result.outcome === 'duplicate') {
      ElMessage.info('库中最新评估的日期与内容均相同，无需重复提交')
    } else {
      ElMessage.warning('库中最新评估的日期不早于本次提交，本次未覆盖；请核对差异后再决定是否留存')
    }
  } catch (err) {
    ElMessage.error(`追加失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    submittingFactor.value = false
  }
}

async function removeFactor(id: number | undefined): Promise<void> {
  if (typeof id !== 'number') return
  try {
    await ElMessageBox.confirm('确认删除这一轮因子评估？删除后名次会立即重算。', '提示', {
      type: 'warning'
    })
    await siteStore.removeFactor(id)
    ElMessage.success('已删除该轮评估')
  } catch {
    /* 用户取消 */
  }
}

/* ------------------------------ 否决记录 ------------------------------ */
const vetoForm = reactive({
  type: '山洪沟' as VetoType,
  description: '',
  judge: '',
  judgedAt: todayIso()
})

async function addVetoHere(): Promise<void> {
  if (!site.value) return
  if (!vetoForm.description.trim()) {
    ElMessage.warning('请填写否决说明')
    return
  }
  await uiStore.addVeto({
    siteId: siteId.value,
    type: vetoForm.type,
    description: vetoForm.description.trim(),
    judge: vetoForm.judge.trim() || '未署名',
    judgedAt: vetoForm.judgedAt || todayIso(),
    createdAt: '',
    updatedAt: ''
  })
  vetoForm.description = ''
  ElMessage.success('已登记否决项，该营位在名次表与地图上标红且禁止评 A')
}

async function removeVeto(id: number | undefined): Promise<void> {
  if (typeof id !== 'number') return
  await uiStore.removeVeto(id)
  ElMessage.success('已解除该否决项')
}

/* ------------------------------ 基本信息编辑 ------------------------------ */
const editing = ref(false)
const editForm = reactive({
  name: '',
  campName: '',
  elevation: 0,
  slope: 0,
  aspect: '东南' as AspectType,
  surface: '草地' as SurfaceType,
  tentCapacity: 1,
  flatness: 80,
  access: '车行' as AccessMode,
  note: ''
})

function startEdit(): void {
  const s = site.value
  if (!s) return
  editForm.name = s.name
  editForm.campName = s.campName
  editForm.elevation = s.elevation
  editForm.slope = s.slope
  editForm.aspect = s.aspect
  editForm.surface = s.surface
  editForm.tentCapacity = s.tentCapacity
  editForm.flatness = s.flatness
  editForm.access = s.access
  editForm.note = s.note
  editing.value = true
}

async function saveEdit(): Promise<void> {
  if (!site.value) return
  await siteStore.updateSite(siteId.value, {
    name: editForm.name.trim() || site.value.name,
    campName: editForm.campName.trim() || site.value.campName,
    elevation: Number(editForm.elevation),
    slope: Number(editForm.slope),
    aspect: editForm.aspect,
    surface: editForm.surface,
    tentCapacity: Number(editForm.tentCapacity),
    flatness: Number(editForm.flatness),
    access: editForm.access,
    note: editForm.note.trim()
  })
  editing.value = false
  ElMessage.success('营位基础信息已更新')
}

/** 因子明细行，附带原始值与权重信息 */
const factorRows = computed(() => {
  const row = scoreRow.value
  if (!row) return []
  return row.rows.map((r) => ({ ...r, higherIsBetter: metaOf(r.key)?.higherIsBetter ?? true }))
})

function metaOf(key: string) {
  return FACTOR_META.find((m) => m.key === key)
}

watch(
  () => route.params.id,
  () => {
    showFactorForm.value = false
    editing.value = false
    prefillFactor()
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="site" class="page">
    <div class="page-head">
      <div class="page-head__title">
        <h1>{{ site.code }} · {{ site.name }}</h1>
        <p>
          {{ site.campName }} · {{ site.surface }} · 容 {{ site.tentCapacity }} 帐 ·
          {{ site.access }} · 海拔 {{ site.elevation }} m
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="router.push('/')">返回名次表</el-button>
        <el-button @click="router.push('/map')">地图视图</el-button>
        <el-button type="primary" @click="startEdit">编辑基础信息</el-button>
      </div>
    </div>

    <el-alert
      v-if="vetoList.length"
      type="error"
      show-icon
      :closable="false"
      title="该营位命中风险否决项，综合等级已被压到 C 级（禁止评 A）"
      :description="vetoList.map((v) => `${v.type}：${v.description}`).join(' ｜ ')"
    />

    <MapPanel
      :sites="siteStore.list"
      :selected-id="siteId"
      :grade-of="gradeOfSite"
      height="360px"
      :title="`营位定位 · ${site.code}`"
      @select="openSite"
    />

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-card__label">综合得分</div>
        <div class="stat-card__value">{{ scoreRow?.total ?? '—' }}</div>
        <div class="stat-card__extra">方案 {{ profileStore.activeProfile?.name ?? '—' }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">推荐等级</div>
        <div class="stat-card__value">
          <GradeBadge :grade="grade" size="large" :vetoed="vetoList.length > 0" />
        </div>
        <div class="stat-card__extra">名次第 {{ scoreRow?.rank ?? '—' }} 位</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">坐标</div>
        <div class="stat-card__value coord">{{ formatLng(site.lng) }}</div>
        <div class="stat-card__extra">{{ formatLat(site.lat) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">评估轮次</div>
        <div class="stat-card__value">{{ factorHistory.length }}</div>
        <div class="stat-card__extra">否决项 {{ vetoList.length }} 条</div>
      </div>
    </div>

    <section v-if="editing" class="panel">
      <div class="panel__head">
        <h2>编辑基础信息</h2>
      </div>
      <el-form label-width="112px" @submit.prevent>
        <div class="form-grid">
          <el-form-item label="营位名称">
            <el-input id="edit-name" v-model="editForm.name" />
          </el-form-item>
          <el-form-item label="所属营地">
            <el-input id="edit-camp" v-model="editForm.campName" />
          </el-form-item>
          <el-form-item label="海拔（m）">
            <el-input-number
              id="edit-elevation"
              v-model="editForm.elevation"
              :min="0"
              :max="6000"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="坡度（°）">
            <el-input-number
              id="edit-slope"
              v-model="editForm.slope"
              :min="0"
              :max="45"
              :step="0.1"
              :precision="1"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="坡向">
            <el-select id="edit-aspect" v-model="editForm.aspect" style="width: 100%">
              <el-option v-for="a in ASPECT_TYPES" :key="a" :label="a" :value="a" />
            </el-select>
          </el-form-item>
          <el-form-item label="地表类型">
            <el-select id="edit-surface" v-model="editForm.surface" style="width: 100%">
              <el-option v-for="s in SURFACE_TYPES" :key="s" :label="s" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item label="可容帐篷数">
            <el-input-number
              id="edit-capacity"
              v-model="editForm.tentCapacity"
              :min="1"
              :max="60"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="平整度评分">
            <el-input-number
              id="edit-flatness"
              v-model="editForm.flatness"
              :min="0"
              :max="100"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="进出方式">
            <el-radio-group v-model="editForm.access">
              <el-radio v-for="a in ACCESS_MODES" :key="a" :value="a">{{ a }}</el-radio>
            </el-radio-group>
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="editForm.note" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveEdit">保存</el-button>
          <el-button @click="editing = false">取消</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="panel">
      <div class="panel__head">
        <h2>因子打分表</h2>
        <span class="weight-note">
          归一方式：{{ profileStore.activeProfile ? NORMALIZE_LABELS[profileStore.activeProfile.normalize] : '—' }}
          · 等级阈值 A ≥ {{ profileStore.activeProfile?.thresholds.gradeA ?? 78 }} / B ≥
          {{ profileStore.activeProfile?.thresholds.gradeB ?? 58 }}
        </span>
      </div>
      <div class="factor-grid">
        <FactorScoreBar
          v-for="row in factorRows"
          :key="row.key"
          :factor-key="row.key"
          :label="row.label"
          :raw="row.raw"
          :normalized="row.normalized"
          :weight="row.weight"
          :weight-ratio="row.weightRatio"
          :higher-is-better="row.higherIsBetter"
          :contribution="row.contribution"
        />
      </div>
      <p class="panel__hint">
        当前名次所用因子来自最新一轮评估（{{ siteStore.latestFactor(siteId)?.assessedAt ?? '暂无' }}，
        评估人 {{ siteStore.latestFactor(siteId)?.assessor ?? '—' }}）。
      </p>
    </section>

    <section class="panel">
      <div class="panel__head">
        <h2>多轮因子复核</h2>
        <el-button
          size="small"
          type="primary"
          plain
          @click="
            () => {
              prefillFactor()
              showFactorForm = !showFactorForm
            }
          "
        >
          {{ showFactorForm ? '收起录入' : '追加一轮评估' }}
        </el-button>
      </div>

      <el-form v-if="showFactorForm" label-width="112px" class="review-form" @submit.prevent>
        <div class="form-grid">
          <el-form-item label="水源距离（m）">
            <el-input-number
              id="review-water"
              v-model="factorForm.waterDistance"
              :min="0"
              :max="5000"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="风向">
            <el-select id="review-windDir" v-model="factorForm.windDir" style="width: 100%">
              <el-option v-for="d in WIND_DIRS" :key="d" :label="d" :value="d" />
            </el-select>
          </el-form-item>
          <el-form-item label="风力等级">
            <el-select id="review-windForce" v-model="factorForm.windForce" style="width: 100%">
              <el-option v-for="f in WIND_FORCES" :key="f" :label="`${f} 级`" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="信号强度（格）">
            <el-input-number
              id="review-signal"
              v-model="factorForm.signalBars"
              :min="0"
              :max="5"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="日照时长（h）">
            <el-input-number
              id="review-sun"
              v-model="factorForm.sunHours"
              :min="0"
              :max="14"
              :step="0.1"
              :precision="1"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="落石落枝风险">
            <el-select id="review-rockfall" v-model="factorForm.rockfallRisk" style="width: 100%">
              <el-option v-for="r in ROCKFALL_RISKS" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
          <el-form-item label="植被遮蔽度">
            <el-input-number
              id="review-shade"
              v-model="factorForm.shade"
              :min="0"
              :max="100"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="离车距离（m）">
            <el-input-number
              id="review-car"
              v-model="factorForm.distanceToCar"
              :min="0"
              :max="5000"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="离步道（m）">
            <el-input-number
              id="review-trail"
              v-model="factorForm.distanceToTrail"
              :min="0"
              :max="5000"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="评估人">
            <el-input id="review-assessor" v-model="factorForm.assessor" />
          </el-form-item>
          <el-form-item label="评估日期">
            <el-date-picker
              id="review-date"
              v-model="factorForm.assessedAt"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-alert
          v-if="factorConflict"
          class="factor-conflict"
          :title="
            factorConflict.outcome === 'duplicate'
              ? '库中最新一轮内容与本次提交一致'
              : '检测到同时提交：本次晚到且评估日期不更新，尚未覆盖'
          "
          type="warning"
          show-icon
          :closable="false"
        >
          <template #default>
            <p class="factor-conflict__dates">
              库中最新：{{ factorConflict.latest.assessedAt }} ·
              {{ factorConflict.latest.assessor }}
              ；本次：{{ factorForm.assessedAt }} ·
              {{ factorForm.assessor.trim() || '未署名' }}
            </p>
            <el-table
              v-if="factorConflict.differences.length"
              :data="factorConflict.differences"
              size="small"
              border
            >
              <el-table-column prop="label" label="差异项" width="130" />
              <el-table-column prop="latest" label="库中最新" min-width="120" />
              <el-table-column prop="incoming" label="本次提交" min-width="120" />
            </el-table>
            <p v-else class="factor-conflict__empty">逐项数值没有差异，无需形成新的评估记录。</p>
            <div v-if="factorConflict.outcome === 'stale'" class="factor-conflict__actions">
              <span>
                {{
                  factorForm.assessedAt === factorConflict.latest.assessedAt
                    ? '确认同日补录后，本次记录将成为最新评分。'
                    : '旧日期记录会保留为历史补录，但评分仍以日期最新的一轮为准。'
                }}
              </span>
              <el-button size="small" type="warning" plain :loading="submittingFactor" @click="submitFactor(true)">
                确认差异并留存
              </el-button>
              <el-button size="small" @click="clearFactorConflict">取消</el-button>
            </div>
          </template>
        </el-alert>
        <el-form-item>
          <el-button type="primary" :loading="submittingFactor" @click="submitFactor()">提交本轮评估</el-button>
        </el-form-item>
      </el-form>

      <el-table v-if="factorHistory.length" :data="factorHistory" size="small" border>
        <el-table-column label="轮次" width="150">
          <template #default="{ row }">
            第 {{ row.sequence }} 次
            <el-tag v-if="siteStore.latestFactor(siteId)?.id === row.id" type="success" size="small">
              当前评分
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="assessedAt" label="评估日期" width="118">
          <template #default="{ row }">{{ formatDate(row.assessedAt) }}</template>
        </el-table-column>
        <el-table-column prop="assessor" label="评估人" width="110" />
        <el-table-column label="水源" width="90">
          <template #default="{ row }">{{ row.waterDistance }} m</template>
        </el-table-column>
        <el-table-column label="风向 / 风力" width="130">
          <template #default="{ row }">{{ row.windDir }} {{ row.windForce }} 级</template>
        </el-table-column>
        <el-table-column label="信号" width="80">
          <template #default="{ row }">{{ row.signalBars }} 格</template>
        </el-table-column>
        <el-table-column label="日照" width="86">
          <template #default="{ row }">{{ row.sunHours }} h</template>
        </el-table-column>
        <el-table-column label="落石落枝" width="100">
          <template #default="{ row }">{{ row.rockfallRisk }}</template>
        </el-table-column>
        <el-table-column label="遮蔽度" width="88">
          <template #default="{ row }">{{ row.shade }}</template>
        </el-table-column>
        <el-table-column label="离车 / 离步道" width="140">
          <template #default="{ row }">{{ row.distanceToCar }} / {{ row.distanceToTrail }} m</template>
        </el-table-column>
        <el-table-column label="录入时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="danger" @click="removeFactor(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-else class="panel__hint">暂无因子评估记录，点击「追加一轮评估」开始录入。</p>
    </section>

    <section class="panel">
      <div class="panel__head">
        <h2>风险否决记录</h2>
        <span class="weight-note">命中任一条即整行标红并禁止评 A</span>
      </div>

      <el-table v-if="vetoList.length" :data="vetoList" size="small" border>
        <el-table-column prop="type" label="否决类型" width="130">
          <template #default="{ row }">
            <el-tag type="danger" size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="260" />
        <el-table-column prop="judge" label="判定人" width="110" />
        <el-table-column label="判定日期" width="120">
          <template #default="{ row }">{{ formatDate(row.judgedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="danger" @click="removeVeto(row.id)">解除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-else class="panel__hint">该营位暂无否决记录，可在下方直接登记。</p>

      <el-divider content-position="left">登记新的否决项</el-divider>
      <el-form label-width="100px" @submit.prevent>
        <div class="form-grid">
          <el-form-item label="否决类型">
            <el-select id="veto-type" v-model="vetoForm.type" style="width: 100%">
              <el-option v-for="t in VETO_TYPES" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <el-form-item label="判定人">
            <el-input id="veto-judge" v-model="vetoForm.judge" placeholder="如 周勘" />
          </el-form-item>
          <el-form-item label="判定日期">
            <el-date-picker
              id="veto-date"
              v-model="vetoForm.judgedAt"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-form-item label="说明">
          <el-input
            id="veto-desc"
            v-model="vetoForm.description"
            type="textarea"
            :rows="2"
            :placeholder="VETO_HINTS[vetoForm.type]"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="danger" plain @click="addVetoHere">登记否决项</el-button>
        </el-form-item>
      </el-form>
    </section>
  </div>

  <div v-else class="page">
    <section class="panel">
      <EmptyState
        title="没有找到这个营位"
        description="该营位可能已被删除，或链接中的编号不正确。返回名次表查看全部候选营位，或直接新增一个。"
        action-text="新增营位"
        @action="router.push('/sites/new')"
      />
    </section>
  </div>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 0 18px;
}
.factor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}
.coord {
  font-size: 15px;
}
.review-form {
  margin-bottom: 12px;
}
.factor-conflict {
  margin-bottom: 12px;
}
.factor-conflict__dates,
.factor-conflict__empty {
  margin: 6px 0 8px;
}
.factor-conflict__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--gb-muted);
}
</style>

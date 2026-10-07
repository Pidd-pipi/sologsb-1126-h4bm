<script setup lang="ts">
/**
 * `/sites/new` 新增营位 —— 地图点选或手填经纬度，录入海拔、坡度、坡向与容量，
 * 支持草稿保存（localStorage）。复用 <MapPanel>、<FactorScoreBar>。
 */
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import MapPanel from '@/components/common/MapPanel.vue'
import FactorScoreBar from '@/components/common/FactorScoreBar.vue'
import { useSiteStore } from '@/stores/siteStore'
import { useProfileStore } from '@/stores/profileStore'
import { useLocalDraft } from '@/hooks/useLocalDraft'
import { ASPECT_TYPES, SURFACE_TYPES, ACCESS_MODES } from '@/types/campsite'
import type { AspectType, Campsite, SurfaceType, AccessMode } from '@/types/campsite'
import type { FactorAssessment, RockfallRisk, WindDir, WindForce } from '@/types/factor'
import { ROCKFALL_RISKS, WIND_DIRS, WIND_FORCES } from '@/types/factor'
import { FACTOR_META, DEFAULT_WEIGHTS } from '@/types/score'
import type { FactorKey, FactorWeights } from '@/types/score'
import {
  buildFactorRows,
  buildNormalizedMatrix,
  gradeOf,
  rawValuesOf,
  weightedTotal,
  type Grade
} from '@/utils/score'
import { isValidLngLat, formatLng, formatLat } from '@/utils/geo'
import { formatFactorValue, todayIso } from '@/utils/format'

const router = useRouter()
const siteStore = useSiteStore()
const profileStore = useProfileStore()

interface SiteForm {
  code: string
  name: string
  campName: string
  lng: number
  lat: number
  elevation: number
  slope: number
  aspect: AspectType
  surface: SurfaceType
  tentCapacity: number
  flatness: number
  access: AccessMode
  note: string
}

interface FactorForm {
  waterDistance: number
  windDir: WindDir
  windForce: WindForce
  signalBars: number
  sunHours: number
  rockfallRisk: RockfallRisk
  shade: number
  distanceToCar: number
  distanceToTrail: number
  assessor: string
  assessedAt: string
}

function defaultSiteForm(): SiteForm {
  return {
    code: '',
    name: '',
    campName: '',
    lng: 119.8842,
    lat: 30.5318,
    elevation: 400,
    slope: 3,
    aspect: '东南',
    surface: '草地',
    tentCapacity: 4,
    flatness: 85,
    access: '车行',
    note: ''
  }
}

function defaultFactorForm(): FactorForm {
  return {
    waterDistance: 60,
    windDir: '东南',
    windForce: 1,
    signalBars: 4,
    sunHours: 5,
    rockfallRisk: '无',
    shade: 35,
    distanceToCar: 40,
    distanceToTrail: 50,
    assessor: '',
    assessedAt: todayIso()
  }
}

/** 草稿数据结构：营位 + 因子一起存，刷新后可完整恢复 */
interface SiteDraft {
  site: SiteForm
  factor: FactorForm
}

const draftModel = ref<SiteDraft>({ site: defaultSiteForm(), factor: defaultFactorForm() })
const site = reactive<SiteForm>(defaultSiteForm())
const factor = reactive<FactorForm>(defaultFactorForm())
const submitting = ref(false)
const draftTip = ref('')

watch(
  () => ({ ...site }),
  () => {
    draftModel.value = { site: { ...site }, factor: { ...factor } }
  },
  { deep: true, immediate: true }
)
watch(
  () => ({ ...factor }),
  () => {
    draftModel.value = { site: { ...site }, factor: { ...factor } }
  },
  { deep: true }
)

const draft = useLocalDraft<SiteDraft>({
  key: 'site-new',
  source: draftModel,
  delay: 500,
  onRestore: (value) => {
    Object.assign(site, value.site)
    Object.assign(factor, value.factor)
    draftTip.value = '已从本地草稿恢复上次未提交的录入内容'
  }
})

function restoreDraft(): void {
  if (draft.restore()) {
    ElMessage.success('已恢复本地草稿')
  } else {
    ElMessage.info('没有可恢复的草稿')
  }
}

function discardDraft(): void {
  draft.clear()
  Object.assign(site, defaultSiteForm())
  Object.assign(factor, defaultFactorForm())
  draftTip.value = ''
  ElMessage.info('草稿已清除')
}

function onPick(point: { lng: number; lat: number }): void {
  site.lng = point.lng
  site.lat = point.lat
  ElMessage.success(`已拾取坐标 ${formatLng(point.lng)} / ${formatLat(point.lat)}`)
}

/** 预览用的临时营位对象（未落库） */
const previewSite = computed<Campsite>(() => ({
  code: site.code || 'CS-NEW',
  name: site.name || '待登记营位',
  campName: site.campName || '未指定营地',
  lng: Number(site.lng),
  lat: Number(site.lat),
  elevation: Number(site.elevation),
  slope: Number(site.slope),
  aspect: site.aspect,
  surface: site.surface,
  tentCapacity: Number(site.tentCapacity),
  flatness: Number(site.flatness),
  access: site.access,
  defaultProfileId: profileStore.activeProfile?.id ?? null,
  note: site.note,
  createdAt: '',
  updatedAt: ''
}))

const previewFactor = computed<FactorAssessment>(() => ({
  siteId: 0,
  waterDistance: Number(factor.waterDistance),
  windDir: factor.windDir,
  windForce: factor.windForce,
  signalBars: Number(factor.signalBars),
  sunHours: Number(factor.sunHours),
  rockfallRisk: factor.rockfallRisk,
  shade: Number(factor.shade),
  distanceToCar: Number(factor.distanceToCar),
  distanceToTrail: Number(factor.distanceToTrail),
  assessor: factor.assessor,
  assessedAt: factor.assessedAt,
  createdAt: '',
  updatedAt: ''
}))

const previewWeights = computed<FactorWeights>(() => ({
  ...DEFAULT_WEIGHTS,
  ...(profileStore.activeProfile?.weights ?? {})
}))
const previewNormalize = computed(() => profileStore.activeProfile?.normalize ?? 'minmax')

const previewRaw = computed(() => rawValuesOf(previewSite.value, previewFactor.value))

/**
 * 极差归一必须同批比较：把「已在库营位 + 当前候选营位」放进同一批，
 * 否则单条样本跨度为零，候选营位会拿到虚高的满分。
 */
const previewMatrix = computed(() => {
  const entries = siteStore.list
    .filter((s): s is typeof s & { id: number } => typeof s.id === 'number')
    .map((s) => ({ siteId: s.id, values: rawValuesOf(s, siteStore.latestFactor(s.id)) }))
  entries.push({ siteId: 0, values: previewRaw.value })
  return buildNormalizedMatrix(entries, previewNormalize.value)
})

const previewNormalized = computed(
  () => previewMatrix.value.get(0) ?? ({} as Record<FactorKey, number>)
)

const previewRows = computed(() =>
  buildFactorRows(previewNormalized.value, previewWeights.value).map((row) => ({
    ...row,
    raw: previewRaw.value[row.key]
  }))
)

const previewTotal = computed(() =>
  weightedTotal(previewNormalized.value, previewWeights.value)
)

const previewGrade = computed<Grade>(() =>
  gradeOf(
    previewTotal.value,
    profileStore.activeProfile?.thresholds ?? { gradeA: 78, gradeB: 58 },
    false
  )
)

const metaOf = (key: FactorKey) => FACTOR_META.find((m) => m.key === key)

async function submit(): Promise<void> {
  if (!site.name.trim()) {
    ElMessage.warning('请填写营位名称')
    return
  }
  if (!site.campName.trim()) {
    ElMessage.warning('请填写所属营地')
    return
  }
  if (!isValidLngLat(Number(site.lng), Number(site.lat))) {
    ElMessage.warning('经纬度超出合理范围，请重新点选或填写')
    return
  }
  submitting.value = true
  try {
    const id = await siteStore.createSite({
      ...site,
      code: site.code.trim() || siteStore.nextCode(),
      name: site.name.trim(),
      campName: site.campName.trim(),
      lng: Number(site.lng),
      lat: Number(site.lat),
      elevation: Number(site.elevation),
      slope: Number(site.slope),
      tentCapacity: Number(site.tentCapacity),
      flatness: Number(site.flatness),
      note: site.note.trim(),
      defaultProfileId: profileStore.activeProfile?.id ?? null,
      createdAt: '',
      updatedAt: ''
    })
    await siteStore.addFactor({
      ...factor,
      siteId: id,
      waterDistance: Number(factor.waterDistance),
      windForce: factor.windForce,
      signalBars: Number(factor.signalBars),
      sunHours: Number(factor.sunHours),
      shade: Number(factor.shade),
      distanceToCar: Number(factor.distanceToCar),
      distanceToTrail: Number(factor.distanceToTrail),
      assessor: factor.assessor.trim() || '未署名',
      assessedAt: factor.assessedAt || todayIso(),
      createdAt: '',
      updatedAt: ''
    })
    draft.clear()
    ElMessage.success('营位已登记，正在跳转详情')
    await router.push(`/sites/${id}`)
  } catch (err) {
    ElMessage.error(`保存失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="page-head__title">
        <h1>新增营位</h1>
        <p>
          在地图上点选营位位置，或直接手填经纬度；随后录入海拔、坡度、坡向与容量，
          并同步填写一轮因子实测值。录入内容会自动存为本地草稿，刷新页面也能恢复。
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="router.push('/')">返回名次表</el-button>
      </div>
    </div>

    <el-alert
      v-if="draftTip"
      :title="draftTip"
      type="success"
      :closable="true"
      show-icon
      @close="draftTip = ''"
    />

    <MapPanel
      :sites="siteStore.list"
      :selected-id="null"
      mode="pick"
      height="380px"
      title="候选营位分布（点选拾取经纬度）"
      @pick="onPick"
    />

    <el-form label-width="112px" class="panel" @submit.prevent>
      <div class="form-grid">
        <el-form-item label="营位编号">
          <el-input
            id="site-code"
            v-model="site.code"
            name="siteCode"
            placeholder="留空自动生成，如 CS-0007"
          />
        </el-form-item>
        <el-form-item label="营位名称">
          <el-input id="site-name" v-model="site.name" name="siteName" placeholder="如 溪畔台地 A 区" />
        </el-form-item>
        <el-form-item label="所属营地">
          <el-input
            id="site-camp"
            v-model="site.campName"
            name="campName"
            placeholder="如 云栖山谷营地"
          />
        </el-form-item>
        <el-form-item label="经度">
          <el-input-number
            id="site-lng"
            v-model="site.lng"
            :precision="5"
            :step="0.001"
            :min="-180"
            :max="180"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="纬度">
          <el-input-number
            id="site-lat"
            v-model="site.lat"
            :precision="5"
            :step="0.001"
            :min="-90"
            :max="90"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="海拔（m）">
          <el-input-number
            id="site-elevation"
            v-model="site.elevation"
            :min="0"
            :max="6000"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="坡度（°）">
          <el-input-number
            id="site-slope"
            v-model="site.slope"
            :min="0"
            :max="45"
            :step="0.1"
            :precision="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="坡向">
          <el-select id="site-aspect" v-model="site.aspect" style="width: 100%">
            <el-option v-for="a in ASPECT_TYPES" :key="a" :label="a" :value="a" />
          </el-select>
        </el-form-item>
        <el-form-item label="地表类型">
          <el-select id="site-surface" v-model="site.surface" style="width: 100%">
            <el-option v-for="s in SURFACE_TYPES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="可容帐篷数">
          <el-input-number
            id="site-capacity"
            v-model="site.tentCapacity"
            :min="1"
            :max="60"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="平整度评分">
          <el-input-number
            id="site-flatness"
            v-model="site.flatness"
            :min="0"
            :max="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="进出方式">
          <el-radio-group id="site-access" v-model="site.access">
            <el-radio v-for="a in ACCESS_MODES" :key="a" :value="a">{{ a }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </div>
      <el-form-item label="营位备注">
        <el-input
          id="site-note"
          v-model="site.note"
          type="textarea"
          :rows="2"
          placeholder="进场道路、地面植被、周边设施等现场情况"
        />
      </el-form-item>

      <el-divider content-position="left">因子实测（第一轮评估）</el-divider>

      <div class="form-grid">
        <el-form-item label="水源距离（m）">
          <el-input-number
            id="factor-water"
            v-model="factor.waterDistance"
            :min="0"
            :max="5000"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="风向">
          <el-select id="factor-windDir" v-model="factor.windDir" style="width: 100%">
            <el-option v-for="d in WIND_DIRS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="风力等级">
          <el-select id="factor-windForce" v-model="factor.windForce" style="width: 100%">
            <el-option v-for="f in WIND_FORCES" :key="f" :label="`${f} 级`" :value="f" />
          </el-select>
        </el-form-item>
        <el-form-item label="信号强度（格）">
          <el-input-number
            id="factor-signal"
            v-model="factor.signalBars"
            :min="0"
            :max="5"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="日照时长（h）">
          <el-input-number
            id="factor-sun"
            v-model="factor.sunHours"
            :min="0"
            :max="14"
            :step="0.1"
            :precision="1"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="落石落枝风险">
          <el-select id="factor-rockfall" v-model="factor.rockfallRisk" style="width: 100%">
            <el-option v-for="r in ROCKFALL_RISKS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="植被遮蔽度">
          <el-input-number
            id="factor-shade"
            v-model="factor.shade"
            :min="0"
            :max="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="离车距离（m）">
          <el-input-number
            id="factor-car"
            v-model="factor.distanceToCar"
            :min="0"
            :max="5000"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="离步道（m）">
          <el-input-number
            id="factor-trail"
            v-model="factor.distanceToTrail"
            :min="0"
            :max="5000"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="评估人">
          <el-input id="factor-assessor" v-model="factor.assessor" placeholder="如 李营" />
        </el-form-item>
        <el-form-item label="评估日期">
          <el-date-picker
            id="factor-date"
            v-model="factor.assessedAt"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </div>

      <el-form-item>
        <el-button type="primary" :loading="submitting" @click="submit">保存营位</el-button>
        <el-button @click="restoreDraft">恢复草稿</el-button>
        <el-button @click="discardDraft">清除草稿</el-button>
        <span class="weight-note draft-state">
          草稿状态：{{ draft.savedAtText || '暂无草稿' }}
        </span>
      </el-form-item>
    </el-form>

    <section class="panel">
      <div class="panel__head">
        <h2>实时评分预览</h2>
        <span class="weight-note">
          按当前方案「{{ profileStore.activeProfile?.name ?? '—' }}」预估，保存后进入名次表
        </span>
      </div>
      <div class="preview-head">
        <span>预估综合得分</span>
        <strong>{{ previewTotal }}</strong>
        <span class="muted">预估等级 {{ previewGrade }}</span>
      </div>
      <div class="factor-grid">
        <FactorScoreBar
          v-for="row in previewRows"
          :key="row.key"
          :factor-key="row.key"
          :label="row.label"
          :raw="row.raw"
          :normalized="row.normalized"
          :weight="row.weight"
          :weight-ratio="row.weightRatio"
          :higher-is-better="metaOf(row.key)?.higherIsBetter ?? true"
          :contribution="row.contribution"
          compact
        />
      </div>
      <p class="panel__hint">
        当前预览原始值：{{ previewRows.map((r) => `${r.label} ${formatFactorValue(r.key, r.raw)}`).join(' · ') }}
      </p>
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
  grid-template-columns: repeat(auto-fit, minmax(268px, 1fr));
  gap: 8px;
}
.preview-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
}
.preview-head strong {
  font-size: 24px;
  color: var(--gb-accent-strong);
  font-variant-numeric: tabular-nums;
}
.draft-state {
  margin-left: 12px;
}
</style>

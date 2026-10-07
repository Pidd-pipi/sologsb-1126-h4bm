<script setup lang="ts">
/**
 * `/veto` 风险否决登记 —— 选营位与否决类型、填说明，提交后名次表与地图同步更新。
 * 消费 RiskVeto、Campsite；复用 <GradeBadge>。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import GradeBadge from '@/components/common/GradeBadge.vue'
import { useSiteStore } from '@/stores/siteStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import { useRanking } from '@/hooks/useRanking'
import { VETO_TYPES, VETO_HINTS } from '@/types/veto'
import type { VetoType } from '@/types/veto'
import { formatDate, todayIso } from '@/utils/format'

const router = useRouter()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const uiStore = useUiStore()

const { scoreOf } = useRanking({
  sites: () => siteStore.list,
  factorOf: (id: number) => siteStore.latestFactor(id),
  weights: () => profileStore.activeWeights,
  normalize: () => profileStore.activeProfile?.normalize ?? 'minmax',
  thresholds: () => profileStore.activeProfile?.thresholds ?? { gradeA: 78, gradeB: 58 },
  vetoedIds: () => uiStore.vetoedSiteIds
})

const form = reactive({
  siteId: null as number | null,
  type: '山洪沟' as VetoType,
  description: '',
  judge: '',
  judgedAt: todayIso()
})

const submitting = ref(false)

const siteOptions = computed(() =>
  siteStore.list
    .filter((s): s is typeof s & { id: number } => typeof s.id === 'number')
    .map((s) => ({
      value: s.id,
      label: `${s.code} · ${s.name}（${s.campName}）`,
      vetoed: uiStore.isVetoed(s.id)
    }))
)

const selectedSite = computed(() =>
  form.siteId == null ? null : siteStore.byId(form.siteId)
)

const selectedRow = computed(() =>
  form.siteId == null ? null : scoreOf(form.siteId)
)

const selectedVetos = computed(() => uiStore.vetosOf(form.siteId))

/** 全部否决记录，附带营位信息，便于一览 */
const vetoLedger = computed(() =>
  uiStore.vetos
    .map((v) => {
      const site = siteStore.byId(v.siteId)
      const row = scoreOf(v.siteId)
      return {
        ...v,
        siteCode: site?.code ?? '—',
        siteName: site?.name ?? '营位已删除',
        campName: site?.campName ?? '—',
        grade: row?.grade ?? 'C',
        total: row?.total ?? 0
      }
    })
    .sort((a, b) => (a.judgedAt < b.judgedAt ? 1 : -1))
)

async function submit(): Promise<void> {
  if (form.siteId == null) {
    ElMessage.warning('请选择要否决的营位')
    return
  }
  if (!form.description.trim()) {
    ElMessage.warning('请填写否决说明，便于复核')
    return
  }
  submitting.value = true
  try {
    await uiStore.addVeto({
      siteId: form.siteId,
      type: form.type,
      description: form.description.trim(),
      judge: form.judge.trim() || '未署名',
      judgedAt: form.judgedAt || todayIso(),
      createdAt: '',
      updatedAt: ''
    })
    ElMessage.success('否决项已登记：名次表标红、等级降至 C、地图同步更新')
    form.description = ''
    form.judge = ''
  } catch (err) {
    ElMessage.error(`登记失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    submitting.value = false
  }
}

async function removeOne(id: number | undefined): Promise<void> {
  if (typeof id !== 'number') return
  await uiStore.removeVeto(id)
  ElMessage.success('已解除该否决项，等级将重新按得分判定')
}

function focusSite(id: number | undefined): void {
  if (typeof id !== 'number') return
  form.siteId = id
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="page-head__title">
        <h1>风险否决登记</h1>
        <p>
          河道内、山洪沟、孤树下、崖底落石区与陡坡属于「一票否决」类硬约束：
          登记后该营位在名次表与地图上立即标红，综合等级被压到 C 级并禁止评 A。
        </p>
      </div>
      <div class="page-actions">
        <el-button @click="router.push('/')">返回名次表</el-button>
        <el-button @click="router.push('/map')">地图视图</el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="否决与得分解耦"
      description="否决记录不参与加权求和，而是在得分算出后做短路处理：只要命中任一条，等级直接判定为 C。解除否决后等级会按原得分重新判定。"
    />

    <div class="veto-layout">
      <section class="panel">
        <div class="panel__head">
          <h2>登记否决项</h2>
        </div>
        <el-form label-width="100px" @submit.prevent>
          <el-form-item label="营位">
            <el-select
              id="veto-site"
              v-model="form.siteId"
              placeholder="选择要否决的营位"
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="opt in siteOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              >
                <span>{{ opt.label }}</span>
                <el-tag v-if="opt.vetoed" type="danger" size="small" style="float: right">
                  已否决
                </el-tag>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="否决类型">
            <el-select id="veto-type" v-model="form.type" style="width: 100%">
              <el-option v-for="t in VETO_TYPES" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <el-form-item label="判定人">
            <el-input id="veto-judge" v-model="form.judge" placeholder="如 周勘" />
          </el-form-item>
          <el-form-item label="判定日期">
            <el-date-picker
              id="veto-date"
              v-model="form.judgedAt"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              id="veto-desc"
              v-model="form.description"
              type="textarea"
              :rows="3"
              :placeholder="VETO_HINTS[form.type]"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="danger" :loading="submitting" @click="submit">提交否决</el-button>
            <el-button
              @click="
                () => {
                  form.siteId = null
                  form.description = ''
                  form.judge = ''
                }
              "
            >
              清空
            </el-button>
          </el-form-item>
        </el-form>

        <el-divider content-position="left">判定提示</el-divider>
        <ul class="hint-list">
          <li v-for="t in VETO_TYPES" :key="t">
            <el-tag size="small" type="danger" effect="plain">{{ t }}</el-tag>
            <span>{{ VETO_HINTS[t] }}</span>
          </li>
        </ul>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2>选中营位预览</h2>
          <GradeBadge
            v-if="selectedRow"
            :grade="selectedRow.grade"
            :score="selectedRow.total"
            :vetoed="selectedVetos.length > 0"
          />
        </div>
        <template v-if="selectedSite">
          <div class="preview-list">
            <div class="preview-item">
              <span>营位</span>
              <strong>{{ selectedSite.code }} · {{ selectedSite.name }}</strong>
            </div>
            <div class="preview-item">
              <span>所属营地</span>
              <strong>{{ selectedSite.campName }}</strong>
            </div>
            <div class="preview-item">
              <span>地表 / 容量</span>
              <strong>{{ selectedSite.surface }} · {{ selectedSite.tentCapacity }} 帐</strong>
            </div>
            <div class="preview-item">
              <span>坡度 / 海拔</span>
              <strong>{{ selectedSite.slope }}° · {{ selectedSite.elevation }} m</strong>
            </div>
            <div class="preview-item">
              <span>现有否决</span>
              <strong>{{ selectedVetos.length }} 条</strong>
            </div>
          </div>
          <div v-if="selectedVetos.length" class="preview-veto">
            <el-tag v-for="v in selectedVetos" :key="v.id" type="danger" size="small" class="mr6">
              {{ v.type }}
            </el-tag>
            <p class="panel__hint">{{ selectedVetos.map((v) => v.description).join(' ｜ ') }}</p>
          </div>
          <el-button
            size="small"
            type="primary"
            plain
            style="margin-top: 10px"
            @click="router.push(`/sites/${selectedSite.id}`)"
          >
            打开营位详情
          </el-button>
        </template>
        <p v-else class="panel__hint">请先从左侧选择营位，提交前可在此确认该营位的基础条件与已有限否记录。</p>
      </section>
    </div>

    <section class="panel">
      <div class="panel__head">
        <h2>否决台账</h2>
        <span class="weight-note">共 {{ vetoLedger.length }} 条</span>
      </div>
      <el-table v-if="vetoLedger.length" :data="vetoLedger" size="small" border stripe>
        <el-table-column label="营位" min-width="190">
          <template #default="{ row }">
            <el-link type="primary" underline="never" @click="focusSite(row.siteId)">
              {{ row.siteCode }} · {{ row.siteName }}
            </el-link>
            <div class="cell-sub">{{ row.campName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="否决类型" width="126">
          <template #default="{ row }">
            <el-tag type="danger" size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="260" />
        <el-table-column prop="judge" label="判定人" width="100" />
        <el-table-column label="判定日期" width="112">
          <template #default="{ row }">{{ formatDate(row.judgedAt) }}</template>
        </el-table-column>
        <el-table-column label="当前等级" width="170">
          <template #default="{ row }">
            <GradeBadge :grade="row.grade" :score="row.total" vetoed size="small" :show-label="false" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="focusSite(row.siteId)">定位</el-button>
            <el-button size="small" text type="danger" @click="removeOne(row.id)">解除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-else class="panel__hint">暂无否决记录。登记后名次表与地图会立即同步标红。</p>
    </section>
  </div>
</template>

<style scoped>
.veto-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1080px) {
  .veto-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
.hint-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.hint-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--gb-muted);
  line-height: 1.6;
}
.preview-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preview-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  font-size: 13px;
  background: var(--gb-surface);
  border-radius: 8px;
}
.preview-item span {
  color: var(--gb-muted);
}
.preview-veto {
  margin-top: 10px;
}
.cell-sub {
  font-size: 11px;
  color: var(--gb-muted);
}
.mr6 {
  margin-right: 6px;
}
</style>

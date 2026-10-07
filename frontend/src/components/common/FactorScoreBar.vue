<script setup lang="ts">
/**
 * FactorScoreBar —— 单因子打分条：原始值、归一化得分、权重占比。
 * 被 `/sites/new`（实时预览）、`/sites/:id`（因子打分表）消费。
 */
import { computed } from 'vue'
import type { FactorKey } from '@/types/score'
import { formatFactorValue, formatPercent } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    factorKey: FactorKey
    label: string
    /** 原始实测值 */
    raw: number
    /** 归一化得分 0-100 */
    normalized: number
    /** 权重（0-100） */
    weight: number
    /** 权重占比 0-1 */
    weightRatio: number
    /** 该因子是否为「值越大越好」 */
    higherIsBetter?: boolean
    /** 在整体得分中的贡献值 */
    contribution?: number
    compact?: boolean
  }>(),
  {
    higherIsBetter: true,
    contribution: undefined,
    compact: false
  }
)

const rawText = computed(() => formatFactorValue(props.factorKey, props.raw))
const ratioText = computed(() => formatPercent(props.weightRatio))
const barColor = computed(() => {
  const n = props.normalized
  if (n >= 78) return '#15803d'
  if (n >= 58) return '#d97706'
  return '#b91c1c'
})
const directionText = computed(() => (props.higherIsBetter ? '越大越优' : '越小越优'))
</script>

<template>
  <div class="factor-bar" :class="{ 'factor-bar--compact': compact }">
    <div class="factor-bar__head">
      <span class="factor-bar__label">{{ label }}</span>
      <span class="factor-bar__raw">{{ rawText }}</span>
      <span class="factor-bar__dir">{{ directionText }}</span>
    </div>
    <div class="factor-bar__track">
      <div
        class="factor-bar__fill"
        :style="{ width: `${Math.min(100, Math.max(0, normalized))}%`, background: barColor }"
      />
    </div>
    <div class="factor-bar__foot">
      <span class="factor-bar__normalized">归一 {{ normalized }}</span>
      <span class="factor-bar__weight">
        权重 {{ weight }}（占比 {{ ratioText }}<template v-if="typeof contribution === 'number'">
          · 贡献 {{ contribution }}</template
        >）
      </span>
    </div>
  </div>
</template>

<style scoped>
.factor-bar {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid var(--gb-line);
  border-radius: 8px;
}
.factor-bar--compact {
  padding: 6px 8px;
}
.factor-bar__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.factor-bar__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--gb-ink);
}
.factor-bar__raw {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--gb-accent-strong);
  font-weight: 700;
}
.factor-bar__dir {
  margin-left: auto;
  font-size: 11px;
  color: var(--gb-muted);
}
.factor-bar__track {
  height: 8px;
  border-radius: 999px;
  background: #e8eee9;
  overflow: hidden;
}
.factor-bar__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.25s ease;
}
.factor-bar__foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--gb-muted);
  flex-wrap: wrap;
}
.factor-bar__normalized {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--gb-ink);
}
</style>

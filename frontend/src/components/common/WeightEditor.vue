<script setup lang="ts">
/**
 * WeightEditor —— 拖动各因子权重条，名次随权重实时刷新。
 * 被 `/scoring` 消费；权重合计与预设也在这里收口。
 */
import { computed } from 'vue'
import type { FactorKey, FactorWeights } from '@/types/score'
import { FACTOR_META, weightSumGuard } from '@/types/score'
import { weightSum } from '@/utils/score'

const props = defineProps<{
  weights: FactorWeights
}>()

const emit = defineEmits<{
  (e: 'change', weights: FactorWeights): void
  (e: 'preset', weights: FactorWeights): void
}>()

const total = computed(() => weightSum(props.weights))

const totalState = computed(() => {
  const sum = total.value
  if (Math.abs(sum - 100) <= 0.5) return { type: 'success' as const, text: '权重合计 100，可直接保存' }
  if (sum > 100) return { type: 'warning' as const, text: `权重合计 ${sum}，超过 100 会按占比自动归一` }
  return { type: 'info' as const, text: `权重合计 ${sum}，低于 100 会按占比自动归一` }
})

function updateFromSlider(key: FactorKey, value: unknown): void {
  update(key, value as number | number[])
}

function updateFromInput(key: FactorKey, value: unknown): void {
  update(key, (value as number | undefined) ?? 0)
}

function update(key: FactorKey, value: number | number[] | undefined): void {
  const num = Array.isArray(value) ? value[0] : value
  const next: FactorWeights = { ...props.weights, [key]: Math.max(0, Math.min(100, Number(num) || 0)) }
  emit('change', next)
}

function applyPreset(name: string): void {
  emit('preset', weightSumGuard(name))
}

function resetAll(): void {
  emit('preset', weightSumGuard('balanced'))
}
</script>

<template>
  <div class="weight-editor">
    <div class="weight-editor__bar">
      <el-tag :type="totalState.type" effect="plain" size="small">{{ totalState.text }}</el-tag>
      <div class="weight-editor__presets">
        <el-button size="small" @click="applyPreset('balanced')">均衡型</el-button>
        <el-button size="small" @click="applyPreset('typhoon')">雨季防风</el-button>
        <el-button size="small" @click="applyPreset('family')">亲子舒适</el-button>
        <el-button size="small" @click="applyPreset('wild')">重装野营</el-button>
        <el-button size="small" type="primary" plain @click="resetAll">重置</el-button>
      </div>
    </div>

    <div class="weight-editor__grid">
      <div v-for="meta in FACTOR_META" :key="meta.key" class="weight-editor__row">
        <div class="weight-editor__label">
          <span class="weight-editor__name">{{ meta.label }}</span>
          <span class="weight-editor__unit">
            {{ meta.higherIsBetter ? '越大越优' : '越小越优' }} · {{ meta.unit }}
          </span>
        </div>
        <el-slider
          :model-value="weights[meta.key]"
          :min="0"
          :max="40"
          :step="1"
          :show-tooltip="true"
          class="weight-editor__slider"
          @update:model-value="updateFromSlider(meta.key, $event)"
        />
        <el-input-number
          :model-value="weights[meta.key]"
          :min="0"
          :max="100"
          :step="1"
          size="small"
          controls-position="right"
          class="weight-editor__number"
          @update:model-value="updateFromInput(meta.key, $event)"
        />
        <span class="weight-editor__ratio">
          {{ total > 0 ? ((weights[meta.key] / total) * 100).toFixed(0) : '0' }}%
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weight-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.weight-editor__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.weight-editor__presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.weight-editor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 6px 18px;
}
.weight-editor__row {
  display: grid;
  grid-template-columns: 128px 1fr 92px 44px;
  align-items: center;
  gap: 10px;
}
.weight-editor__label {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.weight-editor__name {
  font-size: 13px;
  color: var(--gb-ink);
}
.weight-editor__unit {
  font-size: 11px;
  color: var(--gb-muted);
}
.weight-editor__slider {
  min-width: 120px;
}
.weight-editor__number {
  width: 92px;
}
.weight-editor__ratio {
  font-size: 12px;
  color: var(--gb-accent-strong);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>

<script setup lang="ts">
/**
 * GradeBadge —— A/B/C 推荐等级标签 + 综合得分气泡。
 * 被 `/`（名次表）、`/sites/:id`（详情）、`/map`（地图标记）消费。
 */
import { computed } from 'vue'
import { GRADE_COLOR, GRADE_LABEL, type Grade } from '@/utils/score'
import { formatScore } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    grade: Grade
    score?: number
    /** small 用于表格行内，large 用于详情页头部 */
    size?: 'small' | 'default' | 'large'
    /** 命中否决项时追加「否决」标记 */
    vetoed?: boolean
    /** 是否展示等级文案 */
    showLabel?: boolean
  }>(),
  {
    score: undefined,
    size: 'default',
    vetoed: false,
    showLabel: true
  }
)

const color = computed(() => (props.vetoed ? '#b91c1c' : GRADE_COLOR[props.grade]))

const label = computed(() => {
  if (props.vetoed) return `${props.grade} 级 · 命中否决`
  return GRADE_LABEL[props.grade]
})

const scoreText = computed(() =>
  typeof props.score === 'number' ? formatScore(props.score) : '—'
)
</script>

<template>
  <span class="grade-badge" :class="[`grade-badge--${size}`, { 'is-vetoed': vetoed }]">
    <span class="grade-badge__chip" :style="{ background: color }">{{ grade }}</span>
    <span v-if="typeof score === 'number'" class="grade-badge__score">{{ scoreText }}</span>
    <span v-if="showLabel" class="grade-badge__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.grade-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.grade-badge__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.5px;
}
.grade-badge__score {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--gb-ink);
}
.grade-badge__label {
  font-size: 12px;
  color: var(--gb-muted);
}
.grade-badge--small .grade-badge__chip {
  min-width: 18px;
  height: 18px;
  font-size: 11px;
  border-radius: 5px;
}
.grade-badge--small .grade-badge__score,
.grade-badge--small .grade-badge__label {
  font-size: 11px;
}
.grade-badge--large .grade-badge__chip {
  min-width: 30px;
  height: 30px;
  font-size: 16px;
  border-radius: 9px;
}
.grade-badge--large .grade-badge__score {
  font-size: 22px;
}
.grade-badge--large .grade-badge__label {
  font-size: 13px;
}
.grade-badge.is-vetoed .grade-badge__score {
  color: #b91c1c;
}
</style>

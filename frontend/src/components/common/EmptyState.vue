<script setup lang="ts">
/**
 * EmptyState —— 空态提示与新建入口。
 * 被 `/`（名次表为空）、`/map`（地图无营位）消费。
 */
withDefaults(
  defineProps<{
    title?: string
    description?: string
    /** 主按钮文案，为空则不渲染按钮 */
    actionText?: string
    /** 次级提示文案 */
    hint?: string
  }>(),
  {
    title: '还没有数据',
    description: '',
    actionText: '',
    hint: ''
  }
)

const emit = defineEmits<{ (e: 'action'): void }>()
</script>

<template>
  <div class="empty-state">
    <svg class="empty-state__art" viewBox="0 0 120 88" role="img" aria-label="空态插图">
      <rect x="2" y="70" width="116" height="16" rx="8" fill="#dbe7dd" />
      <path d="M22 70 L60 20 L98 70 Z" fill="#e8f0e9" stroke="#8fae96" stroke-width="2" />
      <path d="M38 70 L60 41 L82 70 Z" fill="#cfe0d4" />
      <rect x="57" y="70" width="6" height="9" rx="2" fill="#8fae96" />
      <circle cx="97" cy="21" r="8" fill="#f6d488" />
      <path d="M12 78 C32 70 46 84 62 76 C78 68 96 82 110 74" fill="none" stroke="#8fae96" stroke-width="2" stroke-linecap="round" />
    </svg>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <el-button v-if="actionText" type="primary" class="empty-state__action" @click="emit('action')">
      {{ actionText }}
    </el-button>
    <p v-if="hint" class="empty-state__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 42px 18px 52px;
  text-align: center;
}
.empty-state__art {
  width: 148px;
  height: auto;
}
.empty-state__title {
  margin: 4px 0 0;
  font-size: 17px;
  color: var(--gb-ink);
}
.empty-state__desc {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--gb-muted);
}
.empty-state__action {
  margin-top: 6px;
}
.empty-state__hint {
  margin: 0;
  font-size: 12px;
  color: var(--gb-muted);
}
</style>

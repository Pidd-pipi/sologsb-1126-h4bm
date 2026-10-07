<script setup lang="ts">
/**
 * 应用外壳：顶部导航 + 全局统计 + 页脚存储说明。
 * 挂载时并行加载四张表（sites / factors / profiles / vetos），保证各页面首屏即有数据。
 */
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/siteStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import { resolveAmapKey } from '@/hooks/useAmapLoader'

const route = useRoute()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const uiStore = useUiStore()

const activeMenu = computed(() => {
  const path = route.path
  if (path === '/') return '/'
  if (path.startsWith('/sites')) return '/sites/new'
  if (path.startsWith('/scoring')) return '/scoring'
  if (path.startsWith('/map')) return '/map'
  if (path.startsWith('/veto')) return '/veto'
  return ''
})

const mapModeText = computed(() =>
  resolveAmapKey() ? '高德地图模式' : 'SVG 网格降级模式（未配置 VITE_AMAP_KEY）'
)

onMounted(async () => {
  await Promise.all([
    siteStore.load(),
    profileStore.load(),
    uiStore.loadVetos()
  ])
})
</script>

<template>
  <el-container class="app-shell">
    <el-header class="app-header">
      <div class="app-brand">
        <img class="app-brand__mark" src="/favicon.svg" alt="营地标志" />
        <span class="app-brand__text">
          <strong>露营营地选址评估器</strong>
          <small>地形 · 水源 · 风向 · 隐患 → 综合得分与 A/B/C 等级</small>
        </span>
      </div>
      <el-menu :default-active="activeMenu" mode="horizontal" router :ellipsis="false" class="app-nav">
        <el-menu-item index="/">营位名次表</el-menu-item>
        <el-menu-item index="/sites/new">新增营位</el-menu-item>
        <el-menu-item index="/scoring">权重与评分</el-menu-item>
        <el-menu-item index="/map">营位地图</el-menu-item>
        <el-menu-item index="/veto">风险否决</el-menu-item>
      </el-menu>
      <div class="app-aside">
        <el-tag type="info" effect="plain" size="small">{{ mapModeText }}</el-tag>
        <span class="app-stat">
          营位 {{ siteStore.total }} · 方案 {{ profileStore.total }} · 否决 {{ uiStore.vetoTotal }}
        </span>
      </div>
    </el-header>
    <el-main class="app-main">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </el-main>
    <el-footer class="app-footer">
      数据全部保存在浏览器本地（IndexedDB 存营位/因子/方案/否决记录、localStorage 存表单草稿），无后端服务与外部接口。
    </el-footer>
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100%;
  background: var(--gb-paper);
}
.app-header {
  display: flex;
  align-items: center;
  gap: 18px;
  height: auto;
  min-height: 68px;
  padding: 8px 22px;
  background: #ffffff;
  border-bottom: 1px solid var(--gb-line);
  flex-wrap: wrap;
}
.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-brand__mark {
  width: 34px;
  height: 34px;
}
.app-brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.app-brand__text strong {
  font-size: 17px;
  color: var(--gb-accent-strong);
}
.app-brand__text small {
  font-size: 11px;
  color: var(--gb-muted);
}
.app-nav {
  border-bottom: none !important;
  flex: 1;
  min-width: 360px;
}
.app-aside {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.app-stat {
  font-size: 12px;
  color: var(--gb-muted);
  white-space: nowrap;
}
.app-main {
  padding: 0;
}
.app-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--gb-muted);
  border-top: 1px solid var(--gb-line);
  background: #ffffff;
  height: auto;
  padding: 10px 16px;
  text-align: center;
}
</style>

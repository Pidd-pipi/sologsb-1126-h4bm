import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/** 路由表：/、/sites/new、/sites/:id、/scoring、/map、/veto —— 与提示词「核心页面」一一对应。 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'ranking',
    component: () => import('@/pages/Ranking.vue'),
    meta: { title: '营位名次表' }
  },
  {
    path: '/sites/new',
    name: 'site-new',
    component: () => import('@/pages/SiteNew.vue'),
    meta: { title: '新增营位' }
  },
  {
    path: '/sites/:id',
    name: 'site-detail',
    component: () => import('@/pages/SiteDetail.vue'),
    meta: { title: '营位详情' }
  },
  {
    path: '/scoring',
    name: 'scoring',
    component: () => import('@/pages/Scoring.vue'),
    meta: { title: '权重与评分' }
  },
  {
    path: '/map',
    name: 'map',
    component: () => import('@/pages/MapView.vue'),
    meta: { title: '营位地图' }
  },
  {
    path: '/veto',
    name: 'veto',
    component: () => import('@/pages/Veto.vue'),
    meta: { title: '风险否决登记' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title ? `${title} · 露营营地选址评估器` : '露营营地选址评估器'
})

export default router

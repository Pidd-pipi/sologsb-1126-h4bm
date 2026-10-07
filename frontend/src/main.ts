import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import { initDatabase } from './utils/db'
import './styles/main.css'

async function bootstrap(): Promise<void> {
  // 先打开 IndexedDB 并写入首次运行的样例营地，再挂载应用，避免首屏空列表
  try {
    await initDatabase()
  } catch (err) {
    console.warn('[gbcampsite] 本地数据库初始化失败，将以空数据启动：', err)
  }
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(ElementPlus)
  app.mount('#app')
}

void bootstrap()

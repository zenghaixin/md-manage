import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/styles/index.css'
import App from './App.vue'
import router from './router'
import { initTheme } from './composables/useTheme'
import { runAppStartHooks } from './editor/extensions'

initTheme()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')

// 通知各已注册扩展做启动初始化（词条扫描等），核心不依赖具体扩展
runAppStartHooks().catch((err) => {
  console.warn('[extensions] onAppStart failed:', err?.message || err)
})

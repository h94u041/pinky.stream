import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/theme.css'
import App from './App.vue'
import { i18n } from './i18n'
import ParticipantView from './views/ParticipantView.vue'
import ConsoleView from './views/ConsoleView.vue'

document.documentElement.classList.add('dark')
document.documentElement.lang = i18n.global.locale.value

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: ParticipantView },
    { path: '/console', component: ConsoleView },
  ],
})

function showFatal(msg: string) {
  let box = document.getElementById('fatal')
  if (!box) {
    box = document.createElement('pre')
    box.id = 'fatal'
    box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;background:#191527;color:#ff9a3c;border:1px solid #302843;border-radius:10px;padding:10px 12px;font:12px ui-monospace,monospace;white-space:pre-wrap;max-height:40vh;overflow:auto'
    document.body.appendChild(box)
  }
  box.textContent += (box.textContent ? '\n' : '') + msg
}
window.addEventListener('error', (e) => showFatal(`Error: ${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`))
window.addEventListener('unhandledrejection', (e) => showFatal(`Unhandled: ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`))

const app = createApp(App)
app.config.errorHandler = (err) => showFatal(`Vue: ${(err as Error)?.stack || err}`)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.use(router)
app.use(i18n)
app.mount('#app')

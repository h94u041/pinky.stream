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

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.use(router)
app.use(i18n)
app.mount('#app')

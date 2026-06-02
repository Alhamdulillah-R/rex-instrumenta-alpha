import { createApp } from 'vue'
import { vuetify } from './plugins/vuetify'
import { router } from './router'
import App from './App.vue'

// 先 vuetify 样式(plugin 内 import), 再叠我们的 tokens / base / shell, 保证覆盖生效.
import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'

createApp(App).use(vuetify).use(router).mount('#app')

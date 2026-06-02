import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify, type ThemeDefinition } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

// 莫奈三 — dark 紫罗兰, 颜色与 tokens.css 的 --rex-* 对齐, 让 Vuetify 组件(v-btn 等)
// 与自绘 .rex-* 组件 / canvas 同色系.
const rexDark: ThemeDefinition = {
  dark: true,
  colors: {
    background: '#0f0f1a',
    surface: '#1a1a2e',
    'surface-bright': '#2a2a4a',
    'surface-variant': '#252542',
    primary: '#c4b5fd',
    secondary: '#93c5fd',
    error: '#fca5a5',
    info: '#93c5fd',
    success: '#6ee7b7',
    warning: '#fde68a',
    'on-surface': '#ffffff',
    'on-background': '#ffffff',
  },
}

const rexLight: ThemeDefinition = {
  dark: false,
  colors: {
    background: '#F8FBFF',
    surface: '#FFFFFF',
    'surface-bright': '#FFFFFF',
    'surface-variant': '#ECF2FF',
    primary: '#122E8A',
    secondary: '#294EBD',
    error: '#B83A32',
    info: '#294EBD',
    success: '#173894',
    warning: '#9A6225',
    'on-surface': '#000000',
    'on-background': '#000000',
  },
}

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ria-theme') : null

export const vuetify = createVuetify({
  theme: {
    defaultTheme: saved === 'rexLight' ? 'rexLight' : 'rexDark',
    themes: { rexDark, rexLight },
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  defaults: {
    VBtn: { rounded: 'lg', class: 'text-none' },
  },
})

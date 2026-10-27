import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/michroma/400.css'
import '@fontsource/chakra-petch/400.css'
import '@fontsource/chakra-petch/500.css'
import './style.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')

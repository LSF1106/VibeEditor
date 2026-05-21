// VibeEditor 前端应用入口
// 创建 Vue 应用 → 安装 Pinia 状态管理 → 挂载到 #app
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');

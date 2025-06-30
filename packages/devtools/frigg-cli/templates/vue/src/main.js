import { createApp } from 'vue';
import { createPinia } from 'pinia';
import FriggVue from '@friggframework/ui-vue';

import App from './App.vue';
import router from './router';

import './assets/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(FriggVue);

app.mount('#app');
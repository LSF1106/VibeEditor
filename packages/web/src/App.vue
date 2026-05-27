<!--
  根组件 —— 渲染主布局并定义全局 CSS 变量
  遵循 VS Code 暗色主题风格
-->
<template>
  <MainLayout />
</template>

<script setup lang="ts">
import MainLayout from './components/layout/MainLayout.vue';
</script>

<style>
:root[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d30;
  --bg-hover: #3e3e42;
  --border-color: #3e3e42;
  --text-primary: #cccccc;
  --text-secondary: #969696;
  --accent-color: #007acc;
  --accent-hover: #1a8ad4;
  --statusbar-bg: #007acc;
  --statusbar-text: #fff;
  --scrollbar-thumb: #424242;
  --scrollbar-thumb-hover: #555;
}

:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f3f3;
  --bg-tertiary: #ececec;
  --bg-hover: #e0e0e0;
  --border-color: #d4d4d4;
  --text-primary: #3b3b3b;
  --text-secondary: #6d6d6d;
  --accent-color: #007acc;
  --accent-hover: #1a8ad4;
  --statusbar-bg: #dadada;
  --statusbar-text: #3b3b3b;
  --scrollbar-thumb: #c8c8c8;
  --scrollbar-thumb-hover: #a8a8a8;
}

:root[data-theme="blue"] {
  --bg-primary: #002451;
  --bg-secondary: #001b3d;
  --bg-tertiary: #001733;
  --bg-hover: #00346e;
  --border-color: #1f4662;
  --text-primary: #ffffff;
  --text-secondary: #7285b7;
  --accent-color: #007acc;
  --accent-hover: #1a8ad4;
  --statusbar-bg: #007acc;
  --statusbar-text: #fff;
  --scrollbar-thumb: #1f4662;
  --scrollbar-thumb-hover: #2d6194;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
}
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}
::-webkit-scrollbar-track {
  background: transparent;
}
</style>

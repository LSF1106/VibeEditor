<template>
  <div v-if="visible" class="about-overlay" @click.self="emit('close')">
    <div class="about-card">
      <div class="about-header">
        <h2 class="about-title">{{ appInfo.name }}</h2>
        <button class="about-close" @click="emit('close')">&times;</button>
      </div>
      <div class="about-body">
        <p class="about-desc">{{ $t('about.description') }}</p>
        <div class="about-row">
          <span class="about-label">{{ $t('about.version') }}</span>
          <span class="about-value">v{{ appInfo.version }}</span>
        </div>
        <div class="about-row">
          <span class="about-label">{{ $t('about.author') }}</span>
          <span class="about-value">
            <template v-for="(author, index) in appInfo.authors" :key="author.github">
              <a class="about-link" :href="author.github" target="_blank" rel="noopener">{{ author.name }}</a>
              <template v-if="index < appInfo.authors.length - 1">、</template>
            </template>
          </span>
        </div>
        <div class="about-row">
          <span class="about-label">{{ $t('about.repo') }}</span>
          <a class="about-link" href="https://github.com/zbeeeeeeeeee/VibeEditor" target="_blank" rel="noopener">github.com/zbeeeeeeeeee/VibeEditor</a>
        </div>
      </div>
      <div class="about-footer">
        <button class="about-btn" @click="emit('close')">OK</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const appInfo = __APP_INFO__;

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.about-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  min-width: 320px;
  max-width: 420px;
  padding: 24px;
}
.about-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.about-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}
.about-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.about-close:hover {
  color: var(--text-primary);
}
.about-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}
.about-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}
.about-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}
.about-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.about-value {
  font-size: 13px;
  color: var(--text-primary);
  font-family: 'Consolas', 'Courier New', monospace;
}
.about-link {
  font-size: 12px;
  color: var(--accent-color);
  text-decoration: none;
  font-family: 'Consolas', 'Courier New', monospace;
}
.about-link:hover {
  text-decoration: underline;
}
.about-footer {
  display: flex;
  justify-content: flex-end;
}
.about-btn {
  background: var(--accent-color);
  color: var(--agent-on-accent-text);
  border: none;
  padding: 6px 28px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
}
.about-btn:hover {
  background: var(--accent-hover);
}
</style>

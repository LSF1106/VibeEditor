<template>
  <div class="setting-dropdown" ref="rootRef">
    <div
      class="sd-gear"
      :class="{ active: menuOpen }"
      :title="$t('activityBar.manage')"
      @click.stop="toggleMenu"
    >
      <span class="activity-icon">⚙</span>
    </div>

    <Teleport to="body">
      <div v-if="menuOpen" class="sd-backdrop" @click="closeAll"></div>
      <div v-if="menuOpen" class="sd-menu" :style="menuStyle">
        <div
          class="sd-item"
          :class="{ expanded: langOpen }"
          @click.stop="toggleLang"
        >
          <span class="sd-label">{{ $t('settings.language') }}</span>
          <span class="sd-arrow">▸</span>
        </div>
        <div v-if="langOpen" class="sd-submenu">
          <div
            class="sd-subitem"
            :class="{ active: settings.language === 'en' }"
            @click.stop="selectLang('en')"
          >
            <span class="sd-check">{{ settings.language === 'en' ? '✓' : '' }}</span>
            English
          </div>
          <div
            class="sd-subitem"
            :class="{ active: settings.language === 'zh' }"
            @click.stop="selectLang('zh')"
          >
            <span class="sd-check">{{ settings.language === 'zh' ? '✓' : '' }}</span>
            中文
          </div>
        </div>

        <div
          class="sd-item"
          :class="{ expanded: themeOpen }"
          @click.stop="toggleTheme"
        >
          <span class="sd-label">{{ $t('settings.theme') }}</span>
          <span class="sd-arrow">▸</span>
        </div>
        <div v-if="themeOpen" class="sd-submenu">
          <div
            class="sd-subitem"
            :class="{ active: settings.theme === 'dark' }"
            @click.stop="selectTheme('dark')"
          >
            <span class="sd-check">{{ settings.theme === 'dark' ? '✓' : '' }}</span>
            {{ $t('theme.dark') }}
          </div>
          <div
            class="sd-subitem"
            :class="{ active: settings.theme === 'light' }"
            @click.stop="selectTheme('light')"
          >
            <span class="sd-check">{{ settings.theme === 'light' ? '✓' : '' }}</span>
            {{ $t('theme.light') }}
          </div>
          <div
            class="sd-subitem"
            :class="{ active: settings.theme === 'blue' }"
            @click.stop="selectTheme('blue')"
          >
            <span class="sd-check">{{ settings.theme === 'blue' ? '✓' : '' }}</span>
            {{ $t('theme.blue') }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import type { Language, Theme } from '../../stores/settings';

const settings = useSettingsStore();

const rootRef = ref<HTMLElement>();
const menuOpen = ref(false);
const langOpen = ref(false);
const themeOpen = ref(false);

const menuStyle = computed(() => {
  if (!rootRef.value) return {};
  const rect = rootRef.value.getBoundingClientRect();
  return {
    position: 'fixed' as const,
    left: rect.right + 'px',
    bottom: (window.innerHeight - rect.bottom) + 'px',
  };
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (!menuOpen.value) {
    langOpen.value = false;
    themeOpen.value = false;
  }
}

function toggleLang() {
  langOpen.value = !langOpen.value;
  themeOpen.value = false;
}

function toggleTheme() {
  themeOpen.value = !themeOpen.value;
  langOpen.value = false;
}

function selectLang(lang: Language) {
  settings.setLanguage(lang);
  closeAll();
}

function selectTheme(theme: Theme) {
  settings.setTheme(theme);
  closeAll();
}

function closeAll() {
  menuOpen.value = false;
  langOpen.value = false;
  themeOpen.value = false;
}
</script>

<style scoped>
.setting-dropdown {
  position: relative;
}

.sd-gear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  cursor: pointer;
  color: #858585;
  transition: color 0.1s;
}
.sd-gear:hover,
.sd-gear.active {
  color: var(--text-primary);
}
.sd-gear .activity-icon {
  font-size: 22px;
  line-height: 1;
}
</style>

<style>
.sd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.sd-menu {
  min-width: 180px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  padding: 4px 0;
}

.sd-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  position: relative;
}
.sd-item:hover {
  background: rgba(0, 122, 204, 0.15);
}
.sd-item.expanded {
  background: rgba(0, 122, 204, 0.1);
}

.sd-label {
  flex: 1;
}

.sd-arrow {
  font-size: 8px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.sd-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  min-width: 160px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 101;
  padding: 4px 0;
}

.sd-subitem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sd-subitem:hover {
  background: rgba(0, 122, 204, 0.15);
}
.sd-subitem.active {
  background: rgba(0, 122, 204, 0.1);
}

.sd-check {
  width: 14px;
  font-size: 10px;
  color: var(--accent-color);
  text-align: center;
  flex-shrink: 0;
}
</style>

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { i18n } from '../locales';

export type Language = 'zh' | 'en';
export type Theme = 'dark' | 'light' | 'blue';

const STORAGE_KEY_LANG = 'vibeeditor-language';
const STORAGE_KEY_THEME = 'vibeeditor-theme';

function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored === 'dark' || stored === 'light' || stored === 'blue') return stored;
  } catch {}
  return 'dark';
}

function saveLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY_LANG, lang);
  } catch {}
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  } catch {}
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const useSettingsStore = defineStore('settings', () => {
  const language = computed<Language>(() => i18n.global.locale.value as Language);

  const initialTheme = loadTheme();
  applyTheme(initialTheme);

  const theme = ref<Theme>(initialTheme);

  function setLanguage(lang: Language) {
    i18n.global.locale.value = lang;
    saveLanguage(lang);
  }

  function setTheme(t: Theme) {
    theme.value = t;
    applyTheme(t);
    saveTheme(t);
  }

  return { language, theme, setLanguage, setTheme };
});

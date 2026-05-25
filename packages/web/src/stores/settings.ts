import { defineStore } from 'pinia';
import { computed } from 'vue';
import { i18n } from '../locales';

export type Language = 'zh' | 'en';

const STORAGE_KEY = 'vibeeditor-language';

function saveLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export const useSettingsStore = defineStore('settings', () => {
  const language = computed<Language>(() => i18n.global.locale.value as Language);

  function setLanguage(lang: Language) {
    i18n.global.locale.value = lang;
    saveLanguage(lang);
  }

  return { language, setLanguage };
});

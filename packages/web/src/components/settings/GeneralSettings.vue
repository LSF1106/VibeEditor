<template>
  <div class="general-settings">
    <n-form label-placement="top" size="small">
      <n-form-item :label="$t('settings.language')">
        <n-select
          :value="settings.language"
          :options="langOptions"
          @update:value="(v: Language) => settings.setLanguage(v)"
        />
      </n-form-item>
      <n-form-item :label="$t('settings.theme')">
        <n-select
          :value="settings.theme"
          :options="themeOptions"
          @update:value="(v: Theme) => settings.setTheme(v)"
        />
      </n-form-item>
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NForm, NFormItem, NSelect } from 'naive-ui'
import { useSettingsStore, type Language, type Theme } from '../../stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()

const langOptions = [
  { label: 'English', value: 'en' as Language },
  { label: '中文', value: 'zh' as Language },
]

const themeOptions = computed(() => [
  { label: t('theme.dark'), value: 'dark' as Theme },
  { label: t('theme.light'), value: 'light' as Theme },
  { label: t('theme.blue'), value: 'blue' as Theme },
])
</script>

<style scoped>
.general-settings {
  padding: 8px 0;
}
</style>

<template>
  <div class="provider-section">
    <div v-if="!editing && !pickingPreset && settings.providers.value.length === 0" class="empty-state">
      <n-empty :description="$t('settingsDialog.noProviderDesc')">
        <template #header>
          <span class="empty-title">{{ $t('settingsDialog.noProvider') }}</span>
        </template>
        <template #extra>
          <n-button type="primary" @click="startAddWithPreset(PROVIDER_PRESETS[0])">
            {{ $t('settingsDialog.addDeepSeek') }}
          </n-button>
          <n-button quaternary style="margin-left: 8px" @click="pickingPreset = true">
            {{ $t('settingsDialog.chooseOther') }}
          </n-button>
        </template>
      </n-empty>
    </div>

    <div v-if="settings.providers.value.length > 0" class="provider-list">
      <div
        v-for="g in groupedProviders"
        :key="g.ids[0]"
        class="provider-item"
        :class="{ active: editingId && g.ids.includes(editingId) }"
        @click="startEdit(g)"
      >
        <span class="provider-name">{{ g.name }}</span>
        <span class="provider-model">{{ g.models.join(', ') }}</span>
        <n-button text size="tiny" @click.stop="deleteGroup(g)" class="provider-delete">x</n-button>
      </div>
    </div>

    <n-form
      v-if="editing"
      ref="formRef"
      :model="form"
      label-placement="top"
      size="small"
      class="edit-form"
    >
      <n-form-item :label="$t('settingsDialog.name')">
        <n-input v-model:value="form.name" :placeholder="$t('settingsDialog.namePlaceholder')" />
      </n-form-item>
      <n-form-item :label="$t('settingsDialog.apiKey')">
        <n-input v-model:value="form.apiKey" type="password" :placeholder="$t('settingsDialog.apiKeyPlaceholder')" />
      </n-form-item>
      <n-form-item :label="$t('settingsDialog.apiUrl')">
        <template v-if="!showApiUrl">
          <n-button text size="small" @click="showApiUrl = true">... {{ $t('settingsDialog.modifyApiUrl') }}</n-button>
        </template>
        <n-input v-else v-model:value="form.apiUrl" :placeholder="$t('settingsDialog.apiUrlPlaceholder')" />
      </n-form-item>
      <n-form-item :label="$t('settingsDialog.model')">
        <n-spin v-if="fetchingModels" size="small" />
        <n-checkbox-group v-else-if="availableModels.length > 0" v-model:value="selectedModelList" class="model-checklist">
          <n-space vertical>
            <n-checkbox v-for="m in availableModels" :key="m" :value="m" :label="m" />
          </n-space>
        </n-checkbox-group>
        <span v-else-if="fetchError" class="fetch-error">{{ fetchError }}</span>
        <n-button v-else text size="small" type="primary" @click="fetchModels">
          {{ $t('settingsDialog.clickFetch') }}
        </n-button>
      </n-form-item>
      <div class="form-actions">
        <n-button type="primary" :disabled="selectedModelList.length === 0" @click="saveForm">
          {{ $t('settingsDialog.save') }}
        </n-button>
        <n-button @click="cancelEdit">{{ $t('settingsDialog.cancel') }}</n-button>
      </div>
    </n-form>

    <div v-if="pickingPreset" class="preset-picker">
      <n-text depth="3" class="preset-title">{{ $t('settingsDialog.selectProvider') }}</n-text>
      <n-space vertical>
        <n-card
          v-for="preset in PROVIDER_PRESETS"
          :key="preset.id"
          size="small"
          hoverable
          @click="startAddWithPreset(preset)"
        >
          <n-text strong>{{ preset.name }}</n-text>
          <n-text depth="3" style="margin-left: 8px">{{ $t('settingsDialog.justApiKey') }}</n-text>
        </n-card>
        <n-card size="small" hoverable class="custom-card" @click="startAdd">
          <n-text strong>{{ $t('settingsDialog.custom') }}</n-text>
          <n-text depth="3" style="margin-left: 8px">{{ $t('settingsDialog.customHint') }}</n-text>
        </n-card>
      </n-space>
    </div>

    <div v-if="!editing && !pickingPreset && settings.providers.value.length > 0" class="add-btn-row">
      <n-button dashed block @click="pickingPreset = true">
        {{ $t('settingsDialog.addProvider') }}
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NForm, NFormItem, NInput, NCheckbox, NCheckboxGroup,
  NSpin, NSpace, NCard, NText, NEmpty,
} from 'naive-ui'
import { useLLMSettings, PROVIDER_PRESETS, type ProviderConfig, type ProviderPreset } from '../../composables/useLLMSettings'

const { t } = useI18n()
const settings = useLLMSettings()

const editingId = ref<string | null>(null)
const editingGroupIds = ref<string[]>([])
const editing = ref(false)
const pickingPreset = ref(false)
const showApiUrl = ref(false)
const fetchingModels = ref(false)
const availableModels = ref<string[]>([])
const fetchError = ref('')
const selectedModelList = ref<string[]>([])

let fetchTimer: ReturnType<typeof setTimeout> | null = null

const form = reactive({
  name: '',
  apiUrl: '',
  apiKey: '',
})

interface ProviderGroup {
  ids: string[]
  name: string
  apiUrl: string
  apiKey: string
  models: string[]
}

const groupedProviders = computed<ProviderGroup[]>(() => {
  const map = new Map<string, ProviderGroup>()
  for (const p of settings.providers.value) {
    const key = `${p.name}::${p.apiUrl}::${p.apiKey}`
    const existing = map.get(key)
    if (existing) {
      existing.ids.push(p.id)
      existing.models.push(p.model)
    } else {
      map.set(key, { ids: [p.id], name: p.name, apiUrl: p.apiUrl, apiKey: p.apiKey, models: [p.model] })
    }
  }
  return [...map.values()]
})

function scheduleAutoFetch() {
  if (fetchTimer) clearTimeout(fetchTimer)
  if (!form.apiKey.trim() || !form.apiUrl.trim()) return
  fetchTimer = setTimeout(() => fetchModels(), 800)
}

watch(() => form.apiKey, () => scheduleAutoFetch())

function startEdit(group: ProviderGroup) {
  editingId.value = group.ids[0]
  editingGroupIds.value = [...group.ids]
  editing.value = true
  pickingPreset.value = false
  showApiUrl.value = false
  form.name = group.name
  form.apiUrl = group.apiUrl
  form.apiKey = group.apiKey
  availableModels.value = []
  fetchError.value = ''
  selectedModelList.value = [...group.models]
  scheduleAutoFetch()
}

function startAdd() {
  editingId.value = null
  editingGroupIds.value = []
  editing.value = true
  pickingPreset.value = false
  showApiUrl.value = false
  form.name = ''
  form.apiUrl = ''
  form.apiKey = ''
  availableModels.value = []
  fetchError.value = ''
  selectedModelList.value = []
}

function startAddWithPreset(preset: ProviderPreset) {
  editingId.value = null
  editingGroupIds.value = []
  editing.value = true
  pickingPreset.value = false
  showApiUrl.value = false
  form.name = preset.name
  form.apiUrl = preset.apiUrl
  form.apiKey = ''
  availableModels.value = []
  fetchError.value = ''
  selectedModelList.value = []
}

async function fetchModels() {
  fetchingModels.value = true
  availableModels.value = []
  fetchError.value = ''

  try {
    const apiUrl = form.apiUrl.trim()
    const apiKey = form.apiKey.trim()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const res = await fetch(`${apiUrl}/models`, { headers })
    if (res.ok) {
      const data = await res.json() as any
      const models = (data.data && Array.isArray(data.data))
        ? data.data.map((m: any) => m.id || m.name).filter(Boolean)
        : []
      availableModels.value = models
    }
    if (availableModels.value.length === 0) {
      fetchError.value = t('settingsDialog.noModels')
    }
  } catch (e: any) {
    fetchError.value = e.message || t('settingsDialog.fetchFailed')
  } finally {
    fetchingModels.value = false
  }
}

async function saveForm() {
  if (!form.name.trim() || !form.apiUrl.trim() || selectedModelList.value.length === 0) return

  const base = {
    name: form.name.trim(),
    apiUrl: form.apiUrl.trim(),
    apiKey: form.apiKey.trim(),
  }

  if (editingGroupIds.value.length > 0) {
    for (const id of editingGroupIds.value) {
      await settings.removeProvider(id)
    }
  }

  for (const model of selectedModelList.value) {
    await settings.addProvider({ ...base, model })
  }

  editing.value = false
  editingId.value = null
  editingGroupIds.value = []
}

function cancelEdit() {
  editing.value = false
  editingId.value = null
  editingGroupIds.value = []
  pickingPreset.value = false
  showApiUrl.value = false
  availableModels.value = []
  fetchError.value = ''
  selectedModelList.value = []
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null }
}

async function deleteGroup(group: ProviderGroup) {
  for (const id of group.ids) {
    await settings.removeProvider(id)
  }
  if (editingId.value && group.ids.includes(editingId.value)) {
    cancelEdit()
  }
}

function init() {
  settings.reload()
  editing.value = false
  editingId.value = null
  editingGroupIds.value = []
  pickingPreset.value = false
  showApiUrl.value = false
  availableModels.value = []
  fetchError.value = ''
  selectedModelList.value = []
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null }
}

defineExpose({ init })
</script>

<style scoped>
.empty-state {
  text-align: center;
  padding: 20px 0;
}
.empty-title {
  font-size: 14px;
  font-weight: 600;
}
.provider-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.provider-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.provider-item:hover, .provider-item.active {
  border-color: var(--accent-color);
}
.provider-name {
  font-weight: 500;
  min-width: 80px;
}
.provider-model {
  color: var(--text-secondary);
  font-size: 12px;
  flex: 1;
}
.provider-delete {
  opacity: 0.5;
}
.edit-form {
  margin-top: 12px;
}
.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}
.model-checklist {
  max-height: 180px;
  overflow-y: auto;
}
.fetch-error {
  font-size: 11px;
  color: #f44747;
}
.preset-picker {
  margin-top: 4px;
}
.preset-title {
  margin-bottom: 8px;
}
.custom-card {
  border-style: dashed;
}
.add-btn-row {
  margin-top: 12px;
}
</style>

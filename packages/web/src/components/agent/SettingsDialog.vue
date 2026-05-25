<template>
  <div v-if="visible" class="settings-overlay" @click.self="close">
    <div class="settings-dialog">
      <div class="dialog-header">
        <span class="dialog-title">{{ $t('settingsDialog.title') }}</span>
        <button class="dialog-close" @click="close">x</button>
      </div>

      <div class="dialog-body">
        <!-- 空状态：无提供商时引导添加 -->
        <div v-if="!editing && !pickingPreset && settings.providers.value.length === 0" class="empty-state">
          <div class="empty-icon">&#9881;</div>
          <div class="empty-title">{{ $t('settingsDialog.noProvider') }}</div>
          <div class="empty-desc">{{ $t('settingsDialog.noProviderDesc') }}</div>
          <button class="empty-cta" @click="startAddWithPreset(PROVIDER_PRESETS[0])">
            {{ $t('settingsDialog.addDeepSeek') }}
          </button>
          <button class="empty-secondary" @click="pickingPreset = true">
            {{ $t('settingsDialog.chooseOther') }}
          </button>
        </div>

        <!-- 提供商列表（合并同一提供商的多个模型为一条） -->
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
            <button
              class="provider-delete"
              @click.stop="deleteGroup(g)"
            >x</button>
          </div>
        </div>

        <!-- 编辑 / 新增表单 -->
        <div v-if="editing" class="edit-form">
          <div class="form-group">
            <label>{{ $t('settingsDialog.name') }}</label>
            <input v-model="form.name" class="form-input" :placeholder="$t('settingsDialog.namePlaceholder')" />
          </div>
          <div class="form-group">
            <label>{{ $t('settingsDialog.apiKey') }}</label>
            <input v-model="form.apiKey" class="form-input" type="password" :placeholder="$t('settingsDialog.apiKeyPlaceholder')" />
          </div>

          <!-- API 地址（默认隐藏） -->
          <div class="form-group api-url-group">
            <div class="label-row">
              <label>{{ $t('settingsDialog.apiUrl') }}</label>
              <button
                v-if="!showApiUrl"
                class="toggle-api-btn"
                :title="$t('settingsDialog.modifyApiUrl')"
                @click="showApiUrl = true"
              >&#8230;</button>
            </div>
            <input v-if="showApiUrl" v-model="form.apiUrl" class="form-input" :placeholder="$t('settingsDialog.apiUrlPlaceholder')" />
          </div>

          <!-- 模型选择 -->
          <div class="form-group">
            <label>{{ $t('settingsDialog.model') }}</label>
            <div v-if="fetchingModels" class="model-loading">{{ $t('settingsDialog.fetchingModels') }}</div>
            <div v-else-if="availableModels.length > 0" class="model-checklist">
              <label v-for="m in availableModels" :key="m" class="model-check-item" :class="{ checked: selectedModels.has(m) }">
                <input type="checkbox" :value="m" :checked="selectedModels.has(m)" @change="toggleModel(m)" />
                <span class="model-check-label">{{ m }}</span>
              </label>
            </div>
            <div v-else-if="fetchError" class="fetch-error">{{ fetchError }}</div>
            <div v-else-if="!form.apiKey.trim()" class="model-hint">{{ $t('settingsDialog.autoFetch') }}</div>
            <div v-else class="model-hint">
              <a class="fetch-link" @click="fetchModels">{{ $t('settingsDialog.clickFetch') }}</a>
            </div>
          </div>

          <div class="form-actions">
            <button class="form-btn save" @click="saveForm" :disabled="selectedModels.size === 0">{{ $t('settingsDialog.save') }}</button>
            <button class="form-btn cancel" @click="cancelEdit">{{ $t('settingsDialog.cancel') }}</button>
          </div>
        </div>

        <!-- 预制提供商选择（添加时先选类型） -->
        <div v-if="pickingPreset" class="preset-picker">
          <div class="preset-title">{{ $t('settingsDialog.selectProvider') }}</div>
          <div
            v-for="preset in PROVIDER_PRESETS"
            :key="preset.id"
            class="preset-card"
            @click="startAddWithPreset(preset)"
          >
            <span class="preset-name">{{ preset.name }}</span>
            <span class="preset-hint">{{ $t('settingsDialog.justApiKey') }}</span>
          </div>
          <div class="preset-card custom" @click="startAdd">
            <span class="preset-name">{{ $t('settingsDialog.custom') }}</span>
            <span class="preset-hint">{{ $t('settingsDialog.customHint') }}</span>
          </div>
        </div>

        <!-- 新增按钮 -->
        <div v-if="!editing && !pickingPreset && settings.providers.value.length > 0" class="add-btn-row">
          <button class="form-btn add" @click="pickingPreset = true">{{ $t('settingsDialog.addProvider') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useProviderSettings, fetchAvailableModels, PROVIDER_PRESETS, type ProviderConfig, type ProviderPreset } from '../../composables/useProviderSettings';

const { t } = useI18n();

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const settings = useProviderSettings();

// ===== 状态 =====
const editingId = ref<string | null>(null);
const editingGroupIds = ref<string[]>([]);           // 当前编辑组的全部条目 ID
const editing = ref(false);
const pickingPreset = ref(false);
const showApiUrl = ref(false);
const fetchingModels = ref(false);
const availableModels = ref<string[]>([]);
const fetchError = ref('');
const selectedModels = ref<Set<string>>(new Set());

let fetchTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  name: '',
  apiUrl: '',
  apiKey: '',
});

// ===== 将同一提供商的多个模型合并为一条展示 =====
interface ProviderGroup {
  ids: string[];
  name: string;
  apiUrl: string;
  apiKey: string;
  models: string[];
}

const groupedProviders = computed<ProviderGroup[]>(() => {
  const map = new Map<string, ProviderGroup>();
  for (const p of settings.providers.value) {
    const key = `${p.name}::${p.apiUrl}::${p.apiKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.ids.push(p.id);
      existing.models.push(p.model);
    } else {
      map.set(key, {
        ids: [p.id],
        name: p.name,
        apiUrl: p.apiUrl,
        apiKey: p.apiKey,
        models: [p.model],
      });
    }
  }
  return [...map.values()];
});

// ===== 自动获取模型 =====
function scheduleAutoFetch() {
  if (fetchTimer) clearTimeout(fetchTimer);
  if (!form.apiKey.trim() || !form.apiUrl.trim()) return;
  fetchTimer = setTimeout(() => fetchModels(), 800);
}

watch(() => form.apiKey, () => scheduleAutoFetch());

/** 编辑分组：预选该组全部模型 */
function startEdit(group: ProviderGroup) {
  editingId.value = group.ids[0];
  editingGroupIds.value = [...group.ids];
  editing.value = true;
  pickingPreset.value = false;
  showApiUrl.value = false;
  form.name = group.name;
  form.apiUrl = group.apiUrl;
  form.apiKey = group.apiKey;
  availableModels.value = [];
  fetchError.value = '';
  selectedModels.value = new Set(group.models);
  scheduleAutoFetch();
}

function startAdd() {
  editingId.value = null;
  editingGroupIds.value = [];
  editing.value = true;
  pickingPreset.value = false;
  showApiUrl.value = false;
  form.name = '';
  form.apiUrl = '';
  form.apiKey = '';
  availableModels.value = [];
  fetchError.value = '';
  selectedModels.value = new Set();
}

function startAddWithPreset(preset: ProviderPreset) {
  editingId.value = null;
  editingGroupIds.value = [];
  editing.value = true;
  pickingPreset.value = false;
  showApiUrl.value = false;
  form.name = preset.name;
  form.apiUrl = preset.apiUrl;
  form.apiKey = '';
  availableModels.value = [];
  fetchError.value = '';
  selectedModels.value = new Set();
}

function toggleModel(model: string) {
  const next = new Set(selectedModels.value);
  if (next.has(model)) {
    next.delete(model);
  } else {
    next.add(model);
  }
  selectedModels.value = next;
}

async function fetchModels() {
  fetchingModels.value = true;
  availableModels.value = [];
  fetchError.value = '';

  try {
    const models = await fetchAvailableModels(form.apiUrl.trim(), form.apiKey.trim());
    availableModels.value = models;
    if (models.length === 0) {
      fetchError.value = t('settingsDialog.noModels');
    }
  } catch (e: any) {
    fetchError.value = e.message || t('settingsDialog.fetchFailed');
  } finally {
    fetchingModels.value = false;
  }
}

/** 保存：先删除旧组全部条目，再按新模型列表重建 */
function saveForm() {
  if (!form.name.trim() || !form.apiUrl.trim() || selectedModels.value.size === 0) return;

  const models = [...selectedModels.value];
  const base = {
    name: form.name.trim(),
    apiUrl: form.apiUrl.trim(),
    apiKey: form.apiKey.trim(),
  };

  // 编辑模式：先移除该组所有旧条目
  if (editingGroupIds.value.length > 0) {
    for (const id of editingGroupIds.value) {
      settings.removeProvider(id);
    }
  }

  // 每个选中的模型生成一个独立条目
  for (const model of models) {
    settings.addProvider({ ...base, model });
  }

  editing.value = false;
  editingId.value = null;
  editingGroupIds.value = [];
}

function cancelEdit() {
  editing.value = false;
  editingId.value = null;
  editingGroupIds.value = [];
  pickingPreset.value = false;
  showApiUrl.value = false;
  availableModels.value = [];
  fetchError.value = '';
  selectedModels.value = new Set();
  if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
}

/** 删除整个分组 */
function deleteGroup(group: ProviderGroup) {
  for (const id of group.ids) {
    settings.removeProvider(id);
  }
  if (editingId.value && group.ids.includes(editingId.value)) {
    cancelEdit();
  }
}

function close() {
  emit('close');
}

// 每次打开对话框时重置
watch(() => props.visible, (v) => {
  if (v) {
    editing.value = false;
    editingId.value = null;
    editingGroupIds.value = [];
    pickingPreset.value = false;
    showApiUrl.value = false;
    availableModels.value = [];
    fetchError.value = '';
    selectedModels.value = new Set();
    if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
  }
});
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.settings-dialog {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  width: 440px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}
.dialog-title {
  font-size: 14px;
  font-weight: 600;
}
.dialog-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
}
.dialog-close:hover {
  color: var(--text-primary);
}
.dialog-body {
  padding: 16px;
  overflow-y: auto;
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
.provider-item:hover {
  border-color: var(--accent-color);
}
.provider-item.active {
  border-color: var(--accent-color);
  background: var(--bg-tertiary);
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
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  opacity: 0.5;
}
.provider-delete:hover {
  color: #f44747;
  opacity: 1;
}
.edit-form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 12px;
  color: var(--text-secondary);
}
.form-input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 8px;
  font-size: 13px;
  border-radius: 4px;
  font-family: inherit;
}
.form-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

/* ---- API 地址行 ---- */
.api-url-group .label-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.toggle-api-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.4;
}
.toggle-api-btn:hover {
  opacity: 0.8;
  color: var(--text-primary);
}

/* ---- 模型多选列表 ---- */
.model-loading {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 0;
}
.model-hint {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 0;
}
.fetch-link {
  color: var(--accent-color);
  cursor: pointer;
}
.fetch-link:hover {
  text-decoration: underline;
}
.model-checklist {
  max-height: 180px;
  overflow-y: auto;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.model-check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}
.model-check-item:last-child {
  border-bottom: none;
}
.model-check-item:hover {
  background: var(--bg-hover);
}
.model-check-item.checked {
  background: var(--bg-secondary);
}
.model-check-item input[type="checkbox"] {
  accent-color: var(--accent-color);
  cursor: pointer;
}
.model-check-label {
  color: var(--text-primary);
}
.fetch-error {
  font-size: 11px;
  color: #f44747;
  margin-top: 2px;
}
.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.form-btn {
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
}
.form-btn.save {
  background: var(--accent-color);
  color: #fff;
}
.form-btn.save:hover:not(:disabled) {
  background: var(--accent-hover);
}
.form-btn.save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.form-btn.cancel {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
.form-btn.cancel:hover {
  background: var(--bg-hover);
}
.form-btn.add {
  background: var(--bg-tertiary);
  color: var(--accent-color);
  border: 1px dashed var(--border-color);
  width: 100%;
  padding: 8px;
}
.form-btn.add:hover {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}
.add-btn-row {
  margin-top: 12px;
}
.preset-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.preset-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}
.preset-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.preset-card:hover {
  border-color: var(--accent-color);
}
.preset-card.custom {
  border-style: dashed;
}
.preset-name {
  font-weight: 500;
}
.preset-hint {
  color: var(--text-secondary);
  font-size: 11px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px;
}
.empty-icon {
  font-size: 36px;
  color: var(--text-secondary);
  opacity: 0.4;
  margin-bottom: 12px;
}
.empty-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.empty-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}
.empty-cta {
  background: var(--accent-color);
  color: #fff;
  border: none;
  padding: 8px 24px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 8px;
}
.empty-cta:hover {
  background: var(--accent-hover);
}
.empty-secondary {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 16px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.empty-secondary:hover {
  border-color: var(--accent-color);
  color: var(--text-primary);
}
</style>

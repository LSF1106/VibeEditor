<template>
  <div v-if="visible" class="settings-overlay" @click.self="close">
    <div class="settings-dialog">
      <div class="dialog-header">
        <span class="dialog-title">LLM 提供商设置</span>
        <button class="dialog-close" @click="close">x</button>
      </div>

      <div class="dialog-body">
        <!-- 提供商列表 -->
        <div class="provider-list">
          <div
            v-for="p in settings.providers.value"
            :key="p.id"
            class="provider-item"
            :class="{ active: p.id === editingId }"
            @click="startEdit(p)"
          >
            <span class="provider-name">{{ p.name }}</span>
            <span class="provider-model">{{ p.model }}</span>
            <button
              v-if="settings.providers.value.length > 1"
              class="provider-delete"
              @click.stop="deleteProvider(p.id)"
            >x</button>
          </div>
        </div>

        <!-- 编辑 / 新增表单 -->
        <div v-if="editing" class="edit-form">
          <div class="form-group">
            <label>名称</label>
            <input v-model="form.name" class="form-input" placeholder="例如: OpenAI, Ollama" />
          </div>
          <div class="form-group">
            <label>API 地址</label>
            <input v-model="form.apiUrl" class="form-input" placeholder="https://api.openai.com/v1" />
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input v-model="form.apiKey" class="form-input" type="password" placeholder="sk-..." />
          </div>
          <div class="form-group">
            <label>模型名称</label>
            <div class="model-row">
              <input v-model="form.model" class="form-input" placeholder="gpt-4o" />
              <button
                class="fetch-btn"
                :disabled="fetchingModels || !form.apiUrl.trim()"
                @click="fetchModels"
              >
                {{ fetchingModels ? '获取中...' : '获取模型' }}
              </button>
            </div>
            <!-- 获取到的模型列表下拉 -->
            <div v-if="availableModels.length > 0" class="model-dropdown">
              <div
                v-for="m in availableModels"
                :key="m"
                class="model-option"
                :class="{ selected: form.model === m }"
                @click="form.model = m"
              >
                {{ m }}
              </div>
            </div>
            <!-- 获取失败提示 -->
            <div v-if="fetchError" class="fetch-error">{{ fetchError }}</div>
          </div>
          <div class="form-actions">
            <button class="form-btn save" @click="saveForm">保存</button>
            <button class="form-btn cancel" @click="cancelEdit">取消</button>
          </div>
        </div>

        <!-- 新增按钮（仅在不编辑时显示） -->
        <div v-if="!editing" class="add-btn-row">
          <button class="form-btn add" @click="startAdd">+ 添加提供商</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useProviderSettings, fetchAvailableModels, type ProviderConfig } from '../../composables/useProviderSettings';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const settings = useProviderSettings();
const editingId = ref<string | null>(null);
const editing = ref(false);
const fetchingModels = ref(false);
const availableModels = ref<string[]>([]);
const fetchError = ref('');

const form = reactive({
  name: '',
  apiUrl: '',
  apiKey: '',
  model: '',
});

function startEdit(provider: ProviderConfig) {
  editingId.value = provider.id;
  editing.value = true;
  form.name = provider.name;
  form.apiUrl = provider.apiUrl;
  form.apiKey = provider.apiKey;
  form.model = provider.model;
  availableModels.value = [];
  fetchError.value = '';
}

function startAdd() {
  editingId.value = null;
  editing.value = true;
  form.name = '';
  form.apiUrl = '';
  form.apiKey = '';
  form.model = '';
  availableModels.value = [];
  fetchError.value = '';
}

async function fetchModels() {
  fetchingModels.value = true;
  availableModels.value = [];
  fetchError.value = '';

  try {
    const models = await fetchAvailableModels(form.apiUrl.trim(), form.apiKey.trim());
    availableModels.value = models;
    if (models.length === 0) {
      fetchError.value = '该地址未返回任何模型';
    }
  } catch (e: any) {
    fetchError.value = e.message || '获取模型列表失败';
  } finally {
    fetchingModels.value = false;
  }
}

function saveForm() {
  if (!form.name.trim() || !form.apiUrl.trim() || !form.model.trim()) return;

  if (editingId.value) {
    settings.updateProvider(editingId.value, {
      name: form.name.trim(),
      apiUrl: form.apiUrl.trim(),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
    });
  } else {
    settings.addProvider({
      name: form.name.trim(),
      apiUrl: form.apiUrl.trim(),
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
    });
  }

  editing.value = false;
  editingId.value = null;
}

function cancelEdit() {
  editing.value = false;
  editingId.value = null;
  availableModels.value = [];
  fetchError.value = '';
}

function deleteProvider(id: string) {
  settings.removeProvider(id);
  if (editingId.value === id) {
    cancelEdit();
  }
}

function close() {
  emit('close');
}
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
.model-row {
  display: flex;
  gap: 6px;
}
.model-row .form-input {
  flex: 1;
}
.fetch-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--accent-color);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}
.fetch-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}
.fetch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.model-dropdown {
  max-height: 140px;
  overflow-y: auto;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-top: 2px;
}
.model-option {
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary);
}
.model-option:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.model-option.selected {
  color: var(--accent-color);
  background: var(--bg-secondary);
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
.form-btn.save:hover {
  background: var(--accent-hover);
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
</style>

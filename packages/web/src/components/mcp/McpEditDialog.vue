<template>
  <div v-if="visible" class="dialog-backdrop" @click.self="handleCancel">
    <div class="dialog-panel">
      <div class="dialog-header">
        <span class="dialog-title">{{ isEdit ? $t('mcp.editServer') : $t('mcp.addServer') }}</span>
      </div>
      <div class="dialog-body">
        <!-- Name -->
        <div class="form-group">
          <label class="form-label">{{ $t('mcp.name') }} *</label>
          <input v-model="form.name" type="text" class="form-input" :placeholder="$t('mcp.name')" />
          <span v-if="errors.name" class="form-error">{{ errors.name }}</span>
        </div>

        <!-- Description -->
        <div class="form-group">
          <label class="form-label">{{ $t('mcp.description') }}</label>
          <input v-model="form.description" type="text" class="form-input" :placeholder="$t('mcp.description')" />
        </div>

        <!-- Type -->
        <div class="form-group">
          <label class="form-label">{{ $t('mcp.type') }} *</label>
          <div class="type-selector">
            <button
              v-for="opt in typeOptions"
              :key="opt.value"
              class="type-option"
              :class="{ active: form.type === opt.value }"
              @click="form.type = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
          <span v-if="errors.type" class="form-error">{{ errors.type }}</span>
        </div>

        <!-- STDIO fields -->
        <template v-if="form.type === 'stdio'">
          <div class="form-group">
            <label class="form-label">{{ $t('mcp.command') }} *</label>
            <input v-model="form.command" type="text" class="form-input" :placeholder="'npx'" />
            <span v-if="errors.command" class="form-error">{{ errors.command }}</span>
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('mcp.args') }}</label>
            <input v-model="form.args" type="text" class="form-input" :placeholder="'-y, @scope/server, --option'" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('mcp.env') }}</label>
            <textarea v-model="form.env" class="form-textarea" rows="2" :placeholder="'KEY1=value1\nKEY2=value2'" />
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('mcp.cwd') }}</label>
            <input v-model="form.cwd" type="text" class="form-input" :placeholder="'/path/to/project'" />
          </div>
        </template>

        <!-- HTTP / SSE fields -->
        <template v-if="form.type === 'http' || form.type === 'sse'">
          <div class="form-group">
            <label class="form-label">{{ $t('mcp.url') }} *</label>
            <input v-model="form.url" type="text" class="form-input" :placeholder="'http://localhost:3000/mcp'" />
            <span v-if="errors.url" class="form-error">{{ errors.url }}</span>
          </div>
          <div class="form-group">
            <label class="form-label">{{ $t('mcp.headers') }}</label>
            <textarea v-model="form.headers" class="form-textarea" rows="2" :placeholder="'Authorization=Bearer token\nX-Custom=value'" />
          </div>
          <div v-if="form.type === 'http'" class="form-group">
            <label class="form-label">{{ $t('mcp.sessionId') }}</label>
            <input v-model="form.sessionId" type="text" class="form-input" :placeholder="'session-id'" />
          </div>
        </template>

        <!-- Error / Result message -->
        <div v-if="resultMsg" class="result-msg" :class="{ success: resultSuccess, error: !resultSuccess }">
          {{ resultMsg }}
        </div>
      </div>
      <div class="dialog-footer">
        <button
          class="btn-save"
          :disabled="testing"
          @click="handleSave"
        >
          <span v-if="testing" class="spinner"></span>
          <span v-else>🔌</span>
          {{ testing ? $t('mcp.testing') : $t('mcp.testAndSave') }}
        </button>
        <button class="btn-cancel" @click="handleCancel" :disabled="testing">
          {{ $t('mcp.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { McpServerConfig, McpToolInfo } from '@vibeeditor/agent';
import type { McpServerUI } from '../../types/mcp-ui';
import { getMcpService } from '../../services/mcpService';

const { t } = useI18n();
const mcpService = getMcpService();

const props = defineProps<{
  visible: boolean;
  server: McpServerUI | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [id: string, config: McpServerConfig, name: string, description: string, tools: McpToolInfo[]];
}>();

const isEdit = computed(() => !!props.server);

const typeOptions = [
  { value: 'stdio', label: 'STDIO' },
  { value: 'http', label: 'HTTP Streamable' },
  { value: 'sse', label: 'SSE' },
] as const;

interface FormState {
  name: string;
  description: string;
  type: string;
  command: string;
  args: string;
  env: string;
  cwd: string;
  url: string;
  headers: string;
  sessionId: string;
}

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  type: 'stdio',
  command: '',
  args: '',
  env: '',
  cwd: '',
  url: '',
  headers: '',
  sessionId: '',
});

const form = reactive<FormState>(emptyForm());

const errors = reactive<Record<string, string>>({});
const testing = ref(false);
const resultMsg = ref('');
const resultSuccess = ref(false);

watch(() => props.visible, (v) => {
  if (v) {
    resultMsg.value = '';
    resultSuccess.value = false;
    Object.keys(errors).forEach(k => delete errors[k]);
    if (props.server) {
      const s = props.server;
      form.name = s.name;
      form.description = s.description || '';
      form.type = s.config.type;
      form.command = s.config.type === 'stdio' ? (s.config as any).command || '' : '';
      form.args = s.config.type === 'stdio' ? ((s.config as any).args || []).join(', ') : '';
      form.env = s.config.type === 'stdio' && (s.config as any).env ? objectToLines((s.config as any).env) : '';
      form.cwd = s.config.type === 'stdio' ? (s.config as any).cwd || '' : '';
      form.url = (s.config.type === 'http' || s.config.type === 'sse') ? (s.config as any).url || '' : '';
      form.headers = (s.config.type === 'http' || s.config.type === 'sse') && (s.config as any).headers ? objectToLines((s.config as any).headers) : '';
      form.sessionId = s.config.type === 'http' ? (s.config as any).sessionId || '' : '';
    } else {
      Object.assign(form, emptyForm());
    }
  }
});

function clearErrors() {
  Object.keys(errors).forEach(k => delete errors[k]);
}

function objectToLines(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n');
}

function parseKeyValue(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text.trim()) return result;
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const eqIdx = line.indexOf('=');
    const colonIdx = line.indexOf(':');
    const sepIdx = eqIdx >= 0 ? eqIdx : colonIdx;
    if (sepIdx >= 0) {
      const key = line.slice(0, sepIdx).trim();
      const value = line.slice(sepIdx + 1).trim();
      if (key) result[key] = value;
    }
  }
  return result;
}

function parseArgs(text: string): string[] {
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

function validate(): boolean {
  clearErrors();

  if (!form.name.trim()) {
    errors.name = 'Name is required';
  }

  if (!form.type || !typeOptions.some(o => o.value === form.type)) {
    errors.type = 'Invalid type';
  }

  if (form.type === 'stdio') {
    if (!form.command.trim()) {
      errors.command = 'Command is required';
    }
  }

  if (form.type === 'http' || form.type === 'sse') {
    if (!form.url.trim()) {
      errors.url = 'URL is required';
    } else if (!/^https?:\/\/.+/.test(form.url.trim())) {
      errors.url = 'URL must start with http:// or https://';
    }
  }

  return Object.keys(errors).length === 0;
}

function buildConfig(): McpServerConfig {
  if (form.type === 'stdio') {
    return {
      type: 'stdio',
      name: form.name.trim(),
      command: form.command.trim(),
      args: parseArgs(form.args),
      env: parseKeyValue(form.env),
      cwd: form.cwd.trim() || undefined,
    } as McpServerConfig;
  }
  if (form.type === 'sse') {
    return {
      type: 'sse',
      name: form.name.trim(),
      url: form.url.trim(),
      headers: parseKeyValue(form.headers),
    } as McpServerConfig;
  }
  return {
    type: 'http',
    name: form.name.trim(),
    url: form.url.trim(),
    headers: parseKeyValue(form.headers),
    sessionId: form.sessionId.trim() || undefined,
  } as McpServerConfig;
}

async function handleSave() {
  if (!validate()) return;

  testing.value = true;
  resultMsg.value = '';
  resultSuccess.value = false;

  try {
    const config = buildConfig();
    const name = form.name.trim();
    const description = form.description.trim();

    // 保存到服务端（新增或更新），获取 ID
    let serverId: string;
    if (isEdit.value && props.server) {
      await mcpService.updateServer(props.server.id, { config, name, description, enabled: props.server.enabled });
      serverId = props.server.id;
    } else {
      const entry = await mcpService.addServer({ config, name, description, enabled: true });
      serverId = entry.id;
    }

    // 测试连通性
    const result = await mcpService.testServer(serverId);

    if (result.success && result.tools) {
      resultMsg.value = t('mcp.testSuccess', { n: result.tools.length });
      resultSuccess.value = true;
      setTimeout(() => {
        emit('saved', serverId, config, name, description, result.tools!);
      }, 600);
    } else {
      resultMsg.value = `${t('mcp.testFailed')}: ${result.error || 'Unknown error'}`;
      resultSuccess.value = false;
    }
  } catch (err) {
    resultMsg.value = `${t('mcp.testFailed')}: ${err instanceof Error ? err.message : String(err)}`;
    resultSuccess.value = false;
  } finally {
    testing.value = false;
  }
}

function handleCancel() {
  if (testing.value) return;
  emit('close');
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.dialog-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
.dialog-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.dialog-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.dialog-body {
  padding: 14px 16px;
  overflow-y: auto;
  flex: 1;
}
.dialog-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.form-group {
  margin-bottom: 10px;
}
.form-label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.form-input {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  outline: none;
  box-sizing: border-box;
}
.form-input:focus {
  border-color: var(--accent-color);
}
.form-textarea {
  width: 100%;
  padding: 6px 8px;
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  outline: none;
  resize: vertical;
  box-sizing: border-box;
}
.form-textarea:focus {
  border-color: var(--accent-color);
}
.form-error {
  display: block;
  font-size: 10px;
  color: #f44336;
  margin-top: 3px;
}
.type-selector {
  display: flex;
  gap: 4px;
}
.type-option {
  flex: 1;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.type-option:hover {
  color: var(--text-primary);
}
.type-option.active {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}
.result-msg {
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 6px;
}
.result-msg.success {
  background: rgba(76, 175, 80, 0.1);
  color: #4caf50;
}
.result-msg.error {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}
.btn-save {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 500;
  background: var(--accent-color);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-save:hover:not(:disabled) {
  background: var(--accent-hover);
}
.btn-save:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.btn-cancel {
  padding: 7px 14px;
  font-size: 12px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s;
}
.btn-cancel:hover:not(:disabled) {
  color: var(--text-primary);
}
.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Spinner */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

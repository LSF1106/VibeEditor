<template>
  <div class="agent-panel">
    <!-- 提供商选择 + 设置按钮 -->
    <div class="agent-header">
      <div class="header-left">
        <select
          class="provider-select"
          :value="providerSettings.activeId.value"
          @change="providerSettings.setActive(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="p in providerSettings.providers.value"
            :key="p.id"
            :value="p.id"
          >
            {{ p.name }} ({{ p.model }})
          </option>
        </select>
        <button class="settings-btn" title="提供商设置" @click="showSettings = true">&#9881;</button>
      </div>
      <div class="agent-mode-selector">
        <button
          v-for="mode in modes"
          :key="mode"
          class="mode-btn"
          :class="{ active: agent.config.value.mode === mode }"
          @click="agent.setMode(mode)"
        >
          {{ mode }}
        </button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="agent-messages" ref="messagesContainer">
      <div v-if="agent.messages.value.length === 0" class="agent-empty">
        Ask the agent to help with editing
      </div>
      <div
        v-for="msg in agent.messages.value"
        :key="msg.id"
        class="agent-message"
        :class="'msg-' + msg.role"
      >
        <div class="msg-role">{{ msg.role }}</div>
        <div class="msg-content" v-html="renderMarkdown(msg.content)"></div>
        <!-- 编辑操作结果提示 -->
        <div v-if="msg.editOperations && msg.editOperations.length > 0" class="edit-summary">
          {{ msg.editOperations.length }} 个文件已修改：
          <span v-for="e in msg.editOperations" :key="e.path" class="edit-file">{{ e.path }}</span>
          <button class="undo-btn" @click="emit('undo-edits')">Undo</button>
        </div>
      </div>
      <div v-if="agent.isProcessing.value" class="agent-loading">
        <template v-if="agent.toolStatus.value">{{ agent.toolStatus.value }}</template>
        <template v-else>Thinking...</template>
      </div>
    </div>

    <!-- 输入区域拖拽手柄 -->
    <div class="input-resize-handle" @mousedown="startInputResize"></div>

    <!-- 输入区域 -->
    <div class="agent-input-area" :style="{ height: inputHeight + 'px' }">
      <textarea
        v-model="input"
        class="agent-input"
        placeholder="Ask the agent..."
        rows="2"
        @keydown.enter.exact.prevent="send"
        @keydown.ctrl.enter.prevent="send"
        @keydown.meta.enter.prevent="send"
      ></textarea>
      <button class="agent-send-btn" @click="send" :disabled="!input.trim() || agent.isProcessing.value">
        Send
      </button>
    </div>

    <!-- 设置对话框 -->
    <SettingsDialog :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useAgent } from '../../composables/useAgent';
import { useProviderSettings } from '../../composables/useProviderSettings';
import { useEditorStore } from '../../stores/editor';
import { renderMarkdown } from '../../services/markdown';
import type { FileServiceClient } from '../../services/fileService';
import type { ParsedEdit } from '../../services/editParser';
import SettingsDialog from './SettingsDialog.vue';

const props = defineProps<{
  fileClient?: FileServiceClient | null;
}>();

const emit = defineEmits<{
  'apply-edits': [edits: ParsedEdit[]]
  'undo-edits': []
}>();

const agent = useAgent();
const providerSettings = useProviderSettings();
const editorStore = useEditorStore();
const input = ref('');
const messagesContainer = ref<HTMLElement>();
const modes = ['build', 'plan'] as const;
const showSettings = ref(false);
const inputHeight = ref(90);
let isResizingInput = false;

// ===== 自动滚动控制 =====
const userScrolledUp = ref(false);  // 用户是否手动上滚了
let scrollRafId = 0;
let observer: MutationObserver | null = null;

/** 判断消息区域是否接近底部（50px 容差） */
function isNearBottom(): boolean {
  const el = messagesContainer.value;
  if (!el) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 50;
}

function scrollToBottom() {
  const el = messagesContainer.value;
  if (el) el.scrollTop = el.scrollHeight;
}

/** 用 rAF 节流调度滚动，避免高频 MutationObserver 回调导致卡顿 */
function scheduleScroll(force = false) {
  cancelAnimationFrame(scrollRafId);
  scrollRafId = requestAnimationFrame(() => {
    if (force || !userScrolledUp.value) {
      scrollToBottom();
    }
  });
}

/** 用户手动上滚时暂停自动滚动，滑回底部时恢复自动滚动 */
function onMessagesScroll() {
  userScrolledUp.value = !isNearBottom();
}

/**
 * MutationObserver 监听消息区域 DOM 变化
 * 当流式内容、公式渲染等导致内容增加且用户在底部时，自动滚动
 */
function setupObserver() {
  const el = messagesContainer.value;
  if (!el) return;
  observer = new MutationObserver(() => {
    scheduleScroll(false);
  });
  observer.observe(el, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

/** 发送消息 */
async function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  userScrolledUp.value = false;

  const activeFilePath = editorStore.activeTab?.path;

  const streamPromise = agent.streamMessage(
    text,
    providerSettings.activeProvider.value,
    () => scheduleScroll(false),
    activeFilePath,
    props.fileClient
  );

  // 等待 Vue 渲染用户消息后立即滚动
  await nextTick();
  scrollToBottom();

  await streamPromise;

  // 流式完成后，若有编辑结果则通知父组件应用
  if (agent.lastEdits.value.length > 0) {
    emit('apply-edits', [...agent.lastEdits.value]);
    agent.lastEdits.value = [];
  }

  scheduleScroll(true);
}

/** 输入区域高度拖拽（纵向 resize） */
function startInputResize(e: MouseEvent) {
  isResizingInput = true;
  const startY = e.clientY;
  const startHeight = inputHeight.value;

  const onMove = (ev: MouseEvent) => {
    if (!isResizingInput) return;
    inputHeight.value = Math.max(60, Math.min(320, startHeight - (ev.clientY - startY)));
  };

  const onUp = () => {
    isResizingInput = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

onMounted(() => {
  messagesContainer.value?.addEventListener('scroll', onMessagesScroll);
  setupObserver();
});

onUnmounted(() => {
  cancelAnimationFrame(scrollRafId);
  observer?.disconnect();
  messagesContainer.value?.removeEventListener('scroll', onMessagesScroll);
});
</script>

<style scoped>
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}
.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color);
  gap: 8px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.provider-select {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 3px 6px;
  font-size: 11px;
  border-radius: 3px;
  cursor: pointer;
  max-width: 160px;
  font-family: inherit;
}
.provider-select:focus {
  outline: none;
  border-color: var(--accent-color);
}
.settings-btn {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;
}
.settings-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent-color);
}
.agent-mode-selector {
  display: flex;
  gap: 2px;
}
.mode-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
}
.mode-btn.active {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}
.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.agent-empty {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}
.agent-message {
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.msg-user {
  background: var(--bg-tertiary);
}
.msg-assistant {
  background: #1a3a5c;
}
.msg-system {
  background: #5c1a1a;
}
.msg-role {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.msg-content {
  line-height: 1.5;
}
.msg-content :deep(p) {
  margin: 4px 0;
}
.msg-content :deep(h1) {
  font-size: 16px;
  font-weight: 600;
  margin: 8px 0 4px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 4px;
}
.msg-content :deep(h2) {
  font-size: 14px;
  font-weight: 600;
  margin: 8px 0 4px;
}
.msg-content :deep(h3) {
  font-size: 13px;
  font-weight: 600;
  margin: 6px 0 2px;
}
.msg-content :deep(pre) {
  background: #0d1117;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px 10px;
  margin: 6px 0;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.4;
}
.msg-content :deep(code) {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
}
.msg-content :deep(:not(pre) > code) {
  background: var(--bg-tertiary);
  padding: 1px 4px;
  border-radius: 3px;
  color: #e06c75;
}
.msg-content :deep(strong) {
  font-weight: 600;
  color: #fff;
}
.msg-content :deep(em) {
  font-style: italic;
}
.msg-content :deep(ul),
.msg-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}
.msg-content :deep(li) {
  margin: 2px 0;
}
.msg-content :deep(a) {
  color: var(--accent-color);
  text-decoration: none;
}
.msg-content :deep(a:hover) {
  text-decoration: underline;
}
.msg-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color);
  margin: 6px 0;
  padding: 4px 10px;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.03);
}
.msg-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 8px 0;
}
.edit-summary {
  margin-top: 8px;
  padding: 6px 8px;
  background: rgba(0, 200, 100, 0.1);
  border: 1px solid rgba(0, 200, 100, 0.3);
  border-radius: 4px;
  font-size: 11px;
  color: #4ec9b0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.edit-file {
  background: rgba(0, 200, 100, 0.15);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
}
.undo-btn {
  margin-left: auto;
  background: rgba(255, 200, 50, 0.15);
  border: 1px solid rgba(255, 200, 50, 0.3);
  color: #d4a017;
  padding: 2px 8px;
  font-size: 10px;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
}
.undo-btn:hover {
  background: rgba(255, 200, 50, 0.25);
}
.agent-loading {
  color: var(--accent-color);
  font-size: 12px;
  padding: 4px 8px;
}
.agent-input-area {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  overflow: hidden;
}
.input-resize-handle {
  height: 3px;
  cursor: row-resize;
  background: var(--border-color);
  flex-shrink: 0;
  transition: background 0.15s;
}
.input-resize-handle:hover {
  background: var(--accent-color);
}
.agent-input {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 8px;
  font-size: 13px;
  resize: none;
  border-radius: 4px;
  font-family: inherit;
}
.agent-input:focus {
  outline: none;
  border-color: var(--accent-color);
}
.agent-send-btn {
  background: var(--accent-color);
  border: none;
  color: #fff;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  align-self: flex-end;
}
.agent-send-btn:hover {
  background: var(--accent-hover);
}
.agent-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

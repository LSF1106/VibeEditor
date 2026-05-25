<template>
  <div class="markdown-viewer">
    <div class="viewer-toolbar">
      <button :class="{ active: mode === 'code' }" @click="mode = 'code'">Code</button>
      <button :class="{ active: mode === 'preview' }" @click="mode = 'preview'">Preview</button>
      <button :class="{ active: mode === 'split' }" @click="mode = 'split'">Split</button>
    </div>
    <div class="viewer-content" :class="'mode-' + mode">
      <div v-show="mode === 'code' || mode === 'split'" class="editor-pane" ref="editorPaneRef"></div>
      <div v-if="mode === 'split'" class="split-divider"></div>
      <div
        v-show="mode === 'preview' || mode === 'split'"
        class="preview-pane markdown-body"
        v-html="renderedHtml"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as monaco from 'monaco-editor';
import { setEditorInstance, clearEditorInstance } from '../../services/editorInstance';
import { renderMarkdown } from '../../services/markdown';

const props = defineProps<{
  content: string;
  language: string;
}>();

const emit = defineEmits<{
  'content-change': [content: string];
}>();

type MarkdownMode = 'code' | 'preview' | 'split';
const mode = ref<MarkdownMode>('split');

const editorPaneRef = ref<HTMLElement>();
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

const renderedHtml = computed(() => renderMarkdown(props.content));

onMounted(() => {
  if (!editorPaneRef.value) return;

  editor = monaco.editor.create(editorPaneRef.value, {
    value: props.content,
    language: 'markdown',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 2,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    smoothScrolling: true,
  });

  editor.onDidChangeModelContent(() => {
    const val = editor!.getValue();
    emit('content-change', val);
  });

  setEditorInstance(editor);
});

watch(() => props.content, (val) => {
  if (editor && val !== editor.getValue()) {
    editor.setValue(val);
  }
});

watch(() => props.language, (lang) => {
  if (editor) {
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang);
  }
});

watch(mode, (newMode) => {
  if (newMode === 'split' || newMode === 'code') {
    nextTick(() => {
      if (editor) editor.layout();
    });
  }
});

onBeforeUnmount(() => {
  clearEditorInstance();
  if (editor) {
    editor.dispose();
    editor = null;
  }
});
</script>

<style scoped>
.markdown-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.viewer-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: var(--bg-tertiary, #252526);
  border-bottom: 1px solid var(--border-color, #3c3c3c);
  flex-shrink: 0;
}

.viewer-toolbar button {
  padding: 4px 12px;
  font-size: 12px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-radius: 3px;
}

.viewer-toolbar button:hover {
  color: var(--text-primary, #ccc);
  background: var(--bg-hover, #3e3e3e);
}

.viewer-toolbar button.active {
  color: var(--text-primary, #ccc);
  background: var(--bg-secondary, #2d2d2d);
  border-color: var(--border-color, #3c3c3c);
}

.viewer-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.viewer-content.mode-code .editor-pane,
.viewer-content.mode-preview .preview-pane {
  flex: 1;
}

.viewer-content.mode-split .editor-pane,
.viewer-content.mode-split .preview-pane {
  flex: 1;
}

.editor-pane {
  min-width: 0;
}

.split-divider {
  width: 4px;
  background: var(--border-color, #3c3c3c);
  cursor: col-resize;
  flex-shrink: 0;
}

.split-divider:hover {
  background: var(--accent-color, #007acc);
}

.preview-pane {
  background: var(--bg-primary, #1e1e1e);
  overflow-y: auto;
  padding: 16px 24px;
}

.markdown-body {
  color: var(--text-primary, #ccc);
  line-height: 1.7;
  font-size: 14px;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--text-primary, #ccc);
  margin-top: 24px;
  margin-bottom: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color, #3c3c3c);
  padding-bottom: 6px;
}

.markdown-body :deep(h1) { font-size: 24px; }
.markdown-body :deep(h2) { font-size: 20px; }
.markdown-body :deep(h3) { font-size: 16px; }

.markdown-body :deep(p) {
  margin-bottom: 12px;
}

.markdown-body :deep(pre) {
  background: var(--bg-secondary, #2d2d2d);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 4px;
  padding: 12px 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
}

.markdown-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}

.markdown-body :deep(p > code) {
  background: var(--bg-secondary, #2d2d2d);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent-color, #007acc);
  padding: 4px 16px;
  margin: 12px 0;
  color: var(--text-secondary, #969696);
  background: var(--bg-secondary, #2d2d2d);
  border-radius: 0 4px 4px 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 24px;
  margin-bottom: 12px;
}

.markdown-body :deep(li) {
  margin-bottom: 4px;
}

.markdown-body :deep(a) {
  color: var(--accent-color, #007acc);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color, #3c3c3c);
  margin: 20px 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-color, #3c3c3c);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--bg-secondary, #2d2d2d);
  font-weight: 600;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}

.markdown-body :deep(.katex) {
  font-size: 1.1em;
}

.markdown-body :deep(.katex-display) {
  margin: 16px 0;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>

<template>
  <div ref="editorContainer" class="monaco-editor-wrapper"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as monaco from 'monaco-editor';
import { setEditorInstance, clearEditorInstance } from '../../services/editorInstance';

const props = defineProps<{
  content: string;
  language: string;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  'content-change': [content: string];
  'editor-ready': [editor: monaco.editor.IStandaloneCodeEditor];
}>();

const editorContainer = ref<HTMLElement>();
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

onMounted(() => {
  if (!editorContainer.value) return;

  // 创建 Monaco 编辑器实例，配置 VS Code 暗色主题风格
  editor = monaco.editor.create(editorContainer.value, {
    value: props.content,
    language: props.language,
    readOnly: props.readOnly ?? false,
    theme: 'vs-dark',
    automaticLayout: true,               // 自动响应容器大小变化
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    tabSize: 2,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
  });

  // 内容变更时通知父组件
  editor.onDidChangeModelContent(() => {
    emit('content-change', editor!.getValue());
  });

  // 注册到编辑器单例，供其他组件访问
  setEditorInstance(editor);
  emit('editor-ready', editor);
});

// 语言切换：动态更新 Monaco 模型的语言模式
watch(() => props.language, (lang) => {
  if (editor) {
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang);
  }
});

// 外部内容变更：同步到编辑器（仅在值不同时，避免循环更新）
watch(() => props.content, (val) => {
  if (editor && val !== editor.getValue()) {
    editor.setValue(val);
  }
});

onBeforeUnmount(() => {
  clearEditorInstance();
});
</script>

<style scoped>
.monaco-editor-wrapper {
  width: 100%;
  height: 100%;
}
</style>

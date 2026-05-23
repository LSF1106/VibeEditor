<template>
  <div class="docx-viewer">
    <div v-if="isLegacyDoc" class="docx-unsupported">
      <p class="docx-unsupported-title">Unsupported format</p>
      <p class="docx-unsupported-hint">
        {{ fileName }} is a legacy Word (.doc) file and cannot be previewed.
        Only .docx files are supported.
      </p>
    </div>
    <div v-else-if="!content" class="docx-empty">
      <p>Unable to preview this file.</p>
    </div>
    <div v-else ref="containerRef" class="docx-container" />
    <div v-if="error" class="docx-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { renderAsync } from 'docx-preview';

const props = defineProps<{
  content: string;
  fileName: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
const error = ref('');
const isLegacyDoc = computed(() => props.fileName.toLowerCase().endsWith('.doc'));

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function renderDocument() {
  if (!containerRef.value || !props.content) return;
  error.value = '';
  try {
    const buffer = base64ToArrayBuffer(props.content);
    await renderAsync(buffer, containerRef.value, undefined, {
      className: 'docx-page',
      inWrapper: true,
      breakPages: false,
      ignoreWidth: false,
      ignoreHeight: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
    });
  } catch (e: any) {
    error.value = e.message || 'Failed to render document';
  }
}

onMounted(() => renderDocument());
watch(() => props.content, () => renderDocument());
</script>

<style scoped>
.docx-viewer {
  height: 100%;
  overflow-y: auto;
  background: #f0f0f0;
}

.docx-container {
  min-height: 100%;
}

.docx-container :deep(.docx-page-wrapper) {
  margin: 20px auto;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.docx-container :deep(.docx-page) {
  min-height: 100%;
}

.docx-unsupported,
.docx-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--editor-bg, #1e1e1e);
  color: #888;
}

.docx-unsupported-title {
  font-size: 1.2em;
  font-weight: 600;
  margin-bottom: 8px;
  color: #aaa;
}

.docx-unsupported-hint {
  font-size: 0.9em;
  max-width: 400px;
  text-align: center;
  line-height: 1.5;
}

.docx-error {
  padding: 16px;
  color: #e74c3c;
  background: #fdf0ef;
  border-top: 1px solid #f5c6cb;
  font-size: 0.85em;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}
</style>

<template>
  <div class="pdf-viewer">
    <div v-if="!content" class="pdf-empty">
      <p>{{ $t('viewer.unableToPreview') }}</p>
    </div>
    <iframe
      v-else-if="pdfUrl"
      :src="pdfUrl"
      class="pdf-iframe"
      width="100%"
      height="100%"
    />
    <div v-if="error" class="pdf-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  content: string;
  fileName: string;
}>();

const pdfUrl = ref('');
const error = ref('');

let currentBlobUrl: string | null = null;

function getAssetUrl(path: string): string {
  const baseUrl = import.meta.env.BASE_URL || './';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(`${normalizedBase}${path}`, window.location.href).href;
}

function base64ToBlob(b64: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/pdf' });
}

function revokeCurrentBlob() {
  if (!currentBlobUrl) return;
  URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = null;
}

function loadPdf() {
  revokeCurrentBlob();

  if (!props.content) {
    pdfUrl.value = '';
    return;
  }

  error.value = '';
  try {
    const blob = base64ToBlob(props.content);
    currentBlobUrl = URL.createObjectURL(blob);
    pdfUrl.value = `${getAssetUrl('pdfjs2/web/viewer.html')}?file=${encodeURIComponent(currentBlobUrl)}`;
  } catch (e: any) {
    pdfUrl.value = '';
    error.value = e?.message || t('viewer.failedToLoadPdf');
  }
}

onMounted(() => loadPdf());
watch(() => props.content, () => loadPdf());
onBeforeUnmount(() => revokeCurrentBlob());
</script>

<style scoped>
.pdf-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #525659;
  overflow: hidden;
}

.pdf-iframe {
  border: none;
}

.pdf-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--editor-bg, #1e1e1e);
  color: var(--text-secondary, #888);
}

.pdf-error {
  padding: 16px;
  color: #e74c3c;
  background: #fdf0ef;
  border-top: 1px solid #f5c6cb;
  font-size: 0.85em;
  flex-shrink: 0;
}
</style>

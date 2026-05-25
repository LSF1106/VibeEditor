<template>
  <div class="docx-viewer">
    <div v-if="isLegacyDoc" class="docx-unsupported">
      <p class="docx-unsupported-title">{{ $t('viewer.unsupportedFormat') }}</p>
      <p class="docx-unsupported-hint">
        {{ fileName }}{{ $t('viewer.legacyDoc') }}
        {{ $t('viewer.onlyDocx') }}
      </p>
    </div>
    <div v-else-if="!content" class="docx-empty">
      <p>{{ $t('viewer.unableToPreview') }}</p>
    </div>
    <template v-else>
      <div class="docx-toolbar">
        <div class="toolbar-group">
          <button class="toolbar-btn" :title="$t('viewer.zoomOut')" :disabled="zoom <= minZoom" @click="zoomOut">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="toolbar-btn zoom-display" :title="$t('viewer.reset')" @click="resetZoom">{{ zoom }}%</button>
          <button class="toolbar-btn" :title="$t('viewer.zoomIn')" :disabled="zoom >= maxZoom" @click="zoomIn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="toolbar-group">
          <button class="toolbar-btn" :title="$t('viewer.fitToWidth')" @click="fitToWidth">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4v8M14 4v8M2 6h12M2 10h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div ref="scrollContainer" class="docx-scroll-container">
        <div class="docx-scaled" :style="scaledStyle">
          <div ref="containerRef" class="docx-container" />
        </div>
      </div>
    </template>
    <div v-if="error" class="docx-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { renderAsync } from 'docx-preview';

const { t } = useI18n();

const props = defineProps<{
  content: string;
  fileName: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);
const error = ref('');
const zoom = ref(100);
const minZoom = 25;
const maxZoom = 300;
const zoomStep = 10;
const isLegacyDoc = computed(() => props.fileName.toLowerCase().endsWith('.doc'));

const scalePercent = computed(() => zoom.value / 100);
const scaledStyle = computed(() => ({
  transform: `scale(${scalePercent.value})`,
  transformOrigin: '0 0',
  width: `${100 / scalePercent.value}%`,
}));

function zoomIn() { zoom.value = Math.min(zoom.value + zoomStep, maxZoom); }
function zoomOut() { zoom.value = Math.max(zoom.value - zoomStep, minZoom); }
function resetZoom() { zoom.value = 100; }

function fitToWidth() {
  if (!scrollContainer.value || !containerRef.value) return;
  const containerWidth = scrollContainer.value.clientWidth;
  const contentWidth = containerRef.value.scrollWidth;
  if (contentWidth > 0) {
    zoom.value = Math.max(minZoom, Math.min(Math.round((containerWidth / contentWidth) * 100), maxZoom));
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function renderDocument() {
  if (!containerRef.value || !props.content) return;
  error.value = '';
  try {
    const buffer = base64ToArrayBuffer(props.content);
    await renderAsync(buffer, containerRef.value, undefined, {
      className: 'docx',
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
    error.value = e.message || t('viewer.failedToRenderDoc');
  }
}

onMounted(() => renderDocument());
watch(() => props.content, () => {
  zoom.value = 100;
  nextTick(() => renderDocument());
});
</script>

<style scoped>
.docx-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #323639;
}

.docx-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 8px;
  background: #323639;
  border-bottom: 1px solid #404346;
  flex-shrink: 0;
  user-select: none;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 4px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: #bbb;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.toolbar-btn:hover:not(:disabled) { background: #4e5255; color: #eee; }
.toolbar-btn:active:not(:disabled) { background: #5a5e62; }
.toolbar-btn:disabled { opacity: 0.35; cursor: default; }
.toolbar-btn.zoom-display { min-width: 48px; font-variant-numeric: tabular-nums; }

.docx-scroll-container {
  flex: 1;
  overflow: auto;
  background: #525659;
}

.docx-scaled { min-height: 100%; }
.docx-container { min-height: 100%; }

.docx-container :deep(.docx-wrapper) {
  padding: 20px 0;
}

.docx-container :deep(section.docx) {
  margin: 10px auto 30px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
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
  flex-shrink: 0;
}
</style>

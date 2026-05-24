<template>
  <div class="pdf-viewer">
    <div v-if="!content" class="pdf-empty">
      <p>Unable to preview this file.</p>
    </div>
    <template v-else>
      <div class="pdf-toolbar">
        <button :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">Prev</button>
        <span class="pdf-page-info">
          <input
            type="number"
            :value="currentPage"
            :min="1"
            :max="totalPages"
            class="pdf-page-input"
            @change="onPageInput"
          />
          / {{ totalPages }}
        </span>
        <button :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">Next</button>
      </div>
      <div class="pdf-canvas-wrapper">
        <canvas ref="canvasRef" class="pdf-canvas" />
      </div>
    </template>
    <div v-if="error" class="pdf-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

let cMapUrl = new URL('pdfjs-dist/cmaps/', import.meta.url).toString();
if (!cMapUrl.endsWith('/')) cMapUrl += '/';

const props = defineProps<{
  content: string;
  fileName: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const error = ref('');
const currentPage = ref(1);
const totalPages = ref(0);

let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function renderPage(pageNum: number) {
  if (!pdfDoc || !canvasRef.value) return;
  const page = await pdfDoc.getPage(pageNum);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;

  const canvas = canvasRef.value;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = Math.floor(viewport.width) + 'px';
  canvas.style.height = Math.floor(viewport.height) + 'px';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const transform =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
  await page.render({ canvasContext: ctx, viewport, transform }).promise;
}

async function loadPdf() {
  if (!props.content) {
    pdfDoc = null;
    totalPages.value = 0;
    return;
  }
  error.value = '';
  try {
    const buffer = base64ToArrayBuffer(props.content);
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      cMapUrl,
      cMapPacked: true,
    });
    pdfDoc = await loadingTask.promise;
    totalPages.value = pdfDoc.numPages;
    currentPage.value = 1;
    await nextTick();
    await renderPage(1);
  } catch (e: any) {
    error.value = e.message || 'Failed to render PDF';
  }
}

function goToPage(pageNum: number) {
  if (pageNum < 1 || pageNum > totalPages.value) return;
  currentPage.value = pageNum;
  renderPage(pageNum);
}

function onPageInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = parseInt(target.value, 10);
  if (!isNaN(val)) goToPage(val);
}

onMounted(() => loadPdf());
watch(() => props.content, () => loadPdf());
</script>

<style scoped>
.pdf-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #525659;
  overflow: hidden;
}

.pdf-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--editor-bg, #1e1e1e);
  color: #888;
}

.pdf-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  background: #323639;
  color: #ddd;
  flex-shrink: 0;
}

.pdf-toolbar button {
  padding: 4px 12px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #474b4f;
  color: #ddd;
  cursor: pointer;
  font-size: 13px;
}

.pdf-toolbar button:hover:not(:disabled) {
  background: #5a5f63;
}

.pdf-toolbar button:disabled {
  opacity: 0.4;
  cursor: default;
}

.pdf-page-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.pdf-page-input {
  width: 48px;
  padding: 2px 6px;
  border: 1px solid #555;
  border-radius: 3px;
  background: #1e1e1e;
  color: #ddd;
  text-align: center;
  font-size: 13px;
}

.pdf-canvas-wrapper {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 16px;
}

.pdf-canvas {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
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

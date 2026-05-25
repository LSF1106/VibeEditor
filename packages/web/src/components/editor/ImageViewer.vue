<template>
  <div class="image-viewer" @wheel="handleWheel" @mousedown="handleMouseDown" @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp">
    <div class="image-toolbar">
      <button @click="zoomIn" :title="$t('viewer.zoomIn')">+</button>
      <span class="zoom-level">{{ Math.round(scale * 100) }}%</span>
      <button @click="zoomOut" :title="$t('viewer.zoomOut')">-</button>
      <button @click="resetZoom" :title="$t('viewer.reset')">1:1</button>
      <button @click="fitToScreen" :title="$t('viewer.fitToScreen')">Fit</button>
      <span class="image-info">{{ imageInfo }}</span>
    </div>
    <div class="image-canvas" ref="canvasRef">
      <img
        :src="src"
        :style="imageStyle"
        draggable="false"
        @load="onImageLoad"
        @error="onImageError"
      />
    </div>
    <div v-if="error" class="image-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  src: string;
  filename?: string;
}>();

const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
const panStart = reactive({ x: 0, y: 0 });
const imageSize = reactive({ width: 0, height: 0 });
const naturalSize = reactive({ width: 0, height: 0 });
const canvasRef = ref<HTMLElement>();
const error = ref('');

const imageStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${scale.value})`,
  cursor: isPanning.value ? 'grabbing' : 'grab',
}));

const imageInfo = computed(() => {
  if (!naturalSize.width) return '';
  return `${naturalSize.width} x ${naturalSize.height} px`;
});

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  naturalSize.width = img.naturalWidth;
  naturalSize.height = img.naturalHeight;
  imageSize.width = img.width;
  imageSize.height = img.height;
  fitToScreen();
}

function onImageError() {
  error.value = t('viewer.failedToLoadImage');
}

function zoomIn() {
  scale.value = Math.min(scale.value * 1.25, 20);
}

function zoomOut() {
  scale.value = Math.max(scale.value / 1.25, 0.05);
}

function resetZoom() {
  scale.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function fitToScreen() {
  scale.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale.value = Math.max(0.05, Math.min(20, scale.value * delta));
}

function handleMouseDown(e: MouseEvent) {
  isPanning.value = true;
  panStart.x = e.clientX - panX.value;
  panStart.y = e.clientY - panY.value;
}

function handleMouseMove(e: MouseEvent) {
  if (!isPanning.value) return;
  panX.value = e.clientX - panStart.x;
  panY.value = e.clientY - panStart.y;
}

function handleMouseUp() {
  isPanning.value = false;
}
</script>

<style scoped>
.image-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary, #1e1e1e);
}

.image-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-tertiary, #252526);
  border-bottom: 1px solid var(--border-color, #3c3c3c);
  flex-shrink: 0;
}

.image-toolbar button {
  padding: 3px 10px;
  font-size: 13px;
  background: var(--bg-secondary, #2d2d2d);
  border: 1px solid var(--border-color, #3c3c3c);
  color: var(--text-primary, #ccc);
  cursor: pointer;
  border-radius: 3px;
}

.image-toolbar button:hover {
  background: var(--bg-hover, #3e3e3e);
  border-color: var(--accent-color, #007acc);
}

.zoom-level {
  font-size: 12px;
  color: var(--text-secondary, #999);
  min-width: 48px;
  text-align: center;
}

.image-info {
  font-size: 12px;
  color: var(--text-secondary, #999);
  margin-left: auto;
}

.image-canvas {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-canvas img {
  max-width: none;
  max-height: none;
  image-rendering: auto;
  user-select: none;
}

.image-error {
  padding: 20px;
  text-align: center;
  color: #f44747;
  font-size: 14px;
}
</style>

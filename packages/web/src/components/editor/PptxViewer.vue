<template>
  <div class="pptx-viewer">
    <div v-if="isLegacyPpt" class="pptx-unsupported">
      <p class="pptx-unsupported-title">Unsupported format</p>
      <p class="pptx-unsupported-hint">
        {{ fileName }} is a legacy PowerPoint (.ppt) file and cannot be previewed.
        Only .pptx files are supported.
      </p>
    </div>
    <div v-else-if="!content" class="pptx-empty">
      <p>Unable to preview this file.</p>
    </div>
    <vue-office-pptx v-else :src="buffer" style="height: 100%" />
    <div v-if="error" class="pptx-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import VueOfficePptx from '@vue-office/pptx';

const props = defineProps<{
  content: string;
  fileName: string;
}>();

const buffer = ref<ArrayBuffer | null>(null);
const error = ref('');
const isLegacyPpt = computed(() => props.fileName.toLowerCase().endsWith('.ppt'));

function update() {
  if (!props.content || isLegacyPpt.value) {
    buffer.value = null;
    return;
  }
  error.value = '';
  try {
    const binary = atob(props.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    buffer.value = bytes.buffer;
  } catch (e: any) {
    error.value = e.message || 'Failed to decode file';
  }
}

onMounted(() => update());
watch(() => props.content, () => update());
</script>

<style scoped>
.pptx-viewer {
  height: 100%;
  overflow: hidden;
  background: #fff;
}

.pptx-unsupported,
.pptx-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--editor-bg, #1e1e1e);
  color: #888;
}

.pptx-unsupported-title {
  font-size: 1.2em;
  font-weight: 600;
  margin-bottom: 8px;
  color: #aaa;
}

.pptx-unsupported-hint {
  font-size: 0.9em;
  max-width: 400px;
  text-align: center;
  line-height: 1.5;
}

.pptx-error {
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

<template>
  <div class="mode-selector">
    <div class="mode-track">
      <div class="mode-slider" :class="{ right: modelValue === 'plan' }"></div>
      <button
        class="mode-option"
        :class="{ active: modelValue === 'build' }"
        @click="$emit('update:modelValue', 'build')"
      >{{ $t('modeSelector.build') }}</button>
      <button
        class="mode-option"
        :class="{ active: modelValue === 'plan' }"
        @click="$emit('update:modelValue', 'plan')"
      >{{ $t('modeSelector.plan') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: 'build' | 'plan';
}>();

defineEmits<{
  'update:modelValue': [value: 'build' | 'plan'];
}>();
</script>

<style scoped>
.mode-selector {
  flex-shrink: 0;
}
.mode-track {
  position: relative;
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-tertiary);
}
.mode-slider {
  position: absolute;
  top: 0;
  left: 0;
  width: 50%;
  height: 100%;
  background: var(--accent-color);
  border-radius: 3px;
  transition: left 0.2s ease;
  pointer-events: none;
}
.mode-slider.right {
  left: 50%;
}
.mode-option {
  position: relative;
  z-index: 1;
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: color 0.2s ease;
}
.mode-option.active {
  color: #fff;
}
</style>

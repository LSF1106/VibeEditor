<template>
  <n-modal
    v-model:show="showModal"
    preset="card"
    :title="$t('settingsDialog.title')"
    style="width: 480px"
    @after-leave="$emit('close')"
  >
    <ProviderSettingsSection ref="sectionRef" />
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import ProviderSettingsSection from '../settings/ProviderSettingsSection.vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const showModal = ref(props.visible)
watch(() => props.visible, (v) => { showModal.value = v })

const sectionRef = ref<InstanceType<typeof ProviderSettingsSection> | null>(null)

watch(() => props.visible, (v) => {
  if (v) {
    setTimeout(() => sectionRef.value?.init(), 50)
  }
})
</script>

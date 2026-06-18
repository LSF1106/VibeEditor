<template>
  <n-modal
    v-model:show="showModal"
    preset="card"
    :title="$t('toolbar.settings')"
    :style="modalStyle"
    @after-leave="$emit('close')"
  >
    <div ref="containerRef" class="modal-resize-container" :style="containerStyle">
      <div class="split-wrapper">
        <n-split
          direction="horizontal"
          :size="menuWidth + 'px'"
          min="120px"
          :resize-trigger-size="0"
        >
          <template #1>
            <div class="settings-menu">
              <n-menu
                v-model:value="activeTab"
                :options="menuOptions"
                @update:value="onTabChange"
              />
            </div>
          </template>
          <template #2>
            <div class="settings-content">
              <GeneralSettings v-if="activeTab === 'general'" />
              <div v-else-if="activeTab === 'ai'" class="settings-section">
                <h3 class="section-title">{{ $t('settings.aiModel') }}</h3>
                <ProviderSettingsSection ref="providerSectionRef" />
              </div>
              <div v-else-if="activeTab === 'mcp'" class="settings-section">
                <h3 class="section-title">{{ $t('settings.mcpServer') }}</h3>
                <McpSettingsContent />
              </div>
            </div>
          </template>
        </n-split>
      </div>

      <div class="resize-handle resize-n"    :style="nStyle"    @mousedown="startModalResize('n', $event)"></div>
      <div class="resize-handle resize-s"    @mousedown="startModalResize('s', $event)"></div>
      <div class="resize-handle resize-e"    :style="eStyle"    @mousedown="startModalResize('e', $event)"></div>
      <div class="resize-handle resize-w"    :style="wStyle"    @mousedown="startModalResize('w', $event)"></div>
      <div class="resize-handle resize-ne"   :style="neStyle"   @mousedown="startModalResize('ne', $event)"></div>
      <div class="resize-handle resize-nw"   :style="nwStyle"   @mousedown="startModalResize('nw', $event)"></div>
      <div class="resize-handle resize-se"   @mousedown="startModalResize('se', $event)"></div>
      <div class="resize-handle resize-sw"   @mousedown="startModalResize('sw', $event)"></div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NModal, NMenu, NSplit } from 'naive-ui'
import { HardwareChipOutline, ColorPaletteOutline, CloudOutline } from '@vicons/ionicons5'
import { h, type Component } from 'vue'
import GeneralSettings from './GeneralSettings.vue'
import ProviderSettingsSection from './ProviderSettingsSection.vue'
import McpSettingsContent from './McpSettingsContent.vue'

function renderIcon(icon: Component) {
  return () => h(icon)
}

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const cursorMap: Record<ResizeEdge, string> = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', nw: 'nwse-resize',
  se: 'nwse-resize', sw: 'nesw-resize',
}

const props = defineProps<{
  visible: boolean
  initialTab?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const showModal = ref(props.visible)
watch(() => props.visible, (v) => { showModal.value = v })

const activeTab = ref(props.initialTab || 'general')
watch(() => props.initialTab, (v) => { if (v) activeTab.value = v })

const providerSectionRef = ref<InstanceType<typeof ProviderSettingsSection> | null>(null)

const menuOptions = computed(() => [
  { label: t('settings.general'), key: 'general', icon: renderIcon(ColorPaletteOutline) },
  { label: t('settings.aiModel'), key: 'ai', icon: renderIcon(CloudOutline) },
  { label: t('settings.mcpServer'), key: 'mcp', icon: renderIcon(HardwareChipOutline) },
])

function onTabChange(key: string) {
  if (key === 'ai') {
    providerSectionRef.value?.init()
  }
}

watch(() => props.visible, (v) => {
  if (v && activeTab.value === 'ai') {
    setTimeout(() => providerSectionRef.value?.init(), 50)
  }
})

const menuWidth = ref(150)
const modalWidth = ref(680)
const modalHeight = ref(420)
const containerRef = ref<HTMLElement | null>(null)
const containerStyle = ref<Record<string, string>>({
  marginTop: '-16px',
  marginRight: '-20px',
  marginBottom: '-16px',
  marginLeft: '-20px',
})

const modalStyle = computed(() => ({
  width: modalWidth.value + 'px',
  height: modalHeight.value + 'px',
}))

const headerHeight = ref(44)

const nStyle = computed(() => ({
  top: `-${headerHeight.value}px`,
}))

const eStyle = computed(() => ({
  top: `-${headerHeight.value}px`,
}))

const wStyle = computed(() => ({
  top: `-${headerHeight.value}px`,
}))

const neStyle = computed(() => ({
  top: `-${headerHeight.value}px`,
}))

const nwStyle = computed(() => ({
  top: `-${headerHeight.value}px`,
}))

function updateContainerMargins() {
  const el = containerRef.value
  if (!el) return
  const cardContent = el.closest('.n-card__content') as HTMLElement | null
  if (!cardContent) return

  const s = getComputedStyle(cardContent)
  containerStyle.value = {
    marginTop: `-${s.paddingTop}`,
    marginRight: `-${s.paddingRight}`,
    marginBottom: `-${s.paddingBottom}`,
    marginLeft: `-${s.paddingLeft}`,
  }

  const card = cardContent.closest('.n-card') as HTMLElement | null
  if (card) {
    const header = card.querySelector(':scope > .n-card-header') as HTMLElement | null
    if (header) {
      headerHeight.value = header.offsetHeight
    }
  }
}

function tryUpdateMargins() {
  if (showModal.value) {
    nextTick(() => updateContainerMargins())
  }
}

onMounted(() => tryUpdateMargins())
watch(showModal, (v) => { if (v) tryUpdateMargins() })

function startModalResize(edge: ResizeEdge, e: MouseEvent) {
  e.preventDefault()

  // 找到要操作的卡片 DOM 元素
  const card = containerRef.value?.closest('.n-card') as HTMLElement | null
  if (!card) return

  const startX = e.clientX
  const startY = e.clientY
  const startW = card.offsetWidth
  const startH = card.offsetHeight

  document.body.style.cursor = cursorMap[edge]
  document.body.style.userSelect = 'none'

  let rafId = 0
  let pendingW = startW
  let pendingH = startH

  function applyPending() {
    card!.style.width = pendingW + 'px'
    card!.style.height = pendingH + 'px'
    rafId = 0
  }

  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY

    if (edge.includes('e')) pendingW = Math.max(480, startW + dx)
    if (edge.includes('w')) pendingW = Math.max(480, startW - dx)
    if (edge.includes('s')) pendingH = Math.max(360, startH + dy)
    if (edge.includes('n')) pendingH = Math.max(360, startH - dy)

    if (!rafId) rafId = requestAnimationFrame(applyPending)
  }

  const onUp = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      applyPending()
    }
    // 拖拽结束后同步回 Vue 状态
    modalWidth.value = card.offsetWidth
    modalHeight.value = card.offsetHeight

    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mouseup', onUp, true)
    window.removeEventListener('blur', onUp)
  }

  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('mouseup', onUp, true)
  window.addEventListener('blur', onUp)
}
</script>

<style scoped>
.modal-resize-container {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.split-wrapper {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;
}
.split-wrapper :deep(.n-split) {
  height: 100%;
}

.settings-menu {
  height: 100%;
}
.settings-menu :deep(.n-menu) {
  background: transparent;
}

.settings-content {
  min-width: 0;
  padding-left: 20px;
  height: 100%;
  overflow-y: auto;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--text-primary);
}

.resize-handle {
  position: absolute;
  z-index: 10;
  background: transparent;
  transition: background 0.2s;
}
.resize-handle:hover {
  background: rgba(128, 128, 128, 0.3);
}

.resize-n { left: 0; right: 0; height: 6px; cursor: ns-resize; }
.resize-s { bottom: 0; left: 0; right: 0; height: 6px; cursor: ns-resize; }
.resize-e { right: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.resize-w { left: 0; bottom: 0; width: 6px; cursor: ew-resize; }

.resize-ne,
.resize-nw,
.resize-se,
.resize-sw {
  z-index: 11;
  width: 12px;
  height: 12px;
}
.resize-ne { right: 0; cursor: nesw-resize; }
.resize-nw { left: 0; cursor: nwse-resize; }
.resize-se { bottom: 0; right: 0; cursor: nwse-resize; }
.resize-sw { bottom: 0; left: 0; cursor: nesw-resize; }
</style>

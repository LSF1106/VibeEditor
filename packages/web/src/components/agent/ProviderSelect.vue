<template>
  <div class="provider-select" ref="rootEl">
    <button class="trigger" :title="label" @click.stop="open = !open">
      <span class="trigger-star">&#10022;</span>
      <span class="trigger-label">{{ label }}</span>
      <span class="trigger-caret" :class="{ flip: open }">&#9660;</span>
    </button>

    <div v-if="open" class="backdrop" @click="open = false"></div>

    <div v-if="open" class="menu">
      <div class="menu-title">{{ $t('providerSelect.modelService') }}</div>
      <div
        v-for="group in groups"
        :key="group.apiUrl"
        class="menu-group"
      >
        <div class="group-name" :title="group.apiUrl">{{ group.name }}</div>
        <div
          v-for="p in group.items"
          :key="p.id"
          class="menu-item"
          :class="{ on: p.id === activeId }"
          :title="`${p.name}  ·  ${p.model}`"
          @click.stop="pick(p.id)"
        >
          <span class="item-dot" :class="{ fill: p.id === activeId }"></span>
          <span class="item-model">{{ p.model }}</span>
          <span v-if="p.id === activeId" class="item-check">&#10003;</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProviderConfig } from '../../composables/useProviderSettings';

const { t } = useI18n();

const props = defineProps<{
  providers: ProviderConfig[];
  activeId: string;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
}>();

const open = ref(false);
const rootEl = ref<HTMLElement>();

interface Group {
  apiUrl: string;
  name: string;
  items: ProviderConfig[];
}

const groups = computed<Group[]>(() => {
  const m = new Map<string, ProviderConfig[]>();
  for (const p of props.providers) {
    const arr = m.get(p.apiUrl);
    if (arr) arr.push(p); else m.set(p.apiUrl, [p]);
  }
  return [...m.entries()].map(([apiUrl, items]) => ({
    apiUrl,
    name: items[0].name,
    items,
  }));
});

const label = computed(() => {
  const p = props.providers.find(p => p.id === props.activeId);
  return p ? `${p.model} / ${p.name}` : t('providerSelect.notSelected');
});

function pick(id: string) {
  emit('select', id);
  open.value = false;
}
</script>

<style scoped>
.provider-select {
  position: relative;
  flex: 1;
  min-width: 0;
}

/* ---- trigger ---- */
.trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color .2s, box-shadow .2s;
}
.trigger:hover {
  border-color: var(--accent-color);
  box-shadow: 0 0 6px rgba(0,120,212,.2);
}
.trigger-star {
  color: var(--accent-color);
  font-size: 12px;
  flex-shrink: 0;
}
.trigger-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.trigger-caret {
  font-size: 8px;
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: transform .25s;
}
.trigger-caret.flip {
  transform: rotate(180deg);
}

/* ---- backdrop ---- */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

/* ---- menu ---- */
.menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  width: max-content;
  min-width: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 -2px 16px rgba(0,0,0,.35);
  z-index: 100;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
}
.menu-title {
  padding: 6px 12px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .5px;
  color: var(--text-secondary);
  opacity: .55;
}
.group-name {
  padding: 8px 12px 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: .3px;
  white-space: nowrap;
}

/* ---- item ---- */
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px 6px 18px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background .12s;
}
.menu-item:hover {
  background: rgba(255,255,255,.08);
}
.menu-item.on {
  background: rgba(0,120,212,.12);
}
.menu-item.on .item-model {
  color: #fff;
}
.item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1.5px solid var(--text-secondary);
  flex-shrink: 0;
  transition: background .15s, border-color .15s;
}
.item-dot.fill {
  background: var(--accent-color);
  border-color: var(--accent-color);
}
.item-model {
  flex: 1;
  font-family: 'Consolas','Courier New',monospace;
  font-size: 11px;
  white-space: nowrap;
}
.item-check {
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

/* ---- scrollbar ---- */
.menu::-webkit-scrollbar { width: 4px; }
.menu::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}
</style>

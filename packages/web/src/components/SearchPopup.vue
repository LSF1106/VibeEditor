<template>
  <n-modal
    v-model:show="showModal"
    preset="card"
    :title="$t('sidebar.search')"
    style="width: 560px"
    @after-leave="$emit('close')"
  >
    <div class="search-popup">
      <div class="search-input-group">
        <n-input
          ref="searchInput"
          v-model:value="query"
          clearable
          size="small"
          :placeholder="$t('searchPanel.placeholder')"
          @keyup.enter="doSearch"
        >
          <template #suffix>
            <n-button text size="tiny" :disabled="!query.trim() || searching" @click="doSearch">
              <template #icon><n-icon :component="searching ? SyncOutline : SearchOutline" /></template>
            </n-button>
          </template>
        </n-input>
      </div>

      <div v-if="results.length > 0" class="search-summary">
        {{ results.length }} {{ results.length === 1 ? $t('searchPanel.result') : $t('searchPanel.results') }}
        {{ $t('searchPanel.file', { n: fileCount }) }}
      </div>

      <n-spin v-if="searching" size="small" class="search-status" />
      <n-empty v-else-if="searched && results.length === 0" :description="$t('searchPanel.noResults')" size="small" class="search-status" />

      <div class="search-results">
        <div v-for="(group, filePath) in groupedResults" :key="filePath" class="search-file-group">
          <div class="search-file-header" @click="openFile(filePath)">
            <n-icon size="14" :component="DocumentOutline" />
            <span class="search-file-name">{{ filePath }}</span>
            <span class="search-file-count">{{ (group as SearchResult[]).length }}</span>
          </div>
          <div
            v-for="(r, idx) in ((group as SearchResult[]).slice(0, 3))"
            :key="idx"
            class="search-result-item"
            @click="openFile(filePath)"
          >
            <span class="search-result-line">{{ $t('statusBar.ln') }}{{ r.line }}</span>
            <span class="search-result-text">{{ r.text }}</span>
          </div>
          <div
            v-if="(group as SearchResult[]).length > 3"
            class="search-more"
            @click="openFile(filePath)"
          >
            ...{{ (group as SearchResult[]).length - 3 }}{{ $t('searchPanel.more') }}
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { NModal, NInput, NButton, NIcon, NSpin, NEmpty } from 'naive-ui'
import { SearchOutline, SyncOutline, DocumentOutline } from '@vicons/ionicons5'
import type { FileServiceClient } from '../services/fileService'

interface SearchResult {
  path: string
  line: number
  text: string
}

const props = defineProps<{
  visible: boolean
  client: FileServiceClient
}>()

const emit = defineEmits<{
  close: []
  'open-file': [path: string]
}>()

const { t } = useI18n()

const showModal = ref(props.visible)
watch(() => props.visible, (v) => {
  showModal.value = v
  if (v) {
    query.value = ''
    results.value = []
    searched.value = false
    fileCount.value = 0
    nextTick(() => searchInput.value?.focus())
  }
})

const query = ref('')
const results = ref<SearchResult[]>([])
const searched = ref(false)
const searching = ref(false)
const fileCount = ref(0)
const searchInput = ref<{ focus: () => void }>()

const groupedResults = computed(() => {
  const groups: Record<string, SearchResult[]> = {}
  for (const r of results.value) {
    if (!groups[r.path]) groups[r.path] = []
    groups[r.path].push(r)
  }
  return groups
})

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  try {
    const entries = await props.client.readDir(dir)
    for (const entry of entries) {
      if (entry.isDirectory) {
        const subFiles = await getAllFiles(entry.path)
        files.push(...subFiles)
      } else {
        files.push(entry.path)
      }
    }
  } catch { /* ignore */ }
  return files
}

async function doSearch() {
  const q = query.value.trim()
  if (!q) return

  searching.value = true
  searched.value = true
  results.value = []
  fileCount.value = 0

  try {
    const allFiles = await getAllFiles('.')
    const qLower = q.toLowerCase()
    const found: SearchResult[] = []
    let scannedFiles = 0

    const batchSize = 10
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (filePath) => {
          try {
            const content = await props.client.readFile(filePath)
            const lines = content.split('\n')
            const matches: SearchResult[] = []
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(qLower)) {
                matches.push({ path: filePath, line: i + 1, text: lines[i].trim().substring(0, 120) })
              }
            }
            return matches
          } catch {
            return [] as SearchResult[]
          }
        })
      )
      for (const matchList of batchResults) {
        if (matchList.length > 0) scannedFiles++
        found.push(...matchList)
      }
    }

    results.value = found
    fileCount.value = scannedFiles
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

function openFile(filePath: string) {
  emit('open-file', filePath)
}
</script>

<style scoped>
.search-popup {
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}
.search-input-group {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
.search-summary {
  padding: 6px 0;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}
.search-status {
  padding: 16px 0;
  text-align: center;
}
.search-results {
  overflow-y: auto;
  max-height: 400px;
}
.search-file-group {
  border-bottom: 1px solid var(--border-color);
}
.search-file-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
}
.search-file-header:hover {
  color: var(--accent-color);
}
.search-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 11px;
}
.search-file-count {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 1px 5px;
  border-radius: 3px;
}
.search-result-item {
  display: flex;
  gap: 8px;
  padding: 2px 0 2px 16px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}
.search-result-item:hover {
  color: var(--text-primary);
}
.search-result-line {
  color: var(--accent-color);
  font-size: 11px;
  min-width: 32px;
  flex-shrink: 0;
}
.search-result-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 11px;
}
.search-more {
  padding: 2px 0 2px 16px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  font-style: italic;
}
.search-more:hover {
  color: var(--text-primary);
}
</style>

<template>
  <div class="activity-bar">
    <div class="activity-top">
      <div
        v-for="item in items"
        :key="item.id"
        class="activity-item"
        :class="{ active: activeId === item.id }"
        :title="item.label"
        @click="$emit('select', item.id)"
      >
        <span class="activity-icon">{{ item.icon }}</span>
        <div v-if="activeId === item.id" class="activity-indicator"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 活动栏项目 */
export interface ActivityItem {
  id: string;
  label: string;
  icon: string;
}

defineProps<{
  items: ActivityItem[];
  activeId: string;
}>();

defineEmits<{
  select: [id: string];
}>();
</script>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 48px;
  background: var(--bg-tertiary);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
  user-select: none;
}
.activity-top {
  display: flex;
  flex-direction: column;
}
.activity-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  cursor: pointer;
  color: #858585;
  transition: color 0.1s;
}
.activity-item:hover {
  color: var(--text-primary);
}
.activity-item.active {
  color: var(--text-primary);
}
.activity-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--text-primary);
}
.activity-indicator {
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--text-primary);
}
.activity-icon {
  font-size: 22px;
  line-height: 1;
}
</style>

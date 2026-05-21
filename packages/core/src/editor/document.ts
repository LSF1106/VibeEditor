import { EditorState, EditorTab, getLanguageFromPath } from './types';

/** 全局标签页计数器，确保每个标签页 id 唯一 */
let tabCounter = 0;

/**
 * 创建标签页
 *
 * 自动生成唯一 id，根据文件路径推断语言类型。
 * originalContent 初始与 content 相同，isDirty 为 false。
 */
export function createTab(filePath: string, content: string, isUntitled = false): EditorTab {
  const id = `tab_${++tabCounter}_${Date.now()}`;
  return {
    id,
    path: filePath,
    name: filePath.split('/').pop() || filePath,
    language: getLanguageFromPath(filePath),
    content,
    originalContent: content,
    isDirty: false,
    isUntitled,
  };
}

/** 创建空的编辑器状态 */
export function createEmptyState(): EditorState {
  return { tabs: [], activeTabId: null };
}

/**
 * 添加标签页
 *
 * 若同路径的标签页已存在，则直接激活已有标签（去重），否则追加新标签并激活。
 */
export function addTab(state: EditorState, tab: EditorTab): EditorState {
  const existing = state.tabs.find(t => t.path === tab.path);
  if (existing) {
    return { ...state, activeTabId: existing.id };
  }
  return {
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  };
}

/**
 * 关闭标签页
 *
 * 若关闭的是当前活动标签，则自动切换到最后一个剩余标签。
 */
export function removeTab(state: EditorState, tabId: string): EditorState {
  const tabs = state.tabs.filter(t => t.id !== tabId);
  let activeTabId = state.activeTabId;
  if (activeTabId === tabId) {
    activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null;
  }
  return { tabs, activeTabId };
}

/**
 * 更新标签页内容
 *
 * 自动计算 isDirty：当前内容与 originalContent 是否一致。
 */
export function updateTabContent(state: EditorState, tabId: string, content: string): EditorState {
  return {
    ...state,
    tabs: state.tabs.map(t =>
      t.id === tabId ? { ...t, content, isDirty: content !== t.originalContent } : t
    ),
  };
}

/**
 * 标记标签页为已保存
 *
 * 将 originalContent 同步为当前 content，isDirty 置为 false。
 */
export function markTabSaved(state: EditorState, tabId: string): EditorState {
  return {
    ...state,
    tabs: state.tabs.map(t =>
      t.id === tabId ? { ...t, originalContent: t.content, isDirty: false } : t
    ),
  };
}

/**
 * 切换活动标签页
 *
 * 若 tabId 不存在于当前标签列表中，则不做任何操作（幂等）。
 */
export function setActiveTab(state: EditorState, tabId: string): EditorState {
  if (!state.tabs.find(t => t.id === tabId)) return state;
  return { ...state, activeTabId: tabId };
}

// Monaco 编辑器实例的模块级单例
// 用于在组件间共享编辑器引用，避免 prop 透传
// MainLayout、StatusBar、useFileSystem 等均通过此模块访问编辑器

let instance: import('monaco-editor').editor.IStandaloneCodeEditor | null = null

export function getEditorInstance() {
  return instance
}

export function setEditorInstance(editor: typeof instance) {
  instance = editor
}

/** 销毁编辑器实例并清空引用 */
export function clearEditorInstance() {
  if (instance) {
    instance.dispose()
    instance = null
  }
}

import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

/**
 * 编辑器辅助 composable
 *
 * 提供 Monaco 模型创建/切换、内容获取/更新、选区获取等方法。
 * 大部分功能已被 editorInstance.ts 单例替代，此 composable 用于
 * 需要本地编辑器引用的场景。
 */
export function useEditor(editorRef: Ref<any>) {
  const monacoRef = ref<any>(null);
  const editorInstance = ref<any>(null);

  /** 创建或切换 Monaco 编辑器模型 */
  function setModel(language: string, content: string) {
    if (!monacoRef.value) return;
    const monaco = monacoRef.value;
    const uri = monaco.Uri.parse(`file:///editor-${Date.now()}.${language === 'typescript' ? 'ts' : language === 'javascript' ? 'js' : 'txt'}`);
    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(content, language, uri);
    } else {
      model.setValue(content);
    }
    editorInstance.value?.setModel(model);
    return model;
  }

  function getContent(): string {
    return editorInstance.value?.getValue() ?? '';
  }

  /** 更新编辑器内容并保持光标位置 */
  function updateContent(content: string) {
    const editor = editorInstance.value;
    if (!editor) return;
    const position = editor.getPosition();
    editor.setValue(content);
    if (position) editor.setPosition(position);
  }

  /** 获取当前选中的文本及其范围 */
  function getSelection(): { text: string; startLine: number; endLine: number } | null {
    const editor = editorInstance.value;
    if (!editor) return null;
    const selection = editor.getSelection();
    if (!selection) return null;
    const model = editor.getModel();
    if (!model) return null;
    return {
      text: model.getValueInRange(selection),
      startLine: selection.startLineNumber,
      endLine: selection.endLineNumber,
    };
  }

  function dispose() {
    editorInstance.value?.dispose();
  }

  return { monacoRef, editorInstance, setModel, getContent, updateContent, getSelection, dispose };
}

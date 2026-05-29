import type { ITool } from '../types/tool';
import { ReadFileTool } from './read-file';
import { ListDirTool } from './list-dir';
import { SearchCodeTool } from './search-code';
import { DelegateTool } from './delegate';

export { ReadFileTool } from './read-file';
export { ListDirTool } from './list-dir';
export { SearchCodeTool } from './search-code';
export { DelegateTool } from './delegate';

/** 创建 Agent 默认工具集 */
export function createDefaultTools(): ITool[] {
  return [
    new ReadFileTool(),
    new ListDirTool(),
    new SearchCodeTool(),
    new DelegateTool(),
  ];
}

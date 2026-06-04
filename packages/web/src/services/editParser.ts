/** 解析出的编辑块（类型定义，实际解析由服务端 AgentRuntime 完成） */
export interface ParsedEdit {
  path: string;
  content: string;
}

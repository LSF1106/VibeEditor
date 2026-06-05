import type { AgentContext, AgentResult, SessionMessage } from './types/agent';
import { Agent, type AgentEvent, type AgentEventCallback } from './agent';

/** 会话运行结果 */
export interface SessionResult {
  sessionId: string;
  mainResult: AgentResult;
  subResults: AgentResult[];
}

/** 会话事件 */
export interface SessionEvent {
  type: 'chunk' | 'thinking' | 'tool_start' | 'tool_end' | 'tool_result' | 'sub_agent_start' | 'sub_agent_done' | 'done' | 'error';
  agentId?: string;
  data?: string;
  toolType?: string;
  toolLabel?: string;
}

export type SessionEventCallback = (event: SessionEvent) => void;

export class Session {
  readonly id: string;
  private mainAgent: Agent;
  private subAgents: Map<string, Agent> = new Map();
  messages: SessionMessage[] = [];

  constructor(id: string, mainAgent: Agent) {
    this.id = id;
    this.mainAgent = mainAgent;
  }

  /** 注册子 Agent */
  registerSubAgent(agent: Agent): void {
    this.subAgents.set(agent.definition.id, agent);
  }

  /** 启动主 Agent 处理用户消息（非流式） */
  async start(
    message: string,
    context: AgentContext,
    onEvent?: SessionEventCallback
  ): Promise<SessionResult> {
    const emit = (e: SessionEvent) => onEvent?.(e);

    this.messages.push({
      id: this.nextId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    const mainResult = await this.runAgent(this.mainAgent, message, context, emit);

    this.messages.push({
      id: this.nextId(),
      role: 'agent',
      agentId: this.mainAgent.definition.id,
      content: mainResult.content,
      timestamp: Date.now(),
    });

    const subResults = await this.handleDelegation(mainResult, context, emit);

    emit({ type: 'done' });

    return {
      sessionId: this.id,
      mainResult,
      subResults,
    };
  }

  /** 启动主 Agent 处理用户消息（流式） */
  async startStream(
    message: string,
    context: AgentContext,
    onEvent?: SessionEventCallback,
    signal?: AbortSignal
  ): Promise<SessionResult> {
    const emit = (e: SessionEvent) => onEvent?.(e);

    this.messages.push({
      id: this.nextId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    const mainResult = await this.runAgentStream(this.mainAgent, message, context, emit, signal);

    this.messages.push({
      id: this.nextId(),
      role: 'agent',
      agentId: this.mainAgent.definition.id,
      content: mainResult.content,
      timestamp: Date.now(),
    });

    const subResults = await this.handleDelegation(mainResult, context, emit);

    emit({ type: 'done' });

    return {
      sessionId: this.id,
      mainResult,
      subResults,
    };
  }

  /** 手动将任务委托给子 Agent */
  async delegateToSubAgent(
    agentId: string,
    task: string,
    context: AgentContext,
    onEvent?: AgentEventCallback
  ): Promise<AgentResult> {
    const agent = this.subAgents.get(agentId);
    if (!agent) throw new Error(`Sub-agent "${agentId}" not found`);

    const result = await agent.execute(task, context, onEvent);

    this.messages.push({
      id: this.nextId(),
      role: 'agent',
      agentId,
      content: result.content,
      timestamp: Date.now(),
    });

    return result;
  }

  private async runAgent(
    agent: Agent,
    message: string,
    context: AgentContext,
    emit: SessionEventCallback
  ): Promise<AgentResult> {
    return agent.execute(message, context, (e: AgentEvent) => {
      switch (e.type) {
        case 'chunk':
          emit({ type: 'chunk', agentId: agent.definition.id, data: e.text });
          break;
        case 'thinking':
          emit({ type: 'thinking', agentId: agent.definition.id, data: e.text });
          break;
        case 'tool_start':
          emit({ type: 'tool_start', agentId: agent.definition.id, toolType: e.toolType, toolLabel: e.toolLabel });
          break;
        case 'tool_end':
          emit({ type: 'tool_end', agentId: agent.definition.id, toolType: e.toolType });
          break;
        case 'tool_result':
          emit({ type: 'tool_result', agentId: agent.definition.id, toolType: e.toolType, data: e.text });
          break;
      }
    });
  }

  private async runAgentStream(
    agent: Agent,
    message: string,
    context: AgentContext,
    emit: SessionEventCallback,
    signal?: AbortSignal
  ): Promise<AgentResult> {
    return agent.executeStream(message, context, (e: AgentEvent) => {
      switch (e.type) {
        case 'chunk':
          emit({ type: 'chunk', agentId: agent.definition.id, data: e.text });
          break;
        case 'thinking':
          emit({ type: 'thinking', agentId: agent.definition.id, data: e.text });
          break;
        case 'tool_start':
          emit({ type: 'tool_start', agentId: agent.definition.id, toolType: e.toolType, toolLabel: e.toolLabel });
          break;
        case 'tool_end':
          emit({ type: 'tool_end', agentId: agent.definition.id, toolType: e.toolType });
          break;
        case 'tool_result':
          emit({ type: 'tool_result', agentId: agent.definition.id, toolType: e.toolType, data: e.text });
          break;
      }
    }, signal);
  }

  /** 从主 Agent 结果中解析委托指令并启动子 Agent */
  private async handleDelegation(
    mainResult: AgentResult,
    context: AgentContext,
    emit: SessionEventCallback
  ): Promise<AgentResult[]> {
    const subResults: AgentResult[] = [];
    const delegateRe = /<delegate\s+agent="([^"]+)"\s+task="([^"]*)"\s*\/>/g;
    let m: RegExpExecArray | null;

    while ((m = delegateRe.exec(mainResult.content)) !== null) {
      const agentId = m[1];
      const task = m[2];
      if (!this.subAgents.has(agentId)) continue;

      emit({ type: 'sub_agent_start', agentId });

      const subResult = await this.delegateToSubAgent(agentId, task, context);
      subResults.push(subResult);

      emit({ type: 'sub_agent_done', agentId, data: subResult.content });
    }

    return subResults;
  }

  private nextId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

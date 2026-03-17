// Tools
export { webSearchTool } from './tools/web-search'

// Agents
export { createSourceAgent } from './agents/source'
export type { SourceAgentOptions } from './agents/source'
export { createAdminAgent } from './agents/admin'
export type { AdminAgentOptions } from './agents/admin'
export { createAgent } from './agents/base'

// Router
export { routeQuestion } from './router/route-question'
export {
  agentConfigSchema,
  getDefaultConfig,
  getModelFallbackOptions,
  DEFAULT_MODEL,
  ROUTER_MODEL,
} from './router/schema'

// Prompts
export { ROUTER_SYSTEM_PROMPT } from './prompts/router'
export { buildBotSystemPrompt, buildBotUserMessage } from './prompts/bot'
export { buildAdminSystemPrompt, ADMIN_SYSTEM_PROMPT, buildChatSystemPrompt } from './prompts/chat'

// Types
export type {
  AgentConfigData,
  ThreadContext,
  RoutingResult,
  AgentExecutionContext,
  CreateAgentOptions,
  AgentCallOptions,
  WrapModelFn,
} from './types'
export type { AgentConfig } from './router/schema'

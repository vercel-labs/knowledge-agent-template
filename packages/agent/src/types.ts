import type { z } from 'zod'
import type { AgentConfig } from './router/schema'
import type { callOptionsSchema } from './core/schemas'

export interface AgentConfigData {
  id: string
  name: string
  additionalPrompt: string | null
  responseStyle: 'concise' | 'detailed' | 'technical' | 'friendly'
  language: string
  defaultModel: string | null
  maxStepsMultiplier: number
  temperature: number
  searchInstructions: string | null
  citationFormat: 'inline' | 'footnote' | 'none'
  isActive: boolean
}

export interface ThreadContext {
  platform: string
  title: string
  body: string
  labels: string[]
  state: string
  /** e.g. "owner/repo" for GitHub, "workspace/channel" for Slack */
  source: string
  /** issue/ticket number (GitHub, Linear, etc.) */
  number?: number
  previousComments?: Array<{
    author: string
    body: string
    isBot: boolean
  }>
}

export interface RoutingResult {
  routerConfig: AgentConfig
  agentConfig: AgentConfigData
  effectiveModel: string
  effectiveMaxSteps: number
}

export interface AgentExecutionContext {
  mode: 'admin' | 'chat'
  effectiveModel: string
  maxSteps: number
  routerConfig?: AgentConfig
  agentConfig?: AgentConfigData
  customContext?: Record<string, unknown>
}

export interface CreateAgentOptions {
  tools: Record<string, unknown>
  getAgentConfig: () => Promise<AgentConfigData>
  route: () => Promise<AgentConfig>
  buildPrompt: (routerConfig: AgentConfig, agentConfig: AgentConfigData) => string
  resolveModel?: (routerConfig: AgentConfig, agentConfig: AgentConfigData) => string
  onRouted?: (result: RoutingResult) => void
  onStepFinish?: (stepResult: any) => void
  onFinish?: (result: any) => void
}

export type AgentCallOptions = z.infer<typeof callOptionsSchema>

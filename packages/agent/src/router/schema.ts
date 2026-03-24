import type { SharedV3ProviderOptions } from '@ai-sdk/provider'
import { z } from 'zod'

export const ROUTER_MODEL = 'google/gemini-2.5-flash-lite'
export const DEFAULT_MODEL = 'google/gemini-3-flash'

export const agentConfigSchema = z.object({
  complexity: z.enum(['trivial', 'simple', 'moderate', 'complex'])
    .describe('trivial=greeting, simple=single lookup, moderate=multi-search, complex=deep analysis'),

  maxSteps: z.number().min(1).max(30)
    .describe('Agent iterations: 4 trivial, 8 simple, 15 moderate, 25 complex'),

  model: z.enum([
    'google/gemini-3-flash',
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4.6',
  ]).describe('flash for trivial/simple, sonnet for moderate, opus for complex'),

  reasoning: z.string().max(200)
    .describe('Brief explanation of the classification'),
})

export type AgentConfig = z.infer<typeof agentConfigSchema>

export function getDefaultConfig(): AgentConfig {
  return {
    complexity: 'moderate',
    maxSteps: 15,
    model: 'anthropic/claude-sonnet-4.6',
    reasoning: 'Default fallback configuration',
  }
}

const MODEL_FALLBACKS: Record<string, string[]> = {
  'google/gemini-3-flash': ['anthropic/claude-sonnet-4.6', 'openai/gpt-4o'],
  'anthropic/claude-sonnet-4.6': ['google/gemini-3-flash', 'openai/gpt-4o'],
  'anthropic/claude-opus-4.6': ['anthropic/claude-sonnet-4.6', 'google/gemini-3-flash'],
  'google/gemini-2.5-flash-lite': ['google/gemini-3-flash', 'openai/gpt-4o-mini'],
}

export function getModelFallbackOptions(model: string): SharedV3ProviderOptions | undefined {
  const fallbacks = MODEL_FALLBACKS[model]
  if (!fallbacks?.length) return undefined
  return { gateway: { models: fallbacks } }
}

export function buildProviderOptions(
  model: string,
  metadata?: { userId?: string, tags?: string[] },
): SharedV3ProviderOptions | undefined {
  const fallbacks = MODEL_FALLBACKS[model]
  const gateway: Record<string, unknown> = {}

  if (fallbacks?.length) gateway.models = fallbacks
  if (metadata?.userId) gateway.user = metadata.userId
  if (metadata?.tags?.length) gateway.tags = metadata.tags

  return Object.keys(gateway).length > 0 ? { gateway } : undefined
}

export function buildGatewayProviderOptions(
  metadata?: { userId?: string, tags?: string[] },
): SharedV3ProviderOptions | undefined {
  const gateway: Record<string, unknown> = {}

  if (metadata?.userId) gateway.user = metadata.userId
  if (metadata?.tags?.length) gateway.tags = metadata.tags

  return Object.keys(gateway).length > 0 ? { gateway } : undefined
}

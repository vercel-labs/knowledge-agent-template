import { stepCountIs, ToolLoopAgent, type StepResult, type ToolSet, type UIMessage } from 'ai'
import { log } from 'evlog'
import { DEFAULT_MODEL, getModelFallbackOptions } from '../router/schema'
import { routeQuestion } from '../router/route-question'
import { buildChatSystemPrompt } from '../prompts/chat'
import { applyComplexity } from '../prompts/shared'
import { compactContext } from '../core/context'
import { callOptionsSchema } from '../core/schemas'
import { sanitizeToolCallInputs } from '../core/sanitize'
import { countConsecutiveToolSteps, shouldForceTextOnlyStep } from '../core/policy'
import { webSearchTool } from '../tools/web-search'
import { resolveModelWrapper } from '../core/observe'
import type { AgentConfigData, AgentCallOptions, AgentExecutionContext, RoutingResult } from '../types'

export interface SourceAgentOptions {
  tools: Record<string, unknown>
  getAgentConfig: () => Promise<AgentConfigData>
  messages: UIMessage[]
  /** AI Gateway API key. Optional — falls back to OIDC on Vercel or AI_GATEWAY_API_KEY env var. */
  apiKey?: string
  requestId?: string
  /** Falls back to agentConfig.defaultModel then DEFAULT_MODEL */
  defaultModel?: string
  onRouted?: (result: RoutingResult) => void
   
  onStepFinish?: (stepResult: any) => void
   
  onFinish?: (result: any) => void
}

export function createSourceAgent({
  tools,
  getAgentConfig,
  messages,
  apiKey,
  requestId,
  defaultModel = DEFAULT_MODEL,
  onRouted,
  onStepFinish,
  onFinish,
}: SourceAgentOptions) {
  const id = requestId ?? crypto.randomUUID().slice(0, 8)
  let maxSteps = 15
  const wrap = resolveModelWrapper()

  return new ToolLoopAgent({
    model: wrap(DEFAULT_MODEL),
    callOptionsSchema,
    prepareCall: async ({ options, ...settings }) => {
      const modelOverride = (options as AgentCallOptions | undefined)?.model
      const customContext = (options as AgentCallOptions | undefined)?.context

      const [routerConfig, agentConfig] = await Promise.all([
        routeQuestion(messages, id, apiKey),
        getAgentConfig(),
      ])

      const effectiveMaxSteps = Math.round(routerConfig.maxSteps * agentConfig.maxStepsMultiplier)
      const effectiveModel = modelOverride ?? agentConfig.defaultModel ?? defaultModel

      maxSteps = effectiveMaxSteps
      onRouted?.({ routerConfig, agentConfig, effectiveModel, effectiveMaxSteps })

      const executionContext: AgentExecutionContext = {
        mode: 'chat',
        effectiveModel,
        maxSteps: effectiveMaxSteps,
        routerConfig,
        agentConfig,
        customContext,
      }

      return {
        ...settings,
        model: wrap(effectiveModel),
        instructions: applyComplexity(buildChatSystemPrompt(agentConfig), routerConfig),
        tools: { ...tools, web_search: webSearchTool },
        stopWhen: stepCountIs(effectiveMaxSteps),
        providerOptions: getModelFallbackOptions(effectiveModel),
        experimental_context: executionContext,
      }
    },
    prepareStep: ({ stepNumber, messages: stepMessages, steps }) => {
      sanitizeToolCallInputs(stepMessages)
      const normalizedSteps = (steps as StepResult<ToolSet>[] | undefined) ?? []
      const compactedMessages = compactContext({ messages: stepMessages, steps: normalizedSteps })

      if (shouldForceTextOnlyStep({ stepNumber, maxSteps, steps: normalizedSteps })) {
        log.info({ event: 'agent.force_text_step', step: stepNumber + 1, maxSteps, toolStreak: countConsecutiveToolSteps(normalizedSteps) })
        return {
          tools: {},
          toolChoice: 'none' as const,
          activeTools: [],
          ...(compactedMessages !== stepMessages ? { messages: compactedMessages } : {}),
        }
      }

      if (compactedMessages !== stepMessages) {
        return { messages: compactedMessages }
      }
    },
    onStepFinish,
    onFinish,
  })
}

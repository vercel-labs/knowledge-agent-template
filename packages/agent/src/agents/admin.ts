import { stepCountIs, ToolLoopAgent, type StepResult, type ToolSet } from 'ai'
import { DEFAULT_MODEL, getModelFallbackOptions } from '../router/schema'
import { ADMIN_SYSTEM_PROMPT } from '../prompts/chat'
import { compactContext } from '../core/context'
import { callOptionsSchema } from '../core/schemas'
import { sanitizeToolCallInputs } from '../core/sanitize'
import type { AgentCallOptions, AgentExecutionContext, WrapModelFn } from '../types'

export interface AdminAgentOptions {
  tools: Record<string, unknown>
  /** Defaults to the built-in ADMIN_SYSTEM_PROMPT */
  systemPrompt?: string
  maxSteps?: number
  wrapModel?: WrapModelFn
   
  onStepFinish?: (stepResult: any) => void
   
  onFinish?: (result: any) => void
}

export function createAdminAgent({
  tools,
  systemPrompt = ADMIN_SYSTEM_PROMPT,
  maxSteps = 15,
  wrapModel,
  onStepFinish,
  onFinish,
}: AdminAgentOptions) {
  const wrap = (model: string) => wrapModel ? wrapModel(model) : model

  return new ToolLoopAgent({
    model: wrap(DEFAULT_MODEL),
    callOptionsSchema,
    prepareCall: ({ options, ...settings }) => {
      const modelOverride = (options as AgentCallOptions | undefined)?.model
      const customContext = (options as AgentCallOptions | undefined)?.context
      const effectiveModel = modelOverride ?? DEFAULT_MODEL

      const executionContext: AgentExecutionContext = {
        mode: 'admin',
        effectiveModel,
        maxSteps,
        customContext,
      }

      return {
        ...settings,
        model: wrap(effectiveModel),
        instructions: systemPrompt,
        tools,
        stopWhen: stepCountIs(maxSteps),
        providerOptions: getModelFallbackOptions(effectiveModel),
        experimental_context: executionContext,
      }
    },
    prepareStep: ({ messages, steps }) => {
      sanitizeToolCallInputs(messages)
      const normalizedSteps = (steps as StepResult<ToolSet>[] | undefined) ?? []
      const compactedMessages = compactContext({ messages, steps: normalizedSteps })
      if (compactedMessages !== messages) {
        return { messages: compactedMessages }
      }
    },
    onStepFinish,
    onFinish,
  })
}

import { generateText, Output } from 'ai'
import type { UIMessage } from 'ai'
import { log } from 'evlog'
import { ROUTER_SYSTEM_PROMPT } from '../prompts/router'
import { resolveModelWrapper } from '../core/observe'
import { type AgentConfig, agentConfigSchema, getDefaultConfig, getModelFallbackOptions, ROUTER_MODEL } from './schema'

function extractQuestionFromMessages(messages: UIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMessage) return ''

  const textParts = lastUserMessage.parts
    ?.filter((p): p is { type: 'text', text: string } => p.type === 'text')
    .map(p => p.text)
    .join('\n')

  return textParts || ''
}

export async function routeQuestion(
  messages: UIMessage[],
  requestId: string,
  apiKey?: string,
): Promise<AgentConfig> {
  const wrap = resolveModelWrapper()
  const model = wrap(ROUTER_MODEL)

  const question = extractQuestionFromMessages(messages)
  if (!question) {
    log.info({ event: 'router.no_question', requestId })
    return getDefaultConfig()
  }

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: agentConfigSchema }),
      messages: [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: `Question: ${question}` },
      ],
      providerOptions: getModelFallbackOptions(ROUTER_MODEL),
    })

    if (!output) {
      log.warn({ event: 'router.no_output', requestId })
      return getDefaultConfig()
    }

    log.info({ event: 'router.decision', requestId, complexity: output.complexity, model: output.model, maxSteps: output.maxSteps, reasoning: output.reasoning })
    return output
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error({ event: 'router.failed', requestId, error: errorMessage })
    return getDefaultConfig()
  }
}

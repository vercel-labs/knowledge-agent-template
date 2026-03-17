import { generateText, Output } from 'ai'
import { log } from 'evlog'
import {
  type AgentConfig,
  agentConfigSchema,
  createAgent,
  DEFAULT_MODEL,
  getDefaultConfig,
  getModelFallbackOptions,
  ROUTER_MODEL,
  ROUTER_SYSTEM_PROMPT,
  buildBotSystemPrompt,
  buildBotUserMessage,
} from '@savoir/agent'
import { createInternalSavoir } from './savoir'
import type { ThreadContext } from './types'

function buildRouterInput(question: string, context?: ThreadContext): string {
  const parts: string[] = []

  if (context) {
    parts.push(`Source: ${context.source}`)
    if (context.number) {
      parts.push(`#${context.number}: ${context.title}`)
    } else {
      parts.push(`Thread: ${context.title}`)
    }
    if (context.body) {
      parts.push(`Description: ${context.body.slice(0, 500)}`)
    }
    if (context.labels.length) {
      parts.push(`Labels: ${context.labels.join(', ')}`)
    }
  }

  parts.push(`Question: ${question}`)

  return parts.join('\n')
}

async function routeQuestion(question: string, context?: ThreadContext): Promise<AgentConfig> {
  try {
    const { output } = await generateText({
      model: ROUTER_MODEL,
      output: Output.object({ schema: agentConfigSchema }),
      messages: [
        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
        { role: 'user', content: buildRouterInput(question, context) },
      ],
      providerOptions: getModelFallbackOptions(ROUTER_MODEL),
    })

    if (!output) {
      log.warn('bot', 'Router returned no output, using default config')
      return getDefaultConfig()
    }

    log.info('bot', `Router decision: ${output.complexity} (${output.model}, ${output.maxSteps} steps) - ${output.reasoning}`)
    return output
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error('bot', `Router failed: ${errorMessage}, using default config`)
    return getDefaultConfig()
  }
}

export async function generateAIResponse(
  question: string,
  context?: ThreadContext,
): Promise<string> {
  const startTime = Date.now()

  try {
    const savoir = createInternalSavoir({
      source: context?.platform ? `${context.platform}-bot` : 'bot',
      sourceId: context?.number ? `issue-${context.number}` : undefined,
    })

    const agent = createAgent({
      tools: savoir.tools,
      getAgentConfig: savoir.getAgentConfig,
      route: () => routeQuestion(question, context),
      buildPrompt: (routerConfig, agentConfig) => buildBotSystemPrompt(context, routerConfig, agentConfig),
      resolveModel: (routerConfig, agentConfig) => agentConfig.defaultModel || routerConfig.model,
    })

    const result = await agent.generate({
      prompt: buildBotUserMessage(question, context),
      options: {},
    })

    savoir.reportUsage(result, {
      startTime,
      metadata: context ? { source: context.source } : undefined,
    }).catch(e => log.debug({ event: 'bot.usage_report.failed', error: e instanceof Error ? e.message : 'Unknown' }))

    // If the agent exhausted all steps on tool calls without producing text,
    // do one final call with NO tools to force a text response.
    if (!result.text?.trim()) {
      log.info('bot', 'Agent produced no text, forcing fallback generation')
      const fallback = await generateText({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'user', content: buildBotUserMessage(question, context) },
          ...result.response.messages,
        ],
        providerOptions: getModelFallbackOptions(DEFAULT_MODEL),
      })
      if (fallback.text?.trim()) {
        return fallback.text
      }
    }

    return result.text || `I searched the documentation but couldn't generate a helpful response for:

> ${question}

**Suggestions:**
- Try rephrasing your question with different keywords
- Check the official documentation directly
- Open a discussion for more complex questions`
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return `Sorry, I encountered an error while processing your question:

> ${question}

<details>
<summary>Error details</summary>

\`\`\`
${errorMessage}
\`\`\`
</details>

Please try again later or open a discussion if this persists.`
  }
}

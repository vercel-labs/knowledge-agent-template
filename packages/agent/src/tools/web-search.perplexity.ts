import { generateText, tool } from 'ai'
import { createGateway } from '@ai-sdk/gateway'
import { z } from 'zod'
import { resolveGatewayMetadata } from '../core/observe'
import { buildGatewayProviderOptions } from '../router/schema'

const gateway = createGateway()

export const webSearchTool = tool({
  description: 'Search the web for up-to-date information. Use when you need current data, recent events, or facts not available in the documentation.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async function* ({ query }, { abortSignal }) {
    yield { status: 'loading' as const }
    const start = Date.now()

    try {
      const { text, sources } = await generateText({
        model: gateway('perplexity/sonar'),
        prompt: query,
        abortSignal,
        providerOptions: buildGatewayProviderOptions(resolveGatewayMetadata()),
      })

      const urlSources = sources
        ?.filter(s => s.sourceType === 'url')
        .map(s => ({ title: s.title, url: (s as Extract<typeof s, { sourceType: 'url' }>).url }))
        ?? []

      const sourcesPreview = urlSources.map(s => `${s.title || s.url}\n  ${s.url}`).join('\n')

      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text,
        sources: urlSources,
        commands: [
          {
            title: `Web search: "${query}"`,
            command: '',
            stdout: sourcesPreview || text.slice(0, 500),
            stderr: '',
            exitCode: 0,
            success: true,
          },
        ],
      }
    } catch (error) {
      yield {
        status: 'done' as const,
        durationMs: Date.now() - start,
        text: '',
        sources: [],
        commands: [
          {
            title: `Web search: "${query}"`,
            command: '',
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Search failed',
            exitCode: 1,
            success: false,
          },
        ],
      }
    }
  },
})

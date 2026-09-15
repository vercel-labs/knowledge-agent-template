import { SavoirClient } from './client'
import { createBashBatchTool, createBashTool } from './tools'
import type { AgentConfig, GenerateResult, ReportUsageOptions, SavoirConfig } from './types'

export { ALLOWED_BASH_COMMANDS, isPathWithinDirectory, pathMatchesGlob, validateShellCommand } from './shell-policy'
export type { ShellValidationOptions, ShellValidationResult } from './shell-policy'

export type { SavoirConfig, ShellResponse, ShellBatchResponse, ShellCommandResult, SyncOptions, SyncResponse, SnapshotResponse, GitHubSource, YouTubeSource, SourcesResponse, SyncSourceResponse, AgentConfig, GenerateResult, ReportUsageOptions } from './types'
export { SavoirError, NetworkError } from './errors'
export { SavoirClient } from './client'

export interface Savoir {
  /** Low-level HTTP client for direct API access */
  client: SavoirClient
  /** AI SDK tools for use with generateText/streamText */
  tools: {
    bash: ReturnType<typeof createBashTool>
    /** Runs multiple commands in one request (more efficient, sandbox is reused) */
    bash_batch: ReturnType<typeof createBashBatchTool>
  }
  getSessionId: () => string | undefined
  setSessionId: (sessionId: string) => void
  /** Fetch admin-defined agent customization settings */
  getAgentConfig: () => Promise<AgentConfig>
  /** Report usage from an AI SDK generate result. Extracts totalUsage and modelId automatically. */
  reportUsage: (result: GenerateResult, options?: ReportUsageOptions) => Promise<void>
}

/**
 * Create a Savoir instance with API client and AI SDK tools
 *
 * @example
 * ```ts
 * import { createSavoir } from '@savoir/sdk'
 * import { generateText } from 'ai'
 *
 * const savoir = createSavoir({
 *   apiUrl: process.env.SAVOIR_API_URL!, // Required
 *   apiKey: process.env.SAVOIR_API_KEY,  // Optional if API doesn't require auth
 *   sessionId: 'optional-session-id',    // For sandbox reuse
 * })
 *
 * const { text } = await generateText({
 *   model: 'google/gemini-3-flash',
 *   tools: savoir.tools,
 *   prompt: 'How to use useAsyncData in Nuxt?',
 * })
 * ```
 */
export function createSavoir(config: SavoirConfig): Savoir {
  const client = new SavoirClient(config)

  return {
    client,
    tools: {
      bash: createBashTool(client),
      bash_batch: createBashBatchTool(client),
    },
    getSessionId: () => client.getSessionId(),
    setSessionId: (sessionId: string) => client.setSessionId(sessionId),
    getAgentConfig: () => client.getAgentConfig(),
    reportUsage: (result, options) => client.reportUsage(result, options),
  }
}

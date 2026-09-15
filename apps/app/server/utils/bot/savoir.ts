import { tool } from 'ai'
import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { createError } from 'evlog'
import { validateShellCommand, type GenerateResult, type ReportUsageOptions } from '@savoir/sdk'
import { getOrCreateSandbox } from '../sandbox/manager'
import { getAgentConfig, type AgentConfigData } from '../agent-config'

const MAX_OUTPUT = 50000
const SANDBOX_ROOT = '/vercel/sandbox'

/**
 * Returns the re-quoted command to execute — never run the agent's own string.
 * Bot adapters reach this with input derived from untrusted issue and message
 * bodies, so they share the single policy used by the HTTP shell endpoint.
 */
function sanitizeCommand(command: string): string {
  const validation = validateShellCommand(command, {
    allowedBaseDirectory: SANDBOX_ROOT,
  })
  if (!validation.ok) {
    throw createError({
      message: 'Command blocked by security policy',
      status: 403,
      why: validation.reason,
      fix: `Use only allowed read-only commands within ${SANDBOX_ROOT}`,
    })
  }
  return validation.command
}

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT) {
    return `${output.slice(0, MAX_OUTPUT)}\n... (truncated, ${output.length} total chars)`
  }
  return output
}

interface InternalSavoirConfig {
  source?: string
  sourceId?: string
}

export interface InternalSavoir {
  tools: {
    bash: ReturnType<typeof createInternalBashTool>
    bash_batch: ReturnType<typeof createInternalBashBatchTool>
  }
  getAgentConfig: () => Promise<AgentConfigData>
  reportUsage: (result: GenerateResult, options?: ReportUsageOptions) => Promise<void>
}

function createInternalBashTool() {
  let sessionId: string | undefined

  return tool({
    description: `Execute a bash command in the documentation sandbox.
Use standard Unix commands to explore and read files.`,
    inputSchema: z.object({
      command: z.string().describe('Bash command to execute'),
    }),
    execute: async function* ({ command }) {
      yield { status: 'loading' as const }
      const start = Date.now()

      const executableCommand = sanitizeCommand(command)

      const active = await getOrCreateSandbox(sessionId)
      ;({ sessionId } = active)

      const result = await active.sandbox.runCommand({
        cmd: 'bash',
        args: ['-c', executableCommand],
        cwd: SANDBOX_ROOT,
      })

      const stdout = truncateOutput(await result.stdout())
      const stderr = truncateOutput(await result.stderr())
      const durationMs = Date.now() - start
      const success = result.exitCode === 0

      yield {
        status: 'done' as const,
        success,
        durationMs,
        stdout,
        stderr,
        exitCode: result.exitCode,
        commands: [{ command, stdout, stderr, exitCode: result.exitCode, success }],
      }
    },
  })
}

function createInternalBashBatchTool() {
  let sessionId: string | undefined

  return tool({
    description: `Execute multiple bash commands in the documentation sandbox in a single request.
More efficient than multiple single bash calls — use this as your primary tool.
Combine search (grep) and read (head/cat) commands in a single batch.
Maximum 10 commands per batch.`,
    inputSchema: z.object({
      commands: z.array(z.string()).min(1).max(10).describe('Array of bash commands to execute'),
    }),
    execute: async function* ({ commands }) {
      yield { status: 'loading' as const }
      const start = Date.now()

      const executableCommands = commands.map(sanitizeCommand)

      const active = await getOrCreateSandbox(sessionId)
      ;({ sessionId } = active)

      const results = []
      for (const [index, command] of commands.entries()) {
        const result = await active.sandbox.runCommand({
          cmd: 'bash',
          args: ['-c', executableCommands[index]!],
          cwd: SANDBOX_ROOT,
        })

        results.push({
          command,
          stdout: truncateOutput(await result.stdout()),
          stderr: truncateOutput(await result.stderr()),
          exitCode: result.exitCode,
          success: result.exitCode === 0,
        })
      }

      const durationMs = Date.now() - start

      yield {
        status: 'done' as const,
        success: results.every(r => r.success),
        durationMs,
        results: results.map(r => ({ command: r.command, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode })),
        commands: results,
      }
    },
  })
}

async function reportUsageInternal(
  source: string,
  sourceId: string | undefined,
  result: GenerateResult,
  options?: ReportUsageOptions,
): Promise<void> {
  const durationMs = options?.durationMs ?? (options?.startTime ? Date.now() - options.startTime : undefined)

  await db.insert(schema.apiUsage).values({
    source,
    sourceId: options?.sourceId ?? sourceId,
    model: result.response.modelId ?? undefined,
    inputTokens: result.totalUsage.inputTokens ?? undefined,
    outputTokens: result.totalUsage.outputTokens ?? undefined,
    durationMs,
    metadata: options?.metadata ?? undefined,
  })
}

export function createInternalSavoir(config: InternalSavoirConfig = {}): InternalSavoir {
  const { source, sourceId } = config

  return {
    tools: {
      bash: createInternalBashTool(),
      bash_batch: createInternalBashBatchTool(),
    },
    getAgentConfig,
    reportUsage: (result, options) => reportUsageInternal(source || 'bot', sourceId, result, options),
  }
}

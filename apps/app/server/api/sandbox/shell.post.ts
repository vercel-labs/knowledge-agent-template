import { z } from 'zod'
import { useLogger } from 'evlog'
import { validateShellCommand } from '@savoir/sdk'
import { getOrCreateSandbox } from '../../utils/sandbox/manager'

const bodySchema = z.object({
  command: z.string().min(1).max(2000).optional(),
  commands: z.array(z.string().min(1).max(2000)).max(10).optional(),
  sessionId: z.string().optional(),
}).refine(
  data => (data.command && !data.commands) || (!data.command && data.commands),
  { message: 'Provide either "command" or "commands", not both' },
)

const MAX_OUTPUT = 50000
const SANDBOX_ROOT = '/vercel/sandbox'

/** Returns the re-quoted command to execute — never run the caller's own string. */
function sanitizeCommand(command: string): string {
  const validation = validateShellCommand(command, {
    allowedBaseDirectory: SANDBOX_ROOT,
  })
  if (!validation.ok) {
    throw createError({
      statusCode: 400,
      message: validation.reason,
      data: { why: 'The command failed security validation', fix: `Use only allowed commands within ${SANDBOX_ROOT}` },
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

interface CommandResult {
  command: string
  stdout: string
  stderr: string
  exitCode: number
  execMs: number
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const requestLog = useLogger(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const commands = body.commands || [body.command!]
  const executableCommands = commands.map(sanitizeCommand)

  const isBatch = commands.length > 1
  requestLog.set({ commandCount: commands.length, isBatch })

  const sandboxStart = Date.now()
  const { sandbox, sessionId } = await getOrCreateSandbox(body.sessionId)
  requestLog.set({ sandboxMs: Date.now() - sandboxStart, sandboxId: sandbox.sandboxId, sessionId })

  const results: CommandResult[] = []

  for (const [index, command] of commands.entries()) {
    const execStart = Date.now()
    const result = await sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', executableCommands[index]!],
      cwd: SANDBOX_ROOT,
    })

    results.push({
      command,
      stdout: truncateOutput(await result.stdout()),
      stderr: truncateOutput(await result.stderr()),
      exitCode: result.exitCode,
      execMs: Date.now() - execStart,
    })
  }

  requestLog.set({ totalExecMs: results.reduce((sum, r) => sum + r.execMs, 0), commandsExecuted: results.length })

  if (!isBatch) {
    const r = results[0]!
    return { sessionId, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode }
  }

  return {
    sessionId,
    results: results.map(r => ({
      command: r.command,
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode,
    })),
  }
})

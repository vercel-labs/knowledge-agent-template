import type { Sandbox } from '@vercel/sandbox'
import { createError } from 'evlog'
import type { SyncSourceResult } from '../../workflows/sync-docs/types'

export interface GitConfig {
  email: string
  name: string
}

export interface GitPushOptions {
  branch: string
  repoUrl: string
  commitMessage: string
}

export interface GitPushResult {
  success: boolean
  error?: string
  hasChanges: boolean
}

/** Sets git user email and name in sandbox */
export async function configureGit(sandbox: Sandbox, config: GitConfig): Promise<void> {
  await sandbox.runCommand({
    cmd: 'git',
    args: ['config', 'user.email', config.email],
    cwd: '/vercel/sandbox',
  })

  await sandbox.runCommand({
    cmd: 'git',
    args: ['config', 'user.name', config.name],
    cwd: '/vercel/sandbox',
  })
}

/** Checks out branch, creating it if it doesn't exist */
export async function checkoutBranch(sandbox: Sandbox, branch: string): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['checkout', '-B', branch],
    cwd: '/vercel/sandbox',
  })

  if (result.exitCode !== 0) {
    throw createError({
      message: `Git checkout failed for branch "${branch}"`,
      why: await result.stderr(),
      fix: 'Ensure the branch name is valid and git is properly configured',
    })
  }
}

/** Returns true if there are uncommitted changes in sandbox */
export async function hasChanges(sandbox: Sandbox): Promise<boolean> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['status', '--porcelain'],
    cwd: '/vercel/sandbox',
  })

  return (await result.stdout()).trim().length > 0
}

/** Adds files at path to git staging area */
export async function addFiles(sandbox: Sandbox, path: string): Promise<void> {
  await sandbox.runCommand({
    cmd: 'git',
    args: ['add', path],
    cwd: '/vercel/sandbox',
  })
}

/** Creates git commit with message */
export async function commit(sandbox: Sandbox, message: string): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['commit', '-m', message],
    cwd: '/vercel/sandbox',
  })

  if (result.exitCode !== 0) {
    throw createError({
      message: 'Git commit failed',
      why: await result.stderr(),
      fix: 'Ensure there are staged changes and git user is configured',
    })
  }
}

/** Pushes branch to remote repository with upstream tracking */
export async function push(sandbox: Sandbox, repoUrl: string, branch: string): Promise<void> {
  const result = await sandbox.runCommand({
    cmd: 'git',
    args: ['push', '--set-upstream', repoUrl, branch],
    cwd: '/vercel/sandbox',
  })

  if (result.exitCode !== 0) {
    throw createError({
      message: `Git push failed for branch "${branch}"`,
      why: await result.stderr(),
      fix: 'Check repository permissions and ensure the remote URL is correct',
    })
  }
}

/** Generates formatted commit message from sync results with source list */
export function generateCommitMessage(results: SyncSourceResult[]): string {
  const successfulSources = results.filter(r => r.success)
  const totalFiles = results.reduce((sum, r) => sum + (r.fileCount || 0), 0)

  let message = `chore: sync docs (${successfulSources.length} sources, ${totalFiles} files)`

  if (successfulSources.length > 0) {
    message += `\n\nSources:\n${successfulSources.map(r => `- ${r.sourceId}`).join('\n')}`
  }

  message += `\n\nTimestamp: ${new Date().toISOString()}`

  return message
}

/** Executes complete git workflow: configure, checkout, add, commit, and push. Returns result with success status */
export async function pushChanges(
  sandbox: Sandbox,
  options: GitPushOptions,
  gitConfig: GitConfig = { email: 'bot@vercel.com', name: 'Knowledge Agent Bot' },
): Promise<GitPushResult> {
  try {
    await configureGit(sandbox, gitConfig)
    await checkoutBranch(sandbox, options.branch)

    const changesExist = await hasChanges(sandbox)
    if (!changesExist) {
      return { success: true, hasChanges: false }
    }

    await addFiles(sandbox, '.')
    await commit(sandbox, options.commitMessage)
    await push(sandbox, options.repoUrl, options.branch)

    return { success: true, hasChanges: true }
  } catch (error) {
    return {
      success: false,
      hasChanges: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

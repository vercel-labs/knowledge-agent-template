/**
 * Step: Sync Single Source
 *
 * Syncs a single source (GitHub or YouTube) to the sandbox.
 * Each source is its own step for granular retry and observability.
 */

import { getStepMetadata, RetryableError } from 'workflow'
import { log } from 'evlog'
import { Sandbox } from '@vercel/sandbox'
import type { Source, SyncSourceResult } from '../types'
import { syncFileSource, syncGitHubSource, syncYouTubeSource } from '../../../utils/sandbox/source-sync'

export async function stepSyncSource(
  sandboxId: string,
  source: Source,
  config: { githubToken?: string; youtubeApiKey?: string },
): Promise<SyncSourceResult> {
  'use step'

  const { stepId, attempt } = getStepMetadata()
  log.info('sync', `[${stepId}] Syncing source "${source.label}" (attempt ${attempt})`)

  // Reconnect to existing sandbox
  const sandbox = await Sandbox.get({ sandboxId })

  let result: SyncSourceResult

  if (source.type === 'github') {
    result = await syncGitHubSource(sandbox, source)
  } else if (source.type === 'youtube') {
    if (!config.youtubeApiKey) {
      result = {
        sourceId: source.id,
        label: source.label,
        success: false,
        fileCount: 0,
        error: 'YouTube API key not configured',
      }
    } else {
      result = await syncYouTubeSource(sandbox, source, config.youtubeApiKey)
    }
  } else if (source.type === 'file') {
    result = await syncFileSource(sandbox, source)
  } else {
    const unknownSource = source as Source
    result = {
      sourceId: unknownSource.id,
      label: unknownSource.label,
      success: false,
      fileCount: 0,
      error: `Unsupported source type: ${unknownSource.type}`,
    }
  }

  // If failed due to network/transient error, throw RetryableError
  if (!result.success && result.error?.includes('ECONNRESET')) {
    throw new RetryableError(`Transient error syncing ${source.label}: ${result.error}`, {
      retryAfter: attempt * 2000, // Exponential backoff
    })
  }

  log.info('sync', `[${stepId}] Source "${source.label}": ${result.success ? `synced ${result.fileCount} files` : `failed - ${result.error}`}`)

  return result
}

// Allow more retries for network operations
stepSyncSource.maxRetries = 5

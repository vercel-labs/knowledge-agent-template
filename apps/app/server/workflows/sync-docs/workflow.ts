/**
 * Sync Documentation Workflow
 *
 * Syncs documentation from GitHub/YouTube sources into a Vercel Sandbox,
 * pushes changes to git, then takes a snapshot for instant startup.
 *
 * This workflow is composed of granular steps for better retry semantics
 * and observability:
 * 1. Create sandbox from git repository
 * 2. Cleanup stale source directories (from deleted sources)
 * 3. Sync each source (parallel execution)
 * 4. Push changes to git
 * 5. Take snapshot
 */

import { FatalError } from 'workflow'
import { log } from 'evlog'
import type { Source, SyncConfig, SyncResult, SyncSourceResult } from './types'
import {
  stepCreateSandbox,
  stepCleanupStale,
  stepSyncSource,
  stepPushChanges,
  stepTakeSnapshot,
} from './steps'

export async function syncDocumentation(
  config: SyncConfig,
  sources: Source[],
): Promise<SyncResult> {
  'use workflow'

  // Validate configuration
  if (!config.snapshotRepo) {
    throw new FatalError('Snapshot repository is not configured')
  }

  if (!sources || sources.length === 0) {
    throw new FatalError('No sources provided')
  }

  // Filter out YouTube sources if API key is not configured
  const filteredSources = sources.filter((s) => {
    if (s.type === 'youtube' && !config.youtubeApiKey) {
      log.warn('sync', `Skipping YouTube source "${s.label}" - NUXT_YOUTUBE_API_KEY not configured`)
      return false
    }
    return true
  })

  if (filteredSources.length === 0) {
    throw new FatalError('No sources to sync after filtering')
  }

  // Step 1: Create sandbox
  const { sandboxId } = await stepCreateSandbox(config)

  // Step 2: Remove directories from deleted sources
  await stepCleanupStale(sandboxId, filteredSources)

  // Step 3: Sync all sources in parallel
  // Each source is its own step for granular retry and observability
  const results = await Promise.all(
    filteredSources.map(source =>
      stepSyncSource(sandboxId, source, {
        githubToken: config.githubToken,
        youtubeApiKey: config.youtubeApiKey,
      }),
    ),
  )

  // Step 4: Push changes to git
  await stepPushChanges(
    sandboxId,
    {
      snapshotRepo: config.snapshotRepo,
      snapshotBranch: config.snapshotBranch,
      githubToken: config.githubToken,
    },
    results,
  )

  // Step 5: Take snapshot
  const { snapshotId } = await stepTakeSnapshot(sandboxId)

  // Compute summary
  const successCount = results.filter((r: SyncSourceResult) => r.success).length
  const failCount = results.filter((r: SyncSourceResult) => !r.success).length
  const totalFiles = results.reduce((sum: number, r: SyncSourceResult) => sum + (r.fileCount || 0), 0)

  const status = failCount === 0 ? '✓' : '✗'
  log.info('sync', `${status} Done: ${successCount}/${sources.length} sources, ${totalFiles} files`)

  return {
    success: failCount === 0,
    snapshotId,
    summary: {
      total: sources.length,
      success: successCount,
      failed: failCount,
      files: totalFiles,
    },
    results,
  }
}

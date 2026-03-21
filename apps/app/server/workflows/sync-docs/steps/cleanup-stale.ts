/**
 * Step: Cleanup Stale Sources
 *
 * Removes directories from the sandbox that belong to sources
 * that have been deleted since the last sync.
 */

import { getStepMetadata } from 'workflow'
import { log } from 'evlog'
import { Sandbox } from '@vercel/sandbox'
import type { Source } from '../types'
import { cleanupStaleSources } from '../../../utils/sandbox/source-sync'

export interface CleanupStaleResult {
  removed: string[]
}

export async function stepCleanupStale(
  sandboxId: string,
  sources: Source[],
): Promise<CleanupStaleResult> {
  'use step'

  const { stepId } = getStepMetadata()
  log.info('sync', `[${stepId}] Cleaning up stale source directories`)

  const sandbox = await Sandbox.get({ sandboxId })
  const removed = await cleanupStaleSources(sandbox, sources)

  if (removed.length > 0) {
    log.info('sync', `[${stepId}] Removed ${removed.length} stale directories: ${removed.join(', ')}`)
  } else {
    log.info('sync', `[${stepId}] No stale directories found`)
  }

  return { removed }
}

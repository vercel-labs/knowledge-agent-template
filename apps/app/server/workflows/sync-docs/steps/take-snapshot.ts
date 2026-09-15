/**
 * Step: Take Snapshot
 *
 * Takes a snapshot of the sandbox for instant startup.
 */

import { getStepMetadata } from 'workflow'
import { log } from 'evlog'
import { Sandbox } from '@vercel/sandbox'
import { stripGitMetadata } from '../../../utils/sandbox/git'

export interface TakeSnapshotResult {
  snapshotId: string
}

export async function stepTakeSnapshot(sandboxId: string): Promise<TakeSnapshotResult> {
  'use step'

  const { stepId } = getStepMetadata()
  log.info('sync', `[${stepId}] Taking snapshot of sandbox ${sandboxId}`)

  // Reconnect to existing sandbox
  const sandbox = await Sandbox.get({ sandboxId })

  await stripGitMetadata(sandbox)

  const snapshot = await sandbox.snapshot()

  log.info('sync', `[${stepId}] Snapshot created: ${snapshot.snapshotId}`)

  return {
    snapshotId: snapshot.snapshotId,
  }
}

// Allow more retries for snapshot operations
stepTakeSnapshot.maxRetries = 3

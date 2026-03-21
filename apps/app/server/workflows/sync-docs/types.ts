/**
 * Types for sync-docs workflow
 */

export interface SyncConfig {
  githubToken?: string
  youtubeApiKey?: string
  snapshotRepo: string
  snapshotBranch: string
}

export interface GitHubSource {
  id: string
  type: 'github'
  label: string
  basePath: string
  repo: string
  branch: string
  contentPath: string
  outputPath: string
  readmeOnly: boolean
}

export interface YouTubeSource {
  id: string
  type: 'youtube'
  label: string
  basePath: string
  channelId: string
  handle: string
  maxVideos: number
  outputPath: string
}

export interface FileSourceEntry {
  filename: string
  content: string
}

export interface FileSource {
  id: string
  type: 'file'
  label: string
  basePath: string
  outputPath: string
  files: FileSourceEntry[]
}

export type Source = GitHubSource | YouTubeSource | FileSource

export interface SyncSourceResult {
  sourceId: string
  label: string
  success: boolean
  fileCount: number
  error?: string
}

export interface SyncResult {
  success: boolean
  snapshotId?: string
  summary: {
    total: number
    success: number
    failed: number
    files: number
  }
  results: SyncSourceResult[]
}

import type { Sandbox } from '@vercel/sandbox'
import { createError, log } from 'evlog'
import { youtube } from '@googleapis/youtube'
import { YoutubeTranscript } from 'youtube-transcript'
import type { FileSource, GitHubSource, Source, SyncSourceResult, YouTubeSource } from '../../workflows/sync-docs/types'

interface YouTubeVideo {
  id: string
  title: string
  description: string
  publishedAt: string
  thumbnailUrl: string
}

interface VideoIndex {
  id: string
  title: string
  publishedAt: string
  file: string
  hasTranscript: boolean
}

/** Syncs GitHub source to sandbox, returns result with file count and status */
export async function syncGitHubSource(
  sandbox: Sandbox,
  source: GitHubSource,
): Promise<SyncSourceResult> {
  const basePath = source.basePath || '/docs'
  const outputPath = source.outputPath || source.id
  const targetDir = `/vercel/sandbox${basePath}/${outputPath}`

  try {
    await sandbox.runCommand({
      cmd: 'mkdir',
      args: ['-p', targetDir],
      cwd: '/vercel/sandbox',
    })

    if (source.readmeOnly) {
      const fileCount = await syncReadmeOnly(sandbox, source, targetDir)
      return { sourceId: source.id, label: source.label, success: true, fileCount }
    }

    const fileCount = await syncFullRepository(sandbox, source, targetDir)
    return { sourceId: source.id, label: source.label, success: true, fileCount }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { sourceId: source.id, label: source.label, success: false, fileCount: 0, error: errorMessage }
  }
}

/** Fetches and saves README.md from repository to target directory */
async function syncReadmeOnly(
  sandbox: Sandbox,
  source: GitHubSource,
  targetDir: string,
): Promise<number> {
  const readmeUrl = `https://raw.githubusercontent.com/${source.repo}/${source.branch}/README.md`

  const result = await sandbox.runCommand({
    cmd: 'curl',
    args: ['-sL', '-o', `${targetDir}/README.md`, readmeUrl],
    cwd: '/vercel/sandbox',
  })

  if (result.exitCode !== 0) {
    throw createError({
      message: `Failed to fetch README from ${source.repo}`,
      why: await result.stderr(),
      fix: 'Ensure the repository is public or token has access, and README.md exists',
    })
  }

  return 1
}

/** Clones repository with sparse checkout, copies content path, and filters to keep only docs files */
async function syncFullRepository(
  sandbox: Sandbox,
  source: GitHubSource,
  targetDir: string,
): Promise<number> {
  const contentPath = source.contentPath || ''
  const tempDir = `/tmp/sync-${source.id}-${Date.now()}`

  const cloneResult = await sandbox.runCommand({
    cmd: 'sh',
    args: [
      '-c',
      [
        `git clone --depth 1 --single-branch --branch ${source.branch}`,
        `--filter=blob:none --sparse`,
        `https://github.com/${source.repo}.git ${tempDir}`,
        `&& cd ${tempDir}`,
        `&& git sparse-checkout set ${contentPath || '.'}`,
      ].join(' '),
    ],
    cwd: '/vercel/sandbox',
  })

  if (cloneResult.exitCode !== 0) {
    const stderr = await cloneResult.stderr()
    throw createError({
      message: `Failed to clone repository ${source.repo}`,
      why: stderr,
      fix: 'Check that the repository exists, branch is correct, and token has access if private',
    })
  }

  const sourcePath = contentPath ? `${tempDir}/${contentPath}` : tempDir
  await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', `cp -r ${sourcePath}/* ${targetDir}/ 2>/dev/null || cp -r ${sourcePath}/. ${targetDir}/`],
    cwd: '/vercel/sandbox',
  })

  await sandbox.runCommand({
    cmd: 'sh',
    args: [
      '-c',
      `find ${targetDir} -type f ! \\( -name "*.md" -o -name "*.mdx" -o -name "*.yml" -o -name "*.yaml" -o -name "*.json" \\) -delete`,
    ],
    cwd: '/vercel/sandbox',
  })

  await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', `find ${targetDir} -type d -empty -delete`],
    cwd: '/vercel/sandbox',
  })

  await sandbox.runCommand({
    cmd: 'rm',
    args: ['-rf', tempDir],
    cwd: '/vercel/sandbox',
  })

  const countResult = await sandbox.runCommand({
    cmd: 'sh',
    args: ['-c', `find ${targetDir} -type f -name "*.md" -o -name "*.mdx" | wc -l`],
    cwd: '/vercel/sandbox',
  })

  return parseInt((await countResult.stdout()).trim()) || 0
}

/** Synchronizes a YouTube channel to the sandbox filesystem */
export async function syncYouTubeSource(
  sandbox: Sandbox,
  source: YouTubeSource,
  apiKey: string,
): Promise<SyncSourceResult> {
  try {
    log.info('sync', `Starting YouTube sync for ${source.label} (${source.channelId})`)

    const videos = await fetchChannelVideos(source.channelId, source.maxVideos, apiKey)
    log.info('sync', `Found ${videos.length} videos to sync`)

    if (videos.length === 0) {
      return {
        sourceId: source.id,
        label: source.label,
        success: true,
        fileCount: 0,
      }
    }

    const targetDir = `${source.basePath}/${source.outputPath}`
    await sandbox.runCommand({
      cmd: 'mkdir',
      args: ['-p', targetDir],
      cwd: '/vercel/sandbox',
    })

    const videosIndex: VideoIndex[] = []
    let successCount = 0

    for (const video of videos) {
      try {
        const transcript = await fetchVideoTranscript(video.id)
        const markdown = generateVideoMarkdown(video, transcript)
        const filename = `${video.id}-${slugify(video.title)}.md`
        const filepath = `${targetDir}/${filename}`

        // Write file using shell command
        await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', `cat > '${filepath}' << 'EOFMARKER'\n${markdown}\nEOFMARKER`],
          cwd: '/vercel/sandbox',
        })

        videosIndex.push({
          id: video.id,
          title: video.title,
          publishedAt: video.publishedAt,
          file: filename,
          hasTranscript: !!transcript,
        })
        successCount++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.warn('sync', `Failed to sync video ${video.id}: ${errorMessage}`)
      }
    }

    const indexData = {
      lastSync: new Date().toISOString(),
      totalVideos: successCount,
      channelId: source.channelId,
      handle: source.handle,
      videos: videosIndex,
    }
    // Write index file
    const indexContent = JSON.stringify(indexData, null, 2)
    await sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', `cat > '${targetDir}/videos.json' << 'EOFMARKER'\n${indexContent}\nEOFMARKER`],
      cwd: '/vercel/sandbox',
    })

    log.info('sync', `YouTube sync completed: ${successCount}/${videos.length} videos`)

    return {
      sourceId: source.id,
      label: source.label,
      success: true,
      fileCount: successCount + 1,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error('sync', `YouTube sync failed for ${source.label}: ${errorMessage}`)
    return {
      sourceId: source.id,
      label: source.label,
      success: false,
      fileCount: 0,
      error: errorMessage,
    }
  }
}

async function fetchChannelVideos(
  channelId: string,
  maxVideos: number,
  apiKey: string,
): Promise<YouTubeVideo[]> {
  const yt = youtube({ version: 'v3', auth: apiKey })
  const videos: YouTubeVideo[] = []
  let pageToken: string | undefined

  while (videos.length < maxVideos) {
    try {
      const response = await yt.search.list({
        part: ['snippet'],
        channelId,
        maxResults: Math.min(50, maxVideos - videos.length),
        order: 'date',
        type: ['video'],
        pageToken,
      })

      for (const item of response.data.items || []) {
        if (!item.id?.videoId)
          continue

        videos.push({
          id: item.id.videoId,
          title: item.snippet?.title || 'Untitled',
          description: item.snippet?.description || '',
          publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
          thumbnailUrl: item.snippet?.thumbnails?.high?.url || '',
        })
      }

      pageToken = response.data.nextPageToken || undefined
      if (!pageToken)
        break
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('sync', `Failed to fetch videos from channel ${channelId}: ${errorMessage}`)
      throw error
    }
  }

  return videos.slice(0, maxVideos)
}

async function fetchVideoTranscript(videoId: string): Promise<string | null> {
  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId)

    if (!transcriptItems || transcriptItems.length === 0) {
      log.warn('sync', `No transcript found for video ${videoId}`)
      return null
    }

    const transcript = transcriptItems
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    return transcript
  } catch (error) {
    log.warn('sync', `Failed to fetch transcript for ${videoId}: ${error}`)
    return null
  }
}

function generateVideoMarkdown(video: YouTubeVideo, transcript: string | null): string {
  const escapedTitle = video.title.replace(/"/g, '\\"')
  const escapedDescription = video.description
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .slice(0, 200)

  const publishedDate = new Date(video.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `---
title: "${escapedTitle}"
description: "${escapedDescription}"
videoId: "${video.id}"
publishedAt: "${video.publishedAt}"
url: "https://youtube.com/watch?v=${video.id}"
hasTranscript: ${!!transcript}
---

# ${video.title}

> Published on ${publishedDate}

## Description

${video.description}

## Watch on YouTube

[Watch this video](https://youtube.com/watch?v=${video.id})

${transcript ? `## Transcript\n\n${transcript}` : '⚠️ No transcript available for this video'}
`
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

/** Writes pre-loaded file contents to sandbox */
export async function syncFileSource(
  sandbox: Sandbox,
  source: FileSource,
): Promise<SyncSourceResult> {
  const basePath = source.basePath || '/files'
  const outputPath = source.outputPath || source.id
  const targetDir = `/vercel/sandbox${basePath}/${outputPath}`

  try {
    log.info('sync', `Starting file sync for "${source.label}"`)

    await sandbox.runCommand({
      cmd: 'mkdir',
      args: ['-p', targetDir],
      cwd: '/vercel/sandbox',
    })

    if (source.files.length === 0) {
      log.info('sync', `No files provided for "${source.label}"`)
      return { sourceId: source.id, label: source.label, success: true, fileCount: 0 }
    }

    let fileCount = 0

    for (const entry of source.files) {
      try {
        const filepath = `${targetDir}/${entry.filename}`

        await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', `cat > '${filepath}' << 'EOFMARKER'\n${entry.content}\nEOFMARKER`],
          cwd: '/vercel/sandbox',
        })

        fileCount++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.warn('sync', `Failed to sync file ${entry.filename}: ${errorMessage}`)
      }
    }

    log.info('sync', `File sync completed for "${source.label}": ${fileCount} files`)

    return { sourceId: source.id, label: source.label, success: true, fileCount }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error('sync', `File sync failed for "${source.label}": ${errorMessage}`)
    return { sourceId: source.id, label: source.label, success: false, fileCount: 0, error: errorMessage }
  }
}

/** Removes directories in the sandbox that don't belong to any active source */
export async function cleanupStaleSources(
  sandbox: Sandbox,
  sources: Source[],
): Promise<string[]> {
  const expectedDirs = new Map<string, Set<string>>()

  for (const source of sources) {
    const basePath = source.basePath || (source.type === 'youtube' ? '/youtube' : source.type === 'file' ? '/files' : '/docs')
    const outputPath = source.outputPath || source.id
    if (!expectedDirs.has(basePath)) {
      expectedDirs.set(basePath, new Set())
    }
    expectedDirs.get(basePath)!.add(outputPath)
  }

  const removed: string[] = []
  const basePaths = new Set(['/docs', '/files', '/youtube', ...expectedDirs.keys()])

  for (const basePath of basePaths) {
    const fullBase = `/vercel/sandbox${basePath}`
    const result = await sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', `[ -d '${fullBase}' ] && ls -1 '${fullBase}' || true`],
      cwd: '/vercel/sandbox',
    })

    const output = (await result.stdout()).trim()
    if (!output) continue

    const existingDirs = output.split('\n').filter(Boolean)
    const expected = expectedDirs.get(basePath) || new Set()

    for (const dir of existingDirs) {
      if (!expected.has(dir)) {
        const staleDir = `${fullBase}/${dir}`
        log.info('sync', `Removing stale source directory: ${staleDir}`)
        await sandbox.runCommand({
          cmd: 'rm',
          args: ['-rf', staleDir],
          cwd: '/vercel/sandbox',
        })
        removed.push(`${basePath}/${dir}`)
      }
    }
  }

  return removed
}

/** Syncs all sources sequentially, returns array of results */
export async function syncSources(
  sandbox: Sandbox,
  sources: Source[],
  config?: { githubToken?: string; youtubeApiKey?: string },
): Promise<SyncSourceResult[]> {
  const results: SyncSourceResult[] = []

  for (const source of sources) {
    let result: SyncSourceResult

    if (source.type === 'github') {
      result = await syncGitHubSource(sandbox, source)
    } else if (source.type === 'youtube') {
      if (!config?.youtubeApiKey) {
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

    results.push(result)
  }

  return results
}

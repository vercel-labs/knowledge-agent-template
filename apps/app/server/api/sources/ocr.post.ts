import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { SourceOcrItem } from '#shared/utils/source-ocr'
import { IMAGE_OPTIMIZATION_CONFIG } from '#shared/utils/file'
import { optimizeImage } from '~~/server/utils/image/optimize'

const bodySchema = z.object({
  images: z.array(z.string()).optional().default([]),
  configs: z.array(z.object({
    filename: z.string(),
    content: z.string(),
  })).optional().default([]),
})

const systemPrompt = `Extract ALL documentation source configurations from the provided content.

STRICT FORMAT RULES:

**GitHub repositories:**
- repo: MUST be exactly "owner/repo" format with no extra text (e.g. "nuxt/nuxt", "nuxt/nuxt.com", "unjs/h3")
- branch: git branch name only, lowercase (default "main")
- contentPath: folder path only (e.g. "docs", "docs/content")
- label: short name from repo, keep dots if present (e.g. "nuxt", "nuxt.com", "h3")

**YouTube channels:**
- channelId: MUST start with "UC" followed by 22 characters
- handle: @username format (e.g. "@TheAlexLichter")
- label: short channel name

IMPORTANT:
- label should match the repo name (e.g. repo "nuxt/nuxt.com" → label "nuxt.com")
- repo must be owner/repo format only (no URLs, no status codes, no extra text)
- Only extract clearly defined sources, ignore partial or unclear data

Return ALL valid sources found.`

const YOUTUBE_CHANNEL_PATTERN = /^UC[a-zA-Z0-9_-]{22}$/

function sanitizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '') // Keep dots
    .replace(/\.+/g, '.') // Collapse multiple dots
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '') // Trim dots and dashes
}

function sanitizeRepo(repo: string): string | null {
  // Clean the input first
  let cleaned = repo.trim().toLowerCase()

  // Remove common garbage patterns
  cleaned = cleaned
    .replace(/status:\s*\d+.*/i, '') // Remove "Status: 200 OK" etc
    .replace(/https?:\/\/.*/i, '') // Remove URLs
    .replace(/[^a-z0-9_./-]/g, '') // Remove invalid characters
    .replace(/\/+/g, '/') // Collapse multiple slashes
    .replace(/^\/|\/$/g, '') // Trim slashes

  // Must be owner/repo format
  const parts = cleaned.split('/')
  if (parts.length !== 2) return null

  const [owner, name] = parts
  if (!owner || !name) return null

  // Validate each part (GitHub rules: 1-39 chars, alphanumeric and hyphens)
  const validPart = /^[a-z0-9][a-z0-9._-]*$/
  if (!validPart.test(owner) || !validPart.test(name)) return null

  // Reject suspiciously long names (probably garbage)
  if (owner.length > 39 || name.length > 100) return null

  return `${owner}/${name}`
}

function sanitizeSource(source: SourceOcrItem): SourceOcrItem | null {
  let label = sanitizeLabel(source.label || '')
  if (!label) return null

  if (source.type === 'github') {
    const repo = sanitizeRepo(source.repo || '')
    if (!repo) return null

    // Derive label from repo name if model lost the dot
    // e.g. repo "nuxt/nuxt.com" + label "nuxtcom" → label "nuxt.com"
    const [, repoName] = repo.split('/')
    if (repoName && repoName.includes('.')) {
      const labelWithoutDots = label.replace(/\./g, '')
      const repoNameWithoutDots = repoName.replace(/\./g, '')
      if (labelWithoutDots === repoNameWithoutDots) {
        label = repoName
      }
    }

    return {
      ...source,
      label,
      repo,
      branch: source.branch?.toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'main',
      contentPath: source.contentPath?.replace(/^\/+|\/+$/g, '') || '',
    }
  }

  if (source.type === 'youtube') {
    const channelId = source.channelId?.trim()
    if (!channelId || !YOUTUBE_CHANNEL_PATTERN.test(channelId)) return null

    return {
      ...source,
      label,
      channelId,
      handle: source.handle?.startsWith('@') ? source.handle : source.handle ? `@${source.handle}` : '',
    }
  }

  return null
}

async function extractFromImage(image: string) {
  const { ocr: ocrConfig } = IMAGE_OPTIMIZATION_CONFIG
  let optimizedImage: Buffer | string

  try {
    const result = await optimizeImage(image, ocrConfig)
    optimizedImage = result.buffer
  } catch (error) {
    log.warn({ event: 'ocr.optimization_failed', error: error instanceof Error ? error.message : 'Unknown' })
    optimizedImage = image
  }

  const { output } = await generateText({
    model: useAI().wrap('google/gemini-3-flash'),
    output: Output.object({ schema: sourceOcrSchema }),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'image', image: optimizedImage },
        ],
      },
    ],
  })
  return output?.sources || []
}

async function extractFromConfig(config: { filename: string, content: string }) {
  const { output } = await generateText({
    model: useAI().wrap('google/gemini-2.5-flash-lite'),
    output: Output.object({ schema: sourceOcrSchema }),
    messages: [
      {
        role: 'user',
        content: `${systemPrompt}\n\n--- File: ${config.filename} ---\n${config.content}\n--- End of ${config.filename} ---`,
      },
    ],
  })
  return output?.sources || []
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const { images, configs } = await readValidatedBody(event, bodySchema.parse)

  if (images.length === 0 && configs.length === 0) {
    return { sources: [] }
  }

  const results = await Promise.all([
    ...images.map(image => extractFromImage(image)),
    ...configs.map(config => extractFromConfig(config)),
  ])

  const allSources = results.flat()

  // Sanitize and deduplicate
  const seen = new Set<string>()
  const uniqueSources: SourceOcrItem[] = []

  for (const source of allSources) {
    const sanitized = sanitizeSource(source)
    if (!sanitized) continue

    const key = sanitized.type === 'github'
      ? sanitized.repo
      : sanitized.channelId

    if (!key || seen.has(key)) continue
    seen.add(key)
    uniqueSources.push(sanitized)
  }

  return { sources: uniqueSources }
})

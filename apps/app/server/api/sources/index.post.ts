import { db, schema } from '@nuxthub/db'
import { z } from 'zod'

const bodySchema = z.object({
  type: z.enum(['github', 'youtube', 'file']),
  label: z.string().min(1),
  basePath: z.string().optional().default('/docs'),
  repo: z.string().optional(),
  branch: z.string().optional().default('main'),
  contentPath: z.string().optional(),
  outputPath: z.string().optional(),
  readmeOnly: z.boolean().optional().default(false),
  channelId: z.string().optional(),
  handle: z.string().optional(),
  maxVideos: z.number().optional().default(50),
})

/**
 * POST /api/sources
 * Create a new source (admin only)
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  requestLog.set({ type: body.type, label: body.label })

  const [source] = await db.insert(schema.sources)
    .values({
      id: crypto.randomUUID(),
      type: body.type,
      label: body.label,
      basePath: body.basePath,
      repo: body.repo,
      branch: body.branch,
      contentPath: body.contentPath,
      outputPath: body.outputPath,
      readmeOnly: body.readmeOnly,
      channelId: body.channelId,
      handle: body.handle,
      maxVideos: body.maxVideos,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  requestLog.set({ sourceId: source?.id })

  return source
})

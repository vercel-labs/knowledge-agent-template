import { blob } from 'hub:blob'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string().min(1, 'Missing source ID'),
})

/**
 * GET /api/sources/:id/files
 * List files for a file source from blob storage.
 * Returns empty list after sync (blob is cleaned up post-sync).
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const source = await db.query.sources.findFirst({
    where: () => eq(schema.sources.id, id),
  })

  if (!source) {
    throw createError({ statusCode: 404, message: 'Source not found' })
  }

  if (source.type !== 'file') {
    throw createError({ statusCode: 400, message: 'Source is not a file source' })
  }

  const prefix = `sources/${id}/`
  const { blobs } = await blob.list({ prefix })

  const files = blobs.map(b => ({
    pathname: b.pathname,
    filename: b.pathname.replace(prefix, ''),
    size: b.size,
    uploadedAt: b.uploadedAt,
  }))

  return { files }
})

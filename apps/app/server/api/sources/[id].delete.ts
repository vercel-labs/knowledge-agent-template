import { blob } from 'hub:blob'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string().min(1, 'Missing source ID'),
})

/**
 * DELETE /api/sources/:id
 * Delete a source (admin only)
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  requestLog.set({ sourceId: id })

  const [deleted] = await db.delete(schema.sources)
    .where(eq(schema.sources.id, id))
    .returning()

  if (!deleted) {
    throw createError({ statusCode: 404, message: 'Source not found', data: { why: 'No source exists with this ID', fix: 'Verify the source ID from the sources list' } })
  }

  if (deleted.type === 'file') {
    const prefix = `sources/${id}/`
    const { blobs } = await blob.list({ prefix })
    if (blobs.length > 0) {
      await blob.del(blobs.map(b => b.pathname))
    }
  }

  return { success: true }
})

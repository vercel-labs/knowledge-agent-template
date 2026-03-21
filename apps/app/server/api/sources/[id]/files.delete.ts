import { blob } from 'hub:blob'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string().min(1, 'Missing source ID'),
})

const bodySchema = z.object({
  pathname: z.string().min(1, 'Missing file pathname'),
})

/**
 * DELETE /api/sources/:id/files
 * Delete a specific file from a file source's blob storage.
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { pathname } = await readValidatedBody(event, bodySchema.parse)

  const source = await db.query.sources.findFirst({
    where: () => eq(schema.sources.id, id),
  })

  if (!source) {
    throw createError({ statusCode: 404, message: 'Source not found' })
  }

  if (source.type !== 'file') {
    throw createError({ statusCode: 400, message: 'Source is not a file source' })
  }

  if (!pathname.startsWith(`sources/${id}/`)) {
    throw createError({ statusCode: 403, message: 'File does not belong to this source' })
  }

  await blob.del(pathname)

  requestLog.set({ sourceId: id, deletedFile: pathname })

  return { success: true }
})

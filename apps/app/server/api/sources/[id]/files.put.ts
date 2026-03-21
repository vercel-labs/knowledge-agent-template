import { blob } from 'hub:blob'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const ALLOWED_EXTENSIONS = ['.md', '.mdx', '.txt', '.yml', '.yaml', '.json']
const MAX_FILE_SIZE = 8 * 1024 * 1024

const paramsSchema = z.object({
  id: z.string().min(1, 'Missing source ID'),
})

function isAllowedFile(filename: string): boolean {
  return ALLOWED_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext))
}

/**
 * PUT /api/sources/:id/files
 * Upload files to a file source (admin only).
 * Files are stored in blob at `sources/{sourceId}/{filename}`.
 */
export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
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

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No files provided' })
  }

  const fileFields = formData.filter(f => f.name === 'files' && f.filename && f.data)
  if (fileFields.length === 0) {
    throw createError({ statusCode: 400, message: 'No files in form data' })
  }

  const results = []

  for (const field of fileFields) {
    const filename = field.filename!

    if (!isAllowedFile(filename)) {
      results.push({ filename, error: `File type not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}` })
      continue
    }

    if (field.data.length > MAX_FILE_SIZE) {
      results.push({ filename, error: 'File exceeds 8MB limit' })
      continue
    }

    const pathname = `sources/${id}/${filename}`
    const contentType = field.type || 'text/plain'

    await blob.put(pathname, new Blob([field.data], { type: contentType }), { contentType })
    results.push({ filename, pathname, size: field.data.length })
  }

  requestLog.set({ sourceId: id, filesUploaded: results.filter(r => !('error' in r)).length })

  return { files: results }
})

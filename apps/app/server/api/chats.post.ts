import type { UIMessage } from 'ai'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { checkRateLimit, incrementRateLimit } from '../utils/rate-limit'
import type { CreateChatBody, CreateChatResponse } from '#shared/types/chat'

const bodySchema = z.object({
  id: z.string(),
  mode: z.enum(['chat', 'admin']).default('chat'),
  message: z.custom<UIMessage>()
})

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  const { user } = await requireUserSession(event)
  const body: CreateChatBody = await readValidatedBody(event, bodySchema.parse)
  const { id, message } = body
  const mode = body.mode ?? 'chat'

  requestLog.set({ userId: user.id, chatId: id, mode })

  if (mode === 'admin' && user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required', data: { why: 'Admin chat mode requires the admin role', fix: 'Contact an administrator to be granted access' } })
  }

  if (user.role !== 'admin') {
    const rateLimit = await checkRateLimit(user.id)
    if (!rateLimit.allowed) {
      throw createError({ statusCode: 429, statusMessage: 'Rate limit exceeded', data: { why: `You have reached the daily limit of ${rateLimit.limit} messages`, fix: 'Wait until tomorrow or contact an administrator' } })
    }
  }

  const [chat] = await db.insert(schema.chats).values({
    id,
    title: '',
    mode,
    userId: user.id
  }).returning()

  if (!chat) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create chat', data: { why: 'The database insert did not return the created chat', fix: 'Try again or check server logs for database errors' } })
  }

  await db.insert(schema.messages).values({
    id: message.id,
    chatId: chat.id,
    role: 'user',
    parts: message.parts
  })

  if (user.role !== 'admin') {
    await incrementRateLimit(user.id)
  }

  return chat satisfies CreateChatResponse
})

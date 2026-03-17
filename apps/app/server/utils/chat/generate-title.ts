import type { UIMessage } from 'ai'
import { generateText } from 'ai'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { log } from 'evlog'
import { ROUTER_MODEL, getModelFallbackOptions } from '@savoir/agent'

interface GenerateTitleOptions {
  firstMessage: UIMessage
  chatId: string
  requestId: string
}

export async function generateTitle({ firstMessage, chatId, requestId }: GenerateTitleOptions): Promise<string | null> {
  try {
    const model = useAI().wrap(ROUTER_MODEL)
    const { text: title } = await generateText({
      model,
      system: `Generate a short chat title (max 30 chars) from the user's message.
Rules: no quotes, no colons, no punctuation, plain text only.
If the message is a simple greeting (hi, hey, hello, etc.), respond with a generic title like "New conversation" or "Quick chat".`,
      prompt: JSON.stringify(firstMessage),
      providerOptions: getModelFallbackOptions(ROUTER_MODEL),
    })

    await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, chatId))
    log.info('chat', `${requestId} Title: ${title}`)
    return title
  } catch (error) {
    log.error('chat', `${requestId} Title generation failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

import { Chat, ConsoleLogger, emoji, type Adapter, type Message, type Thread } from 'chat'
import { createDiscordAdapter } from '@chat-adapter/discord'
import { createMemoryState } from '@chat-adapter/state-memory'
import { createRedisState } from '@chat-adapter/state-redis'
import { createError, log } from 'evlog'
import { SavoirGitHubAdapter } from './adapters/github'
import { generateAIResponse } from './ai'
import { hasContextProvider } from './types'

let botInstance: Chat | null = null

async function handleBotResponse(thread: Thread, message: Message) {
  const { adapter } = thread
  const startTime = Date.now()

  log.info({
    event: 'bot.response.start',
    adapter: adapter.name,
    threadId: thread.id,
    author: message.author.userName,
    isMention: message.isMention,
    messageLength: message.text.length,
  })

  await thread.startTyping().catch(() => {})
  await adapter.addReaction(thread.id, message.id, emoji.eyes).catch(e => log.debug({ event: 'bot.reaction.failed', emoji: 'eyes', adapter: adapter.name, error: e instanceof Error ? e.message : 'Unknown' }))

  try {
    const context = hasContextProvider(adapter)
      ? await adapter.fetchThreadContext(thread.id).catch((error) => {
        log.warn({
          event: 'bot.context.failed',
          threadId: thread.id,
          error: error instanceof Error ? error.message : 'Unknown',
        })
        return undefined
      })
      : { platform: adapter.name, title: '', body: '', labels: [], state: '', source: adapter.name }

    const response = await generateAIResponse(message.text, context, message.author.userName)

    await thread.post(response)

    await adapter.removeReaction(thread.id, message.id, emoji.eyes).catch(e => log.debug({ event: 'bot.reaction.cleanup_failed', adapter: adapter.name, error: e instanceof Error ? e.message : 'Unknown' }))
    await new Promise(r => setTimeout(r, 500))
    await adapter.addReaction(thread.id, message.id, emoji.thumbs_up).catch(e => log.debug({ event: 'bot.reaction.add_failed', adapter: adapter.name, error: e instanceof Error ? e.message : 'Unknown' }))

    log.info({
      event: 'bot.response.success',
      adapter: adapter.name,
      threadId: thread.id,
      durationMs: Date.now() - startTime,
      responseLength: response.length,
    })
  } catch (error) {
    log.error({
      event: 'bot.response.failed',
      adapter: adapter.name,
      threadId: thread.id,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown',
    })

    try {
      await thread.post(`Sorry, I encountered an error while processing your request. Please try again later.

<details>
<summary>Error details</summary>

\`\`\`
${error instanceof Error ? error.message : 'Unknown error'}
\`\`\`
</details>`)
    } catch (postError) {
      log.error({
        event: 'bot.error_post.failed',
        threadId: thread.id,
        error: postError instanceof Error ? postError.message : 'Unknown',
      })
    }
  }
}

function createBot(): Chat {
  const config = useRuntimeConfig()

  const appName = (config.public.github?.appName as string)?.replace(/^@/, '')
  if (!appName) {
    throw createError({
      message: 'GitHub App name not configured',
      why: 'NUXT_PUBLIC_GITHUB_APP_NAME is not set',
      fix: 'Set NUXT_PUBLIC_GITHUB_APP_NAME to the GitHub App name (e.g. your-bot-name)',
    })
  }

  const botUserName = (config.public.github?.botTrigger as string)?.replace(/^@/, '') || appName

  const adapters: Record<string, Adapter> = {}

  if (config.github.appId && config.github.appPrivateKey && config.github.webhookSecret) {
    adapters.github = new SavoirGitHubAdapter({
      appId: config.github.appId,
      privateKey: config.github.appPrivateKey,
      webhookSecret: config.github.webhookSecret,
      userName: botUserName,
      replyToNewIssues: config.github.replyToNewIssues as boolean,
    })
  }

  if (config.discord.botToken) {
    adapters.discord = createDiscordAdapter({
      botToken: config.discord.botToken,
      publicKey: config.discord.publicKey,
      applicationId: config.discord.applicationId,
      mentionRoleIds: config.discord.mentionRoleIds
        ? (config.discord.mentionRoleIds as string).split(',').filter(Boolean)
        : undefined,
      logger: new ConsoleLogger('info').child('discord'),
    })
  }

  const redisUrl = process.env.REDIS_URL
  const state = redisUrl
    ? createRedisState({ url: redisUrl, logger: new ConsoleLogger('info').child('redis-state') })
    : createMemoryState()

  const bot = new Chat({
    userName: botUserName,
    adapters,
    state,
    logger: 'info',
  })

  bot.onNewMention(async (thread, message) => {
    log.info({
      event: 'bot.mention',
      adapter: thread.adapter.name,
      threadId: thread.id,
      author: message.author.userName,
    })
    await handleBotResponse(thread, message)
    await thread.subscribe()
  })

  bot.onSubscribedMessage(async (thread, message) => {
    if (message.author.isBot) return

    log.info({
      event: 'bot.thread_continuation',
      adapter: thread.adapter.name,
      threadId: thread.id,
      author: message.author.userName,
    })
    await handleBotResponse(thread, message)
  })

  log.info({
    event: 'bot.created',
    userName: botUserName,
    adapters: Object.keys(adapters),
    state: redisUrl ? 'redis' : 'memory',
  })

  return bot
}

export function useBot(): Chat {
  if (!botInstance) botInstance = createBot()
  return botInstance
}

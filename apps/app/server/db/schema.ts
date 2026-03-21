import { pgTable, text, integer, index, uniqueIndex, real, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
// Better Auth manages user/session/account tables automatically via hub:db
import { relations } from 'drizzle-orm'

const timestamps = {
  createdAt: timestamp('created_at').notNull().defaultNow()
}

export const chats = pgTable('chats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title'),
  userId: text('user_id').notNull(),
  mode: text('mode', { enum: ['chat', 'admin'] }).notNull().default('chat'),
  isPublic: boolean('is_public').notNull().default(false),
  shareToken: text('share_token'),
  ...timestamps
}, table => [
  index('chats_user_id_idx').on(table.userId),
  uniqueIndex('chats_share_token_idx').on(table.shareToken)
])

export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(messages),
}))

export const messages = pgTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  parts: jsonb('parts'),
  feedback: text('feedback', { enum: ['positive', 'negative'] }),
  // Stats fields (for assistant messages only)
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms'),
  source: text('source', { enum: ['web', 'api'] }).default('web'),
  ...timestamps
}, table => [index('messages_chat_id_idx').on(table.chatId)])

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id]
  })
}))

export const sources = pgTable('sources', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text('type', { enum: ['github', 'youtube', 'file'] }).notNull(),
  label: text('label').notNull(),
  basePath: text('base_path').default('/docs'),
  repo: text('repo'),
  branch: text('branch'),
  contentPath: text('content_path'),
  outputPath: text('output_path'),
  readmeOnly: boolean('readme_only').default(false),
  channelId: text('channel_id'),
  handle: text('handle'),
  maxVideos: integer('max_videos').default(50),
  ...timestamps,
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, table => [index('sources_type_idx').on(table.type)])

export const agentConfig = pgTable('agent_config', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().default('default'),
  additionalPrompt: text('additional_prompt'),
  responseStyle: text('response_style', { enum: ['concise', 'detailed', 'technical', 'friendly'] }).default('concise'),
  language: text('language').default('en'),
  defaultModel: text('default_model'),
  maxStepsMultiplier: real('max_steps_multiplier').default(1.0),
  temperature: real('temperature').default(0.7),
  searchInstructions: text('search_instructions'),
  citationFormat: text('citation_format', { enum: ['inline', 'footnote', 'none'] }).default('inline'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const apiUsage = pgTable('api_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  source: text('source').notNull(), // 'github-bot', 'sdk', 'discord-bot', etc.
  sourceId: text('source_id'), // Optional: issue number, PR number, etc.
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  durationMs: integer('duration_ms'),
  metadata: jsonb('metadata'), // Additional context (repo, user, etc.)
  ...timestamps
}, table => [
  index('api_usage_source_idx').on(table.source),
  index('api_usage_created_at_idx').on(table.createdAt)
])

export const usageStats = pgTable('usage_stats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: text('date').notNull(), // Format: YYYY-MM-DD
  userId: text('user_id'), // null = global stats
  source: text('source').notNull().default('web'), // 'web', 'github-bot', 'sdk', etc.
  model: text('model').notNull(),
  messageCount: integer('message_count').notNull().default(0),
  totalInputTokens: integer('total_input_tokens').notNull().default(0),
  totalOutputTokens: integer('total_output_tokens').notNull().default(0),
  totalDurationMs: integer('total_duration_ms').notNull().default(0),
  ...timestamps,
}, table => [
  index('usage_stats_date_idx').on(table.date),
  uniqueIndex('usage_stats_date_user_source_model_idx').on(table.date, table.userId, table.source, table.model),
])

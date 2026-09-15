# Knowledge Agent Template Architecture

> Back to [README](../README.md)

This document describes the technical architecture of Knowledge Agent Template, an open-source file-system and knowledge based agent template for building AI agents with up-to-date knowledge access.

## System Overview

Knowledge Agent Template consists of two main components:

1. **Main App** (`apps/app`): A unified [Nuxt](https://nuxt.com) application that provides the chat interface, API, bot integrations, sandbox management, and content synchronization
2. **SDK** (`packages/sdk`): A client library providing [AI SDK](https://ai-sdk.dev)-compatible tools (`bash`, `bash_batch`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User's AI Application                           │
│                    (Discord bot, GitHub bot, Chat app)                   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  import { generateText } from 'ai'                                 │  │
│  │  import { createSavoir } from '@savoir/sdk'                        │  │
│  │                                                                    │  │
│  │  const savoir = createSavoir({ apiKey, apiUrl })                   │  │
│  │  const { text } = await generateText({                             │  │
│  │    model: yourModel,                                               │  │
│  │    tools: savoir.tools  // bash, bash_batch                        │  │
│  │  })                                                                │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ HTTPS (Better Auth session or API key)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            apps/app                                     │
│                       (Unified Nuxt App)                                 │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ /api/sandbox/*  │  │   /api/sync/*   │  │    /api/sources/*       │  │
│  │                 │  │                 │  │                         │  │
│  │ - shell (bash)  │  │ - POST /sync    │  │ - GET /sources          │  │
│  │ - snapshot      │  │ - POST /sync/:s │  │ - POST /sources         │  │
│  │                 │  │                 │  │ - PUT /sources/:id      │  │
│  │                 │  │                 │  │ - DELETE /sources/:id   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│           ▼                    ▼                        ▼               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Sandbox Manager │  │ Vercel Workflow │  │      NuxtHub DB         │  │
│  │                 │  │                 │  │                         │  │
│  │ - Lifecycle     │  │ - Durable exec  │  │ - SQLite (sources,      │  │
│  │ - KV caching    │  │ - Auto retries  │  │   chats, messages,      │  │
│  │ - Command exec  │  │ - Sync sources  │  │   agent_config, stats)  │  │
│  └────────┬────────┘  └────────┬────────┘  │ - KV (sessions, cache)  │  │
│           │                    │            │ - Blob (uploads)        │  │
└───────────┼────────────────────┼────────────┴─────────────────────────┘  │
            │                    │
            ▼                    ▼
     ┌────────────┐       ┌────────────┐
     │   Vercel   │       │   GitHub   │
     │   Sandbox  │◄──────│  Snapshot  │
     │   API      │ clone │   Repo     │
     └────────────┘       └────────────┘
```

## Project Structure

```
knowledge-agent-template/
├── apps/
│   └── app/                  # Unified Nuxt application
│       ├── app/              # Vue app (components, pages, composables)
│       ├── shared/           # Shared types (tool-call, snapshot)
│       ├── server/
│       │   ├── api/          # API routes
│       │   │   ├── sandbox/  # Sandbox endpoints (shell, snapshot)
│       │   │   ├── sync/     # Sync endpoints
│       │   │   ├── sources/  # Sources CRUD
│       │   │   ├── chats/    # Chat CRUD + AI streaming
│       │   │   ├── agent-config/  # Agent configuration
│       │   │   ├── stats/    # Usage statistics
│       │   │   ├── webhooks/ # Bot webhooks (GitHub, Discord)
│       │   │   ├── upload/   # File uploads
│       │   │   ├── messages/ # Message feedback
│       │   │   ├── shared/   # Shared (public) chats
│       │   │   ├── snapshot/ # Snapshot status/sync
│       │   │   ├── admin/    # Admin API keys
│       │   │   └── discord/  # Discord gateway
│       │   ├── db/           # Drizzle schema + migrations
│       │   ├── utils/
│       │   │   ├── sandbox/  # Sandbox manager library
│       │   │   ├── bot/      # Bot framework (adapters, AI, types)
│       │   │   ├── chat/     # Chat helpers + admin tools
│       │   │   ├── router/   # Complexity router (schema, route-question)
│       │   │   ├── prompts/  # System prompts (chat, bot, router, shared)
│       │   │   └── image/    # Image processing
│       │   ├── workflows/    # Vercel Workflows
│       │   │   ├── sync-docs/
│       │   │   ├── create-snapshot/
│       │   │   └── compute-stats/
│       │   └── auth.config.ts  # Better Auth config
│       └── nuxt.config.ts
├── packages/
│   └── sdk/                  # @savoir/sdk
│       └── src/
│           ├── index.ts      # Public exports
│           ├── client.ts     # HTTP client (SavoirClient)
│           └── tools/        # AI SDK tool definitions (bash, bash_batch)
└── docs/                     # Documentation
```

## Component Details

### 1. Sources (Database)

Sources are stored in SQLite via [NuxtHub](https://hub.nuxt.com) and managed through the admin interface. See [Sources](./SOURCES.md) for configuration details.

#### Database Schema

```typescript
export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['github', 'youtube'] }).notNull(),
  label: text('label').notNull(),
  basePath: text('base_path').default('/docs'),

  // GitHub fields
  repo: text('repo'),
  branch: text('branch'),
  contentPath: text('content_path'),
  outputPath: text('output_path'),
  readmeOnly: integer('readme_only', { mode: 'boolean' }),

  // YouTube fields
  channelId: text('channel_id'),
  handle: text('handle'),
  maxVideos: integer('max_videos'),

  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})
```

### 2. SDK (`@savoir/sdk`)

The SDK provides [AI SDK](https://ai-sdk.dev)-compatible tools that communicate with the API via `POST /api/sandbox/shell`.

#### API Design

```typescript
import { createSavoir } from '@savoir/sdk'

const savoir = createSavoir({
  apiUrl: 'https://your-savoir-instance.com',
  apiKey: 'your-api-key', // Better Auth API key
  sessionId: 'optional',  // Reuse sandbox session
  onToolCall: (info) => {}, // Tool execution callback
})

// Returns:
// savoir.tools.bash       - Execute single bash command in sandbox
// savoir.tools.bash_batch - Execute multiple commands in one request
// savoir.client           - Low-level SavoirClient for direct API access
// savoir.getAgentConfig() - Fetch agent configuration
```

### 3. Sandbox System

The sandbox system uses [Vercel Sandbox Snapshots](https://vercel.com/docs/vercel-sandbox/managing#snapshotting) for instant startup without cloning.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Sync Workflow                                    │
│                                                                          │
│  1. Read     ──▶  2. Clone    ──▶  3. Sync     ──▶  4. Git     ──▶     │
│     sources       in sandbox       content          push                │
│     from DB                                                              │
│                                                          │               │
│                                                          ▼               │
│                                                   5. Take snapshot       │
│                                                          │               │
│                                                          ▼               │
│                                                   ┌─────────────┐        │
│                                                   │  Snapshot   │        │
│                                                   │  (7 days)   │        │
│                                                   └──────┬──────┘        │
└──────────────────────────────────────────────────────────┼──────────────┘
                                                           │
                                                           │ instant start
                                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API: POST /api/sandbox/shell                     │
│                                                                          │
│  Request ──▶ Start from snapshot ──▶ Execute bash ──▶ Return results    │
│                  (instant)            (grep/cat/find)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Allowed Commands

Commands are not pattern-matched. `validateShellCommand()` in `@savoir/sdk` parses the line into pipeline stages and argv tokens, checks each stage against a per-command policy, then rebuilds the line with every argument single-quoted. Callers execute that rebuilt line, never the string they were given, so arguments cannot reopen the shell.

Permitted: `find`, `ls`, `tree`, `grep`, `egrep`, `fgrep`, `cat`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`, `tr`, `column`, `echo`, `printf`, `basename`, `dirname`, `realpath`, `file`, `stat`, `du`, `diff`, `comm`, `md5sum`, `sha256sum` — each restricted to its own allowlist of options.

Two rules shape that table:

- **No command that can spawn another.** `awk`, `sed` and `xargs` are excluded, along with interpreters. A name-only allowlist cannot constrain what such a command does with its arguments: `awk 'BEGIN{system("id")}'` is a valid `awk` invocation.
- **No command that can write.** `tee` is excluded, as are writing options of otherwise read-only commands (`sort -o`, `find -delete`, `find -fprintf`). The snapshot is shared between users, so a write primitive is a cross-user integrity issue, not just a local one.

Also refused: redirections, command substitution, subshells, background execution, newlines, environment-assignment prefixes, and any path operand resolving outside `/vercel/sandbox`.

Because arguments are quoted, the shell performs no glob expansion. Pass patterns to the tool that handles them (`grep --include='*.md'`, `find -name '*.md'`) rather than relying on the shell to expand `docs/*.md`. Pipelines and `&&`, `||`, `;` between allowed commands continue to work.

### 4. AI Agent (Router + Model Selection)

Knowledge Agent Template uses a complexity-based router to select the appropriate model and step count for each question.

#### Router Flow

1. User sends a message
2. `routeQuestion()` sends the question to a lightweight model (`google/gemini-2.5-flash-lite`) with the `agentConfigSchema`
3. The router classifies the question by complexity and returns:
   - `complexity`: trivial | simple | moderate | complex
   - `maxSteps`: 4 | 8 | 15 | 25
   - `model`: flash for trivial/simple, sonnet for moderate, opus for complex
   - `reasoning`: brief explanation
4. Admin agent config (from DB) can override the model and multiply max steps
5. The `ToolLoopAgent` runs with the selected model and tools

#### Agent Configuration (Admin)

Stored in the `agent_config` table, configurable via `/admin/agent`:

| Field | Description |
|-------|-------------|
| `additionalPrompt` | Extra instructions appended to system prompt |
| `responseStyle` | concise, detailed, technical, friendly |
| `language` | Response language (e.g. `en`) |
| `defaultModel` | Override the router's model selection |
| `maxStepsMultiplier` | Multiplier for router's maxSteps |
| `temperature` | Model temperature (0-1) |
| `searchInstructions` | Custom search tips for the agent |
| `citationFormat` | inline, footnote, none |

### 5. Content Sync

Content synchronization uses [Vercel Workflow](https://useworkflow.dev) for durable execution with automatic retries.

### 6. Bot Integrations

#### GitHub Bot

- Uses `SavoirGitHubAdapter` via the [Vercel Chat SDK](https://github.com/vercel-labs/chat)
- Responds to mentions in issues and PRs
- Can optionally reply to new issues (`replyToNewIssues` config)
- Webhook: `POST /api/webhooks/github`

#### Discord Bot

- Uses [`@chat-adapter/discord`](https://github.com/vercel-labs/chat)
- Responds to mentions and continues conversations in threads
- Webhook: `POST /api/webhooks/discord`

Both bots use the same AI agent pipeline (router + tools) as the chat interface but with internal sandbox access (no HTTP round-trip). To add a new platform, see [Customization > Add a Bot Adapter](./CUSTOMIZATION.md#4-add-a-bot-adapter).

## API Endpoints

### Authentication

Authentication uses [Better Auth](https://www.better-auth.com) with the [`@onmax/nuxt-better-auth`](https://github.com/onmax/nuxt-better-auth) module:
- **Email/password** and **GitHub OAuth** sign-in (via a [GitHub App](https://docs.github.com/en/apps), scope `user:email`)
- **API keys** via Better Auth's [`apiKey` plugin](https://www.better-auth.com/docs/plugins/api-key) (supports `Authorization: Bearer <key>` and `x-api-key` headers)
- **Admin role** automatically granted to the first registered user; additional admins promoted via the admin panel

### Sandbox

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/sandbox/shell` | User/API key | Execute bash command(s) in sandbox |
| POST | `/api/sandbox/snapshot` | Admin | Create a new snapshot |

### Chats

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/chats` | User | List user's chats |
| POST | `/api/chats` | User | Create a new chat |
| GET | `/api/chats/:id` | User | Get chat with messages |
| POST | `/api/chats/:id` | User | Stream AI response |
| DELETE | `/api/chats/:id` | User | Delete chat |
| PATCH | `/api/chats/:id/share` | User | Toggle sharing |

### Sources

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/sources` | Public | List all sources |
| POST | `/api/sources` | Admin | Create source |
| PUT | `/api/sources/:id` | Admin | Update source |
| DELETE | `/api/sources/:id` | Admin | Delete source |

### Sync

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/sync` | Admin | Sync all sources |
| POST | `/api/sync/:source` | Admin | Sync specific source |

### Snapshot

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/snapshot/status` | Admin | Current vs latest snapshot |
| POST | `/api/snapshot/sync` | Admin | Sync to latest snapshot |

### Agent Config

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/agent-config` | Admin | Get agent configuration |
| PUT | `/api/agent-config` | Admin | Update agent configuration |
| POST | `/api/agent-config/reset` | Admin | Reset to defaults |
| GET | `/api/agent-config/public` | User/API key | Get active config (for SDK/bots) |

### Stats

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/stats` | Admin | Global usage stats |
| GET | `/api/stats/me` | User | User's own stats |
| POST | `/api/stats/usage` | User/API key | Report usage (SDK/bots) |
| POST | `/api/stats/compute` | Admin | Recompute stats |

### Other

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/webhooks/:platform` | Platform | Bot webhooks (GitHub, Discord) |
| PUT | `/api/upload/:chatId` | User | Upload file to chat |
| DELETE | `/api/upload/...pathname` | User | Delete uploaded file |
| PATCH | `/api/messages/:id/feedback` | User | Set feedback (positive/negative) |
| GET | `/api/shared/:token` | Public | Get shared chat (ISR cached) |

## Storage Strategy

### [NuxtHub](https://hub.nuxt.com) SQLite

Used for persistent data (via [Drizzle ORM](https://orm.drizzle.team)):

```
chats          - Chat sessions (id, title, userId, mode, sharing)
messages       - Chat messages (role, parts, feedback, model, tokens)
sources        - Content sources (GitHub repos, YouTube channels)
agent_config   - AI agent configuration (admin-managed)
api_usage      - External API usage tracking (bots, SDK)
usage_stats    - Aggregated daily usage statistics
user/session/account - Better Auth managed tables
```

### [NuxtHub KV](https://hub.nuxt.com/docs/features/kv)

Used for caching and session management:

```
snapshot:current        - Current snapshot ID and creation timestamp
session:{sessionId}     - Active sandbox sessions
snapshot:status-cache   - Snapshot status cache (1 min TTL)
sources:last-sync       - Last sync timestamp
agent-config:active     - Cached active agent config (60s TTL)
```

### [NuxtHub Blob](https://hub.nuxt.com/docs/features/blob)

Used for file uploads (images, PDFs, CSVs attached to chats).

### Snapshot Repository

```
{GITHUB_SNAPSHOT_REPO}/
├── docs/
│   ├── my-framework/
│   │   ├── getting-started/
│   │   └── composables/
│   ├── my-library/
│   └── ...
└── youtube/
    └── my-channel/
```

## Environment Variables

See [ENVIRONMENT.md](./ENVIRONMENT.md) for the complete list.

## Security

### Authentication

- Better Auth handles user sessions, OAuth, and API keys
- API keys support both `Authorization: Bearer <key>` and `x-api-key` headers
- Admin role is automatically assigned to the first registered user

### Sandbox Isolation

- Each sandbox runs in an isolated Vercel environment
- Sandboxes are pooled and shared between users, so treat their filesystem as shared state: the command policy is what keeps one user's agent from altering what another user's agent reads
- The filesystem is writable at the OS level; it is the command policy, not a mount option, that keeps access read-only
- Commands are parsed into argv and checked against a per-command policy, then re-quoted before execution (see [Allowed Commands](#allowed-commands))
- No command in the policy can write a file or spawn another process
- The same policy covers the HTTP endpoint and the bot adapters, whose input derives from untrusted issue and message bodies
- `.git` is removed before every snapshot is taken: it carries the clone and push credentials, and anything inside a snapshot is readable by every agent that shares it

<img src="./assets/banner.jpg" width="100%" alt="Knowledge Agent Template banner" />

<p align="center">
  <br>
  <b>Knowledge Agent Template</b>
  <br>
  <i>Open source file-system and knowledge based agent template.</i>
  <br>
  <br>
</p>

<p align="center">
  <b>Template.</b> Fork it, customize it, and deploy your own file-system based AI agent.
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fknowledge-agent-template&env=BETTER_AUTH_SECRET,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET&envDescription=BETTER_AUTH_SECRET%3A%20run%20openssl%20rand%20-hex%2032%20%7C%20GITHUB_CLIENT_ID%20%2B%20SECRET%3A%20create%20a%20GitHub%20App%20at%20github.com%2Fsettings%2Fapps%2Fnew&envLink=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fknowledge-agent-template%2Fblob%2Fmain%2Fdocs%2FENVIRONMENT.md&project-name=knowledge-agent&repository-name=knowledge-agent"><img src="https://vercel.com/button" alt="Deploy with Vercel" /></a>
</p>

---

Open source file-system and knowledge based agent template. Build AI agents that stay up to date with your knowledge base — grep, find, and cat across your sources, no embeddings, no vector DB. Plug any source (GitHub repos, YouTube transcripts, custom APIs) and deploy as a chat app, a GitHub bot, a Discord bot, or all at once.

## Features

### File-Based Search — No Embeddings Needed

No vector database. No chunking pipeline. No embedding model. Agents use `grep`, `find`, and `cat` inside [isolated sandboxes](./docs/ARCHITECTURE.md#3-sandbox-system) to search across all your [sources](./docs/SOURCES.md). Results are deterministic, explainable, and instant. Zero infrastructure overhead.

### Multi-Platform Bots — One Agent, Everywhere

Write your agent once, deploy it on the web chat, GitHub Issues, Discord - and soon Slack, Linear, and more. Powered by pluggable adapters via the [Chat SDK](https://github.com/vercel-labs/chat). Adding a new platform is [a single adapter file](./docs/CUSTOMIZATION.md#4-add-a-bot-adapter).

### Built-in Admin Panel

Full admin interface out of the box: usage stats, error logs, user management, source configuration, and content sync controls. No need for external dashboards or third-party monitoring.

### AI-Powered Admin Agent

Ask your app about itself. "What errors happened in the last 24 hours?", "Show token usage by model", "Which endpoints are slowest?" — the admin agent has access to internal tools like `query_stats`, `query_errors`, `run_sql`, and `chart` to answer operational questions in natural language.

### Smart Complexity Router

Every incoming question is classified by complexity (trivial → complex) and [routed to the right model](./docs/ARCHITECTURE.md#4-ai-agent-router--model-selection). Simple questions go to fast, cheap models. Hard questions go to powerful ones. Cost optimization happens automatically, no manual rules to maintain.

### Real-Time Tool Visualization

The chat UI shows what the agent is doing in real time: which files it's reading, which commands it's running, and how long each step takes. No black box.

### Shareable Conversations

Share any conversation with a single click. Generates a public read-only link with full metadata — author, title, and the complete exchange.

### Shared Sandbox Pool

Sandboxes are pooled across users and conversations. When a chat starts, it connects to an already-running sandbox instead of creating a new one — startup in under 100ms. If none is available, a pre-built snapshot spins one up in 1–3s. Because a sandbox is shared, agents reach it through a parsed command policy that permits only read-only commands — nothing that can write a file or spawn a process — so multiple agents search the same up-to-date content without duplicating resources or affecting each other.

## [Architecture](./docs/ARCHITECTURE.md)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your AI Application                      │
│                     (Discord bot, GitHub bot, etc.)             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                          @savoir/sdk                            │
│              AI SDK compatible tools (bash, bash_batch)         │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ API calls
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         apps/app                                │
│                    (Unified Nuxt Application)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │   Sandbox   │  │   Content    │  │   Vercel Workflows     │  │
│  │   Manager   │  │     Sync     │  │   (scheduled sync)     │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────────────────┘  │
└─────────┼────────────────┼──────────────────────────────────────┘
          │                │
          ▼                ▼
   ┌────────────┐   ┌─────────────┐
   │   Vercel   │   │   GitHub    │
   │   Sandbox  │   │  Snapshot   │
   │            │   │    Repo     │
   └────────────┘   └─────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| [`@savoir/sdk`](./packages/sdk) | [AI SDK](https://ai-sdk.dev) compatible tools for agents |
| [`@savoir/agent`](./packages/agent) | Agent core: router, prompts, tools, types |
| [`apps/app`](./apps/app) | Unified [Nuxt](https://nuxt.com) app (chat UI + API + bots) |

## Quick Start

### Using the SDK

```typescript
import { generateText } from 'ai'
import { createSavoir } from '@savoir/sdk'

const savoir = createSavoir({
  apiUrl: process.env.SAVOIR_API_URL!,
  apiKey: process.env.SAVOIR_API_KEY,
})

const { text } = await generateText({
  model: yourModel, // any AI SDK compatible model
  tools: savoir.tools, // bash and bash_batch tools
  maxSteps: 10,
  prompt: 'How do I configure authentication?',
})

console.log(text)
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fknowledge-agent-template&env=BETTER_AUTH_SECRET,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET&envDescription=BETTER_AUTH_SECRET%3A%20run%20openssl%20rand%20-hex%2032%20%7C%20GITHUB_CLIENT_ID%20%2B%20SECRET%3A%20create%20a%20GitHub%20App%20at%20github.com%2Fsettings%2Fapps%2Fnew&envLink=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fknowledge-agent-template%2Fblob%2Fmain%2Fdocs%2FENVIRONMENT.md&project-name=knowledge-agent&repository-name=knowledge-agent)

### Self-hosting

```bash
# Clone the repository
git clone https://github.com/vercel-labs/knowledge-agent-template.git
cd knowledge-agent-template

# Install dependencies
bun install

# Configure environment variables
cp apps/app/.env.example apps/app/.env
# Edit .env with your configuration

# Start the app
bun run dev
```

**Required environment variables:**

```bash
# Authentication
BETTER_AUTH_SECRET=your-secret        # Secret for signing sessions/tokens
GITHUB_CLIENT_ID=...                  # GitHub OAuth app client ID
GITHUB_CLIENT_SECRET=...              # GitHub OAuth app client secret

# AI (optional — only needed for local dev, Vercel uses OIDC automatically)
# AI_GATEWAY_API_KEY=...              # Vercel AI Gateway API key

# Sandbox
# NUXT_GITHUB_SNAPSHOT_REPO=org/repo  # Optional default (can be set from admin sandbox UI)
# NUXT_GITHUB_TOKEN=ghp_...           # Optional fallback override (GitHub App is the default path)

```

See [ENVIRONMENT.md](./docs/ENVIRONMENT.md) for the full list of environment variables.

## Customization

Knowledge Agent Template is designed as a **reusable template**. See the [Customization Guide](./docs/CUSTOMIZATION.md) for how to:

- Rename your instance (name, icon, description)
- Add [content sources](./docs/SOURCES.md) (GitHub repos, YouTube channels, custom)
- Add custom AI tools
- Add bot adapters (Slack, Linear, etc.)
- Customize AI prompts
- Theme the UI
- Deploy to production

**AI-assisted customization:** The project includes local skills in [`.agents/skills/`](./.agents/skills) (add-tool, add-source, add-bot-adapter, rename-project). You can delegate these tasks to an AI agent — e.g. *"Follow the rename-project skill to rename this to MyDocs"* — instead of doing them manually.

## Configuration

Sources are managed through the **admin interface** at `/admin`. You can add GitHub repositories and YouTube channels as knowledge sources, then trigger a sync from the UI.

Sources can also be listed programmatically via the SDK (`savoir.client.getSources()`).

See [SOURCES.md](./docs/SOURCES.md) for detailed source configuration options.

## How It Works

> For the full technical deep-dive, see [Architecture](./docs/ARCHITECTURE.md).

1. **Sources in Database**: Sources are stored in SQLite via [NuxtHub](https://hub.nuxt.com), managed through the admin interface
2. **Content Aggregation**: Sources (GitHub repos, YouTube transcripts, custom APIs, etc.) are synced to a snapshot repository via [Vercel Workflow](https://useworkflow.dev)
3. **Sandbox Creation**: When an agent needs to search, the API creates/recovers a [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) with the snapshot repo cloned
4. **File-based Search**: The SDK `bash` and `bash_batch` tools execute grep/find/cat commands in the sandbox to search and read content
5. **AI Integration**: Tools are compatible with the [Vercel AI SDK](https://ai-sdk.dev) for seamless integration with any LLM

## Bots

Knowledge Agent Template includes built-in bot integrations powered by the [Vercel Chat SDK](https://github.com/vercel-labs/chat):

- **GitHub Bot**: Responds to mentions in GitHub issues and PRs. Uses a [GitHub App](https://docs.github.com/en/apps) for authentication and webhooks.
- **Discord Bot**: Responds to mentions and continues conversations in threads. Uses the [Discord API](https://discord.com/developers/docs).

Both bots use the same AI agent and knowledge base as the chat interface. Want to add your own? See [Adding a Bot Adapter](./docs/CUSTOMIZATION.md#4-add-a-bot-adapter).

## Development

```bash
# Install dependencies
bun install

# Start the app in dev mode
bun run dev

# Build all packages
bun run build

# Run tests
bun run test

# Lint and fix
bun run lint:fix
```

## Built With

- [Nuxt](https://nuxt.com) - Full-stack Vue framework
- [Nuxt UI](https://ui.nuxt.com) - UI component library
- [NuxtHub](https://hub.nuxt.com) - Database, KV, and blob storage
- [Vercel AI SDK](https://ai-sdk.dev) - AI model integration and tool system
- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) - Isolated execution environment
- [Vercel Workflow](https://useworkflow.dev) - Durable workflow execution
- [Better Auth](https://www.better-auth.com) - Authentication framework
- [Drizzle ORM](https://orm.drizzle.team) - Type-safe database queries
- [Vercel Chat SDK](https://github.com/vercel-labs/chat) - Bot framework for GitHub and Discord

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get involved. To report a security vulnerability, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)

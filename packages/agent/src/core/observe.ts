import { AsyncLocalStorage } from 'node:async_hooks'

type WrapFn = (model: string) => any

export interface GatewayMetadata {
  userId?: string
  tags?: string[]
}

interface AIContextStore {
  wrap: WrapFn
  userId?: string
  tags?: string[]
}

const aiContext = new AsyncLocalStorage<AIContextStore>()

export function enterAIContext(wrapFn: WrapFn, metadata?: GatewayMetadata): void {
  aiContext.enterWith({ wrap: wrapFn, userId: metadata?.userId, tags: metadata?.tags })
}

export function setAIGatewayMetadata(metadata: GatewayMetadata): void {
  const ctx = aiContext.getStore()
  if (ctx) {
    if (metadata.userId !== undefined) ctx.userId = metadata.userId
    if (metadata.tags !== undefined) ctx.tags = metadata.tags
  }
}

export function resolveModelWrapper(): WrapFn {
  return aiContext.getStore()?.wrap ?? ((model: string) => model)
}

export function resolveGatewayMetadata(): GatewayMetadata {
  const ctx = aiContext.getStore()
  return { userId: ctx?.userId, tags: ctx?.tags }
}

import { AsyncLocalStorage } from 'node:async_hooks'

type WrapFn = (model: string) => any

const aiContext = new AsyncLocalStorage<WrapFn>()

export function enterAIContext(wrapFn: WrapFn): void {
  aiContext.enterWith(wrapFn)
}

export function resolveModelWrapper(): WrapFn {
  return aiContext.getStore() ?? ((model: string) => model)
}

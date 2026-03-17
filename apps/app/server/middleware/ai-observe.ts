import { enterAIContext } from '@savoir/agent'

export default defineEventHandler(() => {
  enterAIContext(useAI().wrap)
})

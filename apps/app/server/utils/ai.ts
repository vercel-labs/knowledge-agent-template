import { useLogger } from 'evlog'
import { createAILogger } from 'evlog/ai'

export function useAI() {
  const event = useEvent()
  if (!event.context._aiLogger) {
    event.context._aiLogger = createAILogger(useLogger(event))
  }
  return event.context._aiLogger
}

<script setup lang="ts">
import { useTimeoutFn } from '@vueuse/core'

interface SourceData {
  id: string
  type: 'github' | 'youtube' | 'file'
  label: string
  repo: string | null
  branch: string | null
  contentPath: string | null
  outputPath: string | null
  readmeOnly: boolean | null
  channelId: string | null
  handle: string | null
  maxVideos: number | null
}

const props = defineProps<{
  source: SourceData
}>()

const emit = defineEmits<{
  edit: []
  delete: []
  sync: []
}>()

const isSyncing = ref(false)

const { start: resetSyncState } = useTimeoutFn(() => {
  isSyncing.value = false
}, 2000, { immediate: false })

function handleSync() {
  isSyncing.value = true
  emit('sync')
  resetSyncState()
}

const sourceUrl = computed(() => {
  if (props.source.type === 'github' && props.source.repo) {
    return `https://github.com/${props.source.repo}`
  }
  if (props.source.type === 'youtube') {
    if (props.source.handle) return `https://youtube.com/${props.source.handle}`
    if (props.source.channelId) return `https://youtube.com/channel/${props.source.channelId}`
  }
  return null
})

const sourceIdentifier = computed(() => {
  if (props.source.type === 'github') return props.source.repo
  if (props.source.type === 'file') return 'Uploaded files'
  return props.source.handle || props.source.channelId
})
</script>

<template>
  <div class="py-3.5 first:pt-3 last:pb-3">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2">
          <h3 class="font-medium text-[15px] text-highlighted leading-tight">
            {{ source.label }}
          </h3>
          <span class="text-muted/50">·</span>
          <a
            v-if="sourceUrl"
            :href="sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[13px] text-muted hover:text-highlighted transition-colors truncate"
          >
            {{ sourceIdentifier }}
          </a>
          <span v-else class="text-[13px] text-muted truncate">
            {{ sourceIdentifier }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 mt-2">
          <template v-if="source.type === 'github'">
            <div
              v-if="source.branch"
              class="inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11px] font-medium text-muted bg-muted"
            >
              <UIcon name="i-lucide-git-branch" class="size-3 opacity-60" />
              {{ source.branch }}
            </div>
            <div
              v-if="source.contentPath"
              class="inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11px] font-medium text-muted bg-muted"
            >
              <UIcon name="i-lucide-folder" class="size-3 opacity-60" />
              {{ source.contentPath }}
            </div>
            <UTooltip v-if="source.outputPath" text="Output folder in snapshot" :delay-open="200">
              <div class="inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11px] font-medium text-muted bg-muted">
                <UIcon name="i-lucide-package" class="size-3 opacity-60" />
                {{ source.outputPath }}
              </div>
            </UTooltip>
            <div
              v-if="source.readmeOnly"
              class="inline-flex items-center h-[22px] px-2 rounded-md text-[11px] font-medium text-warning bg-warning/10"
            >
              README only
            </div>
          </template>
          <template v-else-if="source.type === 'youtube'">
            <div
              v-if="source.maxVideos"
              class="inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11px] font-medium text-muted bg-muted"
            >
              <UIcon name="i-lucide-video" class="size-3 opacity-60" />
              {{ source.maxVideos }} videos max
            </div>
          </template>
          <template v-else-if="source.type === 'file'">
            <UTooltip v-if="source.outputPath" text="Output folder in snapshot" :delay-open="200">
              <div class="inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-[11px] font-medium text-muted bg-muted">
                <UIcon name="i-lucide-folder-output" class="size-3 opacity-60" />
                {{ source.outputPath }}
              </div>
            </UTooltip>
          </template>
        </div>
      </div>

      <div class="flex items-center shrink-0 -mr-1">
        <UTooltip text="Sync now" :delay-open="300" :ui="{ content: 'px-2 py-1 text-xs' }">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="isSyncing"
            @click="handleSync"
          />
        </UTooltip>
        <UTooltip text="Edit" :delay-open="300" :ui="{ content: 'px-2 py-1 text-xs' }">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('edit')"
          />
        </UTooltip>
        <UTooltip text="Delete" :delay-open="300" :ui="{ content: 'px-2 py-1 text-xs' }">
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            @click="emit('delete')"
          />
        </UTooltip>
      </div>
    </div>
  </div>
</template>

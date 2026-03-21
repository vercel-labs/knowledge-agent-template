<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { LazyModalConfirm } from '#components'

useSeoMeta({ title: 'Sources - Admin' })

const SYNC_REMINDER_DAYS = 7
const SYNC_REMINDER_MS = SYNC_REMINDER_DAYS * 24 * 60 * 60 * 1000
const ITEMS_PER_PAGE = 5

interface SerializedSource {
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
  createdAt: string
  updatedAt: string
}

const toast = useToast()
const overlay = useOverlay()
const { showError } = useErrorToast()

const { data: sources, refresh, status } = useLazyFetch('/api/sources')

const cachedSources = useState('admin-sources', () => sources.value)
if (!sources.value && cachedSources.value) {
  sources.value = cachedSources.value
}
watch(sources, (v) => {
  if (v) cachedSources.value = v 
})

const editingSource = ref<SerializedSource | null>(null)
const showNewFileModal = ref(false)
const isSyncingAll = ref(false)

const searchQuery = ref('')
const githubPage = ref(1)
const youtubePage = ref(1)
const filePage = ref(1)

const deleteModal = overlay.create(LazyModalConfirm)

const needsSync = computed(() => {
  if (!sources.value?.lastSyncAt) return true
  return Date.now() - sources.value.lastSyncAt > SYNC_REMINDER_MS
})

const lastSyncAgo = computed(() => {
  if (!sources.value?.lastSyncAt) return null
  return formatDistanceToNow(sources.value.lastSyncAt, { addSuffix: true })
})

function filterSources(sourceList: SerializedSource[] | undefined) {
  if (!sourceList) return []
  if (!searchQuery.value.trim()) return sourceList

  const query = searchQuery.value.toLowerCase().trim()
  return sourceList.filter((source) => {
    const label = source.label.toLowerCase()
    const repo = source.repo?.toLowerCase() || ''
    const handle = source.handle?.toLowerCase() || ''
    const channelId = source.channelId?.toLowerCase() || ''
    return label.includes(query) || repo.includes(query) || handle.includes(query) || channelId.includes(query)
  })
}

const filteredGithubSources = computed(() => filterSources(sources.value?.github?.sources as SerializedSource[] | undefined))
const filteredYoutubeSources = computed(() => filterSources(sources.value?.youtube?.sources as SerializedSource[] | undefined))
const filteredFileSources = computed(() => filterSources(sources.value?.file?.sources as SerializedSource[] | undefined))

const paginatedGithubSources = computed(() => {
  const start = (githubPage.value - 1) * ITEMS_PER_PAGE
  return filteredGithubSources.value.slice(start, start + ITEMS_PER_PAGE)
})

const paginatedYoutubeSources = computed(() => {
  const start = (youtubePage.value - 1) * ITEMS_PER_PAGE
  return filteredYoutubeSources.value.slice(start, start + ITEMS_PER_PAGE)
})

const paginatedFileSources = computed(() => {
  const start = (filePage.value - 1) * ITEMS_PER_PAGE
  return filteredFileSources.value.slice(start, start + ITEMS_PER_PAGE)
})

watch(searchQuery, () => {
  githubPage.value = 1
  youtubePage.value = 1
  filePage.value = 1
})

async function deleteSource(source: SerializedSource) {
  const confirmed = await deleteModal.open({
    title: 'Delete Source',
    description: `Are you sure you want to delete "${source.label}"?`,
  })

  if (!confirmed) return

  const previousData = sources.value
  if (sources.value) {
    sources.value = {
      ...sources.value,
      total: sources.value.total - 1,
      github: {
        ...sources.value.github,
        sources: sources.value.github.sources.filter(s => s.id !== source.id),
        count: source.type === 'github' ? sources.value.github.count - 1 : sources.value.github.count,
      },
      youtube: {
        ...sources.value.youtube,
        sources: sources.value.youtube.sources.filter(s => s.id !== source.id),
        count: source.type === 'youtube' ? sources.value.youtube.count - 1 : sources.value.youtube.count,
      },
      file: {
        ...sources.value.file,
        sources: sources.value.file.sources.filter(s => s.id !== source.id),
        count: source.type === 'file' ? sources.value.file.count - 1 : sources.value.file.count,
      },
    }
  }

  try {
    await $fetch(`/api/sources/${source.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Source deleted',
      icon: 'i-lucide-check',
    })
  } catch (e) {
    sources.value = previousData
    showError(e, { fallback: 'Failed to delete source' })
  }
}

async function triggerSync(sourceId?: string) {
  try {
    if (!sourceId) {
      isSyncingAll.value = true
    }
    const endpoint = sourceId ? `/api/sync/${sourceId}` : '/api/sync'
    await $fetch(endpoint, { method: 'POST' })
    toast.add({
      title: sourceId ? 'Sync started' : 'Full sync started',
      description: 'The sync workflow has been triggered.',
      icon: 'i-lucide-check',
    })
    await refresh()
  } catch (e) {
    showError(e, { fallback: 'Failed to start sync' })
  } finally {
    isSyncingAll.value = false
  }
}

function handleSaved() {
  editingSource.value = null
  showNewFileModal.value = false
  refresh()
}

const hasSources = computed(() => (sources.value?.github?.count || 0) + (sources.value?.youtube?.count || 0) + (sources.value?.file?.count || 0) > 0)
</script>

<template>
  <div class="px-6 py-8 max-w-2xl mx-auto w-full">
    <header class="mb-8">
      <h1 class="text-lg font-medium text-highlighted mb-1 font-pixel tracking-wide">
        Sources
      </h1>
      <p class="text-sm text-muted max-w-lg">
        Sources are knowledge bases that give the AI context. Connect GitHub repositories, YouTube channels, or upload files directly.
      </p>
    </header>

    <div v-if="status === 'pending' && !sources" class="space-y-4">
      <div class="flex items-center gap-2 mb-6">
        <USkeleton class="h-7 w-20 rounded-md" />
        <USkeleton class="h-7 w-24 rounded-md" />
      </div>
      <div class="rounded-lg border border-default divide-y divide-default overflow-hidden">
        <div v-for="i in 3" :key="i" class="px-4 py-4 flex items-center gap-3">
          <USkeleton class="size-8 rounded-md shrink-0" />
          <div class="flex-1">
            <USkeleton class="h-4 w-40 mb-2" />
            <USkeleton class="h-3 w-56" />
          </div>
        </div>
      </div>
    </div>

    <template v-else>
      <div
        v-if="hasSources && needsSync"
        class="mb-6 rounded-lg border border-warning/20 bg-warning/10 p-4"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-alert-triangle" class="size-5 text-warning" />
            <div>
              <p class="text-sm font-medium text-highlighted">
                Sources need syncing
              </p>
              <p class="text-xs text-muted">
                <template v-if="lastSyncAgo">
                  Last synced {{ lastSyncAgo }}
                </template>
                <template v-else>
                  Never synced
                </template>
              </p>
            </div>
          </div>
          <UButton
            size="xs"
            color="warning"
            :loading="isSyncingAll"
            @click="triggerSync()"
          >
            Sync now
          </UButton>
        </div>
      </div>

      <div
        v-if="hasSources"
        class="flex flex-col gap-4 mb-6"
      >
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-plus"
            size="xs"
            to="/admin/new"
          >
            Add Source
          </UButton>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="isSyncingAll"
            @click="triggerSync()"
          >
            Sync All
          </UButton>
          <UButton
            v-if="sources?.snapshotRepoUrl"
            icon="i-simple-icons-github"
            color="neutral"
            variant="ghost"
            size="xs"
            :to="sources.snapshotRepoUrl"
            target="_blank"
          >
            Open Repository
          </UButton>
          <span v-if="lastSyncAgo && !needsSync" class="text-xs text-muted ml-2">
            Last synced {{ lastSyncAgo }}
          </span>
        </div>

        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Filter sources..."
          size="sm"
          class="max-w-xs"
          :ui="{ root: 'w-full' }"
        />
      </div>

      <div
        v-if="!hasSources"
        class="flex flex-col items-center py-16 border border-dashed border-default rounded-lg"
      >
        <div class="size-10 rounded-lg bg-elevated flex items-center justify-center mb-4">
          <UIcon name="i-custom-docs" class="size-5 text-muted" aria-hidden="true" />
        </div>
        <p class="text-sm font-medium text-highlighted mb-1">
          No sources yet
        </p>
        <p class="text-xs text-muted mb-4 text-center max-w-xs">
          Add your first source to give the AI knowledge about your favorite tools
        </p>
        <UButton
          icon="i-lucide-plus"
          size="xs"
          to="/admin/new"
        >
          Add your first source
        </UButton>
      </div>

      <div v-else class="space-y-8">
        <section>
          <div class="flex items-center justify-between mb-3">
            <p class="text-[10px] text-muted font-pixel tracking-wide uppercase">
              GitHub Repositories
            </p>
            <p v-if="filteredGithubSources.length" class="text-xs text-muted">
              {{ filteredGithubSources.length }} {{ filteredGithubSources.length === 1 ? 'repository' : 'repositories' }}
            </p>
          </div>

          <template v-if="filteredGithubSources.length">
            <div class="rounded-lg border border-default divide-y divide-default overflow-hidden">
              <div v-for="source in paginatedGithubSources" :key="source.id" class="px-4 hover:bg-elevated/50 transition-colors">
                <SourceCard
                  :source
                  @edit="editingSource = source"
                  @delete="deleteSource(source)"
                  @sync="triggerSync(source.id)"
                />
              </div>
            </div>
            <div v-if="filteredGithubSources.length > ITEMS_PER_PAGE" class="flex justify-center mt-4">
              <UPagination
                v-model:page="githubPage"
                :items-per-page="ITEMS_PER_PAGE"
                :total="filteredGithubSources.length"
                :sibling-count="1"
                show-edges
                size="sm"
              />
            </div>
          </template>
          <template v-else-if="sources?.github?.count && searchQuery">
            <div class="py-8 text-center border border-dashed border-default rounded-lg">
              <p class="text-sm text-muted">
                No GitHub repositories match your search
              </p>
            </div>
          </template>
          <UButton
            v-else
            color="neutral"
            variant="ghost"
            class="w-full h-14 border border-dashed border-default hover:border-muted"
            to="/admin/new?type=github"
            icon="i-lucide-plus"
          >
            Add a GitHub repository
          </UButton>
        </section>

        <section v-if="sources?.youtubeEnabled">
          <div class="flex items-center justify-between mb-3">
            <p class="text-[10px] text-muted font-pixel tracking-wide uppercase">
              YouTube Channels
            </p>
            <p v-if="filteredYoutubeSources.length" class="text-xs text-muted">
              {{ filteredYoutubeSources.length }} {{ filteredYoutubeSources.length === 1 ? 'channel' : 'channels' }}
            </p>
          </div>

          <template v-if="filteredYoutubeSources.length">
            <div class="rounded-lg border border-default divide-y divide-default overflow-hidden">
              <div v-for="source in paginatedYoutubeSources" :key="source.id" class="px-4 hover:bg-elevated/50 transition-colors">
                <SourceCard
                  :source
                  @edit="editingSource = source"
                  @delete="deleteSource(source)"
                  @sync="triggerSync(source.id)"
                />
              </div>
            </div>
            <div v-if="filteredYoutubeSources.length > ITEMS_PER_PAGE" class="flex justify-center mt-4">
              <UPagination
                v-model:page="youtubePage"
                :items-per-page="ITEMS_PER_PAGE"
                :total="filteredYoutubeSources.length"
                :sibling-count="1"
                show-edges
                size="sm"
              />
            </div>
          </template>
          <template v-else-if="sources?.youtube?.count && searchQuery">
            <div class="py-8 text-center border border-dashed border-default rounded-lg">
              <p class="text-sm text-muted">
                No YouTube channels match your search
              </p>
            </div>
          </template>
          <UButton
            v-else-if="sources?.youtubeEnabled"
            color="neutral"
            variant="ghost"
            class="w-full h-14 border border-dashed border-default hover:border-muted"
            to="/admin/new?type=youtube"
            icon="i-lucide-plus"
          >
            Add a YouTube channel
          </UButton>
        </section>

        <section>
          <div class="flex items-center justify-between mb-3">
            <p class="text-[10px] text-muted font-pixel tracking-wide uppercase">
              Uploaded Files
            </p>
            <p v-if="filteredFileSources.length" class="text-xs text-muted">
              {{ filteredFileSources.length }} {{ filteredFileSources.length === 1 ? 'source' : 'sources' }}
            </p>
          </div>

          <template v-if="filteredFileSources.length">
            <div class="rounded-lg border border-default divide-y divide-default overflow-hidden">
              <div v-for="source in paginatedFileSources" :key="source.id" class="px-4 hover:bg-elevated/50 transition-colors">
                <SourceCard
                  :source
                  @edit="editingSource = source"
                  @delete="deleteSource(source)"
                  @sync="triggerSync(source.id)"
                />
              </div>
            </div>
            <div v-if="filteredFileSources.length > ITEMS_PER_PAGE" class="flex justify-center mt-4">
              <UPagination
                v-model:page="filePage"
                :items-per-page="ITEMS_PER_PAGE"
                :total="filteredFileSources.length"
                :sibling-count="1"
                show-edges
                size="sm"
              />
            </div>
          </template>
          <template v-else-if="sources?.file?.count && searchQuery">
            <div class="py-8 text-center border border-dashed border-default rounded-lg">
              <p class="text-sm text-muted">
                No file sources match your search
              </p>
            </div>
          </template>
          <UButton
            v-else
            color="neutral"
            variant="ghost"
            class="w-full h-14 border border-dashed border-default hover:border-muted"
            icon="i-lucide-plus"
            @click="showNewFileModal = true"
          >
            Upload files
          </UButton>
        </section>
      </div>

      <SourceModal
        v-if="editingSource"
        :source="editingSource"
        @close="editingSource = null"
        @saved="handleSaved"
      />

      <SourceModal
        v-if="showNewFileModal"
        default-type="file"
        @close="showNewFileModal = false"
        @saved="handleSaved"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
type SourceType = 'github' | 'youtube' | 'file'

const ALLOWED_EXTENSIONS = ['.md', '.mdx', '.txt', '.yml', '.yaml', '.json']

interface SourceData {
  id: string
  type: SourceType
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

interface PendingFile {
  file: File
  id: string
}

const props = defineProps<{
  source?: SourceData | null
  defaultType?: SourceType
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const toast = useToast()
const { showError } = useErrorToast()
const isSubmitting = ref(false)

const isEditing = computed(() => !!props.source)

const form = ref({
  type: (props.source?.type || props.defaultType || 'github') as SourceType,
  label: props.source?.label || '',
  repo: props.source?.repo || '',
  branch: props.source?.branch || 'main',
  contentPath: props.source?.contentPath || '',
  outputPath: props.source?.outputPath || '',
  basePath: (() => {
    const type = props.source?.type || props.defaultType || 'github'
    if (type === 'youtube') return '/youtube'
    if (type === 'file') return '/files'
    return '/docs'
  })(),
  readmeOnly: props.source?.readmeOnly || false,
  channelId: props.source?.channelId || '',
  handle: props.source?.handle || '',
  maxVideos: props.source?.maxVideos || 50,
})

const typeOptions = [
  { label: 'GitHub Repository', value: 'github', icon: 'i-simple-icons-github' },
  { label: 'YouTube Channel', value: 'youtube', icon: 'i-simple-icons-youtube' },
  { label: 'File Upload', value: 'file', icon: 'i-lucide-file-text' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const outputFolderFromLabel = computed(() => slugify(form.value.label))

const effectiveOutputPath = computed(() => {
  return form.value.outputPath || outputFolderFromLabel.value
})

const defaultBasePath = computed(() => {
  if (form.value.type === 'youtube') return '/youtube'
  if (form.value.type === 'file') return '/files'
  return '/docs'
})

const snapshotPreviewPath = computed(() => {
  const base = form.value.basePath || defaultBasePath.value
  const folder = effectiveOutputPath.value || 'folder-name'
  return `${base}/${folder}/`
})

watch(() => form.value.type, (newType) => {
  if (newType === 'youtube') form.value.basePath = '/youtube'
  else if (newType === 'file') form.value.basePath = '/files'
  else form.value.basePath = '/docs'
})

// File upload state
const pendingFiles = ref<PendingFile[]>([])
const isDraggingOver = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

function isAllowedFile(filename: string): boolean {
  return ALLOWED_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext))
}

function addFiles(fileList: FileList | File[]) {
  const newFiles = Array.from(fileList).filter((file) => {
    if (!isAllowedFile(file.name)) {
      toast.add({ title: `${file.name} skipped`, description: `Only ${ALLOWED_EXTENSIONS.join(', ')} files are accepted`, icon: 'i-lucide-alert-triangle', color: 'warning' })
      return false
    }
    if (pendingFiles.value.some(pf => pf.file.name === file.name)) {
      return false
    }
    return true
  })

  pendingFiles.value = [
    ...pendingFiles.value,
    ...newFiles.map(file => ({ file, id: crypto.randomUUID() })),
  ]
}

function removePendingFile(id: string) {
  pendingFiles.value = pendingFiles.value.filter(f => f.id !== id)
}

function onDrop(e: DragEvent) {
  isDraggingOver.value = false
  if (e.dataTransfer?.files) {
    addFiles(e.dataTransfer.files)
  }
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    addFiles(input.files)
    input.value = ''
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function uploadFilesToSource(sourceId: string) {
  if (pendingFiles.value.length === 0) return

  const formData = new FormData()
  for (const pf of pendingFiles.value) {
    formData.append('files', pf.file)
  }

  await $fetch(`/api/sources/${sourceId}/files`, {
    method: 'PUT',
    body: formData,
  })
}

async function save() {
  isSubmitting.value = true
  try {
    const url = isEditing.value ? `/api/sources/${props.source!.id}` : '/api/sources'
    const method = isEditing.value ? 'PUT' : 'POST'

    const body = {
      ...form.value,
      outputPath: form.value.outputPath || outputFolderFromLabel.value,
    }

    const result = await $fetch<{ id: string }>(url, { method, body })

    if (form.value.type === 'file' && pendingFiles.value.length > 0) {
      const sourceId = isEditing.value ? props.source!.id : result.id
      await uploadFilesToSource(sourceId)
    }

    toast.add({
      title: isEditing.value ? 'Source updated' : 'Source created',
      icon: 'i-lucide-check',
    })
    emit('saved')
  } catch (e) {
    showError(e, { fallback: 'Failed to save source' })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal
    :ui="{
      footer: 'justify-end gap-3',
      content: 'sm:max-w-2xl',
      body: 'p-0',
    }"
    :close="{ onClick: () => emit('close') }"
    default-open
    @update:open="(open: boolean) => !open && emit('close')"
  >
    <template #header>
      <div>
        <h2 class="text-lg font-semibold text-highlighted">
          {{ isEditing ? 'Edit Source' : 'Add Source' }}
        </h2>
        <p class="text-sm text-muted mt-0.5">
          Configure a content source for documentation sync
        </p>
      </div>
    </template>

    <template #body>
      <div class="flex flex-col gap-5 p-5">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-highlighted">Type</label>
            <USelectMenu
              v-model="form.type"
              :items="typeOptions"
              value-key="value"
              :disabled="isEditing"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium text-highlighted">
              Label <span class="text-error">*</span>
            </label>
            <UInput v-model="form.label" placeholder="e.g. Nuxt" />
          </div>
        </div>

        <div class="p-4 bg-muted/30 rounded-lg border border-default">
          <div class="flex items-start gap-3 mb-3">
            <div class="size-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-folder-output" class="size-4 text-highlighted" />
            </div>
            <div>
              <h3 class="text-sm font-medium text-highlighted">
                Snapshot Location
              </h3>
              <p class="text-xs text-muted mt-0.5">
                Where synced files will be stored
              </p>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs text-muted">Base Path</label>
              <UInput v-model="form.basePath" placeholder="/docs" class="font-mono text-sm" />
            </div>
            <div class="col-span-2 flex flex-col gap-1.5">
              <label class="text-xs text-muted">Folder Name</label>
              <UInput
                v-model="form.outputPath"
                :placeholder="outputFolderFromLabel || 'folder-name'"
                class="font-mono text-sm"
              />
            </div>
          </div>

          <div class="mt-3 flex items-center gap-2 text-xs">
            <UIcon name="i-lucide-arrow-right" class="size-3 text-highlighted" />
            <span class="text-muted">Preview:</span>
            <code class="text-highlighted font-mono bg-default px-1.5 py-0.5 rounded">
              {{ snapshotPreviewPath }}
            </code>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <template v-if="form.type === 'github'">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-highlighted">
                  Repository <span class="text-error">*</span>
                </label>
                <UInput
                  v-model="form.repo"
                  placeholder="nuxt/nuxt"
                  icon="i-simple-icons-github"
                />
                <p class="text-xs text-muted">
                  owner/repo format
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-highlighted">Branch</label>
                <UInput
                  v-model="form.branch"
                  placeholder="main"
                  icon="i-lucide-git-branch"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-highlighted">Content Path</label>
                <UInput
                  v-model="form.contentPath"
                  placeholder="docs/content"
                  icon="i-lucide-folder-open"
                />
                <p class="text-xs text-muted">
                  Folder containing docs in repo
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-highlighted">Options</label>
                <label class="flex items-center gap-3 h-9 px-3 rounded-lg border border-default bg-default cursor-pointer hover:bg-muted/30 transition-colors">
                  <USwitch v-model="form.readmeOnly" size="xs" />
                  <span class="text-sm">README only</span>
                </label>
              </div>
            </div>

            <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-default">
              <UIcon name="i-lucide-info" class="size-3.5 text-muted shrink-0" />
              <p class="text-xs text-muted">
                Only <code class="text-highlighted">.md</code>, <code class="text-highlighted">.mdx</code>, <code class="text-highlighted">.yml</code>, <code class="text-highlighted">.yaml</code>, <code class="text-highlighted">.json</code> files are synced
              </p>
            </div>
          </template>

          <template v-if="form.type === 'youtube'">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-highlighted">
                  Channel ID <span class="text-error">*</span>
                </label>
                <UInput
                  v-model="form.channelId"
                  placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                  icon="i-simple-icons-youtube"
                />
                <p class="text-xs text-muted">
                  Starts with UC
                </p>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-highlighted">Handle</label>
                <UInput
                  v-model="form.handle"
                  placeholder="@TheAlexLichter"
                  icon="i-lucide-at-sign"
                />
              </div>
            </div>

            <div class="w-1/2">
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-highlighted">Max Videos</label>
                <UInput
                  v-model.number="form.maxVideos"
                  type="number"
                  :min="1"
                  :max="500"
                  icon="i-lucide-video"
                />
                <p class="text-xs text-muted">
                  Between 1 and 500
                </p>
              </div>
            </div>
          </template>

          <template v-if="form.type === 'file'">
            <div
              class="relative rounded-lg border-2 border-dashed transition-colors p-6"
              :class="isDraggingOver ? 'border-primary bg-primary/5' : 'border-default hover:border-muted'"
              @dragover.prevent="isDraggingOver = true"
              @dragleave.prevent="isDraggingOver = false"
              @drop.prevent="onDrop"
            >
              <input
                ref="fileInputRef"
                type="file"
                :accept="ALLOWED_EXTENSIONS.join(',')"
                multiple
                class="hidden"
                @change="onFileInput"
              >
              <div class="flex flex-col items-center gap-2 text-center">
                <div class="size-10 rounded-lg bg-elevated flex items-center justify-center">
                  <UIcon name="i-lucide-upload" class="size-5 text-muted" />
                </div>
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Drop files here or
                    <button type="button" class="text-primary hover:underline" @click="fileInputRef?.click()">
                      browse
                    </button>
                  </p>
                  <p class="text-xs text-muted mt-1">
                    {{ ALLOWED_EXTENSIONS.join(', ') }} files up to 8MB
                  </p>
                </div>
              </div>
            </div>

            <div v-if="pendingFiles.length > 0" class="flex flex-col gap-1">
              <div
                v-for="pf in pendingFiles"
                :key="pf.id"
                class="flex items-center gap-3 px-3 py-2 rounded-lg bg-elevated/50"
              >
                <UIcon name="i-lucide-file-text" class="size-4 text-muted shrink-0" />
                <span class="text-sm text-highlighted truncate flex-1">{{ pf.file.name }}</span>
                <span class="text-xs text-muted shrink-0">{{ formatFileSize(pf.file.size) }}</span>
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="removePendingFile(pf.id)"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton color="neutral" variant="ghost" label="Cancel" @click="emit('close')" />
      <UButton
        :label="isEditing ? 'Save Changes' : 'Create Source'"
        :loading="isSubmitting"
        @click="save"
      />
    </template>
  </UModal>
</template>

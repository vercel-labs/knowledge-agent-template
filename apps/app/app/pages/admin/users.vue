<script setup lang="ts">
import { getPaginationRowModel, getSortedRowModel } from '@tanstack/vue-table'
import type { TableColumn } from '@nuxt/ui'

useSeoMeta({ title: 'Users - Admin' })

type UserRole = 'user' | 'admin'

interface AdminUserRow {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: UserRole
  createdAt: string
  chatCount: number
  messageCount: number
  lastSeenAt: string | null
}

const toast = useToast()
const { showError } = useErrorToast()
const { user: currentUser } = useUserSession()

const table = useTemplateRef('table')
const savingUserId = ref<string | null>(null)
const deletingUserId = ref<string | null>(null)
const userToDelete = ref<AdminUserRow | null>(null)

const globalFilter = ref('')
const sorting = ref([{ id: 'createdAt', desc: true }])
const pagination = ref({ pageIndex: 0, pageSize: 10 })

const deleteModalOpen = computed({
  get: () => userToDelete.value !== null,
  set: (v: boolean) => {
    if (!v) userToDelete.value = null
  },
})

const columns: TableColumn<AdminUserRow>[] = [
  {
    accessorKey: 'name',
    header: 'User',
    enableSorting: true,
    filterFn: (row, _columnId, filterValue) => {
      const q = (filterValue as string).toLowerCase()
      const name = row.original.name?.toLowerCase() ?? ''
      const email = row.original.email?.toLowerCase() ?? ''
      return name.includes(q) || email.includes(q)
    },
  },
  {
    accessorKey: 'chatCount',
    header: 'Chats',
    enableSorting: true,
    meta: { class: { th: 'text-right w-20', td: 'text-right' } },
  },
  {
    accessorKey: 'messageCount',
    header: 'Msgs',
    enableSorting: true,
    meta: { class: { th: 'text-right w-20', td: 'text-right' } },
  },
  {
    accessorKey: 'lastSeenAt',
    header: 'Last active',
    enableSorting: true,
    meta: { class: { th: 'w-28' } },
  },
  {
    accessorKey: 'role',
    header: 'Role',
    meta: { class: { th: 'w-24' } },
  },
  {
    accessorKey: 'actions',
    header: '',
    meta: { class: { th: 'w-10' } },
  },
]

const { data: users, refresh, status } = useLazyFetch<AdminUserRow[]>('/api/admin/users')

const totalUsers = computed(() => users.value?.length ?? 0)
const adminCount = computed(() => users.value?.filter(u => u.role === 'admin').length ?? 0)
const activeCount = computed(() => users.value?.filter(u => u.lastSeenAt !== null).length ?? 0)

const filteredRowCount = computed(() =>
  table.value?.tableApi?.getFilteredRowModel().rows.length ?? 0,
)

const pageCount = computed(() =>
  table.value?.tableApi?.getPageCount() ?? 0,
)

function formatDate(date: string | null): string {
  if (!date) return 'Never'
  return new Date(date).toLocaleDateString()
}

function isCurrentUser(userId: string): boolean {
  return currentUser.value?.id === userId
}

function getRowActions(row: AdminUserRow) {
  if (isCurrentUser(row.id)) return []
  return [
    [
      {
        label: 'Delete user',
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => {
          userToDelete.value = row
        },
      },
    ],
  ]
}

async function deleteUser() {
  const row = userToDelete.value
  if (!row) return

  deletingUserId.value = row.id
  try {
    await $fetch(`/api/admin/users/${row.id}`, { method: 'DELETE' })
    userToDelete.value = null
    await refresh()
    toast.add({
      title: 'User deleted',
      description: `${row.name || row.email || 'User'} has been deleted.`,
      icon: 'i-lucide-check',
    })
  } catch (e) {
    showError(e, { fallback: 'Failed to delete user' })
  } finally {
    deletingUserId.value = null
  }
}

async function changeRole(row: AdminUserRow, newRole: UserRole) {
  if (newRole === row.role) return

  if (isCurrentUser(row.id)) {
    toast.add({
      title: 'Not allowed',
      description: 'You cannot change your own role.',
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
    return
  }

  savingUserId.value = row.id
  try {
    await $fetch(`/api/admin/users/${row.id}`, {
      method: 'PATCH',
      body: { role: newRole },
    })
    await refresh()
    toast.add({
      title: 'Role updated',
      icon: 'i-lucide-check',
    })
  } catch (e) {
    showError(e, { fallback: 'Failed to update role' })
  } finally {
    savingUserId.value = null
  }
}
</script>

<template>
  <div class="px-6 py-8 max-w-4xl mx-auto w-full">
    <header class="mb-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-lg font-medium text-highlighted mb-1 font-pixel tracking-wide">
            Users
          </h1>
          <p class="text-sm text-muted max-w-lg">
            Manage user access and roles across the platform.
          </p>
        </div>
        <UTooltip text="Refresh data">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="status === 'pending'"
            @click="refresh()"
          />
        </UTooltip>
      </div>
    </header>

    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="rounded-lg border border-default bg-elevated/50 p-4">
        <p class="text-xs text-muted mb-1">
          Total Users
        </p>
        <p class="text-2xl font-semibold text-highlighted tabular-nums">
          {{ totalUsers }}
        </p>
      </div>
      <div class="rounded-lg border border-default bg-elevated/50 p-4">
        <p class="text-xs text-muted mb-1">
          Admins
        </p>
        <p class="text-2xl font-semibold text-highlighted tabular-nums">
          {{ adminCount }}
        </p>
      </div>
      <div class="rounded-lg border border-default bg-elevated/50 p-4">
        <p class="text-xs text-muted mb-1">
          Active
        </p>
        <p class="text-2xl font-semibold text-highlighted tabular-nums">
          {{ activeCount }}
        </p>
      </div>
    </div>

    <section>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-[10px] text-muted uppercase tracking-wide font-pixel">
          Directory
        </h2>
        <p v-if="filteredRowCount && globalFilter" class="text-xs text-muted">
          {{ filteredRowCount }} result{{ filteredRowCount !== 1 ? 's' : '' }}
        </p>
      </div>

      <UInput
        v-model="globalFilter"
        icon="i-lucide-search"
        placeholder="Search users..."
        size="xs"
        class="mb-3 max-w-xs"
      />

      <UTable
        ref="table"
        v-model:global-filter="globalFilter"
        v-model:sorting="sorting"
        v-model:pagination="pagination"
        :data="users ?? []"
        :columns
        :loading="status === 'pending' && !users"
        :global-filter-options="{ filterFn: 'custom' }"
        :sorting-options="{ getSortedRowModel: getSortedRowModel() }"
        :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2.5 min-w-0">
            <UAvatar :src="row.original.image || undefined" :alt="row.original.name || row.original.email || undefined" size="xs" />
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <p class="text-highlighted truncate text-xs">
                  {{ row.original.name || 'Unnamed user' }}
                </p>
                <UBadge
                  v-if="isCurrentUser(row.original.id)"
                  label="You"
                  size="xs"
                  color="neutral"
                  variant="subtle"
                />
              </div>
              <p class="text-[11px] text-muted truncate">
                {{ row.original.email || 'No email' }}
              </p>
            </div>
          </div>
        </template>

        <template #chatCount-cell="{ row }">
          <span class="text-muted tabular-nums text-xs">{{ row.original.chatCount }}</span>
        </template>

        <template #messageCount-cell="{ row }">
          <span class="text-muted tabular-nums text-xs">{{ row.original.messageCount }}</span>
        </template>

        <template #lastSeenAt-cell="{ row }">
          <span class="text-muted text-xs">{{ formatDate(row.original.lastSeenAt) }}</span>
        </template>

        <template #role-cell="{ row }">
          <UDropdownMenu
            :items="[
              [
                { label: 'User', icon: 'i-lucide-user', onSelect: () => changeRole(row.original, 'user'), disabled: row.original.role === 'user' },
                { label: 'Admin', icon: 'i-lucide-shield', onSelect: () => changeRole(row.original, 'admin'), disabled: row.original.role === 'admin' },
              ],
            ]"
            :disabled="isCurrentUser(row.original.id) || savingUserId === row.original.id"
          >
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              :loading="savingUserId === row.original.id"
              :disabled="isCurrentUser(row.original.id)"
              trailing-icon="i-lucide-chevron-down"
              class="w-22"
            >
              <UIcon :name="row.original.role === 'admin' ? 'i-lucide-shield' : 'i-lucide-user'" class="size-3 text-muted" />
              <span class="capitalize text-xs">{{ row.original.role }}</span>
            </UButton>
          </UDropdownMenu>
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu
            v-if="!isCurrentUser(row.original.id)"
            :items="getRowActions(row.original)"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="xs"
            />
          </UDropdownMenu>
        </template>

        <template #empty>
          <div class="py-8 text-center">
            <p class="text-sm text-muted">
              {{ globalFilter ? 'No users match your search.' : 'No users found.' }}
            </p>
          </div>
        </template>
      </UTable>

      <div v-if="pageCount > 1" class="flex items-center justify-between mt-3 px-1">
        <p class="text-xs text-muted">
          {{ filteredRowCount }} user{{ filteredRowCount !== 1 ? 's' : '' }}
        </p>
        <UPagination
          :page="(pagination.pageIndex || 0) + 1"
          :items-per-page="pagination.pageSize"
          :total="filteredRowCount"
          size="xs"
          @update:page="(p: number) => pagination = { ...pagination, pageIndex: p - 1 }"
        />
      </div>
    </section>

    <UModal v-model:open="deleteModalOpen">
      <template #content>
        <div class="p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="size-10 rounded-lg bg-error/10 flex items-center justify-center">
              <UIcon name="i-lucide-triangle-alert" class="size-5 text-error" />
            </div>
            <div>
              <h3 class="text-sm font-medium text-highlighted">
                Delete user
              </h3>
              <p class="text-xs text-muted">
                This action cannot be undone.
              </p>
            </div>
          </div>
          <p class="text-sm text-muted mb-6">
            Are you sure you want to delete <span class="font-medium text-highlighted">{{ userToDelete?.name || userToDelete?.email || 'this user' }}</span>?
            All their chats and messages will be permanently removed.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="userToDelete = null"
            />
            <UButton
              label="Delete"
              color="error"
              size="sm"
              :loading="deletingUserId === userToDelete?.id"
              @click="deleteUser()"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

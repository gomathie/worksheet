<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { AppNotification } from '../types'

const auth = useAuthStore()
const router = useRouter()

const open = ref(false)
const items = ref<AppNotification[]>([])
const unread = ref(auth.user?.unread_notifications ?? 0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    items.value = await api<AppNotification[]>('/api/notifications')
    unread.value = items.value.filter((n) => !n.read_at).length
  } catch {
    // A failed poll should never break the header.
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function toggle() {
  open.value = !open.value
  if (open.value) await load()
}

async function markAllRead() {
  await api('/api/notifications/read', { method: 'POST', json: { all: true } })
  const now = new Date().toISOString()
  items.value = items.value.map((n) => ({ ...n, read_at: n.read_at ?? now }))
  unread.value = 0
}

async function openItem(n: AppNotification) {
  if (!n.read_at) {
    await api('/api/notifications/read', { method: 'POST', json: { ids: [n.id] } })
    n.read_at = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
  }
  open.value = false
  if (n.voucher_id) {
    router.push({ name: 'expense-detail', params: { id: n.voucher_id } })
  }
}

function ago(iso: string): string {
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
</script>

<template>
  <div class="relative">
    <button
      class="btn btn-sm flex items-center gap-1.5"
      :aria-label="`Notifications${unread ? `, ${unread} unread` : ''}`"
      @click="toggle"
    >
      <span aria-hidden="true">🔔</span>
      <span
        v-if="unread"
        class="mono rounded-full bg-red px-1.5 text-[11px] leading-4 text-white"
        >{{ unread > 99 ? '99+' : unread }}</span
      >
    </button>

    <div v-if="open" class="fixed inset-0 z-10" @click="open = false" />

    <div
      v-if="open"
      class="panel absolute right-0 z-20 mt-1 max-h-96 w-80 overflow-y-auto !p-1 text-sm shadow-lg"
    >
      <div class="flex items-center justify-between border-b border-line px-3 py-2">
        <span class="display text-base">Notifications</span>
        <button v-if="unread" class="btn btn-sm !px-2 !py-0.5" @click="markAllRead">
          Mark all read
        </button>
      </div>

      <p v-if="loading && items.length === 0" class="px-3 py-4 text-muted">Loading…</p>
      <p v-else-if="items.length === 0" class="px-3 py-4 text-muted">
        Nothing yet.
      </p>

      <button
        v-for="n in items"
        :key="n.id"
        class="block w-full border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-teal-soft"
        :class="{ 'bg-amber-soft': !n.read_at }"
        @click="openItem(n)"
      >
        <p class="font-medium">{{ n.title }}</p>
        <p v-if="n.body" class="mt-0.5 line-clamp-2 text-xs text-muted">{{ n.body }}</p>
        <p class="mono mt-1 text-[11px] text-muted">{{ ago(n.created_at) }}</p>
      </button>
    </div>
  </div>
</template>

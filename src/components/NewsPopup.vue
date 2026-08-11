<script setup lang="ts">
// Pop-up announcements — reappear every REMIND_MS while still live, not just
// once per fresh sign-in, so a notice actually gets seen even by someone who
// keeps a tab open all day or only ever refreshes rather than re-logging in.
// "Seen" is tracked per announcement id in localStorage (not a store field),
// since it has to survive both a full page reload and, for the setInterval
// case below, an open tab that's never reloaded at all.
//
// Distinct from the News feed page: this interrupts, the feed waits to be
// read — and pop-ups are admin-only to browse there at all (see NewsView.vue
// and server/news.ts), so this dedicated `?style=popup` fetch is the only
// way a non-admin ever sees one.
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../api'
import type { NewsItem } from '../types'

const items = ref<NewsItem[]>([])
const open = ref(false)

const SEEN_KEY_PREFIX = 'news-popup-seen:'
const REMIND_MS = 3 * 60 * 60 * 1000 // 3 hours
const RECHECK_MS = 15 * 60 * 1000 // how often an open tab re-checks

function lastSeen(id: string): number {
  const raw = localStorage.getItem(SEEN_KEY_PREFIX + id)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) ? n : 0
}

function markSeen(ids: string[]) {
  const now = String(Date.now())
  for (const id of ids) localStorage.setItem(SEEN_KEY_PREFIX + id, now)
}

async function checkForDue() {
  if (open.value) return // don't interrupt a reminder already on screen
  try {
    const news = await api<NewsItem[]>('/api/news?style=popup')
    const due = news.filter((n) => Date.now() - lastSeen(n.id) >= REMIND_MS)
    if (due.length === 0) return
    items.value = due
    open.value = true
    markSeen(due.map((n) => n.id))
  } catch {
    // A pop-up is a courtesy, not core functionality — never block on it.
  }
}

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  checkForDue()
  timer = setInterval(checkForDue, RECHECK_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function close() {
  open.value = false
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
    <div class="panel w-full max-w-lg">
      <h2 class="display mb-1 text-xl text-teal">📣 Announcement{{ items.length > 1 ? 's' : '' }}</h2>
      <div class="mb-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div
          v-for="n in items"
          :key="n.id"
          class="border-t border-line pt-3 first:border-t-0 first:pt-0"
        >
          <h3 class="display text-lg">{{ n.title }}</h3>
          <p v-if="n.body" class="mt-1 text-sm whitespace-pre-wrap">{{ n.body }}</p>
          <!-- No "posted by" here — a pop-up reads as coming from the
               organisation, not a person, and the server withholds the name
               from anyone but an admin or the sender anyway (see news.ts). -->
          <p class="mt-1 text-xs text-muted">live through {{ n.expires_at }}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <RouterLink :to="{ name: 'news' }" class="btn" @click="close">View all news</RouterLink>
        <button type="button" class="btn btn-solid" @click="close">Got it</button>
      </div>
    </div>
  </div>
</template>

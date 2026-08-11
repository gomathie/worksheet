<script setup lang="ts">
// Pop-up announcements — shown once per fresh sign-in (not on every page
// load; see auth.justLoggedIn), for whatever 'popup'-style news is still
// live. Distinct from the News feed page: this interrupts, the feed waits
// to be read.
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { NewsItem } from '../types'

const auth = useAuthStore()
const items = ref<NewsItem[]>([])
const open = ref(false)

onMounted(async () => {
  if (!auth.justLoggedIn) return
  // Consume immediately — a failed fetch below must not leave this set,
  // which would otherwise retry on every subsequent mount of this
  // component (e.g. after an unrelated Pinia state reset) rather than only
  // once per actual login.
  auth.justLoggedIn = false
  try {
    const news = await api<NewsItem[]>('/api/news')
    items.value = news.filter((n) => n.style === 'popup')
    open.value = items.value.length > 0
  } catch {
    // A pop-up is a courtesy, not core functionality — never block sign-in.
  }
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
          <p class="mt-1 text-xs text-muted">
            {{ n.created_by_name ?? 'Admin' }} · live through {{ n.expires_at }}
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <RouterLink :to="{ name: 'news' }" class="btn" @click="close">View all news</RouterLink>
        <button type="button" class="btn btn-solid" @click="close">Got it</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { NEWS_STYLE_LABELS, maxDaysFor } from '../../shared/news'
import type { NewsItem, NewsStyle } from '../types'

// A read-everyone, write-some feed: anyone can read it, only a
// send_announcements holder (or an admin) can post to it. A 'popup' item
// also interrupts the next sign-in for everyone — see NewsPopup.vue — but
// still lives here too, for whoever missed or dismissed it.

const auth = useAuthStore()

const items = ref<NewsItem[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')

const canSend = computed(() => auth.isAdmin || auth.rights.send_announcements)
const maxDays = computed(() => maxDaysFor(auth.isAdmin))

const blank = () => ({
  title: '',
  body: '',
  style: 'feed' as NewsStyle,
  days: 7,
})
const form = ref(blank())

async function load() {
  error.value = ''
  try {
    items.value = await api<NewsItem[]>('/api/news')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load news'
  }
}
onMounted(load)

async function post() {
  error.value = ''
  notice.value = ''
  if (!form.value.title.trim()) {
    error.value = 'Give the announcement a title.'
    return
  }
  // Clamped client-side to match the server's own rule (1..7, or 1..90 for
  // an admin) — the input's own min/max already stop most of this, but a
  // stale form (role changed mid-session) could still send something
  // outside the current bound.
  const days = Math.min(Math.max(Math.round(form.value.days), 1), maxDays.value)
  busy.value = 'form'
  try {
    await api('/api/news', {
      method: 'POST',
      json: {
        title: form.value.title.trim(),
        body: form.value.body.trim() || null,
        style: form.value.style,
        days,
      },
    })
    notice.value =
      form.value.style === 'popup'
        ? 'Sent — everyone will see it as a pop-up next time they sign in.'
        : 'Posted to the News feed.'
    form.value = blank()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to post the announcement'
  } finally {
    busy.value = ''
  }
}

async function retract(n: NewsItem) {
  if (!confirm(`Retract "${n.title}"? This cannot be undone.`)) return
  error.value = ''
  busy.value = n.id
  try {
    await api(`/api/news/${n.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to retract the announcement'
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">News</h2>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <!-- ============================================================ form -->
    <form v-if="canSend" class="panel mb-6" @submit.prevent="post">
      <h3 class="display mb-3 text-xl">Post an announcement</h3>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div class="md:col-span-2">
          <label class="field-label" for="n-title">Title</label>
          <input
            id="n-title"
            v-model="form.title"
            required
            maxlength="200"
            class="field-input"
            placeholder="What's the headline"
          />
        </div>
        <div>
          <label class="field-label" for="n-style">Style</label>
          <select id="n-style" v-model="form.style" class="field-input">
            <option v-for="(label, s) in NEWS_STYLE_LABELS" :key="s" :value="s">
              {{ label }}
            </option>
          </select>
        </div>
        <div>
          <label class="field-label" for="n-days">Expires in (days)</label>
          <input
            id="n-days"
            v-model.number="form.days"
            type="number"
            min="1"
            :max="maxDays"
            required
            class="field-input mono"
          />
          <p class="mt-1 text-xs text-muted">
            {{ auth.isAdmin ? `Up to ${maxDays} as an admin.` : `Up to ${maxDays} days.` }}
          </p>
        </div>
        <div class="md:col-span-4">
          <label class="field-label" for="n-body">Message (optional)</label>
          <textarea
            id="n-body"
            v-model="form.body"
            maxlength="2000"
            rows="3"
            class="field-input"
            placeholder="Anything beyond the title worth saying"
          />
        </div>
      </div>
      <p class="mt-3 text-xs text-muted">
        <strong>{{ NEWS_STYLE_LABELS.popup }}</strong> also interrupts everyone's next sign-in
        with a pop-up, in addition to appearing here.
      </p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-solid" :disabled="busy === 'form'">
          {{ busy === 'form' ? 'Posting…' : 'Post announcement' }}
        </button>
      </div>
    </form>

    <!-- =========================================================== list -->
    <p v-if="items.length === 0" class="panel text-muted">Nothing posted right now.</p>

    <div v-for="n in items" :key="n.id" class="panel mb-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-medium">{{ n.title }}</h3>
            <span
              v-if="n.style === 'popup'"
              class="display rounded-full border border-teal px-2 py-0.5 text-xs tracking-wider text-teal"
              >Pop-up</span
            >
          </div>
          <p v-if="n.body" class="mt-1 text-sm whitespace-pre-wrap">{{ n.body }}</p>
          <!-- Pop-ups read as coming from the organisation, not a person —
               the server withholds created_by_name from anyone but an admin
               or the sender for a popup (see news.ts), so this only names
               someone when the API actually sent a name to show. -->
          <p class="mt-1 text-xs text-muted">
            <template v-if="n.created_by_name">{{ n.created_by_name }} · </template
            >posted {{ n.created_at.slice(0, 10) }} · live through {{ n.expires_at }}
          </p>
        </div>
        <button
          v-if="n.can_delete"
          class="btn btn-sm btn-danger"
          :disabled="busy === n.id"
          @click="retract(n)"
        >
          Retract
        </button>
      </div>
    </div>
  </div>
</template>

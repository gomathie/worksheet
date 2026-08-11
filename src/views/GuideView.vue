<script setup lang="ts">
// Renders the User/Admin guide — see /guideline-user.md and
// /guideline-admin.md at the repo root, the single source of truth (edit
// those files; this page just displays them). Both are bundled at build
// time via Vite's `?raw` import, not fetched, so there's no network round
// trip and no way for this to point at stale content in production.
//
// v-html below is safe specifically *because* the content is static and
// developer-authored, never derived from a database row or a request body —
// the one case where rendering markdown-to-HTML this way would be an XSS
// risk elsewhere in the app.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { marked } from 'marked'
import { useAuthStore } from '../stores/auth'
import userGuideRaw from '../../guideline-user.md?raw'
import adminGuideRaw from '../../guideline-admin.md?raw'

const route = useRoute()
const auth = useAuthStore()

const isAdminDoc = computed(() => route.meta.doc === 'admin')
const html = computed(() => marked.parse(isAdminDoc.value ? adminGuideRaw : userGuideRaw) as string)
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- Only an admin ever sees both guides, so only an admin needs a
         switcher — everyone else only has the one page to be on. -->
    <nav v-if="auth.isAdmin" class="no-print mb-5 flex gap-2">
      <RouterLink :to="{ name: 'help-user' }" class="btn btn-sm" active-class="btn-solid"
        >User Guide</RouterLink
      >
      <RouterLink :to="{ name: 'help-admin' }" class="btn btn-sm" active-class="btn-solid"
        >Admin Guide</RouterLink
      >
    </nav>
    <div class="panel markdown-body" v-html="html" />
  </div>
</template>

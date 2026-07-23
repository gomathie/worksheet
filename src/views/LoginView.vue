<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function signIn() {
  error.value = ''
  busy.value = true
  try {
    await auth.login(username.value, password.value)
    router.push({ name: 'entries' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto mt-14 max-w-md">
    <div class="panel">
      <h2 class="display mb-1 text-2xl">Sign in</h2>
      <p class="mb-5 text-sm text-muted">
        Use the username and password assigned by your administrator.
      </p>

      <form @submit.prevent="signIn">
        <label class="field-label" for="username">Username</label>
        <input
          id="username"
          v-model="username"
          required
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          class="field-input mb-4"
          placeholder="username"
        />
        <label class="field-label" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="field-input mb-4"
          placeholder="••••••••"
        />
        <button class="btn btn-solid w-full" :disabled="busy">
          {{ busy ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <p v-if="error" class="mt-4 rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
        {{ error }}
      </p>
    </div>
  </div>
</template>

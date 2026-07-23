<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const code = ref('')
const issuedCode = ref<string | null>(null)
const stage = ref<'email' | 'code'>('email')
const error = ref('')
const busy = ref(false)

async function requestCode() {
  error.value = ''
  busy.value = true
  try {
    issuedCode.value = (await auth.login(email.value)) ?? null
    stage.value = 'code'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

async function verify() {
  error.value = ''
  busy.value = true
  try {
    await auth.verify(email.value, code.value)
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
        Enter your work email to receive a one-time sign-in code.
      </p>

      <form v-if="stage === 'email'" @submit.prevent="requestCode">
        <label class="field-label" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="field-input mb-4"
          placeholder="you@company.com"
        />
        <button class="btn btn-solid w-full" :disabled="busy">
          {{ busy ? 'Sending…' : 'Send code' }}
        </button>
      </form>

      <form v-else @submit.prevent="verify">
        <p
          v-if="issuedCode"
          class="mono mb-4 rounded-lg border border-amber bg-amber-soft p-3 text-sm"
        >
          Your one-time code: <strong class="text-base">{{ issuedCode }}</strong
          ><br />
          <span class="text-xs text-muted"
            >(shown here because email delivery isn't configured yet)</span
          >
        </p>
        <label class="field-label" for="code">6-digit code</label>
        <input
          id="code"
          v-model="code"
          inputmode="numeric"
          pattern="\d{6}"
          required
          class="field-input mono mb-4 text-center text-lg tracking-[0.4em]"
          placeholder="••••••"
        />
        <button class="btn btn-solid w-full" :disabled="busy">
          {{ busy ? 'Verifying…' : 'Sign in' }}
        </button>
        <button
          type="button"
          class="btn mt-2 w-full"
          @click="stage = 'email'; code = ''"
        >
          Use a different email
        </button>
      </form>

      <p v-if="error" class="mt-4 rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
        {{ error }}
      </p>
    </div>
  </div>
</template>

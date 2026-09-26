<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { Leave } from '../types'

const auth = useAuthStore()

const leaves = ref<Leave[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')
const showAll = ref(false)

const blank = () => ({
  type: 'sick',
  start_date: auth.user!.today,
  end_date: auth.user!.today,
  reason: '',
})
const form = ref(blank())
const showForm = ref(false)

async function load() {
  error.value = ''
  try {
    leaves.value = await api<Leave[]>('/api/leaves')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load leaves'
  }
}

onMounted(load)

const visible = computed(() => {
  if (showAll.value) return leaves.value
  return leaves.value.filter((l) => l.status === 'pending' || new Date(l.start_date) >= new Date(new Date().setMonth(new Date().getMonth() - 1)))
})

async function save() {
  error.value = ''
  notice.value = ''
  if (!form.value.start_date || !form.value.end_date) {
    error.value = 'Both start and end dates are required'
    return
  }
  if (form.value.start_date > form.value.end_date) {
    error.value = 'Start date cannot be after end date'
    return
  }
  busy.value = 'form'
  try {
    await api('/api/leaves', { method: 'POST', json: form.value })
    notice.value = 'Leave requested.'
    form.value = blank()
    showForm.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save request'
  } finally {
    busy.value = ''
  }
}

async function decide(l: Leave, status: 'approved' | 'rejected') {
  error.value = ''
  busy.value = l.id
  try {
    await api(`/api/leaves/${l.id}`, { method: 'PATCH', json: { status } })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : `Failed to ${status} request`
  } finally {
    busy.value = ''
  }
}

const statusTone: Record<string, string> = {
  pending: 'border-amber text-amber',
  approved: 'border-teal bg-teal-soft text-teal',
  rejected: 'border-red bg-red-soft text-red',
}
const typeLabel: Record<string, string> = {
  sick: 'Sick Leave',
  vacation: 'Vacation',
  unpaid: 'Unpaid Leave',
  personal: 'Personal Day',
}
</script>

<template>
  <div class="max-w-4xl">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Time Off & Leaves</h2>
      <button v-if="!showForm" class="btn btn-sm btn-solid" @click="showForm = true">
        Request time off
      </button>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <form v-if="showForm" class="panel mb-6" @submit.prevent="save">
      <h3 class="display mb-3 text-xl">Request Time Off</h3>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label class="field-label" for="l-type">Type</label>
          <select id="l-type" v-model="form.type" class="field-input">
            <option value="sick">Sick Leave</option>
            <option value="vacation">Vacation</option>
            <option value="personal">Personal Day</option>
            <option value="unpaid">Unpaid Leave</option>
          </select>
        </div>
        <div class="md:col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label class="field-label" for="l-start">Start date</label>
            <input id="l-start" type="date" v-model="form.start_date" required class="field-input mono" />
          </div>
          <div>
            <label class="field-label" for="l-end">End date</label>
            <input id="l-end" type="date" v-model="form.end_date" required class="field-input mono" />
          </div>
        </div>
        <div class="md:col-span-2">
          <label class="field-label" for="l-reason">Reason (optional)</label>
          <input id="l-reason" v-model="form.reason" class="field-input" maxlength="500" placeholder="E.g. Feeling unwell, Family trip" />
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-solid" :disabled="busy === 'form'">
          {{ busy === 'form' ? 'Submitting…' : 'Submit request' }}
        </button>
        <button type="button" class="btn" @click="showForm = false">Cancel</button>
      </div>
    </form>

    <div class="mb-4 flex items-center justify-between">
      <h3 class="display text-xl">Requests</h3>
      <label class="flex items-center gap-2 text-sm text-muted">
        <input v-model="showAll" type="checkbox" />
        Show older
      </label>
    </div>

    <p v-if="visible.length === 0" class="panel text-muted">No leave requests found.</p>

    <div v-for="l in visible" :key="l.id" class="panel mb-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="mb-1 flex items-center gap-2">
            <h4 class="font-medium">{{ l.employee_name }}</h4>
            <span
              class="display rounded-full border px-2 py-0.5 text-xs tracking-wider"
              :class="statusTone[l.status]"
              >{{ l.status }}</span
            >
          </div>
          <p class="text-sm">
            <span class="font-medium">{{ typeLabel[l.type] }}</span>
            <span class="text-muted mx-2">•</span>
            <span class="mono text-muted">{{ l.start_date }}</span>
            <span v-if="l.start_date !== l.end_date" class="mono text-muted"> to {{ l.end_date }}</span>
          </p>
          <p v-if="l.reason" class="mt-2 text-sm italic">"{{ l.reason }}"</p>
        </div>
        <div v-if="auth.isAdmin && l.status === 'pending'" class="flex gap-2">
          <button class="btn btn-sm btn-solid" :disabled="busy === l.id" @click="decide(l, 'approved')">Approve</button>
          <button class="btn btn-sm" :disabled="busy === l.id" @click="decide(l, 'rejected')">Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>

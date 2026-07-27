<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { downloadJson } from '../csv'
import type { RateSettings, WorkTypeInfo } from '../types'

const form = ref<RateSettings>({
  point_value: 1,
  currency: '$',
  max_entries_per_day: 0,
  require_entry_approval: 0,
})
const workTypes = ref<WorkTypeInfo[]>([])
const newType = ref({ name: '', points_per_unit: 1 })
const error = ref('')
const saved = ref(false)
const busy = ref(false)

async function loadTypes() {
  workTypes.value = await api<WorkTypeInfo[]>('/api/work-types')
}

onMounted(async () => {
  ;[form.value] = await Promise.all([
    api<RateSettings>('/api/settings'),
    loadTypes(),
    loadSmtp(),
  ])
})

async function run(fn: () => Promise<unknown>) {
  error.value = ''
  busy.value = true
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

function saveSettings() {
  saved.value = false
  return run(async () => {
    form.value = await api<RateSettings>('/api/settings', {
      method: 'PUT',
      json: form.value,
    })
    saved.value = true
  })
}

function addType() {
  return run(async () => {
    await api('/api/work-types', { method: 'POST', json: newType.value })
    newType.value = { name: '', points_per_unit: 1 }
    await loadTypes()
  })
}

function saveType(wt: WorkTypeInfo) {
  return run(async () => {
    await api(`/api/work-types/${wt.id}`, {
      method: 'PATCH',
      json: { name: wt.name, points_per_unit: wt.points_per_unit },
    })
    await loadTypes()
  })
}

function toggleType(wt: WorkTypeInfo) {
  return run(async () => {
    await api(`/api/work-types/${wt.id}`, {
      method: 'PATCH',
      json: { active: wt.active ? 0 : 1 },
    })
    await loadTypes()
  })
}

function downloadBackup() {
  return run(async () => {
    const data = await api<unknown>('/api/export')
    const date = new Date().toISOString().slice(0, 10)
    downloadJson(`ledger-backup-${date}.json`, data)
  })
}

// ---- SMTP / email notifications
interface SmtpForm {
  enabled: boolean
  host: string
  port: number
  user: string
  pass: string
  from: string
  from_name: string
  has_password?: number
}
const smtp = ref<SmtpForm>({
  enabled: false,
  host: '',
  port: 587,
  user: '',
  pass: '',
  from: '',
  from_name: 'OpenSignal Ledger',
})
const smtpSaved = ref(false)
const testTo = ref('')
const testMsg = ref('')

async function loadSmtp() {
  smtp.value = { ...smtp.value, ...(await api<SmtpForm>('/api/settings/smtp')), pass: '' }
}

function saveSmtp() {
  smtpSaved.value = false
  testMsg.value = ''
  return run(async () => {
    await api('/api/settings/smtp', { method: 'PUT', json: smtp.value })
    smtp.value.pass = ''
    await loadSmtp()
    smtpSaved.value = true
  })
}

function sendTest() {
  testMsg.value = ''
  return run(async () => {
    const res = await api<{ to: string }>('/api/settings/smtp/test', {
      method: 'POST',
      json: { to: testTo.value || undefined },
    })
    testMsg.value = `Test email sent to ${res.to}.`
  })
}
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="panel">
      <h2 class="display mb-1 text-2xl">Work types &amp; points</h2>
      <p class="mb-5 text-sm text-muted">
        Each work type is worth points per unit. Assign types to employees in the
        Employees tab — employees can only log the types assigned to them.
        Changing a rate recalculates every past and future figure.
      </p>

      <div class="table-wrap mb-5">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th class="num">Points per unit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="wt in workTypes" :key="wt.id" :class="{ 'opacity-50': !wt.active }">
              <td>
                <input v-model="wt.name" class="field-input !w-44" />
              </td>
              <td class="num">
                <input
                  v-model.number="wt.points_per_unit"
                  type="number"
                  min="0"
                  step="any"
                  class="field-input mono !w-24 text-right"
                />
              </td>
              <td>{{ wt.active ? 'Active' : 'Inactive' }}</td>
              <td class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" :disabled="busy" @click="saveType(wt)">
                  Save
                </button>
                <button
                  class="btn btn-sm"
                  :class="wt.active ? 'btn-danger' : ''"
                  :disabled="busy"
                  @click="toggleType(wt)"
                >
                  {{ wt.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addType">
        <div>
          <label class="field-label" for="nt-name">New work type</label>
          <input
            id="nt-name"
            v-model="newType.name"
            required
            maxlength="60"
            class="field-input"
            placeholder="e.g. Graphic design"
          />
        </div>
        <div>
          <label class="field-label" for="nt-rate">Points per unit</label>
          <input
            id="nt-rate"
            v-model.number="newType.points_per_unit"
            type="number"
            min="0"
            step="any"
            required
            class="field-input mono !w-28"
          />
        </div>
        <button class="btn btn-solid" :disabled="busy">Add work type</button>
      </form>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">Money &amp; currency</h2>
      <p class="mb-5 text-sm text-muted">
        Remuneration = points × value per point, plus bonuses and approved
        reimbursements.
      </p>
      <form class="grid grid-cols-2 gap-4" @submit.prevent="saveSettings">
        <div>
          <label class="field-label" for="pv">Value per point</label>
          <input
            id="pv"
            v-model.number="form.point_value"
            type="number"
            min="0"
            step="any"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="cur">Currency symbol</label>
          <input
            id="cur"
            v-model="form.currency"
            maxlength="4"
            required
            class="field-input mono"
          />
        </div>
        <div class="col-span-2">
          <label class="field-label" for="maxpd">Max entries per employee per day (0 = unlimited)</label>
          <input
            id="maxpd"
            v-model.number="form.max_entries_per_day"
            type="number"
            min="0"
            step="1"
            required
            class="field-input mono"
          />
          <p class="mt-1 text-xs text-muted">
            The default cap on how many times an employee can log per day. Set a
            per-person override in the Employees tab. Admins are never capped.
          </p>
        </div>
        <div class="col-span-2">
          <label class="flex items-center gap-2 text-sm">
            <input
              :checked="form.require_entry_approval === 1"
              type="checkbox"
              @change="form.require_entry_approval = ($event.target as HTMLInputElement).checked ? 1 : 0"
            />
            Require admin approval for employee time entries
          </label>
          <p class="mt-1 text-xs text-muted">
            When on, entries logged by employees stay pending and only count
            toward pay once you approve them. Admin-logged entries are approved
            automatically.
          </p>
        </div>
        <div class="col-span-2">
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save settings' }}
          </button>
          <span v-if="saved" class="ml-3 text-sm text-teal">Saved.</span>
        </div>
      </form>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">Email notifications (SMTP)</h2>
      <p class="mb-4 text-sm text-muted">
        Point this at any SMTP server to email employees when they're marked paid
        or a reimbursement is decided, and alert admins on new requests. Use port
        587 (STARTTLS) or 465 (TLS); port 25 is blocked.
      </p>
      <form class="grid grid-cols-1 gap-4 md:grid-cols-2" @submit.prevent="saveSmtp">
        <label class="flex items-center gap-2 text-sm md:col-span-2">
          <input v-model="smtp.enabled" type="checkbox" />
          Enable email notifications
        </label>
        <div>
          <label class="field-label" for="s-host">SMTP host</label>
          <input id="s-host" v-model="smtp.host" class="field-input" placeholder="smtp.example.com" />
        </div>
        <div>
          <label class="field-label" for="s-port">Port</label>
          <input id="s-port" v-model.number="smtp.port" type="number" class="field-input mono" />
        </div>
        <div>
          <label class="field-label" for="s-user">Username</label>
          <input id="s-user" v-model="smtp.user" autocomplete="off" class="field-input" />
        </div>
        <div>
          <label class="field-label" for="s-pass">
            Password {{ smtp.has_password ? '(set — blank keeps it)' : '' }}
          </label>
          <input id="s-pass" v-model="smtp.pass" type="password" autocomplete="new-password" class="field-input" />
        </div>
        <div>
          <label class="field-label" for="s-from">From address</label>
          <input id="s-from" v-model="smtp.from" type="email" class="field-input" placeholder="ledger@example.com" />
        </div>
        <div>
          <label class="field-label" for="s-fromname">From name</label>
          <input id="s-fromname" v-model="smtp.from_name" class="field-input" />
        </div>
        <div class="md:col-span-2">
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save SMTP settings' }}
          </button>
          <span v-if="smtpSaved" class="ml-3 text-sm text-teal">Saved.</span>
        </div>
      </form>
      <div class="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <div>
          <label class="field-label" for="s-test">Send a test email to</label>
          <input
            id="s-test"
            v-model="testTo"
            type="email"
            class="field-input"
            placeholder="your own email"
          />
        </div>
        <button class="btn" :disabled="busy" @click="sendTest">Send test</button>
        <span v-if="testMsg" class="text-sm text-teal">{{ testMsg }}</span>
      </div>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">Backup</h2>
      <p class="mb-4 text-sm text-muted">
        Download a full snapshot of all data (employees, entries, work types,
        payments, bonuses, reimbursements, settings, and activity log) as a JSON
        file. Passwords are never included.
      </p>
      <button class="btn btn-solid" :disabled="busy" @click="downloadBackup">
        {{ busy ? 'Preparing…' : 'Download backup (JSON)' }}
      </button>
    </div>

    <p v-if="error" class="rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
      {{ error }}
    </p>
  </div>
</template>

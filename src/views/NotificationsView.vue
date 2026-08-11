<script setup lang="ts">
// Communications settings, split out of the (already long) Settings page:
// how the app reaches people (email, SMS) and the one place it broadcasts to
// everyone (News) — grouped together since they're all about getting a
// message to the team, distinct from Settings' data/workflow configuration.
import { onMounted, ref } from 'vue'
import { api } from '../api'
import PasswordField from '../components/PasswordField.vue'

const error = ref('')
const busy = ref(false)

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
// True when testMsg holds an error rather than a success message. Kept local
// to this button rather than routed through the page's shared `error` ref,
// which renders in one box at the very top of the page — easy to miss for
// an action further down.
const testFailed = ref(false)

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

async function sendTest() {
  smtpSaved.value = false
  testMsg.value = ''
  testFailed.value = false
  busy.value = true
  try {
    const res = await api<{ to: string }>('/api/settings/smtp/test', {
      method: 'POST',
      json: { to: testTo.value || undefined },
    })
    testMsg.value = `Test email sent to ${res.to}.`
  } catch (e) {
    testFailed.value = true
    testMsg.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

// ---- SMS / mnotify notifications
interface SmsForm {
  enabled: boolean
  api_key: string
  sender_id: string
  has_key?: number
}
const sms = ref<SmsForm>({
  enabled: false,
  api_key: '',
  sender_id: '',
})
const smsSaved = ref(false)
const smsTestTo = ref('')
const smsTestMsg = ref('')
const smsTestFailed = ref(false)

async function loadSms() {
  sms.value = { ...sms.value, ...(await api<SmsForm>('/api/settings/sms')), api_key: '' }
}

function saveSms() {
  smsSaved.value = false
  smsTestMsg.value = ''
  return run(async () => {
    await api('/api/settings/sms', { method: 'PUT', json: sms.value })
    sms.value.api_key = ''
    await loadSms()
    smsSaved.value = true
  })
}

async function sendSmsTest() {
  smsSaved.value = false
  smsTestMsg.value = ''
  smsTestFailed.value = false
  busy.value = true
  try {
    const res = await api<{
      to: string
      message?: string
      summary?: {
        _id?: string | number
        total_sent?: number
        total_rejected?: number
        credit_used?: number
        credit_left?: number
      }
    }>('/api/settings/sms/test', {
      method: 'POST',
      json: { to: smsTestTo.value || undefined },
    })
    // mnotify accepting the request is not proof of delivery — its own
    // dashboard is the only place true delivery status shows. Surface the
    // campaign id here so it's one copy-paste away when checking that
    // dashboard or filing a support ticket, alongside the accept-time summary
    // (a stuck message can still show 0 rejected here and fail downstream).
    const s = res.summary
    const bits = [
      s?.total_sent !== undefined ? `${s.total_sent} sent` : null,
      s?.total_rejected ? `${s.total_rejected} rejected` : null,
      s?.credit_left !== undefined ? `${s.credit_left} credits left` : null,
      s?._id !== undefined ? `campaign ${s._id}` : null,
    ].filter(Boolean)
    smsTestMsg.value = `Test SMS sent to ${res.to}.${bits.length ? ` mnotify: ${bits.join(', ')}.` : ''}`
  } catch (e) {
    smsTestFailed.value = true
    smsTestMsg.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadSmtp(), loadSms()])
})
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <h2 class="display text-2xl">Notifications</h2>

    <p v-if="error" class="panel border-red bg-red-soft text-red">{{ error }}</p>

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
        <span v-if="testMsg" class="text-sm" :class="testFailed ? 'text-red' : 'text-teal'">{{
          testMsg
        }}</span>
      </div>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">SMS notifications (mnotify)</h2>
      <p class="mb-4 text-sm text-muted">
        Sends the same events as email, over SMS via
        <a href="https://mnotify.com" target="_blank" rel="noopener" class="underline"
          >mnotify</a
        >, to any employee with a phone number set (Employees tab). Only
        matters when the phone number belongs to someone with SMS-worthy
        notifications — everyone gets an in-app notification either way.
      </p>
      <form class="grid grid-cols-1 gap-4 md:grid-cols-2" @submit.prevent="saveSms">
        <label class="flex items-center gap-2 text-sm md:col-span-2">
          <input v-model="sms.enabled" type="checkbox" />
          Enable SMS notifications
        </label>
        <div>
          <label class="field-label" for="sms-key">
            mnotify API key {{ sms.has_key ? '(set — blank keeps it)' : '' }}
          </label>
          <PasswordField
            id="sms-key"
            v-model="sms.api_key"
            autocomplete="off"
            placeholder="your mnotify API key"
          />
          <p class="mt-1 text-xs text-muted">
            From your
            <a
              href="https://apps.mnotify.net"
              target="_blank"
              rel="noopener"
              class="underline"
              >mnotify dashboard</a
            >, under API keys.
          </p>
        </div>
        <div>
          <label class="field-label" for="sms-sender">Sender ID</label>
          <input
            id="sms-sender"
            v-model="sms.sender_id"
            maxlength="11"
            class="field-input"
            placeholder="e.g. OpenSignal"
          />
          <p class="mt-1 text-xs text-muted">
            Up to 11 characters, registered with mnotify — this is the name
            recipients see as the sender.
          </p>
        </div>
        <div class="md:col-span-2">
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save SMS settings' }}
          </button>
          <span v-if="smsSaved" class="ml-3 text-sm text-teal">Saved.</span>
        </div>
      </form>
      <div class="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <div>
          <label class="field-label" for="sms-test">Send a test SMS to</label>
          <input
            id="sms-test"
            v-model="smsTestTo"
            type="tel"
            class="field-input mono"
            placeholder="your own phone number"
          />
        </div>
        <button class="btn" :disabled="busy" @click="sendSmsTest">Send test</button>
        <span
          v-if="smsTestMsg"
          class="text-sm"
          :class="smsTestFailed ? 'text-red' : 'text-teal'"
          >{{ smsTestMsg }}</span
        >
      </div>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">News</h2>
      <p class="mb-4 text-sm text-muted">
        Team-wide announcements — a plain post to the News feed, or a pop-up that
        interrupts everyone's next sign-in while it's still live. Anyone can read
        News; posting needs the <strong>Send announcements</strong> right
        (admins always have it — grant it to someone else in the Employees tab).
        Posting and reading both happen on the News page itself, not here.
      </p>
      <RouterLink :to="{ name: 'news' }" class="btn btn-solid">Go to News</RouterLink>
    </div>
  </div>
</template>

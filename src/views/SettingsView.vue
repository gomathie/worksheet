<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { downloadJson } from '../csv'
import type {
  Department,
  ExpenseCategory,
  RateSettings,
  WorkflowConfig,
  WorkTypeInfo,
} from '../types'

const form = ref<RateSettings>({
  point_value: 1,
  currency: '$',
  max_entries_per_day: 0,
  require_entry_approval: 0,
})
const workTypes = ref<WorkTypeInfo[]>([])
const codePrefix = ref('EMP-')
const newType = ref({ name: '', points_per_unit: 1, card_based: false })
const error = ref('')
const saved = ref(false)
const busy = ref(false)

// ---------------------------------------------------------- expense module
const departments = ref<Department[]>([])
const categories = ref<ExpenseCategory[]>([])
const newDepartment = ref('')
const newCategory = ref('')
const workflow = ref<WorkflowConfig>({ require_manager: true, require_finance: true })
const workflowSaved = ref(false)

async function loadTypes() {
  workTypes.value = await api<WorkTypeInfo[]>('/api/work-types')
}

async function loadExpenseConfig() {
  ;[departments.value, categories.value, workflow.value] = await Promise.all([
    api<Department[]>('/api/departments'),
    api<ExpenseCategory[]>('/api/expense-categories'),
    api<WorkflowConfig>('/api/expenses/workflow'),
  ])
}

onMounted(async () => {
  const [settings] = await Promise.all([
    api<RateSettings & { employee_code_prefix?: string }>('/api/settings'),
    loadTypes(),
    loadSmtp(),
    loadExpenseConfig(),
  ])
  form.value = settings
  codePrefix.value = settings.employee_code_prefix ?? 'EMP-'
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
    const res = await api<RateSettings & { employee_code_prefix?: string }>('/api/settings', {
      method: 'PUT',
      json: { ...form.value, employee_code_prefix: codePrefix.value },
    })
    form.value = res
    codePrefix.value = res.employee_code_prefix ?? codePrefix.value
    saved.value = true
  })
}

function addType() {
  return run(async () => {
    await api('/api/work-types', { method: 'POST', json: newType.value })
    newType.value = { name: '', points_per_unit: 1, card_based: false }
    await loadTypes()
  })
}

// ---------------------------------------------------- departments & categories

function addDepartment() {
  return run(async () => {
    await api('/api/departments', { method: 'POST', json: { name: newDepartment.value } })
    newDepartment.value = ''
    await loadExpenseConfig()
  })
}

function saveDepartment(d: Department) {
  return run(async () => {
    await api(`/api/departments/${d.id}`, { method: 'PATCH', json: { name: d.name } })
    await loadExpenseConfig()
  })
}

function toggleDepartment(d: Department) {
  return run(async () => {
    await api(`/api/departments/${d.id}`, {
      method: 'PATCH',
      json: { active: d.active ? 0 : 1 },
    })
    await loadExpenseConfig()
  })
}

function addCategory() {
  return run(async () => {
    await api('/api/expense-categories', {
      method: 'POST',
      json: { name: newCategory.value },
    })
    newCategory.value = ''
    await loadExpenseConfig()
  })
}

function saveCategory(c: ExpenseCategory) {
  return run(async () => {
    await api(`/api/expense-categories/${c.id}`, { method: 'PATCH', json: { name: c.name } })
    await loadExpenseConfig()
  })
}

function toggleCategory(c: ExpenseCategory) {
  return run(async () => {
    await api(`/api/expense-categories/${c.id}`, {
      method: 'PATCH',
      json: { active: c.active ? 0 : 1 },
    })
    await loadExpenseConfig()
  })
}

function saveWorkflow() {
  workflowSaved.value = false
  return run(async () => {
    workflow.value = await api<WorkflowConfig>('/api/expenses/workflow', {
      method: 'PUT',
      json: workflow.value,
    })
    workflowSaved.value = true
  })
}

function saveType(wt: WorkTypeInfo) {
  return run(async () => {
    await api(`/api/work-types/${wt.id}`, {
      method: 'PATCH',
      json: { name: wt.name, points_per_unit: wt.points_per_unit, card_based: wt.card_based },
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
              <th>Cards</th>
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
              <td>
                <input
                  type="checkbox"
                  :checked="!!wt.card_based"
                  :title="'Log this type as cards'"
                  @change="wt.card_based = ($event.target as HTMLInputElement).checked ? 1 : 0"
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
        <label class="flex items-center gap-2 pb-2 text-sm">
          <input v-model="newType.card_based" type="checkbox" />
          Logged as cards
        </label>
        <button class="btn btn-solid" :disabled="busy">Add work type</button>
      </form>
      <p class="mt-2 text-xs text-muted">
        "Cards" types (e.g. Classification, QAP) are logged as individual cards
        (name, total audits, time completed); the count is the number of cards.
        Grant "Direct counts" to an employee to let them type the number instead.
      </p>
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
        <div>
          <label class="field-label" for="codeprefix">Employee code prefix</label>
          <input
            id="codeprefix"
            v-model="codePrefix"
            maxlength="12"
            class="field-input mono"
            placeholder="EMP-"
          />
          <p class="mt-1 text-xs text-muted">
            New employees get an auto code like {{ codePrefix }}004. Changing this
            only affects codes assigned from now on.
          </p>
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

    <!-- ================================================== expense vouchers -->
    <div class="panel">
      <h2 class="display mb-1 text-2xl">Expense approval workflow</h2>
      <p class="mb-4 text-sm text-muted">
        Which steps a submitted voucher passes through. Turning a step off
        routes vouchers past it — with both off, a submitted voucher is
        approved immediately.
      </p>
      <div class="mb-4 space-y-2 text-sm">
        <label class="flex items-center gap-2">
          <input v-model="workflow.require_manager" type="checkbox" />
          Manager review — the employee's <em>Reports to</em> approves first
        </label>
        <label class="flex items-center gap-2">
          <input v-model="workflow.require_finance" type="checkbox" />
          Finance review — a finance holder verifies before payment
        </label>
      </div>
      <p class="mb-4 text-xs text-muted">
        Employees with no manager assigned skip the manager step regardless of
        this setting, so vouchers never wait in a queue nobody owns.
      </p>
      <button class="btn btn-solid" :disabled="busy" @click="saveWorkflow">
        {{ busy ? 'Saving…' : 'Save workflow' }}
      </button>
      <span v-if="workflowSaved" class="ml-3 text-sm text-teal">Saved.</span>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">Departments</h2>
      <p class="mb-4 text-sm text-muted">
        Assign employees to a department in the Employees tab. Vouchers inherit
        the filer's department for reporting.
      </p>
      <div class="table-wrap mb-4">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in departments" :key="d.id" :class="{ 'opacity-50': !d.active }">
              <td><input v-model="d.name" class="field-input !w-56" /></td>
              <td>{{ d.active ? 'Active' : 'Inactive' }}</td>
              <td class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" :disabled="busy" @click="saveDepartment(d)">
                  Save
                </button>
                <button
                  class="btn btn-sm"
                  :class="d.active ? 'btn-danger' : ''"
                  :disabled="busy"
                  @click="toggleDepartment(d)"
                >
                  {{ d.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </td>
            </tr>
            <tr v-if="departments.length === 0">
              <td colspan="3" class="py-4 text-center text-muted">
                No departments yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addDepartment">
        <div>
          <label class="field-label" for="nd-name">New department</label>
          <input
            id="nd-name"
            v-model="newDepartment"
            required
            maxlength="80"
            class="field-input"
            placeholder="e.g. Operations"
          />
        </div>
        <button class="btn btn-solid" :disabled="busy">Add department</button>
      </form>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">Expense categories</h2>
      <p class="mb-4 text-sm text-muted">
        Categories offered on the voucher form and used to group the expense
        reports. Deactivating one keeps it on existing vouchers but hides it
        from new ones.
      </p>
      <div class="table-wrap mb-4">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in categories" :key="c.id" :class="{ 'opacity-50': !c.active }">
              <td><input v-model="c.name" class="field-input !w-56" /></td>
              <td>{{ c.active ? 'Active' : 'Inactive' }}</td>
              <td class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" :disabled="busy" @click="saveCategory(c)">
                  Save
                </button>
                <button
                  class="btn btn-sm"
                  :class="c.active ? 'btn-danger' : ''"
                  :disabled="busy"
                  @click="toggleCategory(c)"
                >
                  {{ c.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addCategory">
        <div>
          <label class="field-label" for="nc-name">New category</label>
          <input
            id="nc-name"
            v-model="newCategory"
            required
            maxlength="80"
            class="field-input"
            placeholder="e.g. Training"
          />
        </div>
        <button class="btn btn-solid" :disabled="busy">Add category</button>
      </form>
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

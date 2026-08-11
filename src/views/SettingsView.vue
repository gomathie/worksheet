<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { downloadJson } from '../csv'
import type {
  Department,
  DeviceTypeInfo,
  ExpenseCategory,
  PendingDeviceType,
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
const newType = ref({ name: '', points_per_unit: 1, card_based: false, module: '' })
const error = ref('')
const saved = ref(false)
const busy = ref(false)

// ---------------------------------------------------------- expense module
const departments = ref<Department[]>([])
const categories = ref<ExpenseCategory[]>([])
const newDepartment = ref('')
const newCategory = ref('')
const workflow = ref<WorkflowConfig>({ require_manager: true })
const workflowSaved = ref(false)

async function loadTypes() {
  workTypes.value = await api<WorkTypeInfo[]>('/api/work-types')
}

// ------------------------------------------------------------ device types
const deviceTypes = ref<DeviceTypeInfo[]>([])
const newDeviceType = ref('')
// Proposed by installers out in the field (see EntriesView's "Suggest a
// device type"); inactive and invisible everywhere else until decided here.
const pendingDeviceTypes = ref<PendingDeviceType[]>([])
const deviceTypeNotes = ref<Record<string, string>>({})

async function loadDeviceTypes() {
  deviceTypes.value = await api<DeviceTypeInfo[]>('/api/device-types')
}

async function loadPendingDeviceTypes() {
  pendingDeviceTypes.value = await api<PendingDeviceType[]>('/api/device-types/pending')
}

async function decideDeviceType(d: PendingDeviceType, decision: 'approved' | 'rejected') {
  const note = (deviceTypeNotes.value[d.id] ?? '').trim()
  if (decision === 'rejected' && !note) {
    error.value = 'A note is required when rejecting a device type.'
    return
  }
  error.value = ''
  busy.value = true
  try {
    await api(`/api/device-types/${d.id}/decide`, {
      method: 'POST',
      json: { decision, note: note || undefined },
    })
    delete deviceTypeNotes.value[d.id]
    await Promise.all([loadPendingDeviceTypes(), loadDeviceTypes()])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

function addDeviceType() {
  return run(async () => {
    await api('/api/device-types', { method: 'POST', json: { name: newDeviceType.value } })
    newDeviceType.value = ''
    await loadDeviceTypes()
  })
}

function saveDeviceType(d: DeviceTypeInfo) {
  return run(async () => {
    await api(`/api/device-types/${d.id}`, { method: 'PATCH', json: { name: d.name } })
    await loadDeviceTypes()
  })
}

function toggleDeviceType(d: DeviceTypeInfo) {
  return run(async () => {
    await api(`/api/device-types/${d.id}`, {
      method: 'PATCH',
      json: { active: d.active ? 0 : 1 },
    })
    await loadDeviceTypes()
  })
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
    loadDeviceTypes(),
    loadPendingDeviceTypes(),
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
    newType.value = { name: '', points_per_unit: 1, card_based: false, module: '' }
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
      json: {
        name: wt.name,
        points_per_unit: wt.points_per_unit,
        card_based: wt.card_based,
        module: wt.module ?? null,
      },
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

</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="panel">
      <h2 class="display mb-1 text-2xl">Work types &amp; points</h2>
      <p class="mb-5 text-sm text-muted">
        Each work type is worth points per unit. Assign types to employees in the
        Employees tab — employees can only log the types assigned to them.
        Changing a rate recalculates every past and future figure. A module
        groups related types together, e.g. Classification and QAP under
        <em>Data Analytics</em>; leave it blank for a standalone type.
      </p>

      <div class="table-wrap mb-5">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Module</th>
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
              <td>
                <input
                  v-model="wt.module"
                  class="field-input !w-40"
                  placeholder="none"
                  :aria-label="`Module for ${wt.name}`"
                />
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
          <label class="field-label" for="nt-module">Module (optional)</label>
          <input
            id="nt-module"
            v-model="newType.module"
            maxlength="60"
            class="field-input !w-40"
            placeholder="e.g. Data Analytics"
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
      <h2 class="display mb-1 text-2xl">Device types</h2>
      <p class="mb-5 text-sm text-muted">
        The device makes offered on an installation card (Telematics
        Installation → device type, and the make replaced on a replacement
        job). Deactivating one keeps it on past entries but hides it from new
        ones.
      </p>

      <template v-if="pendingDeviceTypes.length">
        <h3 class="display mb-1 text-lg">Suggested by installers</h3>
        <p class="mb-3 text-sm text-muted">
          Anyone assigned installation work can suggest a device that's
          missing. Not selectable on any card until approved here.
        </p>
        <div class="table-wrap mb-5">
          <table class="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Suggested by</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in pendingDeviceTypes" :key="d.id">
                <td>{{ d.name }}</td>
                <td class="text-xs">{{ d.created_by_name ?? '—' }}</td>
                <td>
                  <input
                    v-model="deviceTypeNotes[d.id]"
                    class="field-input !w-48"
                    maxlength="500"
                    placeholder="Required to reject"
                    :aria-label="`Note for ${d.name}`"
                  />
                </td>
                <td class="whitespace-nowrap">
                  <button
                    class="btn btn-sm btn-solid mr-1"
                    :disabled="busy"
                    @click="decideDeviceType(d, 'approved')"
                  >
                    Approve
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    :disabled="busy"
                    @click="decideDeviceType(d, 'rejected')"
                  >
                    Reject
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div class="table-wrap mb-5">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in deviceTypes" :key="d.id" :class="{ 'opacity-50': !d.active }">
              <td><input v-model="d.name" class="field-input !w-56" /></td>
              <td>{{ d.active ? 'Active' : 'Inactive' }}</td>
              <td class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" :disabled="busy" @click="saveDeviceType(d)">
                  Save
                </button>
                <button
                  class="btn btn-sm"
                  :class="d.active ? 'btn-danger' : ''"
                  :disabled="busy"
                  @click="toggleDeviceType(d)"
                >
                  {{ d.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </td>
            </tr>
            <tr v-if="deviceTypes.length === 0">
              <td colspan="3" class="py-4 text-center text-muted">No device types yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addDeviceType">
        <div>
          <label class="field-label" for="ndt-name">New device type</label>
          <input
            id="ndt-name"
            v-model="newDeviceType"
            required
            maxlength="60"
            class="field-input"
            placeholder="e.g. Ruptela"
          />
        </div>
        <button class="btn btn-solid" :disabled="busy">Add device type</button>
      </form>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">Money &amp; currency</h2>
      <p class="mb-5 text-sm text-muted">
        Remuneration = points × value per point, plus bonuses and approved
        reimbursements.
      </p>
      <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="saveSettings">
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
      </div>
      <p class="mb-4 text-xs text-muted">
        Employees with no manager assigned skip the manager step regardless of
        this setting, so vouchers never wait in a queue nobody owns. Approval
        itself is never optional, and recording always follows it.
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

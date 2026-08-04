<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { DATA_SCOPE_LABELS, type DataScope } from '../types'
import type { Department, Employee, WorkTypeInfo } from '../types'

const employees = ref<Employee[]>([])
const workTypes = ref<WorkTypeInfo[]>([])
const departments = ref<Department[]>([])
const error = ref('')
const busy = ref(false)
const editingId = ref<string | null>(null)

const activeTypes = computed(() =>
  workTypes.value.filter((w) => w.active === undefined || w.active),
)

const activeDepartments = computed(() => departments.value.filter((d) => d.active))

// A manager can be anyone active except the employee being edited — that
// would make them their own approver.
const managerOptions = computed(() =>
  employees.value.filter((e) => e.active && e.id !== editingId.value),
)

const blankRights = () => ({
  add_entries: true,
  edit_entries: true,
  delete_entries: true,
  view_dashboard: false,
  view_reports: false,
  view_remuneration: false,
  view_payslip: false,
  view_points: false,
  log_leave: false,
  direct_counts: false,
  add_expenses: true,
  review_expenses: false,
  finance_expenses: false,
  approve_expenses: false,
  add_users: false,
  approve_users: false,
  use_petty_cash: false,
})

const form = ref({
  name: '',
  email: '',
  username: '',
  password: '',
  role: 'employee',
  rights: blankRights(),
  work_type_ids: [] as string[],
  rate_overrides: {} as Record<string, number | ''>,
  max_entries_per_day: '' as number | '',
  leave_allowance: '' as number | '',
  department_id: '' as string,
  manager_id: '' as string,
  data_scope: 'own' as DataScope,
})

// Points and pay are mutually exclusive off the admin role: showing both lets
// the holder divide one by the other and read the value per point. The server
// enforces it in parseRights; this keeps the form honest about it.
const grantsOwnPay = computed(
  () => form.value.rights.view_remuneration || form.value.rights.view_payslip,
)
watch(grantsOwnPay, (on) => {
  if (on) form.value.rights.view_points = false
})

async function load() {
  ;[employees.value, workTypes.value, departments.value] = await Promise.all([
    api<Employee[]>('/api/employees'),
    api<WorkTypeInfo[]>('/api/work-types'),
    api<Department[]>('/api/departments'),
  ])
}
onMounted(load)

function startEdit(e: Employee) {
  editingId.value = e.id
  form.value = {
    name: e.name,
    email: e.email ?? '',
    username: e.username ?? '',
    password: '',
    role: e.role,
    rights: { ...e.rights },
    work_type_ids: [...e.work_type_ids],
    rate_overrides: { ...e.rate_overrides },
    max_entries_per_day: e.max_entries_per_day ?? '',
    leave_allowance: e.leave_allowance ?? '',
    department_id: e.department_id ?? '',
    manager_id: e.manager_id ?? '',
    data_scope: e.data_scope ?? 'own',
  }
}

function resetForm() {
  editingId.value = null
  form.value = {
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'employee',
    rights: blankRights(),
    work_type_ids: activeTypes.value.map((w) => w.id),
    rate_overrides: {},
    max_entries_per_day: '',
    leave_allowance: '',
    department_id: '',
    manager_id: '',
    data_scope: 'own',
  }
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name,
      email: form.value.email || null,
      username: form.value.username || null,
      role: form.value.role,
      rights: form.value.rights,
      work_type_ids: form.value.work_type_ids,
      rate_overrides: Object.fromEntries(
        Object.entries(form.value.rate_overrides).filter(
          ([id, v]) => form.value.work_type_ids.includes(id) && v !== '' && v !== null,
        ),
      ),
      max_entries_per_day:
        form.value.max_entries_per_day === '' ? null : form.value.max_entries_per_day,
      leave_allowance:
        form.value.leave_allowance === '' ? null : form.value.leave_allowance,
      department_id: form.value.department_id || null,
      manager_id: form.value.manager_id || null,
      data_scope: form.value.data_scope,
    }
    if (form.value.password) payload.password = form.value.password
    if (editingId.value) {
      await api(`/api/employees/${editingId.value}`, { method: 'PATCH', json: payload })
    } else {
      await api('/api/employees', { method: 'POST', json: payload })
    }
    resetForm()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    busy.value = false
  }
}

async function toggleActive(e: Employee) {
  error.value = ''
  try {
    if (e.active) {
      if (!confirm(`Deactivate ${e.name}? Their entries are kept.`)) return
      await api(`/api/employees/${e.id}`, { method: 'DELETE' })
    } else {
      await api(`/api/employees/${e.id}`, { method: 'PATCH', json: { active: 1 } })
    }
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update'
  }
}

function workSummary(e: Employee): string {
  const names = activeTypes.value
    .filter((w) => e.work_type_ids.includes(w.id))
    .map((w) => {
      const custom = e.rate_overrides?.[w.id]
      return custom !== undefined ? `${w.name} @${custom}` : w.name
    })
  return names.length ? names.join(', ') : 'Hours only'
}

function rightsSummary(e: Employee): string {
  if (e.role === 'admin') {
    // Approval is the one right the role does not carry, so spell it out.
    const extra = [
      e.rights.approve_expenses ? 'expense approval' : null,
      e.rights.approve_users ? 'user approval' : null,
    ].filter(Boolean)
    return extra.length
      ? `All rights, incl. ${extra.join(' & ')}`
      : 'All rights, no approval authority'
  }
  const labels: [keyof Employee['rights'], string][] = [
    ['add_entries', 'Add time'],
    ['edit_entries', 'Edit time'],
    ['delete_entries', 'Delete time'],
    ['view_dashboard', 'Dashboard'],
    ['view_reports', 'Reports'],
    ['view_remuneration', 'Remuneration'],
    ['view_payslip', 'Payslip'],
    ['view_points', 'Points'],
    ['log_leave', 'Leave'],
    ['direct_counts', 'Direct counts'],
    ['add_expenses', 'File expenses'],
    ['review_expenses', 'Review expenses'],
    ['finance_expenses', 'Expense finance'],
    ['add_users', 'Add users'],
    ['use_petty_cash', 'Petty cash'],
  ]
  // approve_* are deliberately absent: both require the admin role, so for a
  // non-admin they would claim an authority the API refuses to honour.
  const granted = labels.filter(([key]) => e.rights[key]).map(([, label]) => label)
  return granted.length ? granted.join(', ') : 'View own entries only'
}

/**
 * Changing the role re-seeds the rights and scope, mirroring the server's
 * defaultRightsForRole. Only applied when adding — editing an existing person
 * must not silently rewrite rights an admin has already tuned.
 */
function applyRoleDefaults() {
  if (editingId.value) return
  const r = form.value.rights
  if (form.value.role === 'manager') {
    r.view_dashboard = true
    r.view_reports = true
    r.review_expenses = true
    form.value.data_scope = 'direct_reports'
  } else if (form.value.role === 'admin') {
    form.value.data_scope = 'all'
  } else {
    r.view_dashboard = false
    r.view_reports = false
    r.review_expenses = false
    form.value.data_scope = 'own'
  }
}

const departmentName = (e: Employee) =>
  departments.value.find((d) => d.id === e.department_id)?.name ?? '—'

const managerName = (e: Employee) =>
  employees.value.find((m) => m.id === e.manager_id)?.name ?? '—'
</script>

<template>
  <div>
    <div class="panel mb-6">
      <h2 class="display mb-4 text-2xl">
        {{ editingId ? 'Edit employee' : 'Add employee' }}
      </h2>
      <form @submit.prevent="submit">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label class="field-label" for="name">Name</label>
            <input id="name" v-model="form.name" required class="field-input" />
          </div>
          <div>
            <label class="field-label" for="email">Email (optional)</label>
            <input id="email" v-model="form.email" type="email" class="field-input" />
          </div>
          <div>
            <label class="field-label" for="role">Role</label>
            <select id="role" v-model="form.role" class="field-input" @change="applyRoleDefaults">
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <p class="mt-1 text-xs text-muted">
              The role pre-fills the rights below; adjust any of them afterwards.
            </p>
          </div>
          <div>
            <label class="field-label" for="dept">Department</label>
            <select id="dept" v-model="form.department_id" class="field-input">
              <option value="">—</option>
              <option v-for="d in activeDepartments" :key="d.id" :value="d.id">
                {{ d.name }}
              </option>
            </select>
            <p class="mt-1 text-xs text-muted">Manage the list in Settings.</p>
          </div>
          <div>
            <label class="field-label" for="mgr">Reports to (expense approver)</label>
            <select id="mgr" v-model="form.manager_id" class="field-input">
              <option value="">— no manager —</option>
              <option v-for="m in managerOptions" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
            <p class="mt-1 text-xs text-muted">
              Without a manager, their vouchers skip straight to finance.
            </p>
          </div>
          <div>
            <label class="field-label" for="scope">Data they can see</label>
            <select
              id="scope"
              v-model="form.data_scope"
              class="field-input"
              :disabled="form.role === 'admin'"
            >
              <option v-for="(label, value) in DATA_SCOPE_LABELS" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
            <p class="mt-1 text-xs text-muted">
              {{
                form.role === 'admin'
                  ? 'Admins always see everything.'
                  : 'Applies to the dashboard, reports, and expense lists.'
              }}
            </p>
          </div>
          <div>
            <label class="field-label" for="username">Username (for login)</label>
            <input
              id="username"
              v-model="form.username"
              autocapitalize="none"
              spellcheck="false"
              class="field-input"
              placeholder="e.g. ama.k"
            />
          </div>
          <div>
            <label class="field-label" for="password">
              {{ editingId ? 'New password (blank = keep current)' : 'Password' }}
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              class="field-input"
              placeholder="min. 8 characters"
            />
          </div>
          <div>
            <label class="field-label" for="maxpd">Max entries/day</label>
            <input
              id="maxpd"
              v-model.number="form.max_entries_per_day"
              type="number"
              min="0"
              step="1"
              class="field-input mono"
              placeholder="use default"
            />
          </div>
          <div>
            <label class="field-label" for="leave">Annual leave (days)</label>
            <input
              id="leave"
              v-model.number="form.leave_allowance"
              type="number"
              min="0"
              step="1"
              class="field-input mono"
              placeholder="not tracked"
            />
          </div>
        </div>

        <fieldset class="mt-4">
          <legend class="field-label">Work they do (types they can log)</legend>
          <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div
              v-for="wt in activeTypes"
              :key="wt.id"
              class="flex items-center gap-2"
            >
              <label class="flex items-center gap-2">
                <input v-model="form.work_type_ids" type="checkbox" :value="wt.id" />
                {{ wt.name }}
              </label>
              <input
                v-if="form.work_type_ids.includes(wt.id)"
                v-model.number="form.rate_overrides[wt.id]"
                type="number"
                min="0"
                step="any"
                class="field-input mono !w-20 text-right"
                :placeholder="String(wt.points_per_unit ?? '')"
                :title="`Custom points per unit (blank = general rate ${wt.points_per_unit})`"
              />
            </div>
          </div>
          <p class="mt-1 text-xs text-muted">
            The box next to each ticked type is an optional custom rate (points per
            unit) for this employee — leave blank to use the general rate. Untick
            everything for staff tracked by hours &amp; notes only. Manage types and
            general rates in Settings.
          </p>
        </fieldset>

        <!-- Expense approval sits outside the Rights fieldset below because
             that fieldset is disabled for admins — and this is the one right
             an admin does *not* get automatically. -->
        <fieldset class="mt-4">
          <legend class="field-label">User administration</legend>
          <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="form.rights.add_users" type="checkbox" />
              Add new users
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.use_petty_cash" type="checkbox" />
              Hold a petty cash float
            </label>
          </div>
          <p class="mt-1 text-xs text-muted">
            A non-admin with this right can propose an account. It stays pending
            and cannot sign in until somebody with approval authority approves
            it — and they cannot set the new person's role or rights.
          </p>
        </fieldset>

        <fieldset class="mt-4 rounded-lg border border-teal bg-teal-soft p-3">
          <legend class="field-label px-1">Approval authority</legend>
          <label class="mb-2 flex items-start gap-2 text-sm">
            <input
              v-model="form.rights.approve_users"
              type="checkbox"
              class="mt-1"
              :disabled="form.role !== 'admin'"
            />
            <span>
              Approve new user accounts
              <span v-if="form.role !== 'admin'" class="block text-xs text-muted">
                Only available to admins.
              </span>
            </span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input
              v-model="form.rights.approve_expenses"
              type="checkbox"
              class="mt-1"
              :disabled="form.role !== 'admin'"
            />
            <span>
              Give final approval on expense vouchers
              <span v-if="form.role !== 'admin'" class="block text-xs text-muted">
                Only available to admins — change the role above to grant it.
              </span>
              <span v-else class="block text-xs text-muted">
                Not granted by the admin role on its own. Without this, this
                admin can see vouchers but cannot approve them, and nothing can
                be recorded in the finance records.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset class="mt-4" :disabled="form.role === 'admin'">
          <legend class="field-label">Rights</legend>
          <p v-if="form.role === 'admin'" class="mb-2 text-xs text-muted">
            Admins hold every right except expense approval (above), plus
            employee and settings management.
          </p>
          <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="form.rights.add_entries" type="checkbox" />
              Add own time entries
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.edit_entries" type="checkbox" />
              Edit own time entries
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.delete_entries" type="checkbox" />
              Delete own time entries
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.view_dashboard" type="checkbox" />
              View team dashboard
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.view_reports" type="checkbox" />
              View monthly reports
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.view_remuneration" type="checkbox" />
              View own remuneration (Payments tab)
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.view_payslip" type="checkbox" />
              View own payslip
            </label>
            <label
              class="flex items-center gap-2"
              :class="{ 'opacity-50': grantsOwnPay }"
              :title="
                grantsOwnPay
                  ? 'Unavailable alongside a pay right — points next to an amount would reveal the value per point.'
                  : ''
              "
            >
              <input
                v-model="form.rights.view_points"
                type="checkbox"
                :disabled="grantsOwnPay"
              />
              View own points (output score, no money)
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.log_leave" type="checkbox" />
              Record paid leave
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.direct_counts" type="checkbox" />
              Enter Classification/QAP counts directly (skip cards)
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.add_expenses" type="checkbox" />
              File expense vouchers
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.review_expenses" type="checkbox" />
              Review expenses (their direct reports)
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.finance_expenses" type="checkbox" />
              Expense finance (send for approval &amp; record)
            </label>
          </div>
          <p class="mt-2 text-xs text-muted">
            "Review expenses" only covers employees whose <em>Reports to</em> is set to
            this person. "Expense finance" applies organization-wide.
          </p>
        </fieldset>

        <div class="mt-5 flex gap-2">
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : editingId ? 'Save' : 'Add' }}
          </button>
          <button v-if="editingId" type="button" class="btn" @click="resetForm">
            Cancel
          </button>
        </div>
      </form>
      <p v-if="error" class="mt-3 rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
        {{ error }}
      </p>
    </div>

    <div class="panel">
      <h2 class="display mb-4 text-2xl">Team</h2>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Department</th>
              <th>Reports to</th>
              <th>Work</th>
              <th>Rights</th>
              <th>Login</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in employees" :key="e.id" :class="{ 'opacity-50': !e.active }">
              <td class="mono text-[13px] whitespace-nowrap">{{ e.employee_code ?? '—' }}</td>
              <td>
                {{ e.name }}
                <div v-if="e.email" class="mono text-xs text-muted">{{ e.email }}</div>
              </td>
              <td class="mono text-[13px]">{{ e.username ?? '—' }}</td>
              <td>
                <span
                  class="display rounded-full border px-2 py-0.5 text-xs tracking-wider"
                  :class="
                    e.role === 'admin'
                      ? 'border-teal text-teal'
                      : e.role === 'manager'
                        ? 'border-amber text-amber'
                        : 'border-line text-muted'
                  "
                  >{{ e.role }}</span
                >
              </td>
              <td class="text-xs">{{ departmentName(e) }}</td>
              <td class="text-xs">{{ managerName(e) }}</td>
              <td class="text-xs">{{ workSummary(e) }}</td>
              <td class="text-xs">{{ rightsSummary(e) }}</td>
              <td class="text-xs">
                {{ e.username && e.has_password ? 'Enabled' : 'No credentials' }}
              </td>
              <td>{{ e.active ? 'Active' : 'Inactive' }}</td>
              <td class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" @click="startEdit(e)">Edit</button>
                <button
                  class="btn btn-sm"
                  :class="e.active ? 'btn-danger' : ''"
                  @click="toggleActive(e)"
                >
                  {{ e.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

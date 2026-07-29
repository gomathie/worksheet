<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
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
  log_leave: false,
  direct_counts: false,
  add_expenses: true,
  review_expenses: false,
  finance_expenses: false,
  approve_expenses: false,
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
    return e.rights.approve_expenses
      ? 'All rights, incl. expense approval'
      : 'All rights, except expense approval'
  }
  const labels: [keyof Employee['rights'], string][] = [
    ['add_entries', 'Add time'],
    ['edit_entries', 'Edit time'],
    ['delete_entries', 'Delete time'],
    ['view_dashboard', 'Dashboard'],
    ['view_reports', 'Reports'],
    ['view_remuneration', 'Remuneration'],
    ['view_payslip', 'Payslip'],
    ['log_leave', 'Leave'],
    ['direct_counts', 'Direct counts'],
    ['add_expenses', 'File expenses'],
    ['review_expenses', 'Review expenses'],
    ['finance_expenses', 'Expense finance'],
    ['approve_expenses', 'Approve expenses'],
  ]
  const granted = labels.filter(([key]) => e.rights[key]).map(([, label]) => label)
  return granted.length ? granted.join(', ') : 'View own entries only'
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
            <select id="role" v-model="form.role" class="field-input">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
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
        <fieldset class="mt-4 rounded-lg border border-teal bg-teal-soft p-3">
          <legend class="field-label px-1">Expense approval authority</legend>
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
                  :class="e.role === 'admin' ? 'border-teal text-teal' : 'border-line text-muted'"
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

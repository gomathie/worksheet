<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { computeHours } from '../../shared/logic'
import { downloadCsv } from '../csv'
import { useAuthStore } from '../stores/auth'
import type { Employee, Entry, EntryCard, WorkTypeInfo } from '../types'

const auth = useAuthStore()

const employees = ref<Employee[]>([])
const workTypes = ref<WorkTypeInfo[]>([])
const entries = ref<Entry[]>([])
const month = ref('')
const filterEmployee = ref('')
const error = ref('')
const busy = ref(false)
const editingId = ref<string | null>(null)

const form = ref({
  employee_id: '',
  work_date: '',
  time_start: '09:00',
  time_end: '17:00',
  units: {} as Record<string, number>,
  cards: [] as EntryCard[],
  notes: '',
})

const hoursPreview = computed(() => {
  try {
    return computeHours(form.value.time_start, form.value.time_end).toFixed(2)
  } catch {
    return '—'
  }
})

const activeEmployees = computed(() => employees.value.filter((e) => e.active))
const activeTypes = computed(() =>
  workTypes.value.filter((w) => w.active === undefined || w.active),
)

// Only the work types assigned to the employee being logged for.
const formTypes = computed(() => {
  if (!auth.isAdmin) {
    const mine = new Set(auth.user!.work_types.map((w) => w.id))
    return activeTypes.value.filter((w) => mine.has(w.id))
  }
  const target = employees.value.find((e) => e.id === form.value.employee_id)
  const assigned = new Set(target?.work_type_ids ?? [])
  return activeTypes.value.filter((w) => assigned.has(w.id))
})

// Card-based types are logged as cards unless the user may enter counts directly.
const canDirect = computed(() => auth.isAdmin || auth.rights.direct_counts)
const isCardMode = (w: WorkTypeInfo) => Boolean(w.card_based) && !canDirect.value
const numericTypes = computed(() => formTypes.value.filter((w) => !isCardMode(w)))
const cardTypes = computed(() => formTypes.value.filter((w) => isCardMode(w)))

const cardsFor = (typeId: string) =>
  form.value.cards.filter((c) => c.work_type_id === typeId)
function addCard(typeId: string) {
  form.value.cards.push({
    work_type_id: typeId,
    card_name: '',
    total_audits: 0,
    time_completed: '',
  })
}
function removeCard(card: EntryCard) {
  const i = form.value.cards.indexOf(card)
  if (i >= 0) form.value.cards.splice(i, 1)
}

// Card names used before, per type — the same cards recur, so they are offered
// as suggestions rather than retyped. A name not in the list can still be
// typed; it joins the list once the entry is saved.
const cardNames = ref<Record<string, string[]>>({})

async function loadCardNames() {
  try {
    cardNames.value = await api<Record<string, string[]>>('/api/card-names')
  } catch {
    // Suggestions are a convenience — losing them must not block logging work.
    cardNames.value = {}
  }
}

const namesFor = (typeId: string) => cardNames.value[typeId] ?? []

/** The cards behind an entry's count for one work type, for the entries list. */
const cardNamesFor = (entry: Entry, typeId: string) =>
  (entry.cards ?? [])
    .filter((c) => c.work_type_id === typeId)
    .map((c) => c.card_name)
    .join(', ')

async function loadEntries() {
  const params = new URLSearchParams({ month: month.value })
  if (auth.isAdmin && filterEmployee.value) {
    params.set('employee_id', filterEmployee.value)
  }
  entries.value = await api<Entry[]>(`/api/entries?${params}`)
}

onMounted(async () => {
  const today = auth.user!.today
  month.value = today.slice(0, 7)
  form.value.work_date = today
  form.value.employee_id = auth.user!.id
  ;[employees.value, workTypes.value] = await Promise.all([
    api<Employee[]>('/api/employees'),
    api<WorkTypeInfo[]>('/api/work-types'),
  ])
  await Promise.all([loadEntries(), loadCardNames()])
})

watch([month, filterEmployee], loadEntries)

function resetForm() {
  editingId.value = null
  form.value = {
    employee_id: auth.user!.id,
    work_date: auth.user!.today,
    time_start: '09:00',
    time_end: '17:00',
    units: {},
    cards: [],
    notes: '',
  }
}

function startEdit(entry: Entry) {
  editingId.value = entry.id
  form.value = {
    employee_id: entry.employee_id,
    work_date: entry.work_date,
    time_start: entry.time_start,
    time_end: entry.time_end,
    units: { ...entry.units },
    cards: (entry.cards ?? []).map((c) => ({ ...c })),
    notes: entry.notes ?? '',
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    // Typed counts for numeric types only; card-based types go via `cards`.
    const numericIds = new Set(numericTypes.value.map((w) => w.id))
    const items: Record<string, number> = {}
    for (const [id, n] of Object.entries(form.value.units)) {
      if (numericIds.has(id) && n > 0) items[id] = n
    }
    const cardIds = new Set(cardTypes.value.map((w) => w.id))
    const cards = form.value.cards
      .filter((c) => cardIds.has(c.work_type_id) && c.card_name.trim())
      .map((c) => ({
        work_type_id: c.work_type_id,
        card_name: c.card_name.trim(),
        total_audits: Number(c.total_audits) || 0,
        time_completed: c.time_completed || null,
      }))
    const payload = {
      employee_id: form.value.employee_id,
      work_date: form.value.work_date,
      time_start: form.value.time_start,
      time_end: form.value.time_end,
      items,
      cards,
      notes: form.value.notes || null,
    }
    if (editingId.value) {
      await api(`/api/entries/${editingId.value}`, { method: 'PATCH', json: payload })
    } else {
      await api('/api/entries', { method: 'POST', json: payload })
    }
    resetForm()
    await loadEntries()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save entry'
  } finally {
    busy.value = false
  }
}

async function remove(entry: Entry) {
  if (!confirm(`Delete the ${entry.work_date} entry?`)) return
  await api(`/api/entries/${entry.id}`, { method: 'DELETE' })
  if (editingId.value === entry.id) resetForm()
  await loadEntries()
}

function exportCsv() {
  const header = [
    'Date',
    ...(auth.isAdmin ? ['Employee'] : []),
    'Start',
    'End',
    'Hours',
    ...activeTypes.value.map((w) => w.name),
    'Notes',
  ]
  const rows = entries.value.map((e) => [
    e.work_date,
    ...(auth.isAdmin ? [e.employee_name ?? ''] : []),
    e.time_start,
    e.time_end,
    e.hours,
    ...activeTypes.value.map((w) => e.units[w.id] ?? 0),
    e.notes ?? '',
  ])
  downloadCsv(`entries-${month.value}.csv`, [header, ...rows])
}

// Per-day entry cap (0 = unlimited; admins exempt). Best-effort client guard;
// the server is authoritative.
const entryLimit = computed(() => auth.user!.entry_limit)
const usedOnFormDate = computed(
  () =>
    entries.value.filter(
      (e) => e.work_date === form.value.work_date && e.employee_id === form.value.employee_id,
    ).length,
)
const limitReached = computed(
  () =>
    !auth.isAdmin &&
    !editingId.value &&
    entryLimit.value > 0 &&
    usedOnFormDate.value >= entryLimit.value,
)

const approvalOn = computed(() => auth.user!.entry_approval)

async function setStatus(entry: Entry, status: 'approved' | 'rejected') {
  error.value = ''
  try {
    await api(`/api/entries/${entry.id}/status`, { method: 'PATCH', json: { status } })
    await loadEntries()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update status'
  }
}

const statusLabel = (s: string) =>
  s === 'pending' ? 'Pending' : s === 'rejected' ? 'Rejected' : 'Approved'

const showActions = computed(
  () => auth.rights.edit_entries || auth.rights.delete_entries,
)
const tableColspan = computed(
  () =>
    (auth.isAdmin ? 6 : 5) +
    activeTypes.value.length +
    (approvalOn.value ? 1 : 0) +
    (showActions.value ? 1 : 0),
)
</script>

<template>
  <div>
    <div v-if="auth.rights.add_entries || editingId" class="panel mb-6">
      <h2 class="display mb-4 text-2xl">
        {{ editingId ? 'Edit entry' : 'Log time' }}
      </h2>
      <form class="grid grid-cols-2 gap-4 md:grid-cols-4" @submit.prevent="submit">
        <div class="col-span-2">
          <label class="field-label" for="emp">Employee</label>
          <select
            id="emp"
            v-model="form.employee_id"
            class="field-input"
            :disabled="!auth.isAdmin"
          >
            <option v-for="e in activeEmployees" :key="e.id" :value="e.id">
              {{ e.name }}
            </option>
          </select>
        </div>
        <div class="col-span-2 md:col-span-2">
          <label class="field-label" for="date">Date</label>
          <input
            id="date"
            v-model="form.work_date"
            type="date"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="start">Time start</label>
          <input
            id="start"
            v-model="form.time_start"
            type="time"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="end">Time end</label>
          <input
            id="end"
            v-model="form.time_end"
            type="time"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="hours">Hours</label>
          <input
            id="hours"
            :value="hoursPreview"
            readonly
            class="field-input mono bg-teal-soft"
            tabindex="-1"
          />
        </div>
        <div class="col-span-2 grid grid-cols-2 gap-4 md:col-span-4 md:grid-cols-4">
          <div v-for="wt in numericTypes" :key="wt.id">
            <label class="field-label" :for="`wt-${wt.id}`">{{ wt.name }}</label>
            <input
              :id="`wt-${wt.id}`"
              v-model.number="form.units[wt.id]"
              type="number"
              min="0"
              step="1"
              class="field-input mono"
              placeholder="0"
            />
          </div>
          <p
            v-if="formTypes.length === 0"
            class="col-span-full self-center text-sm text-muted"
          >
            No countable work types assigned — only hours and notes are recorded.
          </p>
        </div>

        <!-- Card-based types: one row per card; the count is the number of cards. -->
        <div
          v-for="wt in cardTypes"
          :key="wt.id"
          class="col-span-2 rounded-lg border border-line p-3 md:col-span-4"
        >
          <div class="mb-2 flex items-center justify-between">
            <span class="field-label">
              {{ wt.name }} cards
              <span class="mono ml-2 text-teal">{{ cardsFor(wt.id).length }}</span>
            </span>
            <button type="button" class="btn btn-sm" @click="addCard(wt.id)">
              + Add card
            </button>
          </div>
          <!-- Previously used names for this type. A datalist suggests them
               while still allowing a new name to be typed. -->
          <datalist :id="`card-names-${wt.id}`">
            <option v-for="n in namesFor(wt.id)" :key="n" :value="n" />
          </datalist>
          <!-- One set of column headings for the whole list. Hidden below md,
               where the row grid collapses and each field carries its own. -->
          <div
            v-if="cardsFor(wt.id).length > 0"
            class="mb-1 hidden gap-2 md:grid md:grid-cols-[2fr_1fr_1fr_auto]"
          >
            <span class="field-label">Card name</span>
            <span class="field-label">Total audits</span>
            <span class="field-label">Time completed</span>
            <span aria-hidden="true" />
          </div>
          <div
            v-for="(c, i) in cardsFor(wt.id)"
            :key="i"
            class="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]"
          >
            <!-- The label wrappers carry `md:hidden`, not the labels:
                 `.field-label` sets `display: block` from unlayered CSS, which
                 outranks Tailwind's layered utilities and would win. -->
            <div>
              <div class="md:hidden">
                <label class="field-label" :for="`card-${wt.id}-${i}-name`">
                  Card name
                </label>
              </div>
              <input
                :id="`card-${wt.id}-${i}-name`"
                v-model="c.card_name"
                :list="`card-names-${wt.id}`"
                autocomplete="off"
                :placeholder="namesFor(wt.id).length ? 'Pick or type a name' : 'Card name'"
                class="field-input"
              />
            </div>
            <div>
              <div class="md:hidden">
                <label class="field-label" :for="`card-${wt.id}-${i}-audits`">
                  Total audits
                </label>
              </div>
              <input
                :id="`card-${wt.id}-${i}-audits`"
                v-model.number="c.total_audits"
                type="number"
                min="0"
                step="1"
                placeholder="Total audits"
                class="field-input mono"
              />
            </div>
            <div>
              <div class="md:hidden">
                <label class="field-label" :for="`card-${wt.id}-${i}-time`">
                  Time completed
                </label>
              </div>
              <input
                :id="`card-${wt.id}-${i}-time`"
                v-model="c.time_completed"
                type="time"
                class="field-input mono"
              />
            </div>
            <!-- Full-width on a one-column phone layout reads as an error bar,
                 so keep it shrink-wrapped and right-aligned there. -->
            <button
              type="button"
              class="btn btn-sm btn-danger justify-self-end md:self-start"
              :aria-label="`Remove card ${i + 1}`"
              @click="removeCard(c)"
            >
              <span class="md:hidden">Remove</span>
              <span class="hidden md:inline">✕</span>
            </button>
          </div>
          <p v-if="cardsFor(wt.id).length === 0" class="text-xs text-muted">
            No cards yet — add one per {{ wt.name }} card completed.
          </p>
        </div>
        <div class="col-span-2 md:col-span-4">
          <label class="field-label" for="notes">Notes (optional)</label>
          <input
            id="notes"
            v-model="form.notes"
            class="field-input"
            placeholder="Anything worth remembering about this shift"
          />
        </div>
        <div class="col-span-2 flex flex-wrap items-center gap-2 md:col-span-4">
          <button class="btn btn-solid" :disabled="busy || limitReached">
            {{ busy ? 'Saving…' : editingId ? 'Save changes' : 'Add entry' }}
          </button>
          <button v-if="editingId" type="button" class="btn" @click="resetForm">
            Cancel
          </button>
          <span v-if="!auth.isAdmin && entryLimit > 0" class="text-xs text-muted">
            <template v-if="limitReached">
              Daily limit reached ({{ entryLimit }}/day) for this date.
            </template>
            <template v-else>
              {{ usedOnFormDate }} of {{ entryLimit }} entries used for this date.
            </template>
          </span>
          <span v-if="!auth.isAdmin && approvalOn" class="text-xs text-muted">
            Entries need admin approval before they count.
          </span>
        </div>
      </form>
      <p v-if="error" class="mt-3 rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
        {{ error }}
      </p>
    </div>

    <div class="panel">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="display text-2xl">Recent entries</h2>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="btn btn-sm"
            :disabled="entries.length === 0"
            @click="exportCsv"
          >
            Download CSV
          </button>
          <input
            v-model="month"
            type="month"
            class="field-input mono !w-auto"
            aria-label="Filter month"
          />
          <select
            v-if="auth.isAdmin"
            v-model="filterEmployee"
            class="field-input !w-auto"
            aria-label="Filter employee"
          >
            <option value="">All employees</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">
              {{ e.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Date</th>
              <th v-if="auth.isAdmin">Employee</th>
              <th class="num">Start</th>
              <th class="num">End</th>
              <th class="num">Hours</th>
              <th v-for="wt in activeTypes" :key="wt.id" class="num">{{ wt.name }}</th>
              <th>Notes</th>
              <th v-if="approvalOn">Status</th>
              <th v-if="showActions"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td class="mono whitespace-nowrap">{{ e.work_date }}</td>
              <td v-if="auth.isAdmin">{{ e.employee_name }}</td>
              <td class="num">{{ e.time_start }}</td>
              <td class="num">{{ e.time_end }}</td>
              <td class="num">{{ e.hours.toFixed(2) }}</td>
              <!-- The count alone does not say *which* cards were done, which
                   is the question asked when something needs checking. The
                   names already come down with the entry, so list them under
                   the figure rather than making someone open the entry. -->
              <td v-for="wt in activeTypes" :key="wt.id" class="num">
                {{ e.units[wt.id] ?? 0 }}
                <span
                  v-if="cardNamesFor(e, wt.id)"
                  class="mt-0.5 block text-[11px] leading-snug font-normal text-muted"
                  :title="cardNamesFor(e, wt.id)"
                  >{{ cardNamesFor(e, wt.id) }}</span
                >
              </td>
              <td class="max-w-56 truncate text-muted" :title="e.notes ?? ''">
                {{ e.notes }}
              </td>
              <td v-if="approvalOn" class="whitespace-nowrap">
                <span
                  class="display rounded-full border px-2 py-0.5 text-xs tracking-wider"
                  :class="
                    e.status === 'approved'
                      ? 'border-teal text-teal'
                      : e.status === 'rejected'
                        ? 'border-red text-red'
                        : 'border-amber text-amber'
                  "
                  >{{ statusLabel(e.status) }}</span
                >
                <template v-if="auth.isAdmin && e.status !== 'approved'">
                  <button class="btn btn-sm ml-1" @click="setStatus(e, 'approved')">
                    Approve
                  </button>
                </template>
                <template v-if="auth.isAdmin && e.status === 'pending'">
                  <button class="btn btn-sm btn-danger ml-1" @click="setStatus(e, 'rejected')">
                    Reject
                  </button>
                </template>
              </td>
              <td v-if="showActions" class="whitespace-nowrap">
                <button
                  v-if="auth.rights.edit_entries"
                  class="btn btn-sm mr-1"
                  @click="startEdit(e)"
                >
                  Edit
                </button>
                <button
                  v-if="auth.rights.delete_entries"
                  class="btn btn-sm btn-danger"
                  @click="remove(e)"
                >
                  Del
                </button>
              </td>
            </tr>
            <tr v-if="entries.length === 0">
              <td :colspan="tableColspan" class="py-6 text-center text-muted">
                No entries for this month yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

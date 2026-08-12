<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import {
  computeHours,
  findSameDayCardClashes,
  type CardClash,
  type SameDayCard,
} from '../../shared/logic'
import {
  INSTALLATION_ACTIONS,
  INSTALLATION_ACTION_LABELS,
  INSTALLATION_TYPES,
  INSTALLATION_TYPE_LABELS,
  needsAction,
  needsDeviceType,
  type InstallationType,
} from '../../shared/installations'
import { downloadCsv } from '../csv'
import { formatDayHeading, groupByDay } from '../dates'
import { useAuthStore } from '../stores/auth'
import type { DeviceTypeInfo, Employee, Entry, EntryCard, WorkTypeInfo } from '../types'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const employees = ref<Employee[]>([])
const workTypes = ref<WorkTypeInfo[]>([])
const deviceTypes = ref<DeviceTypeInfo[]>([])
// "Suggest a device type" — for anyone assigned installation work; the
// suggestion is pending until an admin approves it (see Settings), so it
// isn't added to deviceTypes or made pickable here right away. Offered as a
// "+ Add new device" option at the top of the device-type lists themselves
// (see ADD_NEW_DEVICE below) rather than a standalone block that would sit
// above every installation card whether or not anyone needs it.
const ADD_NEW_DEVICE = '__add_new_device__'
type DeviceField = 'device_type' | 'replaced_device_type'
const addDeviceOpen = ref(false)
const proposeDeviceName = ref('')
const proposeMsg = ref('')
const proposeFailed = ref(false)
const proposeBusy = ref(false)

/** Selecting the sentinel option opens the modal instead of "choosing" it —
 * the select reverts to blank so a half-finished proposal never leaves a
 * fake device recorded on the card. The proposal itself isn't tied to which
 * card/select opened it — it's a standalone request an admin decides on.
 * The reset happens on nextTick, after v-model's own change handler has
 * settled the field at the sentinel — resetting it inline here would race
 * with that handler and could be clobbered back to the sentinel value. */
function onDeviceSelect(card: EntryCard, field: DeviceField) {
  if (card[field] !== ADD_NEW_DEVICE) return
  addDeviceOpen.value = true
  proposeDeviceName.value = ''
  proposeMsg.value = ''
  proposeFailed.value = false
  nextTick(() => {
    card[field] = ''
  })
}

function closeAddDevice() {
  addDeviceOpen.value = false
}
const entries = ref<Entry[]>([])
const month = ref('')
const filterEmployee = ref('')
const error = ref('')
const busy = ref(false)
// Deep link from Card Audit's "Open" button (?month=&employee_id=&entry=) —
// lands here with the right month/employee already filtered, then scrolls
// to and briefly marks the specific entry so there is no hunting for it in
// a list that could otherwise hold dozens of rows.
const highlightEntryId = ref<string | null>(null)
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

// The employee whose work is being logged in the form right now — for an
// admin, whichever the employee-select is set to; everyone else can only
// ever log their own.
const targetEmployee = computed(() =>
  auth.isAdmin ? employees.value.find((e) => e.id === form.value.employee_id) : undefined,
)

// Only the work types assigned to the employee being logged for.
const formTypes = computed(() => {
  if (!auth.isAdmin) {
    const mine = new Set(auth.user!.work_types.map((w) => w.id))
    return activeTypes.value.filter((w) => mine.has(w.id))
  }
  const assigned = new Set(targetEmployee.value?.work_type_ids ?? [])
  return activeTypes.value.filter((w) => assigned.has(w.id))
})

// Installation-style cards (e.g. Telematics Installation) carry a type and,
// for some types, a device make — never a free-text name, and never
// duplicate-checked, since installing several of the same device in a day is
// normal. See shared/installations.ts.
const isInstallationType = (w: WorkTypeInfo) => w.card_style === 'installation'
const deviceTypeRequired = (c: EntryCard) =>
  needsDeviceType((c.installation_type ?? '') as InstallationType)
const actionRequired = (c: EntryCard) =>
  needsAction((c.installation_type ?? '') as InstallationType)
// Which make came out — only asked on a replacement, and only once a device
// type is part of this installation type at all.
const replacedDeviceRequired = (c: EntryCard) =>
  deviceTypeRequired(c) && c.installation_action === 'replacement'

// Card-based types are logged as cards unless the employee whose work this
// is may enter counts directly — except installation types, which are
// always cards: a plain number can't carry a per-job installation/device
// type. Deliberately keyed on the *target* employee's own `direct_counts`
// right, not the acting viewer's: an admin editing someone else's entry must
// see it exactly as that employee would, or their own admin-implied
// direct-entry privilege silently reclassifies that employee's real card
// data as a typed override the moment they save (see allCardTypeIds below,
// where getting this wrong previously corrupted data — an admin removing
// one duplicate card from another employee's Classification/QAP entry had
// the card-derived count resent as a number on top of the real cards,
// inflating units on every single-card removal instead of shrinking them).
const canDirect = computed(() =>
  auth.isAdmin
    ? targetEmployee.value
        ? targetEmployee.value.role === 'admin' || Boolean(targetEmployee.value.rights.direct_counts)
        : false
    : auth.rights.direct_counts,
)
const isCardMode = (w: WorkTypeInfo) =>
  Boolean(w.card_based) && (isInstallationType(w) || !canDirect.value)
const numericTypes = computed(() => formTypes.value.filter((w) => !isCardMode(w)))
const cardTypes = computed(() => formTypes.value.filter((w) => isCardMode(w)))

const installationTypeIds = computed(
  () => new Set(cardTypes.value.filter(isInstallationType).map((w) => w.id)),
)

// Same idea as cardTypes/installationTypeIds above, but a *fixed* property of
// the work type — never `isCardMode`/`canDirect`, which reflects the acting
// viewer's own direct-entry privilege. A row in Recent Entries can belong to
// any employee, and removing one card from it (below) needs to classify that
// entry's own work types by what they objectively are, not by whether the
// admin doing the removing happens to have direct_counts. Getting this wrong
// previously corrupted data: an admin using "remove card" on someone else's
// Classification/QAP card had card_based type ids fall out of this set
// entirely (since canDirect is true for admins), so the card-derived count
// got resent as a typed override on top of the real cards — inflating units
// on every single-card removal instead of shrinking them. Built from every
// work type ever seen (not just active ones), since a type deactivated after
// use must still classify correctly.
const allCardTypeIds = computed(() => new Set(workTypes.value.filter((w) => w.card_based).map((w) => w.id)))
const allInstallationTypeIds = computed(
  () => new Set(workTypes.value.filter((w) => w.card_based && isInstallationType(w)).map((w) => w.id)),
)

/**
 * Card types grouped by their module, e.g. "Data Analytics".
 *
 * Classification and QAP are one body of work rather than two unrelated types,
 * so the form says so instead of leaving the reader to infer it. Types with no
 * module fall into a nameless group and render exactly as they did before.
 */
const cardModules = computed(() => {
  const byModule = new Map<string, WorkTypeInfo[]>()
  for (const w of cardTypes.value) {
    const key = w.module ?? ''
    const list = byModule.get(key)
    if (list) list.push(w)
    else byModule.set(key, [w])
  }
  return [...byModule.entries()].map(([name, types]) => ({ name, types }))
})

const cardsFor = (typeId: string) =>
  form.value.cards.filter((c) => c.work_type_id === typeId)
function addCard(wt: WorkTypeInfo) {
  if (isInstallationType(wt)) {
    form.value.cards.push({
      work_type_id: wt.id,
      card_name: '',
      total_audits: 1,
      time_completed: null,
      installation_type: INSTALLATION_TYPES[0],
      device_type: '',
      installation_action: '',
      replaced_device_type: '',
    })
    return
  }
  form.value.cards.push({
    work_type_id: wt.id,
    card_name: '',
    total_audits: 0,
    time_completed: '',
  })
}
function removeCard(card: EntryCard) {
  const i = form.value.cards.indexOf(card)
  if (i >= 0) form.value.cards.splice(i, 1)
}

async function proposeDeviceType() {
  proposeMsg.value = ''
  proposeFailed.value = false
  if (!proposeDeviceName.value.trim()) return
  proposeBusy.value = true
  try {
    await api('/api/device-types/propose', {
      method: 'POST',
      json: { name: proposeDeviceName.value.trim() },
    })
    proposeDeviceName.value = ''
    proposeMsg.value = "Sent for admin approval — it'll appear here once approved."
  } catch (e) {
    proposeFailed.value = true
    proposeMsg.value = e instanceof Error ? e.message : 'Failed to submit'
  } finally {
    proposeBusy.value = false
  }
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

const cardsForType = (entry: Entry, typeId: string) =>
  (entry.cards ?? []).filter((c) => c.work_type_id === typeId)

/**
 * When the entry was actually logged, in the viewer's own local time — not
 * to be confused with work_date/time_start, which describe the shift
 * worked, not when someone sat down and entered it. Stored as a bare
 * "YYYY-MM-DD HH:MM:SS" (UTC, no offset marker — see server's `datetime
 * ('now')`), so a space-for-T swap plus a trailing Z is what turns it back
 * into a real instant before formatting, same conversion NotificationBell's
 * `ago()` uses.
 */
function loggedAt(createdAt: string): string {
  const d = new Date(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Full local date + time, for a hover title on the compact `loggedAt` text. */
function loggedAtFull(createdAt: string): string {
  const d = new Date(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Remove one card from an already-saved entry, leaving the rest of it
 * untouched — a duplicate line is normally a single card among several
 * correct ones, so fixing it should not mean opening the full entry, hunting
 * the right line down in a long form, and resaving everything else along
 * with it. Goes through the same PATCH the full edit form uses (there is no
 * separate "delete one card" endpoint — the API always takes a complete
 * items/cards replacement), just built from this row instead of the form.
 */
async function removeCardFromEntry(entry: Entry, card: EntryCard) {
  if (!confirm(`Remove "${card.card_name}" from this entry? This cannot be undone.`)) return
  error.value = ''
  busy.value = true
  try {
    // Non-card unit counts carry over as-is — they are unaffected by which
    // cards remain. Card-derived counts are never sent; the server derives
    // them itself from however many cards are left (see unitsWithCards),
    // so sending them here would double them up.
    const items: Record<string, number> = {}
    for (const [typeId, n] of Object.entries(entry.units)) {
      if (!allCardTypeIds.value.has(typeId) && n > 0) items[typeId] = n
    }
    const cards = (entry.cards ?? [])
      .filter((c) => c !== card)
      .map((c) =>
        allInstallationTypeIds.value.has(c.work_type_id)
          ? {
              work_type_id: c.work_type_id,
              installation_type: c.installation_type,
              device_type: c.device_type || undefined,
              installation_action: c.installation_action || undefined,
              replaced_device_type: c.replaced_device_type || undefined,
            }
          : {
              work_type_id: c.work_type_id,
              card_name: c.card_name,
              total_audits: c.total_audits,
              time_completed: c.time_completed,
            },
      )
    await api(`/api/entries/${entry.id}`, {
      method: 'PATCH',
      json: {
        employee_id: entry.employee_id,
        work_date: entry.work_date,
        time_start: entry.time_start,
        time_end: entry.time_end,
        items,
        cards,
        notes: entry.notes,
      },
    })
    await loadEntries()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove the card'
  } finally {
    busy.value = false
  }
}

async function loadEntries() {
  const params = new URLSearchParams({ month: month.value })
  if (auth.isAdmin && filterEmployee.value) {
    params.set('employee_id', filterEmployee.value)
  }
  entries.value = await api<Entry[]>(`/api/entries?${params}`)
}

onMounted(async () => {
  const today = auth.user!.today
  const qMonth = route.query.month
  const qEmployee = route.query.employee_id
  const qEntry = route.query.entry
  month.value = typeof qMonth === 'string' ? qMonth : today.slice(0, 7)
  form.value.work_date = today
  form.value.employee_id = auth.user!.id
  // Set alongside month, both before the first await below — the
  // month/filterEmployee watch flushes as soon as this function yields, so
  // setting filterEmployee only after that point would let an unfiltered
  // loadEntries() fire first and then race the filtered one, sometimes
  // winning and silently dropping the employee filter.
  if (auth.isAdmin && typeof qEmployee === 'string') filterEmployee.value = qEmployee
  ;[employees.value, workTypes.value, deviceTypes.value] = await Promise.all([
    api<Employee[]>('/api/employees'),
    api<WorkTypeInfo[]>('/api/work-types'),
    api<DeviceTypeInfo[]>('/api/device-types'),
  ])
  await Promise.all([loadEntries(), loadCardNames()])
  if (typeof qEntry === 'string' && entries.value.some((e) => e.id === qEntry)) {
    highlightEntryId.value = qEntry
    await nextTick()
    document
      .getElementById(`entry-${qEntry}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      highlightEntryId.value = null
    }, 3000)
  }
  // Drop the deep-link params so a refresh or reusing this tab later starts
  // from a plain, un-filtered Recent entries rather than replaying them.
  if (qMonth || qEmployee || qEntry) router.replace({ query: {} })
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

// --- same-day duplicate warning
//
// A card classified once and QAP'd once in a day is the normal flow; the same
// work type twice in one day is either a double entry or two people on the
// same card. Warn before saving and say plainly that administrators are told,
// then let the person decide — rework is legitimate, so this never blocks.
const clashes = ref<CardClash[]>([])
const askClash = ref(false)

/** Cards in the form that were already done, by anyone, on this date. */
async function findClashes(): Promise<CardClash[]> {
  // Installation cards are never duplicate-checked — see shared/installations.ts.
  const proposed = form.value.cards
    .filter((c) => !installationTypeIds.value.has(c.work_type_id) && c.card_name.trim())
    .map((c) => ({ work_type_id: c.work_type_id, card_name: c.card_name.trim() }))
  if (proposed.length === 0) return []
  try {
    const onDate = await api<(SameDayCard & { entry_id: string })[]>(
      `/api/cards-on-date?date=${form.value.work_date}`,
    )
    return findSameDayCardClashes(
      proposed,
      onDate,
      form.value.employee_id,
      editingId.value ?? undefined,
    )
  } catch {
    // The check is advisory; never block logging work because it failed.
    return []
  }
}

/** Runs the check first; submit() itself is what actually saves. */
async function trySubmit() {
  error.value = ''
  const found = await findClashes()
  if (found.length > 0) {
    clashes.value = found
    askClash.value = true
    return
  }
  await submit()
}

function confirmClash() {
  askClash.value = false
  submit()
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
      .filter((c) => cardIds.has(c.work_type_id))
      .filter((c) =>
        installationTypeIds.value.has(c.work_type_id)
          ? Boolean(c.installation_type)
          : c.card_name.trim(),
      )
      .map((c) =>
        installationTypeIds.value.has(c.work_type_id)
          ? {
              work_type_id: c.work_type_id,
              installation_type: c.installation_type,
              device_type: c.device_type || undefined,
              installation_action: c.installation_action || undefined,
              replaced_device_type: c.replaced_device_type || undefined,
            }
          : {
              work_type_id: c.work_type_id,
              card_name: c.card_name.trim(),
              total_audits: Number(c.total_audits) || 0,
              time_completed: c.time_completed || null,
            },
      )
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
    'Logged at',
  ]
  const rows = entries.value.map((e) => [
    e.work_date,
    ...(auth.isAdmin ? [e.employee_name ?? ''] : []),
    e.time_start,
    e.time_end,
    e.hours,
    ...activeTypes.value.map((w) => e.units[w.id] ?? 0),
    e.notes ?? '',
    e.created_at ? loggedAtFull(e.created_at) : '',
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

// ------------------------------------------------------- day-grouped listing
//
// The same day can carry more than one entry (up to the daily cap), and
// those still belong together — a day worked twice is one day's work, not
// two unrelated rows that happen to share a date. Grouping here is purely a
// display concern: `entries` itself, and everything keyed off it (CSV
// export, the daily-limit check), stays a flat list.
const dayGroups = computed(() =>
  groupByDay(
    entries.value,
    (e) => e.work_date,
    (e) => e.hours,
  ),
)
</script>

<template>
  <div>
    <div v-if="auth.rights.add_entries || editingId" class="panel mb-6">
      <h2 class="display mb-4 text-2xl">
        {{ editingId ? 'Edit entry' : 'Log time' }}
      </h2>
      <form class="grid grid-cols-2 gap-4 md:grid-cols-4" @submit.prevent="trySubmit">
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

        <!-- Card-based types: one row per card; the count is the number of
             cards. Grouped under the module heading, so Classification and QAP
             read as one body of work rather than two unrelated types. -->
        <template v-for="mod in cardModules" :key="mod.name">
          <p v-if="mod.name" class="col-span-2 mt-2 md:col-span-4">
            <span class="field-label !mb-0 text-teal">{{ mod.name }}</span>
          </p>
          <div
            v-for="wt in mod.types"
            :key="wt.id"
            class="col-span-2 rounded-lg border border-line p-3 md:col-span-4"
          >
          <div class="mb-2 flex items-center justify-between">
            <span class="field-label">
              {{ wt.name }} cards
              <span class="mono ml-2 text-teal">{{ cardsFor(wt.id).length }}</span>
            </span>
            <button type="button" class="btn btn-sm" @click="addCard(wt)">
              + Add card
            </button>
          </div>
          <!-- Installation-style cards: a type, and for some types a device
               make — no free-text name, no duplicate check (see
               shared/installations.ts). "Can't find your device?" lives as a
               "+ Add new device" option inside the device-type selects
               themselves (see ADD_NEW_DEVICE), not a standing block here. -->
          <template v-if="isInstallationType(wt)">
            <div
              v-if="cardsFor(wt.id).length > 0"
              class="mb-1 hidden gap-2 md:grid md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
            >
              <span class="field-label">Installation type</span>
              <span class="field-label">New or replacement</span>
              <span class="field-label">Replaced device</span>
              <span class="field-label">Device type</span>
              <span aria-hidden="true" />
            </div>
            <div
              v-for="(c, i) in cardsFor(wt.id)"
              :key="i"
              class="mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
            >
              <div>
                <div class="md:hidden">
                  <label class="field-label" :for="`card-${wt.id}-${i}-itype`">
                    Installation type
                  </label>
                </div>
                <select
                  :id="`card-${wt.id}-${i}-itype`"
                  v-model="c.installation_type"
                  class="field-input"
                >
                  <option v-for="t in INSTALLATION_TYPES" :key="t" :value="t">
                    {{ INSTALLATION_TYPE_LABELS[t] }}
                  </option>
                </select>
              </div>
              <div>
                <div class="md:hidden">
                  <label class="field-label" :for="`card-${wt.id}-${i}-action`">
                    New or replacement
                  </label>
                </div>
                <select
                  v-if="actionRequired(c)"
                  :id="`card-${wt.id}-${i}-action`"
                  v-model="c.installation_action"
                  class="field-input"
                >
                  <option value="" disabled>Select…</option>
                  <option v-for="a in INSTALLATION_ACTIONS" :key="a" :value="a">
                    {{ INSTALLATION_ACTION_LABELS[a] }}
                  </option>
                </select>
                <input
                  v-else
                  :id="`card-${wt.id}-${i}-action`"
                  value="Not applicable"
                  readonly
                  class="field-input text-muted"
                />
              </div>
              <div>
                <div class="md:hidden">
                  <label class="field-label" :for="`card-${wt.id}-${i}-replaced`">
                    Replaced device
                  </label>
                </div>
                <!-- Which make came out — a replacement only, so reporting can
                     answer "which devices are mostly faulty". -->
                <select
                  v-if="replacedDeviceRequired(c)"
                  :id="`card-${wt.id}-${i}-replaced`"
                  v-model="c.replaced_device_type"
                  class="field-input"
                  @change="onDeviceSelect(c, 'replaced_device_type')"
                >
                  <option value="" disabled>Select…</option>
                  <option :value="ADD_NEW_DEVICE" class="text-teal">+ Add new device</option>
                  <option v-for="d in deviceTypes" :key="d.id" :value="d.id">
                    {{ d.name }}
                  </option>
                </select>
                <input
                  v-else
                  :id="`card-${wt.id}-${i}-replaced`"
                  value="Not applicable"
                  readonly
                  class="field-input text-muted"
                />
              </div>
              <div>
                <div class="md:hidden">
                  <label class="field-label" :for="`card-${wt.id}-${i}-device`">
                    Device type
                  </label>
                </div>
                <select
                  v-if="deviceTypeRequired(c)"
                  :id="`card-${wt.id}-${i}-device`"
                  v-model="c.device_type"
                  class="field-input"
                  @change="onDeviceSelect(c, 'device_type')"
                >
                  <option value="" disabled>Select…</option>
                  <option :value="ADD_NEW_DEVICE" class="text-teal">+ Add new device</option>
                  <option v-for="d in deviceTypes" :key="d.id" :value="d.id">
                    {{ d.name }}
                  </option>
                </select>
                <input
                  v-else
                  :id="`card-${wt.id}-${i}-device`"
                  value="Not applicable"
                  readonly
                  class="field-input text-muted"
                />
              </div>
              <button
                v-if="!c.id || auth.rights.delete_entries"
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
              No installations yet — add one per job completed.
            </p>
          </template>

          <template v-else>
            <!-- Previously used names for this type. A datalist suggests them
                 while still allowing a new name to be typed. -->
            <datalist :id="`card-names-${wt.id}`">
              <option v-for="n in namesFor(wt.id)" :key="n" :value="n" />
            </datalist>
            <!-- One set of column headings for the whole list. Hidden below
                 md, where the row grid collapses and each field carries its
                 own. -->
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
                   `.field-label` sets `display: block` from unlayered CSS,
                   which outranks Tailwind's layered utilities and would win. -->
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
              <!-- Full-width on a one-column phone layout reads as an error
                   bar, so keep it shrink-wrapped and right-aligned there. -->
              <button
                v-if="!c.id || auth.rights.delete_entries"
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
          </template>
          </div>
        </template>
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
            <template v-for="g in dayGroups" :key="g.date">
              <!-- One heading per calendar day, however many entries it
                   holds — a day logged twice is still one day's work. -->
              <tr class="group-head">
                <td :colspan="tableColspan">
                  {{ formatDayHeading(g.date) }}
                  <span class="mono ml-2 text-teal">{{ g.totalHours.toFixed(2) }}h</span>
                  <span v-if="g.rows.length > 1" class="ml-2 normal-case text-muted"
                    >· {{ g.rows.length }} entries</span
                  >
                </td>
              </tr>
              <tr
                v-for="e in g.rows"
                :id="`entry-${e.id}`"
                :key="e.id"
                class="transition-colors duration-700"
                :class="highlightEntryId === e.id ? 'bg-amber-soft' : ''"
              >
                <td class="mono whitespace-nowrap">
                  {{ e.work_date }}
                  <span
                    v-if="e.created_at"
                    class="block text-[11px] leading-snug font-normal text-muted"
                    :title="`Logged ${loggedAtFull(e.created_at)}`"
                    >logged {{ loggedAt(e.created_at) }}</span
                  >
                </td>
                <td v-if="auth.isAdmin">{{ e.employee_name }}</td>
                <td class="num">{{ e.time_start }}</td>
                <td class="num">{{ e.time_end }}</td>
                <td class="num">{{ e.hours.toFixed(2) }}</td>
                <!-- The count alone does not say *which* cards were done, which
                     is the question asked when something needs checking. The
                     names already come down with the entry, so list them under
                     the figure rather than making someone open the entry. With
                     delete rights, each line gets its own remove control — a
                     duplicate is normally one card among several correct ones,
                     so fixing it should not mean opening the full entry to find
                     and resave everything else along with it. Gated on delete,
                     not edit: removing a card destroys already-recorded work
                     same as the Del button does, just one line at a time (the
                     server enforces this regardless — see patchEntry). -->
                <td v-for="wt in activeTypes" :key="wt.id" class="num">
                  {{ e.units[wt.id] ?? 0 }}
                  <template v-if="auth.rights.delete_entries && cardsForType(e, wt.id).length">
                    <div
                      v-for="c in cardsForType(e, wt.id)"
                      :key="c.id"
                      class="mt-0.5 flex items-center justify-end gap-1"
                    >
                      <span class="text-[11px] leading-snug font-normal text-muted">{{
                        c.card_name
                      }}</span>
                      <button
                        type="button"
                        class="shrink-0 text-[11px] leading-none text-red hover:underline"
                        :disabled="busy"
                        :aria-label="`Remove ${c.card_name} from this entry`"
                        @click="removeCardFromEntry(e, c)"
                      >
                        ✕
                      </button>
                    </div>
                  </template>
                  <span
                    v-else-if="cardNamesFor(e, wt.id)"
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
            </template>
            <tr v-if="entries.length === 0">
              <td :colspan="tableColspan" class="py-6 text-center text-muted">
                No entries for this month yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ========================================== same-day duplicate warning -->
    <!-- Shown before saving, never after: the point is to let someone stop
         while stopping is still free. Rework is legitimate, so continuing is
         allowed — it is simply not silent. -->
    <div
      v-if="askClash"
      class="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clash-title"
    >
      <div class="panel w-full max-w-lg">
        <h3 id="clash-title" class="display mb-2 text-xl text-red">
          Already done today
        </h3>
        <p class="mb-3 text-sm">
          {{ clashes.length === 1 ? 'This card has' : 'These cards have' }} already
          been logged for the same work type on
          <span class="mono">{{ form.work_date }}</span
          >:
        </p>
        <ul class="mb-4 space-y-1 text-sm">
          <li v-for="c in clashes" :key="`${c.card_name}-${c.work_type_id}-${c.employee_id}`">
            <span class="mono">{{ c.card_name }}</span>
            — {{ c.work_type_name }}, by
            <span class="font-medium">{{ c.own ? 'you' : c.employee_name }}</span>
          </li>
        </ul>
        <p class="mb-4 rounded-lg border border-red bg-red-soft p-3 text-xs">
          If you continue, the admins will be notified that this card was
          logged twice today. Continue only if this is genuine rework. 
          If not geniune, your points may be deducted.
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn" :disabled="busy" @click="askClash = false">
            Go back and change it
          </button>
          <button
            type="button"
            class="btn btn-solid"
            :disabled="busy"
            @click="confirmClash"
          >
            {{ busy ? 'Saving…' : 'Continue and notify admins' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ==================================================== add new device -->
    <!-- Opened by "+ Add new device" at the top of a device-type select
         (installation cards) rather than a block that would sit above the
         card list whether or not anyone needed it. -->
    <div
      v-if="addDeviceOpen"
      class="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-device-title"
    >
      <div class="panel w-full max-w-sm">
        <h3 id="add-device-title" class="display mb-2 text-xl">Suggest a device type</h3>
        <p class="mb-3 text-sm text-muted">
          Sent for an administrator to approve — it won't be selectable on any
          card until then.
        </p>
        <form @submit.prevent="proposeDeviceType">
          <label class="field-label" for="propose-device-name">New device type name</label>
          <input
            id="propose-device-name"
            v-model="proposeDeviceName"
            maxlength="60"
            required
            autofocus
            class="field-input mb-3"
            placeholder="e.g. Ruptela"
          />
          <p
            v-if="proposeMsg"
            class="mb-3 text-xs"
            :class="proposeFailed ? 'text-red' : 'text-teal'"
          >
            {{ proposeMsg }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-solid btn-sm" :disabled="proposeBusy">
              {{ proposeBusy ? 'Sending…' : 'Send for approval' }}
            </button>
            <button type="button" class="btn btn-sm" @click="closeAddDevice">
              {{ proposeMsg && !proposeFailed ? 'Done' : 'Cancel' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

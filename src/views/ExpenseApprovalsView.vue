<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import type { Adjustment, ExpenseVoucher, PendingUser } from '../types'

// Queues on one page, each scoped server-side:
//   manager       — vouchers from the reviewer's direct reports awaiting review
//   approver      — vouchers awaiting final approval (admin + approve_expenses)
//   reimbursement — money claims at the matching stage. These used to appear
//     only on Payments and Screening, so an approver working this page had no
//     sign a claim was waiting and had to go hunting for it.

const auth = useAuthStore()

const vouchers = ref<ExpenseVoucher[]>([])
const approvals = ref<ExpenseVoucher[]>([])
const claimsToScreen = ref<Adjustment[]>([])
const claimsToApprove = ref<Adjustment[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')
const comments = ref<Record<string, string>>({})
const claimNotes = ref<Record<string, string>>({})

const isManager = computed(() => auth.rights.review_expenses)
// Approval requires the admin role as well as the right.
const isApprover = computed(() => auth.isAdmin && auth.rights.approve_expenses)
// Screening a claim is the same authority as screening a voucher.
const isScreener = computed(() => auth.isAdmin || auth.rights.send_for_approval)
// New-user approval is a separate authority from expense approval.
const canApproveUsers = computed(() => auth.canApproveUsers)
const canSeePendingUsers = computed(
  () => canApproveUsers.value || auth.rights.add_users,
)
const pendingUsers = ref<PendingUser[]>([])
const userNotes = ref<Record<string, string>>({})

async function load() {
  error.value = ''
  try {
    if (isManager.value) {
      vouchers.value = await api<ExpenseVoucher[]>('/api/expenses/queue?queue=manager')
    }
    if (isApprover.value) {
      approvals.value = await api<ExpenseVoucher[]>('/api/expenses/queue?queue=approver')
    }
    if (canSeePendingUsers.value) {
      pendingUsers.value = await api<PendingUser[]>('/api/users/pending')
    }
    if (isScreener.value) {
      claimsToScreen.value = await api<Adjustment[]>(
        '/api/adjustments/pending-reimbursements',
      )
    }
    if (isApprover.value) {
      claimsToApprove.value = await api<Adjustment[]>('/api/adjustments/awaiting-approval')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the approval queue'
  }
}
onMounted(load)

type Decision =
  | 'manager_approve'
  | 'manager_reject'
  | 'admin_approve'
  | 'admin_reject'
  | 'return'

const PAST_TENSE: Record<Decision, string> = {
  manager_approve: 'approved',
  admin_approve: 'approved',
  manager_reject: 'rejected',
  admin_reject: 'rejected',
  return: 'returned',
}

async function decide(v: ExpenseVoucher, action: Decision) {
  const comment = (comments.value[v.id] ?? '').trim()
  const needsComment =
    action === 'manager_reject' || action === 'admin_reject' || action === 'return'
  if (needsComment && !comment) {
    error.value =
      action === 'return'
        ? 'Say what additional information is needed.'
        : 'A comment is required when rejecting a voucher.'
    return
  }
  error.value = ''
  notice.value = ''
  busy.value = v.id
  try {
    await api(`/api/expenses/${v.id}/decision`, {
      method: 'POST',
      json: { action, comments: comment || undefined },
    })
    delete comments.value[v.id]
    notice.value = `${v.voucher_number} ${PAST_TENSE[action]}.`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = ''
  }
}

// --- reimbursement claims
//
// Same four moves a voucher gets, against the adjustments endpoint: send to
// the approver, return for more information, approve, reject. 'returned' and
// 'rejected' both require a note — handing something back or refusing it
// without saying why just costs another round trip.
type ClaimAction = 'awaiting_approval' | 'returned' | 'approved' | 'rejected'

const CLAIM_PAST_TENSE: Record<ClaimAction, string> = {
  awaiting_approval: 'sent for approval',
  returned: 'returned for more information',
  approved: 'approved',
  rejected: 'rejected',
}

async function decideClaim(a: Adjustment, action: ClaimAction) {
  const note = (claimNotes.value[a.id] ?? '').trim()
  if ((action === 'returned' || action === 'rejected') && !note) {
    error.value =
      action === 'returned'
        ? 'Say what additional information is needed.'
        : 'A note is required when rejecting a claim.'
    return
  }
  error.value = ''
  notice.value = ''
  busy.value = a.id
  try {
    await api(`/api/adjustments/${a.id}`, {
      method: 'PATCH',
      json: { status: action, note: note || undefined },
    })
    delete claimNotes.value[a.id]
    notice.value = `${a.employee_name ?? 'Claim'}'s reimbursement ${CLAIM_PAST_TENSE[action]}.`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = ''
  }
}

// --- proposing an account
//
// An `add_users` holder who is not an administrator has no route into the
// Employees tab (it is admin-only), so the form to propose an account lives
// here, beside the list of what they have already proposed. Role, rights and
// data scope are deliberately absent: an approver sets those afterwards, so
// this right can only ever create a plain pending employee.
const canPropose = computed(() => !auth.isAdmin && auth.rights.add_users)
const showProposeForm = ref(false)
const proposal = ref({ name: '', email: '', username: '', password: '' })

function resetProposal() {
  proposal.value = { name: '', email: '', username: '', password: '' }
}

async function propose() {
  error.value = ''
  notice.value = ''
  if (!proposal.value.name.trim()) {
    error.value = 'A name is required.'
    return
  }
  busy.value = 'propose'
  try {
    await api('/api/users/propose', {
      method: 'POST',
      json: {
        name: proposal.value.name.trim(),
        email: proposal.value.email.trim() || null,
        username: proposal.value.username.trim() || null,
        password: proposal.value.password || undefined,
      },
    })
    notice.value = `${proposal.value.name.trim()} proposed — an administrator has to approve the account before it can sign in.`
    resetProposal()
    showProposeForm.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to propose the account'
  } finally {
    busy.value = ''
  }
}

async function decideUser(u: PendingUser, decision: 'approved' | 'rejected') {
  const note = (userNotes.value[u.id] ?? '').trim()
  if (decision === 'rejected' && !note) {
    error.value = 'A note is required when rejecting an account.'
    return
  }
  error.value = ''
  notice.value = ''
  busy.value = u.id
  try {
    await api(`/api/users/${u.id}/approval`, {
      method: 'POST',
      json: { decision, note: note || undefined },
    })
    delete userNotes.value[u.id]
    notice.value = `${u.name} ${decision}.`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = ''
  }
}

const total = computed(() =>
  vouchers.value.reduce((s, v) => s + v.amount, 0).toFixed(2),
)
const currency = computed(
  () => vouchers.value[0]?.currency ?? approvals.value[0]?.currency ?? '',
)
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Expense approvals</h2>
      <p v-if="isManager && vouchers.length" class="mono text-lg">
        {{ vouchers.length }} to review · {{ currency }}{{ total }}
      </p>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <!-- ============================================== new user approvals -->
    <template v-if="canSeePendingUsers && (pendingUsers.length || canPropose)">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 class="display text-xl">New user accounts</h3>
        <button
          v-if="canPropose"
          class="btn btn-sm"
          @click="showProposeForm = !showProposeForm"
        >
          {{ showProposeForm ? 'Close' : 'Propose an account' }}
        </button>
      </div>
      <p class="mb-3 text-sm text-muted">
        {{
          canApproveUsers
            ? 'These accounts cannot sign in until you approve them. Set their role, rights, and data scope in the Employees tab afterwards.'
            : 'Accounts you proposed, waiting for an administrator to approve them.'
        }}
      </p>

      <!-- Only name is required; a username needs a password to go with it,
           and everything else is the approver's to set. -->
      <form v-if="canPropose && showProposeForm" class="panel mb-4" @submit.prevent="propose">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="field-label" for="np-name">Full name</label>
            <input id="np-name" v-model="proposal.name" required class="field-input" />
          </div>
          <div>
            <label class="field-label" for="np-email">Email (optional)</label>
            <input id="np-email" v-model="proposal.email" type="email" class="field-input" />
          </div>
          <div>
            <label class="field-label" for="np-user">Username (optional)</label>
            <input
              id="np-user"
              v-model="proposal.username"
              class="field-input"
              placeholder="e.g. ama.k"
            />
          </div>
          <div>
            <label class="field-label" for="np-pass">Password</label>
            <input
              id="np-pass"
              v-model="proposal.password"
              type="password"
              minlength="8"
              class="field-input"
              placeholder="min. 8 characters"
            />
          </div>
        </div>
        <p class="mt-3 text-xs text-muted">
          Set a username and password together if this person needs to sign in.
          The account stays pending and cannot be used until an administrator
          approves it, and they set the role, rights and data scope then.
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn btn-solid" :disabled="busy === 'propose'">
            {{ busy === 'propose' ? 'Sending…' : 'Propose account' }}
          </button>
          <button type="button" class="btn" @click="showProposeForm = false">Cancel</button>
        </div>
      </form>

      <p v-if="!pendingUsers.length" class="panel mb-8 text-muted">
        {{
          canApproveUsers
            ? 'No accounts waiting for approval.'
            : 'You have not proposed any accounts yet.'
        }}
      </p>

      <div v-else class="panel mb-8">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Proposed by</th>
                <th v-if="canApproveUsers">Note</th>
                <th v-if="canApproveUsers"></th>
                <th v-else>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in pendingUsers" :key="u.id">
                <td>{{ u.name }}</td>
                <td class="mono text-[13px]">{{ u.username ?? '—' }}</td>
                <td class="text-xs text-muted">{{ u.email ?? '—' }}</td>
                <td class="text-xs">{{ u.created_by_name ?? '—' }}</td>
                <td v-if="canApproveUsers">
                  <input
                    v-model="userNotes[u.id]"
                    class="field-input !w-48"
                    maxlength="500"
                    placeholder="Required to reject"
                    :aria-label="`Note for ${u.name}`"
                  />
                </td>
                <td v-if="canApproveUsers" class="whitespace-nowrap">
                  <button
                    class="btn btn-sm btn-solid mr-1"
                    :disabled="busy === u.id"
                    @click="decideUser(u, 'approved')"
                  >
                    Approve
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    :disabled="busy === u.id"
                    @click="decideUser(u, 'rejected')"
                  >
                    Reject
                  </button>
                </td>
                <td v-else>
                  <span
                    class="display rounded-full border border-amber px-2 py-0.5 text-xs tracking-wider text-amber"
                    >Pending</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ============================================ final approval queue -->
    <template v-if="isApprover">
      <h3 class="display mb-1 text-xl">Awaiting your approval</h3>
      <p class="mb-3 text-sm text-muted">
        You hold expense approval rights. Nothing can be recorded in the finance
        records until you approve it.
      </p>
      <p v-if="approvals.length === 0" class="panel mb-8 text-muted">
        Nothing is waiting for your approval.
      </p>

      <div v-for="v in approvals" :key="v.id" class="panel mb-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <RouterLink
              :to="{ name: 'expense-detail', params: { id: v.id } }"
              class="display text-xl underline"
              >{{ v.voucher_number }}</RouterLink
            >
            <ExpenseStatusChip :status="v.status" />
            <span
              v-if="v.duplicate_count"
              class="display rounded-full border border-amber px-2 py-0.5 text-xs tracking-wider text-amber"
              :title="`${v.duplicate_count} similar claim(s) by the same employee`"
              >Possible duplicate</span
            >
          </div>
          <p class="mono text-2xl font-semibold">
            {{ v.currency }}{{ v.amount.toFixed(2) }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <p class="field-label">Employee</p>
            <p>{{ v.employee_name }}</p>
          </div>
          <div>
            <p class="field-label">Department</p>
            <p>{{ v.department_name ?? '—' }}</p>
          </div>
          <div>
            <p class="field-label">Date of expense</p>
            <p class="mono">{{ v.expense_date }}</p>
          </div>
          <div>
            <p class="field-label">Category</p>
            <p>{{ v.category_name ?? '—' }}</p>
          </div>
        </div>

        <p class="mt-3 text-sm">{{ v.description }}</p>

        <div
          class="mt-3 rounded-lg border border-amber bg-amber-soft p-3 text-sm"
        >
          <p class="field-label">Reason no receipt is available</p>
          <p>{{ v.missing_receipt_reason ?? '—' }}</p>
        </div>

        <div class="mt-4 border-t border-line pt-3">
          <label class="field-label" :for="`ac-${v.id}`">Comments</label>
          <textarea
            :id="`ac-${v.id}`"
            v-model="comments[v.id]"
            rows="2"
            maxlength="1000"
            class="field-input mb-3"
            placeholder="Required when rejecting or requesting more information"
          />
          <div class="flex flex-wrap gap-2">
            <button
              class="btn btn-solid"
              :disabled="busy === v.id"
              @click="decide(v, 'admin_approve')"
            >
              Approve
            </button>
            <button class="btn" :disabled="busy === v.id" @click="decide(v, 'return')">
              Request more info
            </button>
            <button
              class="btn btn-danger"
              :disabled="busy === v.id"
              @click="decide(v, 'admin_reject')"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ================================================ manager review queue -->
    <template v-if="isManager">
      <h3 v-if="isApprover" class="display mt-8 mb-1 text-xl">
        Your direct reports
      </h3>
      <p v-if="vouchers.length === 0" class="panel text-muted">
        Nothing is waiting for your review.
      </p>

      <div v-for="v in vouchers" :key="v.id" class="panel mb-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <RouterLink
            :to="{ name: 'expense-detail', params: { id: v.id } }"
            class="display text-xl underline"
            >{{ v.voucher_number }}</RouterLink
          >
          <ExpenseStatusChip :status="v.status" />
        </div>
        <p class="mono text-2xl font-semibold">{{ v.currency }}{{ v.amount.toFixed(2) }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <p class="field-label">Employee</p>
          <p>{{ v.employee_name }}</p>
        </div>
        <div>
          <p class="field-label">Date of expense</p>
          <p class="mono">{{ v.expense_date }}</p>
        </div>
        <div>
          <p class="field-label">Category</p>
          <p>{{ v.category_name ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Submitted</p>
          <p class="mono">{{ v.submission_date ?? '—' }}</p>
        </div>
      </div>

      <div class="mt-3">
        <p class="field-label">Purpose</p>
        <p class="whitespace-pre-wrap text-sm">{{ v.description }}</p>
      </div>

      <div
        class="mt-3 rounded-lg border border-amber bg-amber-soft p-3 text-sm"
      >
        <p class="field-label">Reason no receipt is available</p>
        <p>{{ v.missing_receipt_reason ?? '—' }}</p>
        <p class="mt-1 text-xs" :class="v.declaration_accepted ? 'text-teal' : 'text-red'">
          {{
            v.declaration_accepted
              ? 'Employee accepted the declaration.'
              : 'Declaration not accepted.'
          }}
        </p>
      </div>

      <div class="mt-4 border-t border-line pt-3">
        <label class="field-label" :for="`c-${v.id}`">Comments</label>
        <textarea
          :id="`c-${v.id}`"
          v-model="comments[v.id]"
          rows="2"
          maxlength="1000"
          class="field-input mb-3"
          placeholder="Required when rejecting or requesting more information"
        />
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-solid"
            :disabled="busy === v.id"
            @click="decide(v, 'manager_approve')"
          >
            Approve
          </button>
          <button class="btn" :disabled="busy === v.id" @click="decide(v, 'return')">
            Request more info
          </button>
          <button
            class="btn btn-danger"
            :disabled="busy === v.id"
            @click="decide(v, 'manager_reject')"
          >
            Reject
          </button>
          <RouterLink
            :to="{ name: 'expense-detail', params: { id: v.id } }"
            class="btn"
            >Open</RouterLink
          >
        </div>
      </div>
      </div>
    </template>
  </div>
</template>

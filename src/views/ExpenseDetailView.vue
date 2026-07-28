<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiClientError } from '../api'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import {
  PAYMENT_METHOD_LABELS,
  type ExpenseAction,
  type PaymentMethod,
} from '../../shared/expenses'
import type { ExpenseVoucherDetail } from '../types'

const route = useRoute()
const router = useRouter()

const voucher = ref<ExpenseVoucherDetail | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const comments = ref('')
const paidReference = ref('')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const id = computed(() => route.params.id as string)

async function load() {
  error.value = ''
  try {
    voucher.value = await api<ExpenseVoucherDetail>(`/api/expenses/${id.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load voucher'
  }
}
onMounted(load)

const can = (a: ExpenseAction) => voucher.value?.actions.includes(a) ?? false

const money = computed(() =>
  voucher.value ? `${voucher.value.currency}${voucher.value.amount.toFixed(2)}` : '',
)

const methodLabel = computed(() =>
  voucher.value
    ? (PAYMENT_METHOD_LABELS[voucher.value.payment_method as PaymentMethod] ??
      voucher.value.payment_method)
    : '',
)

async function run(fn: () => Promise<unknown>, successMessage = '') {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    await fn()
    await load()
    notice.value = successMessage
    comments.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

function decide(action: ExpenseAction, successMessage: string) {
  return run(
    () =>
      api(`/api/expenses/${id.value}/decision`, {
        method: 'POST',
        json: {
          action,
          comments: comments.value || undefined,
          paid_reference: action === 'mark_paid' ? paidReference.value || undefined : undefined,
        },
      }),
    successMessage,
  )
}

function submitVoucher() {
  return run(
    () => api(`/api/expenses/${id.value}/submit`, { method: 'POST' }),
    'Voucher submitted for approval.',
  )
}

async function removeVoucher() {
  if (!confirm(`Delete voucher ${voucher.value?.voucher_number}? This cannot be undone.`)) {
    return
  }
  error.value = ''
  busy.value = true
  try {
    await api(`/api/expenses/${id.value}`, { method: 'DELETE' })
    router.push({ name: 'expenses' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete voucher'
    busy.value = false
  }
}

async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  notice.value = ''
  uploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    // FormData sets its own multipart boundary — do not pass `json` here.
    await api(`/api/expenses/${id.value}/attachments`, { method: 'POST', body })
    await load()
    notice.value = 'Receipt attached.'
  } catch (e) {
    error.value =
      e instanceof ApiClientError && e.status === 503
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Upload failed'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function removeAttachment(attachmentId: string, name: string) {
  if (!confirm(`Remove ${name}?`)) return
  return run(
    () =>
      api(`/api/expenses/${id.value}/attachments/${attachmentId}`, { method: 'DELETE' }),
    'Receipt removed.',
  )
}

const fileSize = (bytes: number | null) =>
  bytes === null ? '' : bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

// e.g. "manager_approve" -> "Manager approve"
function actionLabel(action: string): string {
  const s = action.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const printPage = () => window.print()
</script>

<template>
  <div v-if="voucher">
    <div class="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="display text-2xl">{{ voucher.voucher_number }}</h2>
        <ExpenseStatusChip :status="voucher.status" />
        <span v-if="voucher.reopened_at" class="text-xs text-amber">
          Reopened by an administrator
        </span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm" @click="printPage">Print / Save as PDF</button>
        <RouterLink
          v-if="can('edit')"
          :to="{ name: 'expense-edit', params: { id: voucher.id } }"
          class="btn btn-sm"
          >Edit</RouterLink
        >
        <RouterLink :to="{ name: 'expenses' }" class="btn btn-sm">Back</RouterLink>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <!-- ========================================================== summary -->
    <div class="panel mb-6">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p class="field-label">Amount</p>
          <p class="mono text-3xl font-semibold text-teal">{{ money }}</p>
        </div>
        <div>
          <p class="field-label">Employee</p>
          <p class="font-medium">{{ voucher.employee_name }}</p>
          <p class="text-xs text-muted">{{ voucher.department_name ?? 'No department' }}</p>
        </div>
        <div>
          <p class="field-label">Date of expense</p>
          <p class="mono">{{ voucher.expense_date }}</p>
        </div>
        <div>
          <p class="field-label">Date submitted</p>
          <p class="mono">{{ voucher.submission_date ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Category</p>
          <p>{{ voucher.category_name ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Payment method</p>
          <p>{{ methodLabel }}</p>
        </div>
        <div>
          <p class="field-label">Vendor / supplier</p>
          <p>{{ voucher.vendor ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Receipt</p>
          <p :class="voucher.receipt_available ? 'text-teal' : 'text-amber'">
            {{ voucher.receipt_available ? 'Attached' : 'Not available (declared)' }}
          </p>
        </div>
      </div>

      <div class="mt-4 border-t border-line pt-4">
        <p class="field-label">Purpose / description</p>
        <p class="whitespace-pre-wrap">{{ voucher.description }}</p>
      </div>

      <div
        v-if="!voucher.receipt_available"
        class="mt-4 rounded-lg border border-amber bg-amber-soft p-4"
      >
        <p class="field-label">Reason for missing receipt</p>
        <p class="mb-3">{{ voucher.missing_receipt_reason ?? '—' }}</p>
        <p class="field-label">Employee declaration</p>
        <p class="text-sm italic">{{ voucher.declaration_text ?? '—' }}</p>
        <p class="mt-2 text-xs" :class="voucher.declaration_accepted ? 'text-teal' : 'text-red'">
          {{
            voucher.declaration_accepted
              ? `Accepted by ${voucher.employee_name}`
              : 'Not yet accepted'
          }}
        </p>
      </div>

      <div
        v-if="voucher.paid_at"
        class="mt-4 rounded-lg border border-teal bg-teal-soft p-4 text-sm"
      >
        Paid on <span class="mono">{{ voucher.paid_at.slice(0, 10) }}</span>
        <template v-if="voucher.paid_by_name"> by {{ voucher.paid_by_name }}</template>
        <template v-if="voucher.paid_reference">
          · reference <span class="mono">{{ voucher.paid_reference }}</span>
        </template>
      </div>
    </div>

    <!-- ======================================================= attachments -->
    <div class="panel no-print mb-6">
      <h3 class="display mb-3 text-xl">Receipts &amp; attachments</h3>
      <ul v-if="voucher.attachments.length" class="mb-4 space-y-2 text-sm">
        <li
          v-for="a in voucher.attachments"
          :key="a.id"
          class="flex flex-wrap items-center gap-3 border-b border-line pb-2"
        >
          <a
            :href="`/api/expenses/${voucher.id}/attachments/${a.id}`"
            target="_blank"
            rel="noopener"
            class="font-medium text-teal underline"
            >{{ a.file_name }}</a
          >
          <span class="mono text-xs text-muted">{{ fileSize(a.size_bytes) }}</span>
          <span class="text-xs text-muted">
            {{ a.uploaded_by_name ?? 'Unknown' }} · {{ a.uploaded_at.slice(0, 10) }}
          </span>
          <button
            v-if="can('remove_attachment')"
            class="btn btn-sm btn-danger"
            :disabled="busy"
            @click="removeAttachment(a.id, a.file_name)"
          >
            Remove
          </button>
        </li>
      </ul>
      <p v-else class="mb-4 text-sm text-muted">No files attached.</p>

      <div v-if="can('add_attachment')">
        <label class="field-label" for="v-file">Attach a receipt (PDF, JPG, PNG — max 10 MB)</label>
        <input
          id="v-file"
          ref="fileInput"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          class="field-input"
          :disabled="uploading"
          @change="uploadFile"
        />
        <p v-if="uploading" class="mt-1 text-xs text-muted">Uploading…</p>
      </div>
    </div>

    <!-- =========================================================== actions -->
    <div
      v-if="voucher.actions.length"
      class="panel no-print mb-6"
    >
      <h3 class="display mb-3 text-xl">Actions</h3>

      <div
        v-if="
          can('manager_approve') ||
          can('finance_approve') ||
          can('manager_reject') ||
          can('finance_reject') ||
          can('return')
        "
        class="mb-4"
      >
        <label class="field-label" for="v-comments">Comments</label>
        <textarea
          id="v-comments"
          v-model="comments"
          rows="2"
          maxlength="1000"
          class="field-input"
          placeholder="Required when rejecting or requesting more information"
        />
      </div>

      <div v-if="can('mark_paid')" class="mb-4">
        <label class="field-label" for="v-ref">Payment reference (optional)</label>
        <input
          id="v-ref"
          v-model="paidReference"
          maxlength="120"
          class="field-input mono"
          placeholder="e.g. MoMo txn 883910"
        />
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-if="can('submit')"
          class="btn btn-solid"
          :disabled="busy"
          @click="submitVoucher"
        >
          Submit for approval
        </button>
        <button
          v-if="can('start_review')"
          class="btn"
          :disabled="busy"
          @click="decide('start_review', 'Marked as under review.')"
        >
          Start review
        </button>
        <button
          v-if="can('manager_approve')"
          class="btn btn-solid"
          :disabled="busy"
          @click="decide('manager_approve', 'Approved.')"
        >
          Approve (manager)
        </button>
        <button
          v-if="can('finance_approve')"
          class="btn btn-solid"
          :disabled="busy"
          @click="decide('finance_approve', 'Verified and approved.')"
        >
          Verify &amp; approve (finance)
        </button>
        <button
          v-if="can('mark_paid')"
          class="btn btn-solid"
          :disabled="busy"
          @click="decide('mark_paid', 'Marked as paid.')"
        >
          Mark as paid
        </button>
        <button
          v-if="can('return')"
          class="btn"
          :disabled="busy"
          @click="decide('return', 'Returned to the employee.')"
        >
          Request more information
        </button>
        <button
          v-if="can('manager_reject')"
          class="btn btn-danger"
          :disabled="busy"
          @click="decide('manager_reject', 'Rejected.')"
        >
          Reject (manager)
        </button>
        <button
          v-if="can('finance_reject')"
          class="btn btn-danger"
          :disabled="busy"
          @click="decide('finance_reject', 'Rejected.')"
        >
          Reject (finance)
        </button>
        <button
          v-if="can('reopen')"
          class="btn"
          :disabled="busy"
          @click="decide('reopen', 'Voucher reopened.')"
        >
          Reopen
        </button>
        <button
          v-if="can('delete')"
          class="btn btn-danger"
          :disabled="busy"
          @click="removeVoucher"
        >
          Delete
        </button>
      </div>
    </div>

    <!-- ========================================================= approvals -->
    <div class="panel print-block mb-6">
      <h3 class="display mb-3 text-xl">Approval history</h3>
      <div v-if="voucher.approvals.length" class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Approver</th>
              <th>Role</th>
              <th>Decision</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in voucher.approvals" :key="a.id">
              <td class="mono whitespace-nowrap text-[13px]">{{ a.approved_at }}</td>
              <td>{{ a.approver_name ?? 'Unknown' }}</td>
              <td class="text-xs capitalize">{{ a.role }}</td>
              <td
                class="text-xs"
                :class="
                  a.decision === 'approved' || a.decision === 'paid'
                    ? 'text-teal'
                    : a.decision === 'rejected'
                      ? 'text-red'
                      : 'text-amber'
                "
              >
                {{ actionLabel(a.decision) }}
              </td>
              <td class="text-muted">{{ a.comments ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-muted">No decisions recorded yet.</p>
    </div>

    <!-- ======================================================= audit trail -->
    <div class="panel print-block">
      <h3 class="display mb-1 text-xl">Audit trail</h3>
      <p class="mb-3 text-sm text-muted">
        Every action on this voucher, oldest last. This history is append-only —
        the database rejects edits and deletions.
      </p>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Who</th>
              <th>Action</th>
              <th>Field</th>
              <th>Previous</th>
              <th>New</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in voucher.audit_trail" :key="l.id">
              <td class="mono whitespace-nowrap text-[13px]">{{ l.timestamp }}</td>
              <td>{{ l.user_name ?? 'Unknown' }}</td>
              <td>{{ actionLabel(l.action) }}</td>
              <td class="text-xs text-muted">{{ l.field ?? '—' }}</td>
              <td class="mono max-w-40 truncate text-xs text-muted" :title="l.old_value ?? ''">
                {{ l.old_value ?? '—' }}
              </td>
              <td class="mono max-w-40 truncate text-xs" :title="l.new_value ?? ''">
                {{ l.new_value ?? '—' }}
              </td>
            </tr>
            <tr v-if="voucher.audit_trail.length === 0">
              <td colspan="6" class="py-6 text-center text-muted">Nothing recorded.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <p v-else-if="error" class="panel border-red bg-red-soft text-red">{{ error }}</p>
  <p v-else class="panel text-muted">Loading…</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  type PaymentMethod,
} from '../../shared/expenses'
import type { ExpenseVoucherDetail } from '../types'

// The printable voucher. This is the artefact that gets filed in the external
// accounting system as supporting evidence, so it has to stand on its own:
// what was spent, by whom, on what, and — crucially — who approved it.
//
// Only rendered for approved/recorded vouchers; see canDownloadPdf in
// ExpenseDetailView. A draft must never produce a document that could pass
// for an approved receipt.

const props = defineProps<{ voucher: ExpenseVoucherDetail }>()

const money = computed(
  () => `${props.voucher.currency}${props.voucher.amount.toFixed(2)}`,
)

const methodLabel = computed(
  () =>
    PAYMENT_METHOD_LABELS[props.voucher.payment_method as PaymentMethod] ??
    props.voucher.payment_method,
)

/** The decision that put this voucher into 'approved' — the evidence. */
const finalApproval = computed(() =>
  [...props.voucher.approvals]
    .reverse()
    .find((a) => a.decision === 'approved' && a.role === 'approver'),
)

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

const generatedOn = new Date().toLocaleString('en-GB', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const decisionLabel = (d: string) =>
  d.charAt(0).toUpperCase() + d.slice(1).replace(/_/g, ' ')
</script>

<template>
  <article class="voucher-doc text-ink">
    <!-- ------------------------------------------------------------ header -->
    <header class="flex items-start justify-between border-b-2 border-ink pb-3">
      <div>
        <p class="display text-2xl leading-none">OPENSIGNAL Ledger</p>
        <p class="mt-1 text-[11px] tracking-[0.14em] text-muted uppercase">
          Expense Voucher — Approved
        </p>
      </div>
      <div class="text-right">
        <p class="mono text-xl font-semibold">{{ voucher.voucher_number }}</p>
        <p class="text-[11px] tracking-wider text-muted uppercase">
          {{ STATUS_LABELS[voucher.status] }}
        </p>
      </div>
    </header>

    <!-- ------------------------------------------------------------ details -->
    <section class="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
      <div class="flex justify-between border-b border-line pb-1">
        <span class="text-muted">Employee</span>
        <span class="font-medium">
          {{ voucher.employee_name
          }}<template v-if="voucher.employee_code">
            ({{ voucher.employee_code }})</template
          >
        </span>
      </div>
      <div class="flex justify-between border-b border-line pb-1">
        <span class="text-muted">Department</span>
        <span>{{ voucher.department_name ?? '—' }}</span>
      </div>
      <div class="flex justify-between border-b border-line pb-1">
        <span class="text-muted">Date of expense</span>
        <span class="mono">{{ voucher.expense_date }}</span>
      </div>
      <div class="flex justify-between border-b border-line pb-1">
        <span class="text-muted">Date submitted</span>
        <span class="mono">{{ voucher.submission_date ?? '—' }}</span>
      </div>
      <div class="flex justify-between border-b border-line pb-1">
        <span class="text-muted">Category</span>
        <span>{{ voucher.category_name ?? '—' }}</span>
      </div>
      <div class="flex justify-between border-b border-line pb-1">
        <span class="text-muted">Payment method</span>
        <span>{{ methodLabel }}</span>
      </div>
      <div class="col-span-2 flex justify-between border-b border-line pb-1">
        <span class="text-muted">Vendor / supplier</span>
        <span>{{ voucher.vendor ?? '—' }}</span>
      </div>
    </section>

    <!-- -------------------------------------------------------- description -->
    <section class="mt-4">
      <p class="text-[11px] tracking-[0.1em] text-muted uppercase">
        Purpose / description
      </p>
      <p class="mt-1 text-[13px] whitespace-pre-wrap">{{ voucher.description }}</p>
    </section>

    <!-- ------------------------------------------------------------- amount -->
    <section
      class="mt-4 flex items-center justify-between border-2 border-ink px-4 py-3"
    >
      <span class="display text-lg">Total claimed</span>
      <span class="mono text-3xl font-semibold">{{ money }}</span>
    </section>

    <!-- ------------------------------------------------- receipt/declaration -->
    <section class="mt-4 border border-line p-3">
      <p class="text-[11px] tracking-[0.1em] text-muted uppercase">Receipt</p>
      <p v-if="voucher.receipt_available" class="mt-1 text-[13px]">
        Original receipt held on file<template v-if="voucher.attachment_count">
          — {{ voucher.attachment_count }} file(s) attached to this voucher</template
        >.
      </p>
      <template v-else>
        <p class="mt-1 text-[13px] font-medium">
          No receipt available — filed on declaration.
        </p>
        <p class="mt-2 text-[11px] tracking-[0.1em] text-muted uppercase">Reason</p>
        <p class="text-[13px]">{{ voucher.missing_receipt_reason ?? '—' }}</p>
        <p class="mt-2 text-[11px] tracking-[0.1em] text-muted uppercase">
          Employee declaration
        </p>
        <p class="text-[12px] italic">{{ voucher.declaration_text ?? '—' }}</p>
        <p class="mt-1 text-[12px]">
          Accepted by <span class="font-medium">{{ voucher.employee_name }}</span>
          on <span class="mono">{{ voucher.submission_date ?? '—' }}</span
          >.
        </p>
      </template>
    </section>

    <!-- --------------------------------------------------- approval evidence -->
    <section class="mt-4 border-2 border-teal p-3">
      <p class="text-[11px] tracking-[0.1em] text-teal uppercase">Approval</p>
      <p v-if="finalApproval" class="mt-1 text-[13px]">
        Approved by
        <span class="font-medium">{{ finalApproval.approver_name ?? 'Unknown' }}</span>
        on <span class="mono">{{ day(finalApproval.approved_at) }}</span
        >.
      </p>
      <p v-else class="mt-1 text-[13px]">Approved.</p>
      <p v-if="finalApproval?.comments" class="mt-1 text-[12px] text-muted">
        “{{ finalApproval.comments }}”
      </p>

      <p
        v-if="voucher.recorded_at"
        class="mt-2 border-t border-line pt-2 text-[13px]"
      >
        Recorded in the external finance records on
        <span class="mono">{{ day(voucher.recorded_at) }}</span>
        <template v-if="voucher.recorded_by_name">
          by {{ voucher.recorded_by_name }}</template
        ><template v-if="voucher.recorded_reference">
          · reference
          <span class="mono">{{ voucher.recorded_reference }}</span></template
        >.
      </p>
    </section>

    <!-- -------------------------------------------------------- audit table -->
    <section v-if="voucher.approvals.length" class="mt-4">
      <p class="text-[11px] tracking-[0.1em] text-muted uppercase">
        Full approval history
      </p>
      <table class="mt-1 w-full border-collapse text-[12px]">
        <thead>
          <tr class="border-b border-ink text-left">
            <th class="py-1 pr-2 font-semibold">Date</th>
            <th class="py-1 pr-2 font-semibold">Name</th>
            <th class="py-1 pr-2 font-semibold">Role</th>
            <th class="py-1 pr-2 font-semibold">Decision</th>
            <th class="py-1 font-semibold">Comments</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in voucher.approvals" :key="a.id" class="border-b border-line">
            <td class="mono py-1 pr-2 whitespace-nowrap">{{ day(a.approved_at) }}</td>
            <td class="py-1 pr-2">{{ a.approver_name ?? 'Unknown' }}</td>
            <td class="py-1 pr-2 capitalize">{{ a.role }}</td>
            <td class="py-1 pr-2">{{ decisionLabel(a.decision) }}</td>
            <td class="py-1 text-muted">{{ a.comments ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ---------------------------------------------------------- signatures -->
    <section class="mt-8 grid grid-cols-3 gap-6 text-[11px]">
      <div v-for="label in ['Employee', 'Approved by', 'Finance']" :key="label">
        <div class="h-8 border-b border-ink" />
        <p class="mt-1 tracking-[0.1em] text-muted uppercase">{{ label }}</p>
      </div>
    </section>

    <!-- -------------------------------------------------------------- footer -->
    <footer class="mt-6 border-t border-line pt-2 text-[10px] text-muted">
      <p>
        System-generated from OPENSIGNAL Ledger on {{ generatedOn }}. Reference
        <span class="mono">{{ voucher.id }}</span
        >. The approval history above is drawn from an append-only audit record.
      </p>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  type PaymentMethod,
} from '../../shared/expenses'
import type { ExpenseVoucherDetail } from '../types'

// The printable voucher — laid out as a receipt, since this is what gets
// filed in the external accounting system as supporting evidence. It has to
// stand on its own: who was paid, how much, what for, and who approved it.
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

/**
 * Who signs. Both names are known from the record, so they are printed rather
 * than left blank — the document then identifies both parties without anyone
 * having to decipher a signature.
 */
const signatories = computed(() => [
  { label: 'Initiator', name: props.voucher.employee_name ?? '—' },
  { label: 'Approved by', name: finalApproval.value?.approver_name ?? '—' },
])

const generatedOn = new Date().toLocaleString('en-GB', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
</script>

<template>
  <article class="voucher-doc text-ink">
    <div class="border-2 border-ink p-6">
      <!-- ---------------------------------------------------------- header -->
      <header class="border-b border-ink pb-3 text-center">
        <p class="display text-2xl leading-none">Internal Receipt Flow</p>
        <p class="mt-1 text-[11px] tracking-[0.2em] text-muted uppercase">
          Expense Voucher (Certificate of Honor) — Approved
        </p>
      </header>

      <div class="mt-3 flex items-baseline justify-between text-[12px]">
        <span>
          No.
          <span class="mono text-[14px] font-semibold">{{
            voucher.voucher_number
          }}</span>
        </span>
        <span class="tracking-[0.1em] text-muted uppercase">
          {{ STATUS_LABELS[voucher.status] }}
        </span>
        <span>
          Date <span class="mono">{{ voucher.expense_date }}</span>
        </span>
      </div>

      <!-- ------------------------------------------- receipt-style leaders -->
      <section class="mt-5 space-y-2.5 text-[13px]">
        <div class="flex items-baseline gap-2">
          <span class="shrink-0 text-muted">Department</span>
          <span class="min-w-0 flex-1 border-b border-dotted border-ink/40" />
          <span class="shrink-0">{{ voucher.department_name ?? '—' }}</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="shrink-0 text-muted">Being payment for</span>
          <span class="min-w-0 flex-1 border-b border-dotted border-ink/40" />
          <span class="shrink-0">{{ voucher.category_name ?? '—' }}</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="shrink-0 text-muted">Funded from</span>
          <span class="min-w-0 flex-1 border-b border-dotted border-ink/40" />
          <span class="shrink-0">
            {{ voucher.paid_from_petty_cash ? 'Petty cash float' : 'Own pocket' }}
          </span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="shrink-0 text-muted">Paid by</span>
          <span class="min-w-0 flex-1 border-b border-dotted border-ink/40" />
          <span class="shrink-0">{{ methodLabel }}</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="shrink-0 text-muted">Vendor / supplier</span>
          <span class="min-w-0 flex-1 border-b border-dotted border-ink/40" />
          <span class="shrink-0">{{ voucher.vendor ?? '—' }}</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="shrink-0 text-muted">Date submitted</span>
          <span class="min-w-0 flex-1 border-b border-dotted border-ink/40" />
          <span class="mono shrink-0">{{ voucher.submission_date ?? '—' }}</span>
        </div>
      </section>

      <!-- ----------------------------------------------------------- amount -->
      <section class="mt-5">
        <div
          class="flex items-center justify-between border-2 border-ink bg-teal-soft px-4 py-3"
        >
          <span class="display text-lg">Total claimed</span>
          <span class="mono text-3xl leading-none font-semibold">{{ money }}</span>
        </div>
      </section>

      <!-- ------------------------------------------------------------ purpose -->
      <section class="mt-4">
        <p class="text-[10px] tracking-[0.14em] text-muted uppercase">
          Purpose / description
        </p>
        <p class="mt-1 text-[13px] leading-snug whitespace-pre-wrap">
          {{ voucher.description }}
        </p>
      </section>

      <!-- ------------------------------------------------------- declaration -->
      <!-- A voucher is raised precisely because no receipt was issued, so the
           declaration is what gives this document its standing. Never optional. -->
      <section class="mt-4 border border-line p-3">
        <p class="text-[10px] tracking-[0.14em] text-muted uppercase">
          Why no receipt was issued
        </p>
        <p class="mt-1 text-[13px]">{{ voucher.missing_receipt_reason ?? '—' }}</p>
        <p class="mt-2 text-[10px] tracking-[0.14em] text-muted uppercase">
          Employee declaration
        </p>
        <p class="text-[12px] leading-snug italic">
          {{ voucher.declaration_text ?? '—' }}
        </p>
        <p class="mt-1 text-[12px]">
          Accepted by <span class="font-medium">{{ voucher.employee_name }}</span>
          on <span class="mono">{{ voucher.submission_date ?? '—' }}</span
          >.
        </p>
      </section>

      <!-- --------------------------------------------------- approval + stamp -->
      <section class="mt-4 flex items-center gap-4 border-2 border-teal p-3">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] tracking-[0.14em] text-teal uppercase">Approval</p>
          <p v-if="finalApproval" class="mt-1 text-[13px]">
            Approved by
            <span class="font-medium">{{
              finalApproval.approver_name ?? 'Unknown'
            }}</span>
            on <span class="mono">{{ day(finalApproval.approved_at) }}</span
            >.
          </p>
          <p v-else class="mt-1 text-[13px]">Approved.</p>
          <p v-if="finalApproval?.comments" class="mt-1 text-[12px] text-muted">
            “{{ finalApproval.comments }}”
          </p>
          <p v-if="voucher.recorded_at" class="mt-2 text-[12px]">
            Recorded in the external finance records on
            <span class="mono">{{ day(voucher.recorded_at) }}</span>
            <template v-if="voucher.recorded_by_name">
              by {{ voucher.recorded_by_name }}</template
            ><template v-if="voucher.recorded_reference">
              · ref
              <span class="mono">{{ voucher.recorded_reference }}</span></template
            >.
          </p>
        </div>

        <!-- The app's stamp motif, doubling as the "this is genuine" mark. -->
        <div
          class="display flex h-24 w-24 shrink-0 -rotate-12 flex-col items-center justify-center rounded-full border-2 border-teal px-2 text-center text-teal"
        >
          <span class="text-[13px] leading-none tracking-[0.1em]">APPROVED</span>
          <span class="mono mt-1 text-[9px] leading-none">
            {{ day(finalApproval?.approved_at ?? null) }}
          </span>
          <!-- Sized to keep the longest voucher number inside the circle. -->
          <span class="mt-1 text-[6px] leading-none tracking-[0.04em]">
            {{ voucher.voucher_number }}
          </span>
        </div>
      </section>

      <!-- -------------------------------------------------------- signatures -->
      <!-- The names are printed on the rule so the document identifies both
           parties on its own; the space above still takes a wet signature. -->
      <section class="mt-8 grid grid-cols-2 gap-8 text-[10px]">
        <div v-for="s in signatories" :key="s.label">
          <p class="flex h-8 items-end pb-0.5 text-[12px] font-medium">
            {{ s.name }}
          </p>
          <div class="border-b border-ink" />
          <p class="mt-1 tracking-[0.12em] text-muted uppercase">{{ s.label }}</p>
        </div>
      </section>

      <!-- ------------------------------------------------------------ footer -->
      <footer class="mt-5 border-t border-line pt-2 text-center text-[9px] text-muted">
        <p>
          Internal Receipt Flow {{ generatedOn }}. Reference
          <span class="mono">{{ voucher.id }}</span
          >.
        </p>
      </footer>
    </div>
  </article>
</template>

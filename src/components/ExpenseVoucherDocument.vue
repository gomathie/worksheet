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

const generatedOn = new Date().toLocaleString('en-GB', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

// ------------------------------------------------------------ amount in words

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
]
const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty',
  'ninety',
]

function underThousand(n: number): string {
  if (n < 20) return ONES[n]
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)]
    return n % 10 ? `${t}-${ONES[n % 10]}` : t
  }
  const rest = n % 100
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${underThousand(rest)}` : ''}`
}

function toWords(n: number): string {
  if (n === 0) return 'zero'
  const parts: string[] = []
  const scales: [number, string][] = [
    [1_000_000_000, 'billion'],
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ]
  let left = n
  for (const [value, name] of scales) {
    if (left >= value) {
      parts.push(`${underThousand(Math.floor(left / value))} ${name}`)
      left %= value
    }
  }
  if (left) parts.push(underThousand(left))
  return parts.join(' ')
}

/**
 * Cheque-style wording, e.g. "One hundred and forty-eight and 50/100 only".
 * Deliberately currency-agnostic — the app stores a symbol, not a currency
 * name, so spelling out "cedis" or "dollars" here would sometimes be wrong.
 */
const amountInWords = computed(() => {
  const whole = Math.floor(props.voucher.amount)
  const fraction = Math.round((props.voucher.amount - whole) * 100)
  const words = `${toWords(whole)} and ${String(fraction).padStart(2, '0')}/100 only`
  return words.charAt(0).toUpperCase() + words.slice(1)
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
          <span class="shrink-0 text-muted">Paid to</span>
          <span class="min-w-0 flex-1 border-b border-dotted border-ink/40" />
          <span class="shrink-0 font-medium">
            {{ voucher.employee_name
            }}<template v-if="voucher.employee_code">
              ({{ voucher.employee_code }})</template
            >
          </span>
        </div>
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
        <div class="flex items-stretch border-2 border-ink">
          <div class="flex-1 px-4 py-3">
            <p class="text-[10px] tracking-[0.14em] text-muted uppercase">
              Amount in words
            </p>
            <p class="mt-0.5 text-[13px] leading-snug">{{ amountInWords }}</p>
          </div>
          <div
            class="flex min-w-[34%] flex-col justify-center border-l-2 border-ink bg-teal-soft px-4 py-3 text-right"
          >
            <p class="text-[10px] tracking-[0.14em] text-muted uppercase">
              Total claimed
            </p>
            <p class="mono text-3xl leading-none font-semibold">{{ money }}</p>
          </div>
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

      <!-- ------------------------------------------------ receipt/declaration -->
      <section class="mt-4 border border-line p-3">
        <p class="text-[10px] tracking-[0.14em] text-muted uppercase">
          Supporting receipt
        </p>
        <p v-if="voucher.receipt_available" class="mt-1 text-[13px]">
          Original receipt held on file<template v-if="voucher.attachment_count">
            — {{ voucher.attachment_count }} file(s) attached to this voucher</template
          >.
        </p>
        <template v-else>
          <p class="mt-1 text-[13px] font-medium">
            No receipt available — issued on the declaration below.
          </p>
          <p class="mt-2 text-[10px] tracking-[0.14em] text-muted uppercase">Reason</p>
          <p class="text-[13px]">{{ voucher.missing_receipt_reason ?? '—' }}</p>
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
        </template>
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
          class="display flex h-24 w-24 shrink-0 -rotate-12 flex-col items-center justify-center rounded-full border-2 border-teal text-center text-teal"
        >
          <span class="text-[13px] leading-none tracking-[0.1em]">APPROVED</span>
          <span class="mono mt-1 text-[9px] leading-none">
            {{ day(finalApproval?.approved_at ?? null) }}
          </span>
          <span class="mt-1 text-[8px] leading-none tracking-[0.08em]">
            {{ voucher.voucher_number }}
          </span>
        </div>
      </section>

      <!-- -------------------------------------------------------- signatures -->
      <section class="mt-8 grid grid-cols-3 gap-6 text-[10px]">
        <div v-for="label in ['Initiator', 'Approved by', 'Finance']" :key="label">
          <div class="h-8 border-b border-ink" />
          <p class="mt-1 tracking-[0.12em] text-muted uppercase">{{ label }}</p>
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

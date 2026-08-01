<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import ExpenseVoucherDocument from '../components/ExpenseVoucherDocument.vue'
import { STATUS_LABELS } from '../../shared/expenses'
import { usePortraitPrint } from '../usePortraitPrint'
import type { ExpenseVoucherDetail } from '../types'

// The month-end audit pack: a cover sheet plus every settled voucher for the
// month, one per page, printed as a single PDF to file with the accounts.
// Only approved/recorded vouchers appear — anything still in flight has no
// standing as evidence, and the API enforces that too.

interface Pack {
  month: string
  currency: string
  generated_at: string
  total: number
  count: number
  vouchers: ExpenseVoucherDetail[]
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const month = ref((route.query.month as string) ?? auth.user!.today.slice(0, 7))
const pack = ref<Pack | null>(null)
const error = ref('')
const loading = ref(false)

async function load() {
  error.value = ''
  loading.value = true
  try {
    pack.value = await api<Pack>(`/api/expenses/pack?month=${month.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the audit pack'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(month, () => {
  router.replace({ query: { month: month.value } })
  load()
})

const money = (n: number) => `${pack.value?.currency ?? ''}${n.toFixed(2)}`

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
})

const generatedOn = computed(() =>
  pack.value
    ? new Date(pack.value.generated_at).toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)

// Vouchers are portrait; the global stylesheet's landscape is for the
// monthly report and would split each voucher across two sheets.
usePortraitPrint()

const printPack = () => window.print()
</script>

<template>
  <div>
    <div class="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Monthly audit pack</h2>
      <div class="flex flex-wrap items-center gap-3">
        <MonthPicker v-model="month" />
        <button
          class="btn btn-solid"
          :disabled="!pack || pack.count === 0"
          @click="printPack"
        >
          Download PDF
        </button>
        <RouterLink :to="{ name: 'expense-reports' }" class="btn btn-sm">Back</RouterLink>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="loading" class="panel no-print text-muted">Building the pack…</p>

    <p
      v-else-if="pack && pack.count === 0"
      class="panel no-print text-muted"
    >
      No approved or recorded vouchers for {{ monthLabel }}. Only settled
      vouchers go into the pack.
    </p>

    <template v-if="pack && pack.count">
      <p class="panel no-print mb-6 border-teal bg-teal-soft text-sm">
        {{ pack.count }} voucher(s), {{ money(pack.total) }} in total. Each prints
        on its own page after the cover sheet.
      </p>

      <!-- ------------------------------------------------------ cover sheet -->
      <article class="voucher-doc pack-page text-ink">
        <div class="border-2 border-ink p-6">
          <header class="border-b border-ink pb-3 text-center">
            <p class="display text-2xl leading-none">Internal Receipt Flow</p>
            <p class="mt-1 text-[11px] tracking-[0.2em] text-muted uppercase">
              Expense Voucher Pack — {{ monthLabel }}
            </p>
          </header>

          <div class="mt-4 flex items-baseline justify-between text-[12px]">
            <span>Vouchers <span class="mono font-semibold">{{ pack.count }}</span></span>
            <span>
              Total
              <span class="mono font-semibold">{{ money(pack.total) }}</span>
            </span>
          </div>

          <table class="mt-4 w-full border-collapse text-[12px]">
            <thead>
              <tr class="border-b border-ink text-left">
                <th class="py-1 pr-2 font-semibold">Voucher</th>
                <th class="py-1 pr-2 font-semibold">Date</th>
                <th class="py-1 pr-2 font-semibold">Employee</th>
                <th class="py-1 pr-2 font-semibold">Category</th>
                <th class="py-1 pr-2 text-right font-semibold">Amount</th>
                <th class="py-1 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in pack.vouchers" :key="v.id" class="border-b border-line">
                <td class="mono py-1 pr-2 whitespace-nowrap">{{ v.voucher_number }}</td>
                <td class="mono py-1 pr-2 whitespace-nowrap">{{ v.expense_date }}</td>
                <td class="py-1 pr-2">{{ v.employee_name }}</td>
                <td class="py-1 pr-2">{{ v.category_name ?? '—' }}</td>
                <td class="mono py-1 pr-2 text-right">
                  {{ v.currency }}{{ v.amount.toFixed(2) }}
                </td>
                <td class="py-1 text-[11px]">{{ STATUS_LABELS[v.status] }}</td>
              </tr>
              <tr class="border-t-2 border-ink font-semibold">
                <td class="py-1" colspan="4">Total</td>
                <td class="mono py-1 pr-2 text-right">{{ money(pack.total) }}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <p class="mt-6 text-[10px] text-muted">
            Every voucher listed above was approved by an administrator holding
            expense approval rights; the individual approval is recorded on each
            voucher that follows. Generated {{ generatedOn }}.
          </p>
        </div>
      </article>

      <!-- --------------------------------------------- one voucher per page -->
      <ExpenseVoucherDocument
        v-for="v in pack.vouchers"
        :key="v.id"
        :voucher="v"
        class="pack-page mt-8"
      />
    </template>
  </div>
</template>

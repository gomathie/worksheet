<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import type { DailyTotal } from '../../shared/logic'
import type { WorkTypeInfo } from '../types'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  month: string
  daily: DailyTotal[]
  workTypes: WorkTypeInfo[]
}>()

// Teal and amber first (the original two series), then more distinct hues.
const PALETTE = ['#128F72', '#C9822C', '#4C6FBF', '#B4548C', '#6B8F2A', '#8A6FD1']

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const chartData = computed(() => {
  const n = daysInMonth(props.month)
  const byDate = new Map(props.daily.map((d) => [d.date, d]))
  const labels: string[] = []
  const dates: string[] = []
  for (let day = 1; day <= n; day++) {
    labels.push(String(day))
    dates.push(`${props.month}-${String(day).padStart(2, '0')}`)
  }
  return {
    labels,
    datasets: props.workTypes.map((wt, i) => ({
      label: wt.name,
      data: dates.map((date) => byDate.get(date)?.units[wt.id] ?? 0),
      backgroundColor: PALETTE[i % PALETTE.length],
      borderRadius: 4,
      borderSkipped: 'bottom' as const,
      maxBarThickness: 14,
    })),
  }
})

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: 'rectRounded' as const,
        color: '#1E2124',
        font: { family: 'Inter', size: 12 },
      },
    },
    tooltip: {
      backgroundColor: '#1E2124',
      titleFont: { family: 'IBM Plex Mono', size: 12 },
      bodyFont: { family: 'IBM Plex Mono', size: 12 },
      callbacks: {
        title: (items: { label: string }[]) =>
          items.length ? `${props.month}-${items[0].label.padStart(2, '0')}` : '',
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#7C7F87', font: { family: 'IBM Plex Mono', size: 11 } },
      title: {
        display: true,
        text: 'Day of month',
        color: '#7C7F87',
        font: { family: 'Inter', size: 11 },
      },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: '#E2DFD5' },
      ticks: {
        precision: 0,
        color: '#7C7F87',
        font: { family: 'IBM Plex Mono', size: 11 },
      },
    },
  },
}
</script>

<template>
  <div class="h-72">
    <Bar :data="chartData" :options="options" />
  </div>
</template>

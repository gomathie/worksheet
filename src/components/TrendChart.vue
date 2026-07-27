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

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  labels: string[]
  series: { label: string; data: number[] }[]
  /** Prefix values with this currency symbol in tooltips (money charts). */
  currency?: string
}>()

const PALETTE = ['#128F72', '#C9822C', '#4C6FBF', '#B4548C', '#6B8F2A', '#8A6FD1']

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.series.map((s, i) => ({
    label: s.label,
    data: s.data,
    backgroundColor: PALETTE[i % PALETTE.length],
    borderRadius: 4,
    borderSkipped: 'bottom' as const,
    maxBarThickness: 26,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: props.series.length > 1,
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
        label: (item: { dataset: { label?: string }; parsed: { y: number | null } }) => {
          const v = item.parsed.y ?? 0
          const val = props.currency ? `${props.currency}${v.toFixed(2)}` : String(v)
          return `${item.dataset.label}: ${val}`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#7C7F87', font: { family: 'IBM Plex Mono', size: 11 } },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: '#E2DFD5' },
      ticks: { color: '#7C7F87', font: { family: 'IBM Plex Mono', size: 11 } },
    },
  },
}))
</script>

<template>
  <div class="h-64">
    <Bar :data="chartData" :options="options" />
  </div>
</template>

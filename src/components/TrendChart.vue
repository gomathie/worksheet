<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
  type Plugin,
} from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps<{
  labels: string[]
  series: { label: string; data: number[] }[]
  /** Prefix values with this currency symbol in tooltips (money charts). */
  currency?: string
  /**
   * Stack each label's series into a single column so the bar height is that
   * label's total. Grouped side-by-side bars split a total across columns, so
   * a period with more series reads as differently *positioned* rather than
   * taller — and a period that is genuinely bigger can look smaller because
   * its tallest single series happens to be shorter than a rival's. Use this
   * when the comparison being asked for is period against period.
   */
  stacked?: boolean
  /** Print each column's total above it. Only meaningful when stacked. */
  showTotals?: boolean
  /**
   * Draw the bars left-to-right with the labels down the side. Bars that grow
   * from a shared baseline on the left are easier to rank than columns that
   * grow from a shared baseline at the bottom, because the eye follows one
   * horizontal line per label instead of comparing heights across a gap.
   */
  horizontal?: boolean
}>()

const PALETTE = ['#128F72', '#C9822C', '#4C6FBF', '#B4548C', '#6B8F2A', '#8A6FD1']

/** Totals drawn on the canvas, since chart.js has no built-in data labels
 * and pulling in another plugin package for a few numbers is not worth it. */
const totalLabels: Plugin<'bar'> = {
  id: 'totalLabels',
  afterDatasetsDraw(chart) {
    if (!props.showTotals) return
    const { ctx } = chart
    const labels = chart.data.labels ?? []
    const horizontal = Boolean(props.horizontal)
    ctx.save()
    ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace'
    ctx.fillStyle = '#1E2124'
    ctx.textAlign = horizontal ? 'left' : 'center'
    ctx.textBaseline = horizontal ? 'middle' : 'bottom'
    for (let i = 0; i < labels.length; i++) {
      let total = 0
      // Vertical stacks are labelled above the smallest y; horizontal ones
      // past the largest x. Both start at a value that any real bar beats.
      let top = Number.POSITIVE_INFINITY
      let edge = Number.NEGATIVE_INFINITY
      let cx = Number.NaN
      let cy = Number.NaN
      chart.data.datasets.forEach((d, di) => {
        if (!chart.isDatasetVisible(di)) return
        const value = d.data[i]
        if (typeof value === 'number') total += value
        const bar = chart.getDatasetMeta(di).data[i] as unknown as
          | { x: number; y: number }
          | undefined
        if (!bar || !Number.isFinite(bar.x) || !Number.isFinite(bar.y)) return
        cx = bar.x
        cy = bar.y
        if (horizontal) {
          if (bar.x > edge) edge = bar.x
        } else if (bar.y < top) {
          top = bar.y
        }
      })
      if (total <= 0) continue
      const text = String(Math.round(total * 100) / 100)
      if (horizontal) {
        if (!Number.isFinite(edge) || !Number.isFinite(cy)) continue
        ctx.fillText(text, edge + 8, cy)
      } else {
        if (!Number.isFinite(top) || !Number.isFinite(cx)) continue
        ctx.fillText(text, cx, top - 6)
      }
    }
    ctx.restore()
  },
}

const plugins = [totalLabels]

/** Room for the category labels on a horizontal chart. chart.js sizes this
 * gutter from a width measured at layout time, and if that measurement lands a
 * few pixels short — a webfont arriving late is enough — the text is drawn past
 * the canvas edge and loses its first characters. These labels are always a
 * short "MMM YY", so a fixed gutter is deterministic where the measurement is
 * not. */
const LABEL_GUTTER = 82

const categoryAxis = computed(() => ({
  stacked: props.stacked ?? false,
  grid: { display: false },
  ticks: { color: '#7C7F87', font: { family: 'IBM Plex Mono', size: 11 } },
  afterFit: (scale: { width: number }) => {
    if (props.horizontal) scale.width = LABEL_GUTTER
  },
}))

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.series.map((s, i) => ({
    label: s.label,
    data: s.data,
    backgroundColor: PALETTE[i % PALETTE.length],
    borderRadius: props.stacked ? 6 : 4,
    // 'middle' keeps the rounding to the outer corners of the stack, so the
    // segments inside a column stay flush against each other.
    borderSkipped: (props.stacked
      ? 'middle'
      : props.horizontal
        ? 'left'
        : 'bottom') as 'middle' | 'left' | 'bottom',
    maxBarThickness: props.stacked ? 80 : 26,
    categoryPercentage: props.stacked ? (props.horizontal ? 0.7 : 0.55) : undefined,
    barPercentage: props.stacked ? 0.95 : undefined,
  })),
}))

// The category axis carries the labels; the value axis carries the numbers.
// Horizontal bars simply swap which one is which.
const categoryAxis = computed(() => ({
  stacked: props.stacked ?? false,
  grid: { display: false },
  ticks: { color: '#7C7F87', font: { family: 'IBM Plex Mono', size: 11 } },
}))

const valueAxis = computed(() => ({
  stacked: props.stacked ?? false,
  beginAtZero: true,
  border: { display: false },
  grid: { color: '#E2DFD5' },
  ticks: {
    color: '#7C7F87',
    font: { family: 'IBM Plex Mono', size: 11 },
    precision: 0,
    // Three short bars do not need a gridline every 2 units.
    maxTicksLimit: props.stacked ? 5 : undefined,
  },
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: (props.horizontal ? 'y' : 'x') as 'x' | 'y',
  // Room for the total drawn beyond the last bar, and for category labels on
  // the left — canvas text outside the canvas is clipped, so an axis that
  // measures a label a few pixels short loses its first characters otherwise.
  layout: {
    padding: props.showTotals || props.horizontal
      ? {
          top: props.showTotals && !props.horizontal ? 20 : 0,
          right: props.showTotals && props.horizontal ? 48 : 0,
          left: props.horizontal ? 16 : 0,
        }
      : {},
  },
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
        label: (item: {
          dataset: { label?: string }
          parsed: { x: number | null; y: number | null }
        }) => {
          // Horizontal bars put the value on x; vertical ones on y.
          const v = (props.horizontal ? item.parsed.x : item.parsed.y) ?? 0
          const val = props.currency ? `${props.currency}${v.toFixed(2)}` : String(v)
          return `${item.dataset.label}: ${val}`
        },
        footer: (items: { dataIndex: number }[]) => {
          if (!props.stacked || items.length === 0) return ''
          const i = items[0].dataIndex
          const total = props.series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0)
          return `Total: ${props.currency ? props.currency : ''}${
            props.currency ? total.toFixed(2) : total
          }`
        },
      },
    },
  },
  scales: props.horizontal
    ? { x: valueAxis.value, y: categoryAxis.value }
    : { x: categoryAxis.value, y: valueAxis.value },
}))
</script>

<template>
  <div class="h-64">
    <Bar ref="chartRef" :data="chartData" :options="options" :plugins="plugins" />
  </div>
</template>

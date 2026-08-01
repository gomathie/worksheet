import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Force portrait printing for as long as the calling view is mounted.
 *
 * The global stylesheet sets `@page { size: landscape }` for the monthly
 * report, which is wrong for the voucher documents — in landscape only ~490px
 * of height is printable and an 847px voucher splits across two sheets.
 *
 * Applying this on mount rather than inside the print handler means the
 * browser's own Ctrl+P / Share-to-print produces the same correct output as
 * the button does.
 */
export function usePortraitPrint(margin = '14mm') {
  let style: HTMLStyleElement | null = null

  onMounted(() => {
    style = document.createElement('style')
    style.dataset.portraitPrint = 'true'
    style.textContent = `@page { size: A4 portrait; margin: ${margin}; }`
    document.head.appendChild(style)
  })

  onBeforeUnmount(() => {
    style?.remove()
    style = null
  })
}

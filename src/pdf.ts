export function isMobileOrPwa(): boolean {
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const win = typeof window !== 'undefined' ? window : null
  const isStandalone = Boolean(
    win?.matchMedia?.('(display-mode: standalone)')?.matches ||
      (win?.navigator as unknown as { standalone?: boolean })?.standalone === true,
  )
  const userAgent = nav?.userAgent ?? ''
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
  return isStandalone || isMobile
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false
  }
  try {
    const testFile = new File(['test'], 'test.txt', { type: 'text/plain' })
    return navigator.canShare({ files: [testFile] })
  } catch {
    return false
  }
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  title = filename,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type })
  if (canShareFiles()) {
    try {
      await navigator.share({
        files: [file],
        title,
      })
      return 'shared'
    } catch (err) {
      // If user aborted / cancelled share sheet, do not trigger unwanted download
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared'
      }
      // Otherwise fall back to download
    }
  }
  triggerDownload(blob, filename)
  return 'downloaded'
}

export interface PdfOptions {
  orientation?: 'portrait' | 'landscape'
  marginMm?: number
  scale?: number
}

export async function generatePdfBlob(
  element: HTMLElement,
  filename: string,
  options: PdfOptions = {},
): Promise<Blob> {
  const orientation = options.orientation ?? 'portrait'
  const marginMm = options.marginMm ?? 8
  const scale = options.scale ?? 2
  const containerWidth = orientation === 'landscape' ? 1120 : 800

  // Create an off-screen container with a clean clone so that:
  // 1. It is rendered at full A4 width (800px / 1120px) even on small mobile screens.
  // 2. Any .no-print elements (buttons, navigation tabs) are cleanly stripped.
  // 3. Any .print-only elements (vouchers, certificates) are visible.
  // 4. Mobile responsive styles do not compress the document layout.
  const tempContainer = document.createElement('div')
  tempContainer.style.position = 'fixed'
  tempContainer.style.top = '0'
  tempContainer.style.left = '-99999px'
  tempContainer.style.width = `${containerWidth}px`
  tempContainer.style.backgroundColor = '#ffffff'
  tempContainer.style.zIndex = '-99999'
  tempContainer.style.pointerEvents = 'none'

  const clone = element.cloneNode(true) as HTMLElement
  clone.style.display = 'block'
  clone.classList.remove('print-only')

  // Reveal any print-only children
  for (const child of Array.from(clone.querySelectorAll<HTMLElement>('.print-only'))) {
    child.classList.remove('print-only')
    child.style.display = 'block'
  }
  // Remove any no-print children
  for (const child of Array.from(clone.querySelectorAll<HTMLElement>('.no-print'))) {
    child.remove()
  }

  tempContainer.appendChild(clone)
  document.body.appendChild(tempContainer)

  try {
    const opt = {
      margin: marginMm,
      filename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: containerWidth,
      },
      jsPDF: {
        unit: 'mm' as const,
        format: 'a4' as const,
        orientation,
      },
    }

    // Dynamically load html2pdf so it is only loaded on demand and does not break SSR/test runners
    const html2pdfModule = await import('html2pdf.js')
    const html2pdf = (html2pdfModule.default || html2pdfModule) as unknown as () => {
      set: (opt: unknown) => { from: (el: HTMLElement) => { outputPdf: (type: string) => Promise<Blob> } }
    }

    // Generate real PDF blob via html2pdf
    return await html2pdf().set(opt).from(clone).outputPdf('blob')
  } finally {
    if (tempContainer.parentNode) {
      tempContainer.parentNode.removeChild(tempContainer)
    }
  }
}

export async function exportOrSharePdf(
  element: HTMLElement,
  filename: string,
  title = filename,
  options: PdfOptions = {},
): Promise<'shared' | 'downloaded'> {
  const blob = await generatePdfBlob(element, filename, options)
  return await shareOrDownloadFile(blob, filename, title)
}

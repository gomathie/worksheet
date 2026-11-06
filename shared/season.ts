/**
 * The festive logo runs from 1 November to 9 January inclusive. From
 * 10 January the standard logo returns until the next November.
 * index.html repeats this check inline for the PWA icons; keep them in sync.
 */
export function isFestiveSeason(date: Date): boolean {
  const month = date.getMonth() // 0 = January
  if (month === 10 || month === 11) return true
  return month === 0 && date.getDate() < 10
}

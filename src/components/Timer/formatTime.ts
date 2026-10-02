const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * Formats elapsed time as `mm:ss`: whole seconds (rounded down), both parts zero-padded.
 * Negative input is treated as 0.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(Math.max(ms, 0) / 1000)
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
}

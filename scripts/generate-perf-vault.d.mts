/** Types for the committed perf-vault generator (story 15.2). */
export interface PerfVaultCounts {
  files: number
  notes: number
  handoffs: number
}
export function generatePerfVault(
  dir: string,
  opts?: { notes?: number; seed?: number },
): PerfVaultCounts

/**
 * Open a handoff brief in the reader with its reading order rendered inline
 * (F5). Shared by Today's needs-you queue and the Inbox (story 26.3; was
 * Board.tsx's export before the v3 Inbox rebuild).
 */
import type { HandoffCard } from '../../../../shared/types'
import { toVaultRelative } from '../../../../shared/handoff-lanes'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'

export function openBrief(card: HandoffCard): void {
  const vaultPath = useApp.getState().identity?.vaultPath ?? ''
  useApp.getState().setView('reader')
  useHandoffs.getState().markRead(card) // story 9.2: opening marks read
  void useReader.getState().open(toVaultRelative(card.path, vaultPath), card.readingOrder)
}

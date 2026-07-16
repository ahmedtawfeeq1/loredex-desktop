/**
 * Read-mode checklist toggle: flip one [ ]/[x] in the note source and save
 * through note.save (same write path, identity, and git commit as edit mode).
 * The file is the only truth — after the write the note is re-read from disk,
 * which also reverts the optimistic checkbox if anything refused the write.
 */
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { toggleTask } from '../../markdown/tasks'
import { useEditor } from '../../stores/editor'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import { useToasts } from '../../stores/toasts'

let busy = false // one write at a time — clicks during a save are dropped

export async function toggleTaskInNote(
  path: string,
  index: number,
  checked: boolean,
): Promise<void> {
  if (busy) return
  const reader = useReader.getState()
  if (reader.selected !== path || !reader.doc) return
  const editor = useEditor.getState()
  if (editor.path === path && editor.draft !== editor.saved) {
    useToasts.getState().push('Unsaved edit draft', 'Save or discard the draft first (⌘E)')
    return
  }
  const identity = effectiveIdentity(useIdentity.getState())
  if (!identity) {
    useToasts.getState().push('Checklist needs an identity', 'Set your name in Settings')
    return
  }
  const body = toggleTask(reader.doc.body, index, checked)
  const reopen = (): Promise<void> => useReader.getState().open(path, reader.readingOrder)
  if (body === null) {
    // stale render (the file changed underneath) — reload instead of writing
    await reopen()
    return
  }
  busy = true
  try {
    await invoke('note.save', { path, body, identity })
  } catch (e) {
    useToasts.getState().push('Checklist not saved', isErrEnvelope(e) ? e.message : String(e))
  } finally {
    busy = false
  }
  await reopen()
}

/**
 * The predicate that decides whether a terminal paste is an image (send Ctrl+V,
 * let the CLI read the clipboard) or text (leave it entirely to xterm).
 *
 * Getting this wrong in the "text" direction breaks ordinary pasting, so the
 * negative cases matter as much as the positive ones.
 */
import { describe, expect, it } from 'vitest'
import { pasteHasImage } from './xtermRegistry'

/** Minimal DataTransfer stand-in — only what the predicate reads. */
const transfer = (
  items: { type: string }[],
  files: { type: string }[] = [],
): DataTransfer => ({ items, files }) as unknown as DataTransfer

describe('pasteHasImage', () => {
  it('is true for a screenshot on the clipboard', () => {
    expect(pasteHasImage(transfer([{ type: 'image/png' }]))).toBe(true)
  })

  it('is true when the image arrives as a file rather than an item', () => {
    // Chromium populates `files` (not `items`) for some sources, e.g. a copy
    // out of Finder/Explorer
    expect(pasteHasImage(transfer([], [{ type: 'image/jpeg' }]))).toBe(true)
  })

  it('is true for an image alongside text — the image is what text paste loses', () => {
    expect(pasteHasImage(transfer([{ type: 'text/plain' }, { type: 'image/png' }]))).toBe(true)
  })

  it('is FALSE for ordinary text, so xterm keeps handling normal pastes', () => {
    expect(pasteHasImage(transfer([{ type: 'text/plain' }]))).toBe(false)
  })

  it('is FALSE for rich text and html', () => {
    expect(pasteHasImage(transfer([{ type: 'text/plain' }, { type: 'text/html' }]))).toBe(false)
  })

  it('is FALSE for a non-image file such as a pasted document', () => {
    expect(pasteHasImage(transfer([], [{ type: 'application/pdf' }]))).toBe(false)
  })

  it('is FALSE for an empty clipboard, and survives a null clipboardData', () => {
    expect(pasteHasImage(transfer([]))).toBe(false)
    expect(pasteHasImage(null)).toBe(false)
  })
})

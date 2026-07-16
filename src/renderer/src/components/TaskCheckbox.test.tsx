// @vitest-environment jsdom
/**
 * Interactive checklists: clicking a rendered task checkbox reports the
 * task's document-order index (from the parent li) and the DESIRED state;
 * without a TasksContext handler (previews, briefs) the checkbox stays inert.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderMarkdown } from '../markdown/pipeline'
import { TasksContext } from './TaskCheckbox'

afterEach(() => cleanup())

const MD = '- [ ] alpha\n- [x] beta'

describe('MarkdownTaskCheckbox through the sanctioned pipeline', () => {
  it('click reports (index, desired state) from the parent li', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <TasksContext.Provider value={onToggle}>{renderMarkdown(MD)}</TasksContext.Provider>,
    )
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    fireEvent.click(boxes[0] as HTMLInputElement) // unchecked → wants checked
    fireEvent.click(boxes[1] as HTMLInputElement) // checked → wants unchecked
    expect(onToggle.mock.calls).toEqual([
      [0, true],
      [1, false],
    ])
  })

  it('without a handler the checkbox stays disabled — previews never write', () => {
    const onToggle = vi.fn()
    const { container } = render(<>{renderMarkdown(MD)}</>)
    const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(box?.disabled).toBe(true)
    if (box) fireEvent.click(box)
    expect(onToggle).not.toHaveBeenCalled()
  })
})

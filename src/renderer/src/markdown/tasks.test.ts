/**
 * Interactive checklists: the remark plugin numbers GFM task items in document
 * order (data-task-index on the <li>), and toggleTask flips the matching
 * [ ]/[x] in the markdown source — the file stays the only truth.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './pipeline'
import { toggleTask } from './tasks'

const html = (md: string): string => renderToStaticMarkup(renderMarkdown(md))

describe('remarkTaskIndexes through the sanctioned pipeline', () => {
  it('numbers task items in document order and renders their checkboxes', () => {
    const out = html('- [ ] first\n- [x] second\n\ntext\n\n- [ ] third')
    expect(out).toContain('data-task-index="0"')
    expect(out).toContain('data-task-index="1"')
    expect(out).toContain('data-task-index="2"')
    expect(out.match(/type="checkbox"/g)).toHaveLength(3)
    expect(out).toContain('checked')
  })

  it('plain list items get no index', () => {
    expect(html('- not a task')).not.toContain('data-task-index')
  })
})

describe('toggleTask', () => {
  const body = ['# title', '', '- [ ] alpha', '- [x] beta', '  - [ ] nested', '- [ ] gamma'].join(
    '\n',
  )

  it('checks the nth task, leaving everything else byte-identical', () => {
    expect(toggleTask(body, 0, true)).toBe(body.replace('- [ ] alpha', '- [x] alpha'))
    expect(toggleTask(body, 2, true)).toBe(body.replace('- [ ] nested', '- [x] nested'))
  })

  it('unchecks a checked task', () => {
    expect(toggleTask(body, 1, false)).toBe(body.replace('- [x] beta', '- [ ] beta'))
  })

  it('counts ordered-list and blockquoted tasks', () => {
    const md = '1. [ ] one\n\n> - [ ] quoted'
    expect(toggleTask(md, 1, true)).toBe('1. [ ] one\n\n> - [x] quoted')
  })

  it('skips task-looking lines inside fenced code', () => {
    const md = '```\n- [ ] fake\n```\n- [ ] real'
    expect(toggleTask(md, 0, true)).toBe('```\n- [ ] fake\n```\n- [x] real')
  })

  it('refuses on state mismatch or out-of-range index — never a blind write', () => {
    expect(toggleTask(body, 1, true)).toBeNull() // beta is already checked
    expect(toggleTask(body, 9, true)).toBeNull()
  })
})

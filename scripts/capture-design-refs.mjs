// Capture named reference screenshots from the interactive prototype.
import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import WebSocket from 'ws'

const OUT = '/Users/tawfeeq/Business/GenuDo/Technical/md-files-reader/loredex-desktop/docs/design/reference'
mkdirSync(OUT, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9345
const URL = 'file:///Users/tawfeeq/Business/GenuDo/Technical/md-files-reader/handoff/loredex-v2-prototype.html'
const chrome = execFile(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cdp-proto-profile2', '--no-first-run', '--window-size=2000,1300', 'about:blank'])
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const ts = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const p = ts.find(t => t.type === 'page')
      if (p) return p.webSocketDebuggerUrl
    } catch {}
    await sleep(300)
  }
  throw new Error('no chrome')
}
const ws = new WebSocket(await wsUrl(), { maxPayload: 256*1024*1024 })
await new Promise(r => ws.on('open', r))
let id = 0; const pend = new Map()
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (method, params={}) => new Promise(res => { id++; pend.set(id, res); ws.send(JSON.stringify({id, method, params})) })
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value

await send('Emulation.setDeviceMetricsOverride', { width: 2000, height: 1300, deviceScaleFactor: 1, mobile: false })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await send('Page.enable')
await send('Page.navigate', { url: URL })
await sleep(15000)

const key = k => evalJs(`(() => {
  for (const t of [document, document.body, window]) {
    t.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', bubbles: true }))
    t.dispatchEvent(new KeyboardEvent('keyup', { key: '${k}', bubbles: true }))
  }
  return true
})()`)
const clickText = txt => evalJs(`(() => {
  const els = [...document.querySelectorAll('div,button,span,a')]
  const el = els.filter(e => e.textContent?.trim() === ${JSON.stringify(txt)}).sort((a,b) => a.textContent.length - b.textContent.length)[0]
  if (!el) return 'MISS: ' + ${JSON.stringify(txt)}
  el.click(); return 'clicked'
})()`)
async function shot(name) {
  await sleep(900)
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'))
  console.log('saved', name)
}

// views (keys 1-8)
const views = [
  ['1', '01-today'], ['2', '02-inbox'], ['3', '03-plan-board'], ['4', '04-reader'],
  ['5', '05-atlas'], ['6', '06-agents'], ['7', '07-activity'], ['8', '08-settings-general'],
]
for (const [k, name] of views) { await key(k); await shot(name) }

// settings sections (view 8 active)
const sections = [
  ['Projects & contracts', '09-settings-projects-contracts'],
  ['Members & agents', '10-settings-members-agents'],
  ['Filing rules', '11-settings-filing-rules'],
  ['Appearance', '12-settings-appearance'],
  ['Typography', '13-settings-typography'],
  ['Shortcuts', '14-settings-shortcuts'],
  ['MCP server', '15-settings-mcp-server'],
  ['Sync & git', '16-settings-sync-git'],
  ['GitHub', '17-settings-github'],
]
for (const [txt, name] of sections) { console.log(await clickText(txt)); await shot(name) }

// atlas project lens (click a project card if the atlas map shows one)
await key('5'); await sleep(800)
console.log(await clickText('Project'))
await shot('18-atlas-project-lens')

// new handoff modal (key C from Today)
await key('1'); await sleep(500)
await key('c')
await shot('19-modal-new-handoff')

ws.close(); chrome.kill(); process.exit(0)

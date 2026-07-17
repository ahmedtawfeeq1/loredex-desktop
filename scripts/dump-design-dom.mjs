// Dump each prototype view's DOM (inline styles = exact values) → repo.
import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import WebSocket from 'ws'
const OUT = '/Users/tawfeeq/Business/GenuDo/Technical/md-files-reader/loredex-desktop/docs/design/reference/dom'
mkdirSync(OUT, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9346
const URL = 'file:///Users/tawfeeq/Business/GenuDo/Technical/md-files-reader/handoff/loredex-v2-prototype.html'
const chrome = execFile(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cdp-proto-profile3', '--no-first-run', '--window-size=2000,1300', 'about:blank'])
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try { const ts = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const p = ts.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch {}
    await sleep(300)
  }
  throw new Error('no chrome')
}
const ws = new WebSocket(await wsUrl(), { maxPayload: 256*1024*1024 })
await new Promise(r => ws.on('open', r))
let id = 0; const pend = new Map()
ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p={}) => new Promise(res => { id++; pend.set(id, res); ws.send(JSON.stringify({id, method: m, params: p})) })
const evalJs = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value
await send('Page.enable')
await send('Page.navigate', { url: URL })
await sleep(15000)
const key = k => evalJs(`(()=>{for(const t of [document,document.body,window]){t.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true}))}return 1})()`)
const clickText = t => evalJs(`(()=>{const el=[...document.querySelectorAll('div,button,span,a')].filter(e=>e.textContent?.trim()===${JSON.stringify(t)}).sort((a,b)=>a.textContent.length-b.textContent.length)[0];if(!el)return 'MISS';el.click();return 'ok'})()`)
async function dump(name) {
  await sleep(700)
  const html = await evalJs(`document.getElementById('dc-root').outerHTML`)
  writeFileSync(`${OUT}/${name}.html`, `<!-- readable DC source: prototype view "${name}" — inline styles are the exact values -->\n` + html)
  console.log('dumped', name, (html?.length/1024|0)+'kb')
}
const views = [['1','01-today'],['2','02-inbox'],['3','03-plan-board'],['4','04-reader'],['5','05-atlas'],['6','06-agents'],['7','07-activity'],['8','08-settings-general']]
for (const [k, n] of views) { await key(k); await dump(n) }
const sections = [['Projects & contracts','09-settings-projects-contracts'],['Members & agents','10-settings-members-agents'],['Filing rules','11-settings-filing-rules'],['Appearance','12-settings-appearance'],['Typography','13-settings-typography'],['Shortcuts','14-settings-shortcuts'],['MCP server','15-settings-mcp-server'],['Sync & git','16-settings-sync-git'],['GitHub','17-settings-github']]
for (const [t, n] of sections) { await clickText(t); await dump(n) }
await key('5'); await sleep(600); await clickText('Project'); await dump('18-atlas-project-lens')
await key('1'); await sleep(400); await key('c'); await dump('19-modal-new-handoff')
ws.close(); chrome.kill(); process.exit(0)

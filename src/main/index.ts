import { app, BrowserWindow, ipcMain, shell, screen, dialog, powerSaveBlocker } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join, extname, basename } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { createServer } from 'http'
import type { Server } from 'http'
import type { Socket } from 'net'
import { networkInterfaces, hostname } from 'os'
import { execSync } from 'child_process'
import { Bonjour } from 'bonjour-service'
import { db } from './db/index'
import { songs, sections, serviceDates, lineupItems, themes, songUsage } from './db/schema'
import { asc, desc, eq, ne, and, like, or, count, lte, gte } from 'drizzle-orm'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'

let controlWindow: BrowserWindow | null = null
let projectionWindow: BrowserWindow | null = null
let confidenceWindow: BrowserWindow | null = null
let confidenceWasOpen = false       // true if confidence was open when display disconnected
let confidenceLastDisplayId: number | undefined  // last display it was opened on
let powerSaveBlockerId: number | null = null
let movingProjection = false  // true while doing an intentional display switch

// ── Stage display (local web server) ──────────────────────────────────────────

interface StageClient {
  socket: Socket
  send: (event: unknown) => boolean
  ping: () => boolean
  ip: string
  userAgent: string
  connectedAt: number
}

function parseDeviceLabel(ua: string): string {
  if (/iPhone/i.test(ua))                      return 'iPhone'
  if (/iPad/i.test(ua))                        return 'iPad'
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'Android Phone'
  if (/Android/i.test(ua))                     return 'Android Tablet'
  if (/Macintosh|Mac OS X/i.test(ua))          return 'Mac'
  if (/Windows/i.test(ua))                     return 'Windows PC'
  if (/Linux/i.test(ua))                       return 'Linux'
  if (/CrOS/i.test(ua))                        return 'Chromebook'
  return 'Unknown Device'
}

let stageServer: Server | null = null
let sseClients: StageClient[] = []
let stageSlide: unknown = null
let stageBlank = false
let stageCountdown: unknown = null
let stagePort = 4040
let stagePingInterval: ReturnType<typeof setInterval> | null = null
const bonjour = new Bonjour()
let bonjourService: ReturnType<typeof bonjour.publish> | null = null

function getMdnsHostname(): string {
  try {
    if (process.platform === 'darwin') {
      return execSync('scutil --get LocalHostName', { encoding: 'utf8' }).trim() + '.local'
    }
  } catch { /* fall through */ }
  return hostname() + '.local'
}

function getLocalIP(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'localhost'
}



function broadcastAll(event: unknown) {
  const stamped = Object.assign({}, event as object, { sentAt: Date.now() })
  sseClients = sseClients.filter(c => c.send(stamped))
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function startStageServer(port = 4040): Promise<boolean> {
  return new Promise((resolve) => {
    if (stageServer) { resolve(true); return }
    stagePort = port
    const server = createServer((req, res) => {
      if (req.url === '/events') {
        const sock = req.socket
        sock.setNoDelay(true)
        sock.setKeepAlive(true, 1000)
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
        })
        // Use res.write() — the standard SSE path. res.write() owns the chunked
        // encoding, cork/uncork, and flush lifecycle correctly. Writing directly to
        // the socket while res is still open interferes with that and adds latency.
        const sseSend = (data: string): boolean => {
          if (!res.writable) return false
          try { res.write(data); return true } catch { return false }
        }
        const client: StageClient = {
          socket: sock,
          send: (event: unknown) => sseSend(`data: ${JSON.stringify(event)}\n\n`),
          ping: () => sseSend(': ping\n\n'),
          ip: (sock.remoteAddress ?? '').replace('::ffff:', ''),
          userAgent: req.headers['user-agent'] ?? '',
          connectedAt: Date.now(),
        }
        sseClients.push(client)
        // Stage display only needs slide/blank/countdown — no lineup
        client.send({ type: 'init', slide: stageSlide, blank: stageBlank, countdown: stageCountdown })
        req.on('close', () => { sseClients = sseClients.filter(c => c !== client) })
        sock.on('error', () => { sseClients = sseClients.filter(c => c !== client) })
      } else if (req.url === '/status') {
        const clientData = sseClients.map(c => ({
          ip: c.ip,
          device: parseDeviceLabel(c.userAgent),
          connectedFor: formatDuration(Date.now() - c.connectedAt),
        }))
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ clients: clientData }))
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(STAGE_DISPLAY_HTML)
      }
    })
    server.once('error', (err) => {
      console.error('[stage] failed to start:', err)
      stageServer = null
      resolve(false)
    })
    server.listen(port, () => {
      stageServer = server
      console.log(`[stage] listening on http://localhost:${port}`)
      try {
        bonjourService = bonjour.publish({ name: 'WorshipSync', type: 'http', port })
      } catch (e) {
        console.warn('[stage] mDNS publish failed:', e)
      }
      stagePingInterval = setInterval(() => {
        sseClients = sseClients.filter(c => c.ping())
      }, 250)
      resolve(true)
    })
  })
}

function stopStageServer() {
  if (stagePingInterval) { clearInterval(stagePingInterval); stagePingInterval = null }
  sseClients.forEach(c => {
    try { c.send({ type: 'shutdown' }) } catch { /* ignore */ }
    try { c.socket.destroy() } catch { /* ignore */ }
  })
  sseClients = []
  stageServer?.close()
  stageServer = null
  if (bonjourService) {
    try { bonjourService.stop() } catch { /* ignore */ }
    bonjourService = null
  }
}

const STAGE_DISPLAY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stage Display — WorshipSync</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#080810;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;height:100dvh;display:flex;flex-direction:column;overflow:hidden;user-select:none}

/* ── Top bar ── */
#top{display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);min-height:52px;flex-shrink:0}
#song-title{font-size:13px;font-weight:600;color:#c4c4cc;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#section-badge{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:rgba(139,92,246,.18);color:#a78bfa;border:1px solid rgba(139,92,246,.3);border-radius:5px;padding:3px 9px;white-space:nowrap;flex-shrink:0;display:none}
#clock{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;color:#fff;letter-spacing:-.01em;flex-shrink:0;min-width:80px;text-align:right}

/* ── Current slide (large, ~60% height) ── */
#current-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 40px 20px}
#lyrics{font-size:clamp(26px,5.5vw,72px);font-weight:700;line-height:1.35;text-align:center;color:#ffffff;letter-spacing:-.015em;max-width:960px;display:none}
#lyrics div{padding-bottom:.1em}
#empty{text-align:center;color:rgba(255,255,255,.18)}
#empty h2{font-size:18px;font-weight:600;margin-bottom:8px}
#empty p{font-size:13px;line-height:1.5}
#countdown-wrap{display:none;text-align:center}
#countdown{font-size:clamp(60px,15vw,140px);font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;font-family:'SF Mono','Fira Code','Fira Mono',monospace}
#countdown-label{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-top:10px}

/* ── Next slide (smaller, ~30% height) ── */
#next-wrap{flex-shrink:0;border-top:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);display:none;flex-direction:column}
#next-header{display:flex;align-items:center;gap:8px;padding:8px 20px 6px}
#next-label{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.3)}
#next-section{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(139,92,246,.7)}
#next-lyrics{padding:0 20px 14px;font-size:clamp(14px,2.2vw,28px);font-weight:500;line-height:1.45;text-align:center;color:rgba(255,255,255,.45);max-height:30vh;overflow:hidden}
#next-lyrics div{padding-bottom:.08em}

/* ── Bottom bar ── */
#bottom{display:flex;align-items:center;justify-content:space-between;padding:8px 20px;border-top:1px solid rgba(255,255,255,.06);min-height:38px;flex-shrink:0}
#slide-pos{font-size:11px;color:rgba(255,255,255,.25);font-variant-numeric:tabular-nums}
#lag{font-size:10px;color:rgba(255,255,255,.18);font-variant-numeric:tabular-nums}
#dot{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite}
#dot.off{background:#ef4444;animation:none}

/* ── Blank overlay ── */
#blank-overlay{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:20;display:flex;align-items:center;justify-content:center}
#blank-overlay.on{opacity:1}
#blank-text{font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.1)}

@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style>
</head>
<body>

<div id="top">
  <div id="song-title">WorshipSync Stage Display</div>
  <div id="section-badge"></div>
  <div id="clock"></div>
</div>

<div id="current-wrap">
  <div id="empty"><h2>Waiting for slides…</h2><p>The stage display will update<br>when the operator advances slides.</p></div>
  <div id="lyrics"></div>
  <div id="countdown-wrap">
    <div id="countdown">00:00</div>
    <div id="countdown-label">Until Service Starts</div>
  </div>
</div>

<div id="next-wrap">
  <div id="next-header">
    <span id="next-label">Next</span>
    <span id="next-section"></span>
  </div>
  <div id="next-lyrics"></div>
</div>

<div id="bottom">
  <div id="slide-pos"></div>
  <div id="lag"></div>
  <div id="dot" class="off"></div>
</div>

<div id="blank-overlay"><div id="blank-text">Screen Blank</div></div>

<script>
var cdTimer=null,reconnTimer=null,clockTimer=null;
function $(id){return document.getElementById(id)}

// ── Clock ──
function tickClock(){
  var now=new Date();
  var h=now.getHours(),m=now.getMinutes();
  var ampm=h>=12?'PM':'AM';
  h=h%12||12;
  $('clock').textContent=h+':'+(m<10?'0':'')+m+' '+ampm;
}
tickClock();
setInterval(tickClock,5000);

// ── SSE ──
var es=null;
function connect(){
  if(es){try{es.onerror=null;es.close();}catch(e){}}
  clearTimeout(reconnTimer);
  es=new EventSource('/events');
  es.onopen=function(){$('dot').classList.remove('off');};
  es.onmessage=function(e){handle(JSON.parse(e.data))};
  es.onerror=function(){$('dot').classList.add('off');es.onerror=null;es.close();reconnTimer=setTimeout(connect,1000)};
}
// Reconnect immediately when the page becomes visible (e.g. after screen wake or app foreground)
document.addEventListener('visibilitychange',function(){
  if(!document.hidden&&(!es||es.readyState===2)){clearTimeout(reconnTimer);connect();}
});

function handle(ev){
  if(ev.sentAt){var lag=Date.now()-ev.sentAt;$('lag').textContent=lag+'ms';}
  if(ev.type==='init'){if(ev.slide)showSlide(ev.slide);if(ev.blank)setBlank(ev.blank);if(ev.countdown)doCountdown(ev.countdown)}
  else if(ev.type==='slide'){clearCD();showSlide(ev.payload);setBlank(false)}
  else if(ev.type==='blank'){setBlank(ev.isBlank)}
  else if(ev.type==='countdown'){doCountdown(ev.data)}
  else if(ev.type==='shutdown'){
    clearTimeout(reconnTimer);
    if(es){es.onerror=null;es.close();}
    $('dot').classList.add('off');
    $('song-title').textContent='Stage display stopped';
    $('section-badge').style.display='none';
    $('lyrics').style.display='none';
    $('next-wrap').style.display='none';
    $('empty').style.display='block';
    $('empty').querySelector('h2').textContent='Stage display is off';
    $('empty').querySelector('p').textContent='The operator has stopped the stage display.';
  }
}

function showSlide(p){
  var lines=p.lines||[];
  $('empty').style.display='none';
  $('countdown-wrap').style.display='none';

  if(!lines.length){
    $('lyrics').style.display='none';
    $('empty').style.display='block';
  } else {
    $('lyrics').style.display='block';
    $('lyrics').innerHTML=lines.map(function(l){return'<div>'+(l?esc(l):'&nbsp;')+'</div>'}).join('');
  }

  // Song info
  $('song-title').textContent=(p.songTitle||'')+(p.artist?'  \u2014  '+p.artist:'');
  var sec=p.sectionLabel||'';
  $('section-badge').textContent=sec;
  $('section-badge').style.display=sec?'inline-block':'none';

  // Slide counter
  $('slide-pos').textContent=(p.slideIndex!=null&&p.totalSlides!=null)?(p.slideIndex+1)+' / '+p.totalSlides:'';

  // Next slide
  var nextLines=p.nextLines||[];
  if(nextLines.length){
    $('next-wrap').style.display='flex';
    $('next-section').textContent=p.nextSectionLabel||'';
    $('next-lyrics').innerHTML=nextLines.map(function(l){return'<div>'+(l?esc(l):'&nbsp;')+'</div>'}).join('');
  } else {
    $('next-wrap').style.display='none';
  }
}

function setBlank(b){$('blank-overlay').classList.toggle('on',!!b)}

function doCountdown(d){
  clearCD();
  $('empty').style.display='none';
  $('lyrics').style.display='none';
  $('next-wrap').style.display='none';
  $('countdown-wrap').style.display='block';
  $('song-title').textContent='Service Starting';
  $('section-badge').style.display='none';
  if(!d.running){$('countdown').textContent='00:00';return}
  var target=new Date(d.targetTime).getTime();
  function tick(){
    var diff=target-Date.now();
    if(diff<=0){$('countdown').textContent='Starting!';return}
    var m=Math.floor(diff/60000),s=Math.floor((diff%60000)/1000);
    $('countdown').textContent=pad(m)+':'+pad(s);
    cdTimer=setTimeout(tick,500);
  }
  tick();
}

function clearCD(){clearTimeout(cdTimer);cdTimer=null;$('countdown-wrap').style.display='none'}
function pad(n){return String(n).padStart(2,'0')}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

connect();
</script>
</body>
</html>`

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'WorshipSync',
    backgroundColor: '#0c0c10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // ← allows file:// image loading
    },
    show: false
  })

  controlWindow.on('ready-to-show', () => {
    controlWindow?.show()
    controlWindow?.maximize()
  })

  controlWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    controlWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    controlWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createProjectionWindow(displayId?: number): void {
  const displays = screen.getAllDisplays()
  const target = displayId
    ? displays.find(d => d.id === displayId)
    : displays.find(d => d.id !== screen.getPrimaryDisplay().id)
  const targetDisplay = target ?? screen.getPrimaryDisplay()
  const { x, y, width, height } = targetDisplay.bounds

  projectionWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: 'WorshipSync — Projection',
    backgroundColor: '#000000',
    fullscreen: !!target,
    frame: !target,
    alwaysOnTop: !!target,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // ← allows file:// image loading
    },
    show: false
  })

  // Prevent display sleep while projecting
  if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  }

  projectionWindow.on('ready-to-show', () => {
    projectionWindow?.show()
  })

  projectionWindow.on('closed', () => {
    projectionWindow = null
    if (movingProjection) {
      // Intentional display switch — don't notify the renderer
      movingProjection = false
      return
    }
    // Real close — stop display-sleep prevention and notify renderer
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId)
      powerSaveBlockerId = null
    }
    controlWindow?.webContents.send('window:projectionClosed')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const projUrl = `${process.env['ELECTRON_RENDERER_URL']}/projection.html`
    console.log('[projection] loading URL:', projUrl)
    projectionWindow.loadURL(projUrl)
  } else {
    const projPath = join(__dirname, '../renderer/projection.html')
    console.log('[projection] loading file:', projPath)
    projectionWindow.loadFile(projPath)
  }

  projectionWindow.webContents.on('did-finish-load', () => {
    console.log('[projection] window loaded successfully')
  })

  projectionWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[projection] failed to load:', code, desc)
  })
}

function createConfidenceWindow(displayId?: number): void {
  confidenceLastDisplayId = displayId
  confidenceWasOpen = false

  const displays = screen.getAllDisplays()
  const target = displayId
    ? displays.find(d => d.id === displayId)
    : displays.find(d => d.id !== screen.getPrimaryDisplay().id)
  const targetDisplay = target ?? screen.getPrimaryDisplay()
  const { x, y, width, height } = targetDisplay.bounds

  confidenceWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: 'WorshipSync — Confidence Monitor',
    backgroundColor: '#080810',
    fullscreen: !!target,
    frame: !target,
    alwaysOnTop: !!target,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    show: false,
  })

  confidenceWindow.on('ready-to-show', () => {
    confidenceWindow?.show()
  })

  confidenceWindow.on('closed', () => {
    confidenceWindow = null
    controlWindow?.webContents.send('window:confidenceClosed')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    confidenceWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/confidence.html`)
  } else {
    confidenceWindow.loadFile(join(__dirname, '../renderer/confidence.html'))
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.on('slide:show', (_event, payload) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:show', payload)
  }
  if (confidenceWindow && !confidenceWindow.isDestroyed()) {
    confidenceWindow.webContents.send('slide:show', payload)
  }
  stageSlide = payload
  stageBlank = false
  broadcastAll({ type: 'slide', payload })
})

ipcMain.on('slide:blank', (_event, isBlank: boolean) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:blank', isBlank)
  }
  if (confidenceWindow && !confidenceWindow.isDestroyed()) {
    confidenceWindow.webContents.send('slide:blank', isBlank)
  }
  stageBlank = isBlank
  // blank=true → broadcast immediately.
  // blank=false → the subsequent slide:show already implies unblank on the client;
  // no separate broadcast needed (avoids a double repaint on slow devices).
  if (isBlank) broadcastAll({ type: 'blank', isBlank: true })
})

ipcMain.on('slide:logo', (_event, show: boolean) => {
  projectionWindow?.webContents.send('slide:logo', show)
})

ipcMain.on('slide:countdown', (_event, data: { targetTime: string; running: boolean }) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:countdown', data)
  }
  if (confidenceWindow && !confidenceWindow.isDestroyed()) {
    confidenceWindow.webContents.send('slide:countdown', data)
  }
  stageCountdown = data
  broadcastAll({ type: 'countdown', data })
})

ipcMain.on('slide:videoControl', (_event, action: 'play' | 'pause' | 'stop') => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:videoControl', action)
  }
})

ipcMain.on('slide:videoSeek', (_event, time: number) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:videoSeek', time)
  }
})

// ── Confidence monitor IPC handlers ──────────────────────────────────────────

ipcMain.on('window:openConfidence', (_event, displayId?: number) => {
  if (!confidenceWindow || confidenceWindow.isDestroyed()) {
    createConfidenceWindow(displayId)
  } else {
    confidenceWindow.focus()
  }
})

ipcMain.on('window:moveConfidence', (_event, displayId: number) => {
  if (confidenceWindow && !confidenceWindow.isDestroyed()) {
    confidenceWindow.once('closed', () => createConfidenceWindow(displayId))
    confidenceWindow.close()
  } else {
    createConfidenceWindow(displayId)
  }
})

ipcMain.on('window:closeConfidence', () => {
  confidenceWindow?.close()
  confidenceWindow = null
})

ipcMain.handle('window:getConfidenceOpen', () => {
  return !!(confidenceWindow && !confidenceWindow.isDestroyed())
})

// Restore last known state when confidence window (re)loads
ipcMain.on('confidence:ready', () => {
  if (!confidenceWindow || confidenceWindow.isDestroyed()) return
  if (stageBlank) {
    confidenceWindow.webContents.send('slide:blank', true)
  } else if (stageCountdown && (stageCountdown as { running?: boolean }).running) {
    confidenceWindow.webContents.send('slide:countdown', stageCountdown)
  } else if (stageSlide) {
    confidenceWindow.webContents.send('slide:show', stageSlide)
  }
})

ipcMain.on('projection:ready', () => {
  controlWindow?.webContents.send('projection:ready')
})

ipcMain.handle('window:getDisplayCount', () => {
  return screen.getAllDisplays().length
})


ipcMain.handle('window:getDisplays', () => {
  const primary = screen.getPrimaryDisplay()
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    width: d.size.width,
    height: d.size.height,
    isPrimary: d.id === primary.id,
  }))
})

ipcMain.on('window:openProjection', (_event, displayId?: number) => {
  if (!projectionWindow || projectionWindow.isDestroyed()) {
    createProjectionWindow(displayId)
  } else {
    projectionWindow.focus()
  }
})

ipcMain.on('window:moveProjection', (_event, displayId: number) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    movingProjection = true
    projectionWindow.once('closed', () => createProjectionWindow(displayId))
    projectionWindow.close()
  } else {
    createProjectionWindow(displayId)
  }
})

ipcMain.on('window:closeProjection', () => {
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null
  }
  projectionWindow?.close()
  projectionWindow = null
})

// ── Song IPC handlers ─────────────────────────────────────────────────────────

ipcMain.handle('songs:getAll', () => {
  return db.select().from(songs).orderBy(songs.title).all()
})

ipcMain.handle('songs:search', (_e, query: string) => {
  const q = `%${query}%`
  return db.select().from(songs).where(
    or(like(songs.title, q), like(songs.artist, q))
  ).orderBy(songs.title).all()
})

ipcMain.handle('songs:getById', (_e, id: number) => {
  const song = db.select().from(songs).where(eq(songs.id, id)).get()
  if (!song) return null
  const songSections = db.select().from(sections)
    .where(eq(sections.songId, id))
    .orderBy(sections.orderIndex)
    .all()
  return { ...song, sections: songSections }
})

ipcMain.handle('songs:create', (_e, data: {
  title: string
  artist: string
  key?: string
  tempo?: 'slow' | 'medium' | 'fast'
  ccliNumber?: string
  tags: string
  sections: { type: string; label: string; lyrics: string; orderIndex: number }[]
}) => {
  const { sections: sectionData, ...songData } = data
  const [song] = db.insert(songs).values(songData).returning().all()
  if (sectionData.length > 0) {
    db.insert(sections).values(
      sectionData.map(s => ({ ...s, songId: song.id }))
    ).run()
  }
  return song
})

ipcMain.handle('songs:update', (_e, id: number, data: Partial<typeof songs.$inferInsert>) => {
  db.update(songs).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(songs.id, id)).run()
  return db.select().from(songs).where(eq(songs.id, id)).get()
})

ipcMain.handle('songs:delete', (_e, id: number) => {
  db.delete(songs).where(eq(songs.id, id)).run()
  return true
})

ipcMain.handle('sections:upsert', (_e, songId: number, sectionData: {
  id?: number
  type: string
  label: string
  lyrics: string
  orderIndex: number
}[]) => {
  db.delete(sections).where(eq(sections.songId, songId)).run()
  if (sectionData.length > 0) {
    db.insert(sections).values(
      sectionData.map(s => ({ ...s, songId }))
    ).run()
  }
  return db.select().from(sections).where(eq(sections.songId, songId)).orderBy(sections.orderIndex).all()
})// ── Service date IPC handlers ─────────────────────────────────────────────────

ipcMain.handle('services:getAll', () => {
  return db.select().from(serviceDates)
    .orderBy(asc(serviceDates.date))
    .all()
})

ipcMain.handle('services:getByDate', (_e, date: string) => {
  return db.select().from(serviceDates)
    .where(eq(serviceDates.date, date))
    .get() ?? null
})

ipcMain.handle('services:create', (_e, data: {
  date: string
  label: string
  status: 'empty' | 'in-progress' | 'ready'
  notes?: string
}) => {
  const [created] = db.insert(serviceDates).values(data).returning().all()
  return created
})

ipcMain.handle('services:updateStatus', (_e, id: number, status: 'empty' | 'in-progress' | 'ready') => {
  db.update(serviceDates)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(serviceDates.id, id))
    .run()
  return db.select().from(serviceDates).where(eq(serviceDates.id, id)).get()
})

ipcMain.handle('services:update', (_e, id: number, data: { label?: string; date?: string }) => {
  db.update(serviceDates)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(serviceDates.id, id))
    .run()
  return db.select().from(serviceDates).where(eq(serviceDates.id, id)).get()
})

ipcMain.handle('services:delete', (_e, id: number) => {
  db.delete(serviceDates).where(eq(serviceDates.id, id)).run()
  return true
})

ipcMain.handle('services:getAllWithCounts', () => {
  const all = db.select().from(serviceDates).orderBy(desc(serviceDates.date)).all()
  return all.map(service => {
    const songRow = db.select({ count: count() })
      .from(lineupItems)
      .leftJoin(songs, eq(lineupItems.songId, songs.id))
      .where(and(
        eq(lineupItems.serviceDateId, service.id),
        eq(lineupItems.itemType, 'song'),
        ne(songs.artist, 'Scripture'),
        ne(songs.artist, 'Media'),
      )).get()
    const totalRow = db.select({ count: count() }).from(lineupItems)
      .where(eq(lineupItems.serviceDateId, service.id)).get()
    return { ...service, songCount: songRow?.count ?? 0, itemCount: totalRow?.count ?? 0 }
  })
})

ipcMain.handle('services:getRecent', () => {
  const today = new Date().toISOString().split('T')[0]
  return db.select().from(serviceDates)
    .where(gte(serviceDates.date, today))
    .orderBy(asc(serviceDates.date))
    .limit(5)
    .all()
})

ipcMain.handle('services:search', (_e, q: string) => {
  const term = `%${q}%`
  return db.select().from(serviceDates)
    .where(or(like(serviceDates.label, term), like(serviceDates.date, term)))
    .orderBy(desc(serviceDates.date))
    .limit(10)
    .all()
})

// ── Lineup IPC handlers ───────────────────────────────────────────────────────

ipcMain.handle('lineup:getForService', (_e, serviceDateId: number) => {
  const items = db.select().from(lineupItems)
    .where(eq(lineupItems.serviceDateId, serviceDateId))
    .orderBy(asc(lineupItems.orderIndex))
    .all()

  // Join with song + sections data (skip for countdown items)
  return items.map(item => {
    // Ensure itemType is set (might be missing for rows created before migration)
    const itemType = item.itemType || 'song'

    if (itemType === 'countdown' || !item.songId) {
      return { ...item, itemType: 'countdown', song: null }
    }
    const song = db.select().from(songs)
      .where(eq(songs.id, item.songId))
      .get()
    if (!song) {
      return { ...item, itemType, song: null }
    }
    const songSections = db.select().from(sections)
      .where(eq(sections.songId, item.songId))
      .orderBy(asc(sections.orderIndex))
      .all()
    return { ...item, itemType, song: { ...song, sections: songSections } }
  })
})

ipcMain.handle('lineup:addSong', (_e, serviceDateId: number, songId: number) => {
  // Get current max order index
  const existing = db.select().from(lineupItems)
    .where(eq(lineupItems.serviceDateId, serviceDateId))
    .all()
  const orderIndex = existing.length

  // Default selected sections = all section ids for this song
  const songSections = db.select().from(sections)
    .where(eq(sections.songId, songId))
    .orderBy(asc(sections.orderIndex))
    .all()
  const selectedSections = JSON.stringify(songSections.map(s => s.id))

  const [item] = db.insert(lineupItems).values({
    serviceDateId,
    songId,
    orderIndex,
    selectedSections
  }).returning().all()

  return item
})

ipcMain.handle('lineup:addCountdown', (_e, serviceDateId: number) => {
  const existing = db.select().from(lineupItems)
    .where(eq(lineupItems.serviceDateId, serviceDateId))
    .all()
  const orderIndex = existing.length

  const [item] = db.insert(lineupItems).values({
    serviceDateId,
    orderIndex,
    itemType: 'countdown',
    selectedSections: '[]',
  }).returning().all()

  return item
})

ipcMain.handle('lineup:removeSong', (_e, lineupItemId: number) => {
  db.delete(lineupItems).where(eq(lineupItems.id, lineupItemId)).run()
  return true
})

ipcMain.handle('lineup:reorder', (_e, serviceDateId: number, orderedIds: number[]) => {
  for (let i = 0; i < orderedIds.length; i++) {
    db.update(lineupItems)
      .set({ orderIndex: i })
      .where(eq(lineupItems.id, orderedIds[i]))
      .run()
  }
  return true
})

ipcMain.handle('lineup:toggleSection', (_e, lineupItemId: number, sectionId: number, included: boolean) => {
  const item = db.select().from(lineupItems)
    .where(eq(lineupItems.id, lineupItemId))
    .get()
  if (!item) return null

  const current: number[] = JSON.parse(item.selectedSections || '[]')
  const updated = included
    ? [...new Set([...current, sectionId])]
    : current.filter(id => id !== sectionId)

  db.update(lineupItems)
    .set({ selectedSections: JSON.stringify(updated) })
    .where(eq(lineupItems.id, lineupItemId))
    .run()

  return updated
})

ipcMain.handle('lineup:setSections', (_e, lineupItemId: number, sectionIds: number[]) => {
  db.update(lineupItems)
    .set({ selectedSections: JSON.stringify(sectionIds) })
    .where(eq(lineupItems.id, lineupItemId))
    .run()
  return sectionIds
})

ipcMain.handle('lineup:setNotes', (_e, lineupItemId: number, notes: string) => {
  db.update(lineupItems)
    .set({ notes: notes || null })
    .where(eq(lineupItems.id, lineupItemId))
    .run()
  return true
})

// ── Theme IPC handlers ────────────────────────────────────────────────────────

ipcMain.handle('themes:getAll', () => {
  return db.select().from(themes).orderBy(asc(themes.name)).all()
})

ipcMain.handle('themes:getDefault', () => {
  return db.select().from(themes).where(eq(themes.isDefault, true)).get() ?? null
})

ipcMain.handle('themes:create', (_e, data: {
  name: string
  type: 'global' | 'seasonal' | 'per-song'
  isDefault: boolean
  seasonStart?: string
  seasonEnd?: string
  settings: string
}) => {
  const [created] = db.insert(themes).values(data).returning().all()
  return created
})

ipcMain.handle('themes:update', (_e, id: number, data: {
  name?: string
  settings?: string
  isDefault?: boolean
  seasonStart?: string
  seasonEnd?: string
}) => {
  db.update(themes).set(data).where(eq(themes.id, id)).run()
  return db.select().from(themes).where(eq(themes.id, id)).get()
})

ipcMain.handle('themes:delete', (_e, id: number) => {
  db.delete(themes).where(eq(themes.id, id)).run()
  return true
})

// ── Analytics IPC handlers ────────────────────────────────────────────────────

ipcMain.handle('analytics:getSongUsage', () => {
  const allSongs = db.select().from(songs)
    .where(and(ne(songs.artist, 'Scripture'), ne(songs.artist, 'Media')))
    .orderBy(asc(songs.title)).all()

  // Derive usage from lineup_items — always accurate, updates on add/remove
  const lineupRows = db.select({
    songId: lineupItems.songId,
    serviceDateId: lineupItems.serviceDateId,
  }).from(lineupItems).where(eq(lineupItems.itemType, 'song')).all()

  const serviceDateMap = new Map(
    db.select({ id: serviceDates.id, date: serviceDates.date, label: serviceDates.label })
      .from(serviceDates).all().map(s => [s.id, s])
  )

  // Group lineup rows by songId
  const usagesBySong = new Map<number, { date: string; label: string }[]>()
  for (const row of lineupRows) {
    if (row.songId == null) continue
    const svc = serviceDateMap.get(row.serviceDateId)
    if (!svc) continue
    const arr = usagesBySong.get(row.songId) ?? []
    arr.push(svc)
    usagesBySong.set(row.songId, arr)
  }

  return allSongs.map(song => {
    const usages = usagesBySong.get(song.id) ?? []
    const lastService = usages.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
    return {
      ...song,
      usageCount: usages.length,
      lastUsedDate: lastService?.date ?? null,
      lastUsedLabel: lastService?.label ?? null,
    }
  })
})

ipcMain.handle('analytics:getServiceHistory', () => {
  return db.select().from(serviceDates)
    .orderBy(desc(serviceDates.date))
    .all()
})

ipcMain.handle('analytics:recordUsage', (_e, songId: number, serviceDateId: number) => {
  // Avoid duplicate entries
  const existing = db.select().from(songUsage)
    .where(eq(songUsage.songId, songId))
    .all()
    .find(u => u.serviceDateId === serviceDateId)

  if (existing) return existing

  const [created] = db.insert(songUsage).values({
    songId,
    serviceDateId,
    usedAt: new Date().toISOString()
  }).returning().all()
  return created
})

// ── Background / file IPC handlers ───────────────────────────────────────────

const mediaDir = (ext: string) => {
  const sub =
    /\.(mp4|webm|mov)$/i.test(ext) ? 'Videos' :
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(ext) ? 'Audio Tracks' :
    'Pictures'
  const dir = join(app.getPath('userData'), sub)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

ipcMain.handle('backgrounds:getDir', () => {
  const dir = join(app.getPath('userData'), 'Pictures')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
})

ipcMain.handle('backgrounds:pickImage', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose media file',
    filters: [
      { name: 'All Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
      { name: 'Videos', extensions: ['mp4', 'webm', 'mov'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
    ],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const srcPath = result.filePaths[0]
  const ext = extname(srcPath).toLowerCase()
  const dir = mediaDir(ext)
  const base = basename(srcPath, extname(srcPath))
  // Use original filename; append _2, _3, … if it already exists
  let filename = `${base}${ext}`
  let destPath = join(dir, filename)
  let counter = 2
  while (existsSync(destPath)) {
    filename = `${base}_${counter}${ext}`
    destPath = join(dir, filename)
    counter++
  }
  try {
    copyFileSync(srcPath, destPath)
  } catch (e) {
    console.error('[backgrounds] copy failed:', e)
    return null
  }

  return destPath
})

ipcMain.handle('backgrounds:listImages', () => {
  const subdirs = ['Pictures', 'Videos', 'Audio Tracks']
  const files: string[] = []
  for (const sub of subdirs) {
    const dir = join(app.getPath('userData'), sub)
    if (!existsSync(dir)) continue
    readdirSync(dir)
      .filter(f => /\.(jpg|jpeg|png|webp|mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i.test(f))
      .forEach(f => files.push(join(dir, f)))
  }
  return files
})

ipcMain.handle('songs:setBackground', (_e, songId: number, backgroundPath: string | null) => {
  db.update(songs)
    .set({ backgroundPath, updatedAt: new Date().toISOString() })
    .where(eq(songs.id, songId))
    .run()
  return db.select().from(songs).where(eq(songs.id, songId)).get()
})

ipcMain.handle('backgrounds:getUsageCount', (_e, imagePath: string) => {
  const result = db.select({ count: count() })
    .from(songs)
    .where(eq(songs.backgroundPath, imagePath))
    .get()
  return result?.count ?? 0
})

ipcMain.handle('backgrounds:getUsingSongs', (_e, imagePath: string) => {
  return db.select({ id: songs.id, title: songs.title, artist: songs.artist })
    .from(songs)
    .where(eq(songs.backgroundPath, imagePath))
    .all()
})

ipcMain.handle('backgrounds:getUsingServices', (_e, imagePath: string) => {
  const rows = db.select({
    id: serviceDates.id,
    date: serviceDates.date,
    label: serviceDates.label,
  })
    .from(lineupItems)
    .leftJoin(songs, eq(lineupItems.songId, songs.id))
    .innerJoin(serviceDates, eq(lineupItems.serviceDateId, serviceDates.id))
    .where(or(
      eq(lineupItems.overrideBackgroundPath, imagePath),
      eq(songs.backgroundPath, imagePath),
    ))
    .all()

  const seen = new Set<number>()
  return rows
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
    .sort((a, b) => b.date.localeCompare(a.date))
})

ipcMain.handle('backgrounds:deleteImage', (_e, imagePath: string) => {
  try {
    // Clear from any songs using it
    db.update(songs)
      .set({ backgroundPath: null })
      .where(eq(songs.backgroundPath, imagePath))
      .run()

    // Also clear from any themes using it
    const allThemes = db.select().from(themes).all()
    for (const theme of allThemes) {
      try {
        const settings = JSON.parse(theme.settings)
        if (settings.backgroundPath === imagePath) {
          settings.backgroundPath = null
          db.update(themes)
            .set({ settings: JSON.stringify(settings) })
            .where(eq(themes.id, theme.id))
            .run()
        }
      } catch {}
    }

    // Delete the file
    unlinkSync(imagePath)
    return true
  } catch (e) {
    console.error('[backgrounds] delete failed:', e)
    return false
  }
})

// ── App state persistence ─────────────────────────────────────────────────────

const appStatePath = () => join(app.getPath('userData'), 'app-state.json')

function readAppState(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(appStatePath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeAppState(data: Record<string, any>): void {
  try {
    const current = readAppState()
    writeFileSync(appStatePath(), JSON.stringify({ ...current, ...data }), 'utf-8')
  } catch {}
}

ipcMain.handle('app:getState', () => readAppState())

ipcMain.handle('app:setState', (_e, data: Record<string, any>) => {
  writeAppState(data)
  return true
})

ipcMain.handle('app:getTodayService', () => {
  const today = new Date().toISOString().split('T')[0]
  const todayService = db.select().from(serviceDates)
    .where(eq(serviceDates.date, today))
    .get()
  if (todayService) return { service: todayService, daysAway: 0 }

  // Find next upcoming service within 7 days
  const upcoming = db.select().from(serviceDates)
    .orderBy(asc(serviceDates.date))
    .all()
    .find(s => s.date > today)

  if (!upcoming) return null

  const daysAway = Math.round(
    (new Date(upcoming.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime())
    / (1000 * 60 * 60 * 24)
  )

  if (daysAway > 7) return null
  return { service: upcoming, daysAway }
})

// ── Stage display IPC ─────────────────────────────────────────────────────────

ipcMain.handle('stageDisplay:start', async (_e, port: number = 4040) => {
  const ok = await startStageServer(port)
  if (ok) writeAppState({ stageDisplayEnabled: true, stageDisplayPort: port })
  return { ok, url: `http://${getLocalIP()}:${stagePort}`, port: stagePort }
})

ipcMain.handle('stageDisplay:stop', () => {
  stopStageServer()
  writeAppState({ stageDisplayEnabled: false })
  return true
})

ipcMain.handle('stageDisplay:getStatus', () => {
  const now = Date.now()
  return {
    running: !!stageServer,
    url: `http://${getLocalIP()}:${stagePort}`,
    mdnsUrl: `http://${getMdnsHostname()}:${stagePort}`,
    port: stagePort,
    clients: sseClients.length,
    localIP: getLocalIP(),
    clientList: sseClients.map(c => ({
      ip: c.ip,
      device: parseDeviceLabel(c.userAgent),
      connectedAt: c.connectedAt,
      connectedForSeconds: Math.floor((now - c.connectedAt) / 1000),
    })),
  }
})

// ── Data export / import ──────────────────────────────────────────────────────

ipcMain.handle('data:export', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Export WorshipSync Data',
    defaultPath: `worshipsync-backup-${new Date().toISOString().split('T')[0]}.worshipsync`,
    filters: [{ name: 'WorshipSync Backup', extensions: ['worshipsync'] }]
  })
  if (result.canceled || !result.filePath) return { success: false, canceled: true }

  // Read all media files as base64 (store subdir prefix so import can restore to correct folder)
  const backgrounds: { filename: string; sub: string; data: string }[] = []
  for (const sub of ['Pictures', 'Videos', 'Audio Tracks']) {
    const bgDir = join(app.getPath('userData'), sub)
    if (!existsSync(bgDir)) continue
    for (const f of readdirSync(bgDir).filter(f => /\.(jpg|jpeg|png|webp|mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i.test(f))) {
      backgrounds.push({ filename: f, sub, data: readFileSync(join(bgDir, f)).toString('base64') })
    }
  }

  // Convert absolute bg paths to portable filenames
  const portablePath = (p: string | null | undefined): string | null => {
    if (!p || p.startsWith('color:')) return p ?? null
    return basename(p)
  }

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    songs: db.select().from(songs).all().map(s => ({
      ...s, backgroundPath: portablePath(s.backgroundPath)
    })),
    sections: db.select().from(sections).all(),
    serviceDates: db.select().from(serviceDates).all(),
    lineupItems: db.select().from(lineupItems).all().map(item => ({
      ...item, overrideBackgroundPath: portablePath(item.overrideBackgroundPath)
    })),
    themes: db.select().from(themes).all().map(t => {
      try {
        const s = JSON.parse(t.settings)
        if (s.backgroundPath) s.backgroundPath = portablePath(s.backgroundPath)
        return { ...t, settings: JSON.stringify(s) }
      } catch { return t }
    }),
    songUsage: db.select().from(songUsage).all(),
    backgrounds
  }

  writeFileSync(result.filePath, JSON.stringify(exportData), 'utf-8')
  return { success: true, path: result.filePath }
})

ipcMain.handle('data:import', async () => {
  const openResult = await dialog.showOpenDialog({
    title: 'Import WorshipSync Data',
    filters: [{ name: 'WorshipSync Backup', extensions: ['worshipsync'] }],
    properties: ['openFile']
  })
  if (openResult.canceled || !openResult.filePaths[0]) return { success: false, canceled: true }

  const confirmed = await dialog.showMessageBox({
    type: 'warning',
    title: 'Import data',
    message: 'This will replace ALL current data — songs, services, themes, and backgrounds. This cannot be undone.',
    buttons: ['Cancel', 'Replace all data'],
    defaultId: 0,
    cancelId: 0
  })
  if (confirmed.response === 0) return { success: false, canceled: true }

  let data: any
  try {
    data = JSON.parse(readFileSync(openResult.filePaths[0], 'utf-8'))
    if (!data.version) throw new Error('invalid')
  } catch {
    return { success: false, error: 'Invalid or corrupt backup file.' }
  }

  // Write media files back into their typed subdirectories
  const pathMap: Record<string, string> = {}
  for (const bg of (data.backgrounds ?? [])) {
    const sub = bg.sub ?? 'Pictures'
    const bgDir = join(app.getPath('userData'), sub)
    if (!existsSync(bgDir)) mkdirSync(bgDir, { recursive: true })
    const dest = join(bgDir, bg.filename)
    writeFileSync(dest, Buffer.from(bg.data, 'base64'))
    pathMap[bg.filename] = dest
    pathMap[`${sub}/${bg.filename}`] = dest
  }

  const restorePath = (p: string | null | undefined): string | null => {
    if (!p || p.startsWith('color:')) return p ?? null
    return pathMap[p] ?? pathMap[basename(p)] ?? null
  }

  // Clear in FK-safe order
  db.delete(songUsage).run()
  db.delete(lineupItems).run()
  db.delete(sections).run()
  db.delete(songs).run()
  db.delete(serviceDates).run()
  db.delete(themes).run()

  // Restore — preserve original IDs so foreign keys stay consistent
  for (const row of (data.songs ?? [])) {
    db.insert(songs).values({ ...row, backgroundPath: restorePath(row.backgroundPath) }).run()
  }
  for (const row of (data.sections ?? [])) {
    db.insert(sections).values(row).run()
  }
  for (const row of (data.serviceDates ?? [])) {
    db.insert(serviceDates).values(row).run()
  }
  for (const row of (data.lineupItems ?? [])) {
    db.insert(lineupItems).values({ ...row, overrideBackgroundPath: restorePath(row.overrideBackgroundPath) }).run()
  }
  for (const row of (data.themes ?? [])) {
    try {
      const s = JSON.parse(row.settings)
      if (s.backgroundPath) s.backgroundPath = restorePath(s.backgroundPath)
      db.insert(themes).values({ ...row, settings: JSON.stringify(s) }).run()
    } catch {
      db.insert(themes).values(row).run()
    }
  }
  for (const row of (data.songUsage ?? [])) {
    db.insert(songUsage).values(row).run()
  }

  return { success: true }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Database first — before any windows open
  runMigrations()
  seedIfEmpty()
  electronApp.setAppUserModelId('com.worshipsync')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createControlWindow()

  // Auto-start stage display if previously enabled
  const savedState = readAppState()
  if (savedState.stageDisplayEnabled) {
    startStageServer(savedState.stageDisplayPort ?? 4040).catch(() => {})
  }

  // Notify renderer when displays are added or removed
  const notifyDisplaysChanged = () => {
    const primary = screen.getPrimaryDisplay()
    const displays = screen.getAllDisplays().map(d => ({
      id: d.id,
      label: d.label || `Display ${d.id}`,
      width: d.size.width,
      height: d.size.height,
      isPrimary: d.id === primary.id,
    }))
    controlWindow?.webContents.send('window:displaysChanged', displays)
  }

  screen.on('display-removed', () => {
    // Snapshot whether confidence was open before Electron closes the window
    confidenceWasOpen = !!(confidenceWindow && !confidenceWindow.isDestroyed())
    notifyDisplaysChanged()
  })

  screen.on('display-added', () => {
    notifyDisplaysChanged()
    // Auto-reopen confidence window on the reconnected display
    if (confidenceWasOpen && (!confidenceWindow || confidenceWindow.isDestroyed())) {
      confidenceWasOpen = false
      setTimeout(() => createConfidenceWindow(confidenceLastDisplayId), 800)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopStageServer()
  try { bonjour.destroy() } catch { /* ignore */ }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
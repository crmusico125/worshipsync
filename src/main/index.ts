import { app, BrowserWindow, ipcMain, shell, screen, dialog } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join, extname, basename } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { db } from './db/index'
import { songs, sections, serviceDates, lineupItems, themes, songUsage } from './db/schema'
import { asc, desc, eq, like, or, count } from 'drizzle-orm'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'

let controlWindow: BrowserWindow | null = null
let projectionWindow: BrowserWindow | null = null

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

  projectionWindow.on('ready-to-show', () => {
    projectionWindow?.show()
  })

  projectionWindow.on('closed', () => {
    projectionWindow = null
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

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.on('slide:show', (_event, payload) => {
  console.log('[ipc] slide:show received, projectionWindow exists:', !!projectionWindow, 'destroyed:', projectionWindow?.isDestroyed(), 'webContents loading:', projectionWindow?.webContents?.isLoading())
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:show', payload)
    console.log('[ipc] slide:show forwarded to projection window')
  } else {
    console.warn('[ipc] slide:show NOT forwarded - no projection window')
  }
})

ipcMain.on('slide:blank', (_event, isBlank: boolean) => {
  console.log('[ipc] slide:blank received:', isBlank, 'projectionWindow exists:', !!projectionWindow)
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:blank', isBlank)
  }
})

ipcMain.on('slide:logo', (_event, show: boolean) => {
  projectionWindow?.webContents.send('slide:logo', show)
})

ipcMain.on('slide:countdown', (_event, data: { targetTime: string; running: boolean }) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send('slide:countdown', data)
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

ipcMain.on('window:closeProjection', () => {
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

ipcMain.handle('services:delete', (_e, id: number) => {
  db.delete(serviceDates).where(eq(serviceDates.id, id)).run()
  return true
})

ipcMain.handle('services:getAllWithCounts', () => {
  const all = db.select().from(serviceDates).orderBy(desc(serviceDates.date)).all()
  return all.map(service => {
    const row = db.select({ count: count() }).from(lineupItems)
      .where(eq(lineupItems.serviceDateId, service.id)).get()
    return { ...service, itemCount: row?.count ?? 0 }
  })
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
  // Return all songs with their usage count and last used date
  const allSongs = db.select().from(songs).orderBy(asc(songs.title)).all()
  const usageData = db.select().from(songUsage).all()
  const serviceDateData = db.select().from(serviceDates).all()

  return allSongs.map(song => {
    const usages = usageData.filter(u => u.songId === song.id)
    const lastUsage = usages.sort((a, b) =>
      new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime()
    )[0]
    const lastServiceDate = lastUsage
      ? serviceDateData.find(s => s.id === lastUsage.serviceDateId)
      : null

    return {
      ...song,
      usageCount: usages.length,
      lastUsedDate: lastServiceDate?.date ?? null,
      lastUsedLabel: lastServiceDate?.label ?? null
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

ipcMain.handle('backgrounds:getDir', () => {
  const dir = join(app.getPath('userData'), 'backgrounds')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
})

ipcMain.handle('backgrounds:pickImage', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose background image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const srcPath = result.filePaths[0]
  const dir = join(app.getPath('userData'), 'backgrounds')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const ext = extname(srcPath)
  const filename = `bg_${Date.now()}${ext}`
  const destPath = join(dir, filename)
  copyFileSync(srcPath, destPath)

  return destPath
})

ipcMain.handle('backgrounds:listImages', () => {
  const dir = join(app.getPath('userData'), 'backgrounds')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => join(dir, f))
})

ipcMain.handle('songs:setBackground', (_e, songId: number, backgroundPath: string | null) => {
  db.update(songs)
    .set({ backgroundPath, updatedAt: new Date().toISOString() })
    .where(eq(songs.id, songId))
    .run()
  return db.select().from(songs).where(eq(songs.id, songId)).get()
})

ipcMain.handle('backgrounds:getUsageCount', (_e, imagePath: string) => {
  // Count how many songs use this image
  const usingSongs = db.select().from(songs)
    .all()
    .filter(s => s.backgroundPath === imagePath)
  return usingSongs.length
})

ipcMain.handle('backgrounds:getUsingSongs', (_e, imagePath: string) => {
  return db.select({ id: songs.id, title: songs.title, artist: songs.artist })
    .from(songs)
    .all()
    .filter(s => s.backgroundPath === imagePath)
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

// ── Data export / import ──────────────────────────────────────────────────────

ipcMain.handle('data:export', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Export WorshipSync Data',
    defaultPath: `worshipsync-backup-${new Date().toISOString().split('T')[0]}.worshipsync`,
    filters: [{ name: 'WorshipSync Backup', extensions: ['worshipsync'] }]
  })
  if (result.canceled || !result.filePath) return { success: false, canceled: true }

  const bgDir = join(app.getPath('userData'), 'backgrounds')

  // Read background images as base64
  const backgrounds: { filename: string; data: string }[] = []
  if (existsSync(bgDir)) {
    for (const f of readdirSync(bgDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))) {
      backgrounds.push({ filename: f, data: readFileSync(join(bgDir, f)).toString('base64') })
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

  // Write background images, build filename → absolute path map
  const bgDir = join(app.getPath('userData'), 'backgrounds')
  if (!existsSync(bgDir)) mkdirSync(bgDir, { recursive: true })

  const pathMap: Record<string, string> = {}
  for (const bg of (data.backgrounds ?? [])) {
    const dest = join(bgDir, bg.filename)
    writeFileSync(dest, Buffer.from(bg.data, 'base64'))
    pathMap[bg.filename] = dest
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
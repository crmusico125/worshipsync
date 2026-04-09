import { db } from './db/index'
import { songs, sections, serviceDates, lineupItems, themes, songUsage } from './db/schema'
import { asc, desc, eq, like, or } from 'drizzle-orm'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

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
      nodeIntegration: false
    },
    show: false
  })

  controlWindow.on('ready-to-show', () => {
    controlWindow?.show()
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

function createProjectionWindow(): void {
  const displays = screen.getAllDisplays()
  const externalDisplay = displays.find(d => d.id !== screen.getPrimaryDisplay().id)
  const targetDisplay = externalDisplay ?? screen.getPrimaryDisplay()
  const { x, y, width, height } = targetDisplay.bounds

  projectionWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: 'WorshipSync — Projection',
    backgroundColor: '#000000',
    fullscreen: !!externalDisplay,
    frame: !externalDisplay,
    alwaysOnTop: !!externalDisplay,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  projectionWindow.on('ready-to-show', () => {
    projectionWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    projectionWindow.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/projection.html`
    )
  } else {
    projectionWindow.loadFile(join(__dirname, '../renderer/projection.html'))
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.on('slide:show', (_event, payload) => {
  projectionWindow?.webContents.send('slide:show', payload)
})

ipcMain.on('slide:blank', (_event, isBlank: boolean) => {
  projectionWindow?.webContents.send('slide:blank', isBlank)
})

ipcMain.on('slide:logo', (_event, show: boolean) => {
  projectionWindow?.webContents.send('slide:logo', show)
})

ipcMain.on('projection:ready', () => {
  controlWindow?.webContents.send('projection:ready')
})

ipcMain.handle('window:getDisplayCount', () => {
  return screen.getAllDisplays().length
})

ipcMain.on('window:openProjection', () => {
  if (!projectionWindow || projectionWindow.isDestroyed()) {
    createProjectionWindow()
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

// ── Lineup IPC handlers ───────────────────────────────────────────────────────

ipcMain.handle('lineup:getForService', (_e, serviceDateId: number) => {
  const items = db.select().from(lineupItems)
    .where(eq(lineupItems.serviceDateId, serviceDateId))
    .orderBy(asc(lineupItems.orderIndex))
    .all()

  // Join with song + sections data
  return items.map(item => {
    const song = db.select().from(songs)
      .where(eq(songs.id, item.songId))
      .get()
    const songSections = db.select().from(sections)
      .where(eq(sections.songId, item.songId))
      .orderBy(asc(sections.orderIndex))
      .all()
    return { ...item, song: { ...song, sections: songSections } }
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
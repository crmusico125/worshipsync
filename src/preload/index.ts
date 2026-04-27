import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('worshipsync', {

  slide: {
    show: (payload: SlidePayload) => ipcRenderer.send('slide:show', payload),
    blank: (isBlank: boolean) => ipcRenderer.send('slide:blank', isBlank),
    logo: (show: boolean) => ipcRenderer.send('slide:logo', show),
    countdown: (data: { targetTime: string; running: boolean }) => ipcRenderer.send('slide:countdown', data),
    videoControl: (action: 'play' | 'pause' | 'stop') => ipcRenderer.send('slide:videoControl', action),
    videoSeek: (time: number) => ipcRenderer.send('slide:videoSeek', time),

    onShow: (cb: (payload: SlidePayload) => void) => {
      ipcRenderer.on('slide:show', (_e, payload) => cb(payload))
      return () => ipcRenderer.removeAllListeners('slide:show')
    },
    onBlank: (cb: (isBlank: boolean) => void) => {
      ipcRenderer.on('slide:blank', (_e, isBlank) => cb(isBlank))
      return () => ipcRenderer.removeAllListeners('slide:blank')
    },
    onLogo: (cb: (show: boolean) => void) => {
      ipcRenderer.on('slide:logo', (_e, show) => cb(show))
      return () => ipcRenderer.removeAllListeners('slide:logo')
    },
    onCountdown: (cb: (data: { targetTime: string; running: boolean }) => void) => {
      ipcRenderer.on('slide:countdown', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('slide:countdown')
    },
    onVideoControl: (cb: (action: 'play' | 'pause' | 'stop') => void) => {
      ipcRenderer.on('slide:videoControl', (_e, action) => cb(action))
      return () => ipcRenderer.removeAllListeners('slide:videoControl')
    },
    onVideoSeek: (cb: (time: number) => void) => {
      ipcRenderer.on('slide:videoSeek', (_e, time) => cb(time))
      return () => ipcRenderer.removeAllListeners('slide:videoSeek')
    }
  },

  window: {
    getDisplayCount: () => ipcRenderer.invoke('window:getDisplayCount'),
    getDisplays: () => ipcRenderer.invoke('window:getDisplays') as Promise<
      { id: number; label: string; width: number; height: number; isPrimary: boolean }[]
    >,
    openProjection: (displayId?: number) => ipcRenderer.send('window:openProjection', displayId),
    moveProjection: (displayId: number) => ipcRenderer.send('window:moveProjection', displayId),
    closeProjection: () => ipcRenderer.send('window:closeProjection'),
    onProjectionReady: (cb: () => void) => {
      ipcRenderer.on('projection:ready', cb)
      return () => ipcRenderer.removeAllListeners('projection:ready')
    },
    onProjectionClosed: (cb: () => void) => {
      ipcRenderer.on('window:projectionClosed', cb)
      return () => ipcRenderer.removeListener('window:projectionClosed', cb)
    },
    onDisplaysChanged: (cb: (displays: { id: number; label: string; width: number; height: number; isPrimary: boolean }[]) => void) => {
      ipcRenderer.on('window:displaysChanged', (_e, displays) => cb(displays))
      return () => ipcRenderer.removeAllListeners('window:displaysChanged')
    }
  },

  projection: {
    ready: () => ipcRenderer.send('projection:ready')
  },
  
  songs: {
    getAll:   ()                => ipcRenderer.invoke('songs:getAll'),
    search:   (q: string)      => ipcRenderer.invoke('songs:search', q),
    getById:  (id: number)     => ipcRenderer.invoke('songs:getById', id),
    create:   (data: unknown)  => ipcRenderer.invoke('songs:create', data),
    update:   (id: number, data: unknown) => ipcRenderer.invoke('songs:update', id, data),
    delete:   (id: number)     => ipcRenderer.invoke('songs:delete', id),
    upsertSections: (songId: number, sections: unknown[]) =>
        ipcRenderer.invoke('sections:upsert', songId, sections)
  },
  services: {
    getAll:        ()                                          => ipcRenderer.invoke('services:getAll'),
    getByDate:     (date: string)                              => ipcRenderer.invoke('services:getByDate', date),
    create:        (data: unknown)                             => ipcRenderer.invoke('services:create', data),
    updateStatus:  (id: number, status: string)               => ipcRenderer.invoke('services:updateStatus', id, status),
    delete:        (id: number)                               => ipcRenderer.invoke('services:delete', id),
    getAllWithCounts: ()                                       => ipcRenderer.invoke('services:getAllWithCounts'),
    },

  lineup: {
    getForService:  (serviceDateId: number)                    => ipcRenderer.invoke('lineup:getForService', serviceDateId),
    addSong:        (serviceDateId: number, songId: number)    => ipcRenderer.invoke('lineup:addSong', serviceDateId, songId),
    addCountdown:   (serviceDateId: number)                    => ipcRenderer.invoke('lineup:addCountdown', serviceDateId),
    removeSong:     (lineupItemId: number)                     => ipcRenderer.invoke('lineup:removeSong', lineupItemId),
    reorder:        (serviceDateId: number, ids: number[])     => ipcRenderer.invoke('lineup:reorder', serviceDateId, ids),
    toggleSection:  (lineupItemId: number, sectionId: number, included: boolean) =>
                        ipcRenderer.invoke('lineup:toggleSection', lineupItemId, sectionId, included),
    setSections:    (lineupItemId: number, sectionIds: number[]) =>
                        ipcRenderer.invoke('lineup:setSections', lineupItemId, sectionIds),
  },
  themes: {
    getAll:     ()                    => ipcRenderer.invoke('themes:getAll'),
    getDefault: ()                    => ipcRenderer.invoke('themes:getDefault'),
    create:     (data: unknown)       => ipcRenderer.invoke('themes:create', data),
    update:     (id: number, data: unknown) => ipcRenderer.invoke('themes:update', id, data),
    delete:     (id: number)          => ipcRenderer.invoke('themes:delete', id),
  },

  analytics: {
    getSongUsage:     ()                                          => ipcRenderer.invoke('analytics:getSongUsage'),
    getServiceHistory: ()                                         => ipcRenderer.invoke('analytics:getServiceHistory'),
    recordUsage:      (songId: number, serviceDateId: number)    => ipcRenderer.invoke('analytics:recordUsage', songId, serviceDateId),
  },
  backgrounds: {
    getDir:      ()               => ipcRenderer.invoke('backgrounds:getDir'),
    pickImage:   ()               => ipcRenderer.invoke('backgrounds:pickImage'),
    setBackground: (songId: number, path: string | null) =>
      ipcRenderer.invoke('songs:setBackground', songId, path),
    listImages: () => ipcRenderer.invoke('backgrounds:listImages'),
    getUsageCount: (imagePath: string) => ipcRenderer.invoke('backgrounds:getUsageCount', imagePath),
    getUsingSongs: (imagePath: string) => ipcRenderer.invoke('backgrounds:getUsingSongs', imagePath),
    getUsingServices: (imagePath: string) => ipcRenderer.invoke('backgrounds:getUsingServices', imagePath),
    deleteImage:   (imagePath: string) => ipcRenderer.invoke('backgrounds:deleteImage', imagePath),
  },
  appState: {
    get:              ()                          => ipcRenderer.invoke('app:getState'),
    set:              (data: Record<string, any>) => ipcRenderer.invoke('app:setState', data),
    getTodayService:  ()                          => ipcRenderer.invoke('app:getTodayService'),
  },
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
  },
})

interface SlidePayload {
  lines: string[]
  songTitle: string
  sectionLabel: string
  slideIndex: number
  totalSlides: number
  backgroundPath?: string
  theme?: {
    fontFamily: string
    fontSize: number
    fontWeight: string
    textColor: string
    textAlign: 'left' | 'center' | 'right'
    textPosition: 'top' | 'middle' | 'bottom'
    overlayOpacity: number
    textShadowOpacity: number
    maxLinesPerSlide: number
  }
}
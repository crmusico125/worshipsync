import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('worshipsync', {

  slide: {
    show: (payload: SlidePayload) => ipcRenderer.send('slide:show', payload),
    blank: (isBlank: boolean) => ipcRenderer.send('slide:blank', isBlank),
    logo: (show: boolean) => ipcRenderer.send('slide:logo', show),

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
    }
  },

  window: {
    getDisplayCount: () => ipcRenderer.invoke('window:getDisplayCount'),
    openProjection: () => ipcRenderer.send('window:openProjection'),
    closeProjection: () => ipcRenderer.send('window:closeProjection'),
    onProjectionReady: (cb: () => void) => {
      ipcRenderer.on('projection:ready', cb)
      return () => ipcRenderer.removeAllListeners('projection:ready')
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
    },

  lineup: {
    getForService:  (serviceDateId: number)                    => ipcRenderer.invoke('lineup:getForService', serviceDateId),
    addSong:        (serviceDateId: number, songId: number)    => ipcRenderer.invoke('lineup:addSong', serviceDateId, songId),
    removeSong:     (lineupItemId: number)                     => ipcRenderer.invoke('lineup:removeSong', lineupItemId),
    reorder:        (serviceDateId: number, ids: number[])     => ipcRenderer.invoke('lineup:reorder', serviceDateId, ids),
    toggleSection:  (lineupItemId: number, sectionId: number, included: boolean) =>
                        ipcRenderer.invoke('lineup:toggleSection', lineupItemId, sectionId, included),
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
    deleteImage:   (imagePath: string) => ipcRenderer.invoke('backgrounds:deleteImage', imagePath),
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
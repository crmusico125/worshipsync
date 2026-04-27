import type { Song, Section, SlidePayload, SongWithSections } from '../../../shared/types'

interface ServiceDate {
  id: number
  date: string
  label: string
  status: 'empty' | 'in-progress' | 'ready'
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface LineupItemWithSong {
  id: number
  serviceDateId: number
  songId: number | null
  itemType: 'song' | 'countdown'
  orderIndex: number
  selectedSections: string
  overrideThemeId: number | null
  overrideBackgroundPath: string | null
  song: SongWithSections | null
}
interface Theme {
  id: number
  name: string
  type: 'global' | 'seasonal' | 'per-song'
  isDefault: boolean
  seasonStart: string | null
  seasonEnd: string | null
  settings: string
  createdAt: string
}

interface ThemeSettings {
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

interface SongWithUsage extends Song {
  usageCount: number
  lastUsedDate: string | null
  lastUsedLabel: string | null
}

interface TodayServiceResult {
  service: ServiceDate
  daysAway: number
}

declare global {
  interface Window {
    worshipsync: {
      slide: {
        show: (payload: SlidePayload) => void
        blank: (isBlank: boolean) => void
        logo: (show: boolean) => void
        countdown: (data: { targetTime: string; running: boolean }) => void
        videoControl: (action: 'play' | 'pause' | 'stop') => void
        videoSeek: (time: number) => void
        onShow: (cb: (payload: SlidePayload) => void) => () => void
        onBlank: (cb: (isBlank: boolean) => void) => () => void
        onLogo: (cb: (show: boolean) => void) => () => void
        onCountdown: (cb: (data: { targetTime: string; running: boolean }) => void) => () => void
        onVideoControl: (cb: (action: 'play' | 'pause' | 'stop') => void) => () => void
        onVideoSeek: (cb: (time: number) => void) => () => void
      }
      window: {
        getDisplayCount: () => Promise<number>
        getDisplays: () => Promise<
          { id: number; label: string; width: number; height: number; isPrimary: boolean }[]
        >
        openProjection: (displayId?: number) => void
        moveProjection: (displayId: number) => void
        closeProjection: () => void
        onProjectionReady: (cb: () => void) => () => void
        onProjectionClosed: (cb: () => void) => () => void
        onDisplaysChanged: (cb: (displays: { id: number; label: string; width: number; height: number; isPrimary: boolean }[]) => void) => () => void
      }
      projection: {
        ready: () => void
      }
      songs: {
        getAll:         () => Promise<Song[]>
        search:         (q: string) => Promise<Song[]>
        getById:        (id: number) => Promise<SongWithSections | null>
        create:         (data: unknown) => Promise<Song>
        update:         (id: number, data: unknown) => Promise<Song>
        delete:         (id: number) => Promise<boolean>
        upsertSections: (songId: number, sections: unknown[]) => Promise<Section[]>
      }
      services: {
        getAll:           () => Promise<ServiceDate[]>
        getAllWithCounts:  () => Promise<(ServiceDate & { itemCount: number })[]>
        getByDate:        (date: string) => Promise<ServiceDate | null>
        create:           (data: unknown) => Promise<ServiceDate>
        updateStatus:     (id: number, status: string) => Promise<ServiceDate>
        delete:           (id: number) => Promise<boolean>
      }
      lineup: {
        getForService:  (serviceDateId: number) => Promise<LineupItemWithSong[]>
        addSong:        (serviceDateId: number, songId: number) => Promise<unknown>
        addCountdown:   (serviceDateId: number) => Promise<unknown>
        removeSong:     (lineupItemId: number) => Promise<boolean>
        reorder:        (serviceDateId: number, ids: number[]) => Promise<boolean>
        toggleSection:  (lineupItemId: number, sectionId: number, included: boolean) => Promise<number[]>
        setSections:    (lineupItemId: number, sectionIds: number[]) => Promise<number[]>
      }
      themes: {
        getAll:     () => Promise<Theme[]>
        getDefault: () => Promise<Theme | null>
        create:     (data: unknown) => Promise<Theme>
        update:     (id: number, data: unknown) => Promise<Theme>
        delete:     (id: number) => Promise<boolean>
      }
      analytics: {
        getSongUsage:      () => Promise<SongWithUsage[]>
        getServiceHistory: () => Promise<ServiceDate[]>
        recordUsage:       (songId: number, serviceDateId: number) => Promise<unknown>
      }
      backgrounds: {
        getDir:        () => Promise<string>
        pickImage:     () => Promise<string | null>
        setBackground: (songId: number, path: string | null) => Promise<Song>
        listImages: () => Promise<string[]>
        getUsageCount: (imagePath: string) => Promise<number>
        getUsingSongs: (imagePath: string) => Promise<{ id: number; title: string; artist: string }[]>
        getUsingServices: (imagePath: string) => Promise<{ id: number; date: string; label: string }[]>
        deleteImage:   (imagePath: string) => Promise<boolean>
      }
      appState: {
        get:             () => Promise<Record<string, any>>
        set:             (data: Record<string, any>) => Promise<boolean>
        getTodayService: () => Promise<TodayServiceResult | null>
      }
    }
  }
}

export {}
export type AppScreen =
  | "overview"
  | "planner"
  | "service"
  | "library"
  | "media"
  | "themes"
  | "analytics"
  | "settings"

export interface Song {
  id: number
  title: string
  artist: string
  key: string | null
  tempo: string | null
  ccliNumber: string | null
  backgroundPath: string | null
  themeId: number | null
  tags: string
  createdAt: string
  updatedAt: string
}

export interface Section {
  id: number
  songId: number
  type: string
  label: string
  lyrics: string
  orderIndex: number
}

export interface SongWithSections extends Song {
  sections: Section[]
}

export interface SlidePayload {
  lines: string[]
  songTitle: string
  sectionLabel: string
  sectionType?: string
  artist?: string
  slideIndex?: number
  totalSlides?: number
  backgroundPath?: string | null
  nextLines?: string[]
  nextSectionLabel?: string
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

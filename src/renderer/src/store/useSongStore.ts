import { create } from 'zustand'
import type { Song, SongWithSections } from '../../../../shared/types'

interface SongStore {
  songs: Song[]
  selectedSong: SongWithSections | null
  searchQuery: string
  loading: boolean

  loadSongs: () => Promise<void>
  searchSongs: (q: string) => Promise<void>
  selectSong: (id: number) => Promise<void>
  clearSelection: () => void
  setSearchQuery: (q: string) => void
}

export const useSongStore = create<SongStore>((set, get) => ({
  songs: [],
  selectedSong: null,
  searchQuery: '',
  loading: false,

  loadSongs: async () => {
    set({ loading: true })
    const songs = await window.worshipsync.songs.getAll()
    set({ songs, loading: false })
  },

  searchSongs: async (q: string) => {
    set({ searchQuery: q, loading: true })
    const songs = q.trim()
      ? await window.worshipsync.songs.search(q)
      : await window.worshipsync.songs.getAll()
    set({ songs, loading: false })
  },

  selectSong: async (id: number) => {
    const song = await window.worshipsync.songs.getById(id)
    set({ selectedSong: song })
  },

  clearSelection: () => set({ selectedSong: null }),

  setSearchQuery: (q: string) => {
    set({ searchQuery: q })
    get().searchSongs(q)
  }
}))
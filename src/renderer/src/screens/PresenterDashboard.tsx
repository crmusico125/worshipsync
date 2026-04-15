import { useEffect, useState, useCallback, useRef } from "react"
import { useServiceStore } from "../store/useServiceStore"
import {
  ChevronDown, Music2, BookOpen, Plus, Pencil,
  MonitorOff, Monitor, Radio, Search, Check, Calendar, Settings2,
  Lock, Unlock, SkipForward, Eye, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import LibraryModal from "../components/LibraryModal"
import EditLyricsModal from "../components/EditLyricsModal"

// ── Types ─────────────────────────────────────────────────────────────────────

type DashboardMode = "prepare" | "rehearsal" | "live"

interface Slide {
  lines: string[]
  sectionLabel: string
  sectionType: string
  sectionId: number
  globalIndex: number
}

interface LiveSong {
  lineupItemId: number
  songId: number
  title: string
  artist: string
  key: string | null
  ccliNumber: string | null
  backgroundPath: string | null
  themeId: number | null
  slides: Slide[]
  rawLyrics: string
}

interface ThemeStyle {
  fontFamily: string
  fontSize: number
  fontWeight: string
  textColor: string
  textAlign: "left" | "center" | "right"
  textPosition: "top" | "middle" | "bottom"
  overlayOpacity: number
  textShadowOpacity: number
  maxLinesPerSlide: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_THEME: ThemeStyle = {
  fontFamily: "Montserrat, sans-serif",
  fontSize: 48,
  fontWeight: "600",
  textColor: "#ffffff",
  textAlign: "center",
  textPosition: "middle",
  overlayOpacity: 45,
  textShadowOpacity: 40,
  maxLinesPerSlide: 2,
}

const BADGE_COLORS: Record<string, string> = {
  verse: "bg-green-600",
  chorus: "bg-blue-600",
  bridge: "bg-amber-600",
  "pre-chorus": "bg-violet-600",
  intro: "bg-slate-600",
  outro: "bg-slate-600",
  tag: "bg-red-600",
  interlude: "bg-slate-600",
  blank: "bg-gray-700",
}

function buildSlidesForSong(
  sections: { id: number; type: string; label: string; lyrics: string }[],
  maxLines = 2,
): Slide[] {
  const slides: Slide[] = []
  let globalIdx = 0
  for (const sec of sections) {
    const lines = sec.lyrics.split("\n").filter(l => l.trim())
    if (lines.length === 0) {
      slides.push({ lines: [""], sectionLabel: sec.label, sectionType: sec.type, sectionId: sec.id, globalIndex: globalIdx++ })
      continue
    }
    for (let i = 0; i < lines.length; i += maxLines) {
      slides.push({
        lines: lines.slice(i, i + maxLines),
        sectionLabel: sec.label,
        sectionType: sec.type,
        sectionId: sec.id,
        globalIndex: globalIdx++,
      })
    }
  }
  slides.push({ lines: [""], sectionLabel: "Blank", sectionType: "blank", sectionId: -1, globalIndex: globalIdx })
  return slides
}

function sectionsToLyrics(sections: { label: string; lyrics: string }[]): string {
  return sections.map(s => `[${s.label}]\n${s.lyrics}`).join("\n\n")
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  projectionOpen: boolean
  onProjectionChange: (open: boolean) => void
}

export default function PresenterDashboard({ projectionOpen, onProjectionChange }: Props) {
  const { services, selectedService, lineup, loadLineup, loadServices, selectService, addSongToLineup } = useServiceStore()

  const [mode, setMode] = useState<DashboardMode>("prepare")
  const [liveSongs, setLiveSongs] = useState<LiveSong[]>([])
  const [selectedSongIdx, setSelectedSongIdx] = useState(0)
  const [activeSlideIdx, setActiveSlideIdx] = useState(-1)
  const [isBlank, setIsBlank] = useState(false)
  const [themeCache, setThemeCache] = useState<Record<number, any>>({})
  const [defaultTheme, setDefaultTheme] = useState<any>(null)
  const [defaultThemeBg, setDefaultThemeBg] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [editingSong, setEditingSong] = useState<LiveSong | null>(null)
  const [settingsTab, setSettingsTab] = useState("appearance")
  const [bgImages, setBgImages] = useState<string[]>([])
  const [themeOverrides, setThemeOverrides] = useState<Partial<ThemeStyle>>({})
  const [bgOverride, setBgOverride] = useState<string | null | undefined>(undefined)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectorSearch, setSelectorSearch] = useState("")
  const [showGoLiveConfirm, setShowGoLiveConfirm] = useState(false)
  const selectorRef = useRef<HTMLDivElement>(null)
  const slideGridRef = useRef<HTMLDivElement>(null)

  const isLive = mode === "live"
  const isRehearsal = mode === "rehearsal"
  const isPrepare = mode === "prepare"

  // ── Close selector on outside click ────────────────────────────────────────
  useEffect(() => {
    if (!selectorOpen) return
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false)
        setSelectorSearch("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [selectorOpen])

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    loadServices()
    if (selectedService) loadLineup(selectedService.id)
    window.worshipsync.themes.getDefault().then((t: any) => {
      setDefaultTheme(t)
      if (t?.settings) {
        try { setDefaultThemeBg(JSON.parse(t.settings).backgroundPath ?? null) } catch {}
      }
    })
    window.worshipsync.themes.getAll().then((all: any[]) => {
      const c: Record<number, any> = {}
      all.forEach(t => { c[t.id] = t })
      setThemeCache(c)
    })
    window.worshipsync.backgrounds.listImages().then(setBgImages).catch(() => {})
  }, [])

  // ── Build live songs ──────────────────────────────────────────────────────
  useEffect(() => {
    const built: LiveSong[] = lineup.map(item => {
      const selectedIds: number[] = JSON.parse(item.selectedSections || "[]")
      const filtered = item.song.sections.filter(s => selectedIds.includes(s.id))
      const sectionsToUse = filtered.length > 0 ? filtered : item.song.sections
      return {
        lineupItemId: item.id,
        songId: item.song.id,
        title: item.song.title,
        artist: item.song.artist ?? "",
        key: item.song.key ?? null,
        ccliNumber: item.song.ccliNumber ?? null,
        backgroundPath: item.song.backgroundPath ?? null,
        themeId: item.song.themeId ?? null,
        slides: buildSlidesForSong(sectionsToUse),
        rawLyrics: sectionsToLyrics(sectionsToUse),
      }
    })
    setLiveSongs(built)
  }, [lineup])

  // ── Theme + background resolution ──────────────────────────────────────────
  const resolveTheme = useCallback((song: LiveSong): ThemeStyle => {
    const t = (song.themeId ? themeCache[song.themeId] : null) ?? defaultTheme
    let base = DEFAULT_THEME
    if (t?.settings) {
      try { base = { ...DEFAULT_THEME, ...JSON.parse(t.settings) } } catch {}
    }
    return { ...base, ...themeOverrides }
  }, [themeCache, defaultTheme, themeOverrides])

  const resolveBg = useCallback((song: LiveSong): string | undefined => {
    if (bgOverride !== undefined) return bgOverride ?? undefined
    if (song.backgroundPath) return song.backgroundPath
    if (song.themeId && themeCache[song.themeId]) {
      try { return JSON.parse(themeCache[song.themeId].settings).backgroundPath ?? undefined } catch {}
    }
    return defaultThemeBg ?? undefined
  }, [themeCache, defaultThemeBg, bgOverride])

  // ── Slide projection ──────────────────────────────────────────────────────
  const sendSlide = useCallback((songIdx: number, slideIdx: number) => {
    const song = liveSongs[songIdx]
    if (!song) return
    const slide = song.slides[slideIdx]
    if (!slide) return
    const theme = resolveTheme(song)
    const bg = resolveBg(song)
    setSelectedSongIdx(songIdx)
    setActiveSlideIdx(slideIdx)
    setIsBlank(false)

    // In rehearsal mode, only update local state — don't send to projection
    if (isRehearsal) return

    if (slide.sectionType === "blank") {
      window.worshipsync.slide.blank(true)
      setIsBlank(true)
    } else {
      window.worshipsync.slide.blank(false)
      window.worshipsync.slide.logo(false)
      window.worshipsync.slide.show({
        lines: slide.lines,
        songTitle: song.title,
        sectionLabel: slide.sectionLabel,
        slideIndex: slide.globalIndex,
        totalSlides: song.slides.length,
        backgroundPath: bg,
        theme: {
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize,
          fontWeight: theme.fontWeight,
          textColor: theme.textColor,
          textAlign: theme.textAlign,
          textPosition: theme.textPosition,
          overlayOpacity: theme.overlayOpacity,
          textShadowOpacity: theme.textShadowOpacity,
          maxLinesPerSlide: theme.maxLinesPerSlide,
        },
      })
    }
  }, [liveSongs, resolveTheme, resolveBg, isRehearsal])

  // Re-send current slide when overrides change (only in live mode)
  useEffect(() => {
    if (isLive && activeSlideIdx >= 0 && !isBlank) {
      sendSlide(selectedSongIdx, activeSlideIdx)
    }
  }, [themeOverrides, bgOverride])

  const clearAll = () => {
    if (isRehearsal) { setIsBlank(true); setActiveSlideIdx(-1); return }
    window.worshipsync.slide.blank(true); setIsBlank(true); setActiveSlideIdx(-1)
  }
  const clearText = () => {
    if (isRehearsal) { setIsBlank(true); return }
    window.worshipsync.slide.blank(true); setIsBlank(true)
  }
  const clearBg = () => {
    const song = liveSongs[selectedSongIdx]
    if (!song || activeSlideIdx < 0) return
    if (isRehearsal) return
    const slide = song.slides[activeSlideIdx]
    if (!slide) return
    const theme = resolveTheme(song)
    window.worshipsync.slide.show({
      lines: slide.lines, songTitle: song.title, sectionLabel: slide.sectionLabel,
      slideIndex: slide.globalIndex, totalSlides: song.slides.length,
      theme: { fontFamily: theme.fontFamily, fontSize: theme.fontSize, fontWeight: theme.fontWeight,
        textColor: theme.textColor, textAlign: theme.textAlign, textPosition: theme.textPosition,
        overlayOpacity: theme.overlayOpacity, textShadowOpacity: theme.textShadowOpacity,
        maxLinesPerSlide: theme.maxLinesPerSlide },
    })
  }

  // ── Next song helper (for live mode) ──────────────────────────────────────
  const goNextSong = () => {
    const next = selectedSongIdx + 1
    if (next < liveSongs.length) {
      setSelectedSongIdx(next)
      setActiveSlideIdx(-1)
    }
  }

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (isPrepare) return // no keyboard nav in prepare mode
      const song = liveSongs[selectedSongIdx]
      if (!song) return
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        const next = activeSlideIdx + 1
        if (next < song.slides.length) sendSlide(selectedSongIdx, next)
        else goNextSong()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        const prev = activeSlideIdx - 1
        if (prev >= 0) sendSlide(selectedSongIdx, prev)
      } else if (e.key === "b" || e.key === "B") {
        clearAll()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [liveSongs, selectedSongIdx, activeSlideIdx, sendSlide, isPrepare])

  // ── Library add handler ────────────────────────────────────────────────────
  const handleLibraryAdd = async (songIds: number[]) => {
    if (!selectedService) return
    for (const id of songIds) await addSongToLineup(id)
  }

  // ── Edit lyrics save handler ──────────────────────────────────────────────
  const handleLyricsSave = async (newLyrics: string) => {
    if (!editingSong) return
    const typeMap: Record<string, string> = {
      verse: "verse", chorus: "chorus", bridge: "bridge", "pre-chorus": "pre-chorus",
      intro: "intro", outro: "outro", tag: "tag", interlude: "interlude",
    }
    const parsed: { type: string; label: string; lyrics: string; orderIndex: number }[] = []
    let currentType: string | null = null
    let currentLabel = ""
    let currentLines: string[] = []
    let idx = 0
    const flush = () => {
      if (!currentType) return
      parsed.push({ type: currentType, label: currentLabel, lyrics: currentLines.join("\n").trimEnd(), orderIndex: idx++ })
      currentLines = []
    }
    for (const line of newLyrics.split("\n")) {
      const match = line.trim().match(/^\[(.+?)\]$/)
      if (match) {
        flush()
        const raw = match[1].toLowerCase().trim().replace(/\s*\d+$/, "")
        currentType = typeMap[raw] ?? "verse"
        currentLabel = match[1].trim()
      } else if (currentType !== null) {
        currentLines.push(line)
      }
    }
    flush()
    if (parsed.length > 0) {
      await window.worshipsync.songs.upsertSections(editingSong.songId, parsed)
      if (selectedService) await loadLineup(selectedService.id)
    }
  }

  // ── Mode transitions ──────────────────────────────────────────────────────
  const enterLive = () => {
    setMode("live")
    setShowGoLiveConfirm(false)
    if (!projectionOpen) {
      window.worshipsync.window.openProjection()
      onProjectionChange(true)
    }
  }

  const exitLive = () => {
    setMode("prepare")
    setActiveSlideIdx(-1)
    setIsBlank(false)
  }

  const endShow = () => {
    window.worshipsync.slide.blank(true)
    window.worshipsync.window.closeProjection()
    onProjectionChange(false)
    setMode("prepare")
    setActiveSlideIdx(-1)
    setIsBlank(false)
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const currentSong = liveSongs[selectedSongIdx] ?? null
  const currentSlide = currentSong?.slides[activeSlideIdx] ?? null
  const totalSlides = currentSong?.slides.length ?? 0
  const effectiveTheme = currentSong ? resolveTheme(currentSong) : DEFAULT_THEME
  const effectiveBg = currentSong ? resolveBg(currentSong) : undefined
  const nextSong = liveSongs[selectedSongIdx + 1] ?? null

  return (
    <div className={`h-full flex overflow-hidden bg-background text-foreground ${isLive ? "ring-2 ring-red-500/60 ring-inset" : ""}`}>

      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT SIDEBAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className={`w-56 shrink-0 border-r flex flex-col bg-card ${isLive ? "border-red-500/30" : "border-border"}`}>

        {/* Mode header / LIVE badge */}
        {isLive ? (
          <div className="px-3 py-2.5 border-b border-red-500/30 bg-red-500/10 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Live</span>
              </div>
              <Button
                variant="ghost" size="sm"
                className="h-6 text-[10px] px-2 gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={exitLive}
              >
                <Unlock className="h-3 w-3" /> Unlock
              </Button>
            </div>
            <p className="text-[10px] text-red-400/70 mt-1 truncate">
              {selectedService?.label ?? "No service"}
            </p>
          </div>
        ) : (
          /* Service selector (prepare/rehearsal only) */
          <div className="px-3 py-3 border-b border-border relative" ref={selectorRef}>
            <button
              onClick={() => { setSelectorOpen(!selectorOpen); setSelectorSearch("") }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm font-medium text-foreground bg-accent hover:bg-accent/80 transition-colors"
            >
              <span className="truncate flex-1 text-left">{selectedService?.label ?? "No service"}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${selectorOpen ? "rotate-180" : ""}`} />
            </button>

            {selectorOpen && (() => {
              const filtered = services
                .filter(s => {
                  if (!selectorSearch.trim()) return true
                  const q = selectorSearch.toLowerCase()
                  return s.label.toLowerCase().includes(q) || s.date.includes(q)
                })
                .sort((a, b) => b.date.localeCompare(a.date))
              return (
                <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        autoFocus
                        className="pl-8 h-8 text-xs bg-accent"
                        placeholder="Search lineups..."
                        value={selectorSearch}
                        onChange={e => setSelectorSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
                    <div className="px-3 pt-2.5 pb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent Lineups</span>
                    </div>
                    {filtered.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">No lineups match your search.</div>
                    ) : (
                      filtered.map(service => {
                        const isSelected = selectedService?.id === service.id
                        const dateStr = new Date(service.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        return (
                          <button
                            key={service.id}
                            onClick={async () => {
                              await selectService(service)
                              setSelectorOpen(false)
                              setSelectorSearch("")
                              setSelectedSongIdx(0)
                              setActiveSlideIdx(-1)
                            }}
                            className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors rounded-md ${isSelected ? "bg-primary/10" : "hover:bg-accent"}`}
                          >
                            <div className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center mt-0.5 ${isSelected ? "bg-primary" : "bg-accent"}`}>
                              {isSelected ? <Check className="h-4 w-4 text-primary-foreground" /> : <Calendar className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>{service.label}</p>
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{dateStr}</p>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                  <div className="border-t border-border p-2 flex flex-col gap-0.5">
                    <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" onClick={() => setSelectorOpen(false)}>
                      <Plus className="h-3.5 w-3.5" /> Create New Lineup
                    </button>
                    <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" onClick={() => setSelectorOpen(false)}>
                      <Settings2 className="h-3.5 w-3.5" /> Manage Lineups
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Lineup header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {isLive ? "Song Order" : "Service Lineup"}
          </span>
          {isPrepare && (
            <button onClick={() => setShowLibrary(true)} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Lineup items */}
        <div className="flex-1 overflow-y-auto px-2" style={{ scrollbarGutter: "stable" }}>
          {liveSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <Music2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium text-foreground mb-0.5">Empty Lineup</p>
              <p className="text-[10px] text-muted-foreground mb-3">Your service lineup has no items yet.</p>
              {isPrepare && (
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5" onClick={() => setShowLibrary(true)}>
                  <BookOpen className="h-3 w-3" /> Browse Library
                </Button>
              )}
            </div>
          ) : (
            liveSongs.map((song, i) => {
              const isCurrent = selectedSongIdx === i
              const isNext = selectedSongIdx + 1 === i
              return (
                <button
                  key={song.lineupItemId}
                  onClick={() => { setSelectedSongIdx(i); setActiveSlideIdx(-1) }}
                  className={`w-full text-left px-2.5 py-2 rounded-md mb-0.5 transition-colors ${
                    isCurrent
                      ? isLive ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-primary text-primary-foreground"
                      : isNext && isLive ? "bg-accent/80 border border-border" : "text-foreground hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isLive && (
                      <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0">{i + 1}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{song.title}</p>
                      <p className={`text-[10px] truncate mt-0.5 ${
                        isCurrent && isLive ? "text-red-300/60"
                        : isCurrent ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                      }`}>
                        {song.artist || "Unknown"}{song.key ? ` \u2022 Key: ${song.key}` : ""}
                      </p>
                    </div>
                    {isNext && isLive && (
                      <span className="text-[9px] font-bold uppercase text-muted-foreground">Next</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer: depends on mode */}
        <div className="px-3 py-3 border-t border-border shrink-0 space-y-1.5">
          {isPrepare && (
            <>
              <button
                onClick={() => setShowLibrary(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5" /> Add from Library
              </button>
              <div className="flex gap-1.5">
                <Button
                  variant="outline" size="sm"
                  className="flex-1 h-7 text-xs gap-1"
                  disabled={liveSongs.length === 0}
                  onClick={() => setMode("rehearsal")}
                >
                  <Eye className="h-3 w-3" /> Rehearse
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs gap-1 bg-red-600 hover:bg-red-700"
                  disabled={liveSongs.length === 0}
                  onClick={() => setShowGoLiveConfirm(true)}
                >
                  <Radio className="h-3 w-3" /> Go Live
                </Button>
              </div>
            </>
          )}
          {isRehearsal && (
            <div className="flex gap-1.5">
              <Button
                variant="outline" size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => { setMode("prepare"); setActiveSlideIdx(-1) }}
              >
                Back to Prepare
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1 bg-red-600 hover:bg-red-700"
                onClick={() => setShowGoLiveConfirm(true)}
              >
                <Radio className="h-3 w-3" /> Go Live
              </Button>
            </div>
          )}
          {isLive && (
            <>
              {nextSong && (
                <Button
                  size="sm"
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={goNextSong}
                >
                  <SkipForward className="h-3.5 w-3.5" /> Next: {nextSong.title}
                </Button>
              )}
              <Button
                variant="outline" size="sm"
                className="w-full h-8 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                onClick={endShow}
              >
                <MonitorOff className="h-3.5 w-3.5" /> End Show
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CENTER AREA
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentSong ? (
          <>
            {/* Song header */}
            <div className={`px-6 pt-5 pb-3 border-b shrink-0 ${isLive ? "border-red-500/20" : "border-border"}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold truncate">{currentSong.title}</h1>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {currentSong.artist || "Unknown artist"}
                    {currentSong.ccliNumber && ` \u2022 CCLI: ${currentSong.ccliNumber}`}
                    {currentSong.key && ` \u2022 Key: ${currentSong.key}`}
                  </p>
                </div>
                {isPrepare && (
                  <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs" onClick={() => setEditingSong(currentSong)}>
                    <Pencil className="h-3 w-3" /> Edit Lyrics
                  </Button>
                )}
                {isRehearsal && (
                  <span className="shrink-0 flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md">
                    <Eye className="h-3 w-3" /> Rehearsal
                  </span>
                )}
                {isLive && (
                  <span className="shrink-0 flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-md">
                    <Radio className="h-3 w-3 animate-pulse" /> Broadcasting
                  </span>
                )}
              </div>
            </div>

            {/* Control bar */}
            <div className={`flex items-center gap-3 px-6 py-2.5 border-b shrink-0 ${isLive ? "border-red-500/20" : "border-border"}`}>
              {(isLive || isRehearsal) && (
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearAll}>Clear All</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearText}>Clear Text</Button>
                  {isLive && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearBg}>Clear BG</Button>}
                </div>
              )}
              {isPrepare && (
                <p className="text-xs text-muted-foreground">Click slides to preview. Use Rehearse or Go Live to project.</p>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {activeSlideIdx >= 0 ? `Slide ${activeSlideIdx + 1} of ${totalSlides}` : `${totalSlides} slides`}
              </span>
            </div>

            {/* Slide grid */}
            <div ref={slideGridRef} className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-3 gap-3">
                {currentSong.slides.map((slide, i) => {
                  const isActive = activeSlideIdx === i
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (isPrepare) {
                          // In prepare: just preview locally, don't send
                          setActiveSlideIdx(i)
                        } else {
                          sendSlide(selectedSongIdx, i)
                        }
                      }}
                      className={`rounded-lg overflow-hidden border-2 transition-all text-left ${
                        isActive
                          ? isLive ? "border-red-500 ring-2 ring-red-500/30 scale-[1.02]" : "border-primary ring-2 ring-primary/30 scale-[1.02]"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="bg-gray-900 p-3 relative" style={{ aspectRatio: "16/9" }}>
                        <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase text-white ${BADGE_COLORS[slide.sectionType] ?? "bg-slate-600"}`}>
                          {slide.sectionLabel}
                        </span>
                        <div className="flex items-center justify-center h-full px-2">
                          <p className="text-[11px] text-white text-center leading-relaxed whitespace-pre-wrap">
                            {slide.lines.join("\n") || " "}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Monitor className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-1">Ready to Present</h2>
            <p className="text-sm text-muted-foreground mb-5 max-w-sm">
              {isPrepare
                ? "Build your lineup on the left sidebar, then select an item to view and control its slides here."
                : "Select a song from the lineup to begin."}
            </p>
            {isPrepare && (
              <Button size="sm" className="gap-1.5" onClick={() => setShowLibrary(true)}>
                <Plus className="h-3.5 w-3.5" /> Add First Item
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RIGHT SIDEBAR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className={`w-72 shrink-0 border-l flex flex-col bg-card ${isLive ? "border-red-500/30" : "border-border"}`}>

        {/* Live output preview header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${
              isLive ? "bg-red-500 animate-pulse" : projectionOpen ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
            }`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {isLive ? "Live Output" : isRehearsal ? "Preview (Not Broadcasting)" : projectionOpen ? "Live Output (Audience)" : "Live Output (Offline)"}
            </span>
          </div>
        </div>

        {/* Preview area */}
        <div className={`mx-4 mb-3 rounded-lg overflow-hidden border bg-gray-950 shrink-0 relative ${
          isLive ? "border-red-500/40" : isRehearsal ? "border-amber-500/40" : "border-border"
        }`} style={{ aspectRatio: "16/9" }}>
          {effectiveBg && currentSlide && !isBlank && (
            <img src={`file://${effectiveBg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
          )}
          {effectiveBg && currentSlide && !isBlank && (
            <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }} />
          )}
          {currentSlide && !isBlank ? (
            <div className={`relative h-full flex p-4 ${
              effectiveTheme.textPosition === "top" ? "items-start" : effectiveTheme.textPosition === "bottom" ? "items-end" : "items-center"
            } ${
              effectiveTheme.textAlign === "left" ? "justify-start" : effectiveTheme.textAlign === "right" ? "justify-end" : "justify-center"
            }`}>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{
                color: effectiveTheme.textColor,
                fontFamily: effectiveTheme.fontFamily,
                fontWeight: effectiveTheme.fontWeight === "700" || effectiveTheme.fontWeight === "bold" ? 700 : effectiveTheme.fontWeight === "600" ? 600 : 400,
                textAlign: effectiveTheme.textAlign,
                textShadow: effectiveTheme.textShadowOpacity > 0 ? `0 2px 4px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})` : "none",
              }}>
                {currentSlide.lines.join("\n")}
              </p>
            </div>
          ) : (
            <div className="relative h-full flex items-center justify-center">
              {isBlank ? (
                <MonitorOff className="h-5 w-5 text-gray-700" />
              ) : (
                <p className="text-[10px] text-gray-600">No slide active</p>
              )}
            </div>
          )}
          {isRehearsal && (
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-amber-500/80 text-[8px] font-bold text-white uppercase">
              Preview Only
            </div>
          )}
        </div>

        {/* Right sidebar content depends on mode */}
        {isLive ? (
          /* Live mode: controls + clock + next song preview */
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Quick controls */}
            <div className="px-4 py-3 border-t border-red-500/20 space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick Controls</h4>
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearAll}>
                  <MonitorOff className="h-3 w-3 mr-1.5" /> Blank
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                  window.worshipsync.slide.logo(true)
                  setIsBlank(false)
                }}>
                  <Monitor className="h-3 w-3 mr-1.5" /> Logo
                </Button>
              </div>
            </div>

            {/* Clock */}
            <div className="px-4 py-3 border-t border-red-500/20">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Clock</h4>
              <LiveClock />
            </div>

            {/* Next song preview */}
            {nextSong && (
              <div className="px-4 py-3 border-t border-red-500/20">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Up Next</h4>
                <div className="rounded-md border border-border p-2.5 bg-accent/50">
                  <p className="text-xs font-medium truncate">{nextSong.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {nextSong.artist || "Unknown"}{nextSong.key ? ` \u2022 Key: ${nextSong.key}` : ""} \u2022 {nextSong.slides.length} slides
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : isRehearsal ? (
          /* Rehearsal mode: minimal controls */
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-t border-border space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rehearsal Controls</h4>
              <p className="text-[10px] text-muted-foreground">
                Navigate slides with arrow keys or by clicking. Nothing is sent to the projection screen.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearAll}>
                  <MonitorOff className="h-3 w-3 mr-1.5" /> Blank
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                  if (activeSlideIdx >= 0 && currentSong) setActiveSlideIdx(-1)
                }}>
                  Reset
                </Button>
              </div>
            </div>
            {nextSong && (
              <div className="px-4 py-3 border-t border-border">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Up Next</h4>
                <div className="rounded-md border border-border p-2.5 bg-accent/50">
                  <p className="text-xs font-medium truncate">{nextSong.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {nextSong.artist || "Unknown"} \u2022 {nextSong.slides.length} slides
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Prepare mode: full settings tabs */
          <Tabs value={settingsTab} onValueChange={setSettingsTab} className="flex flex-col flex-1 min-h-0">
            <div className="px-4 border-b border-border shrink-0">
              <TabsList className="h-auto w-full bg-transparent p-0 gap-0 rounded-none">
                {["appearance", "transitions", "output"].map(t => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="flex-1 rounded-none border-b-2 border-transparent px-2 py-2 text-[10px] font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none capitalize"
                  >
                    {t === "appearance" ? "Appearance" : t === "transitions" ? "Transitions" : "Output"}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="flex-1 overflow-y-auto">
              {settingsTab === "appearance" ? (
                <AppearanceTab
                  song={currentSong}
                  bgImages={bgImages}
                  theme={effectiveTheme}
                  onThemeChange={(key, value) => setThemeOverrides(prev => ({ ...prev, [key]: value }))}
                  onBgChange={(path) => setBgOverride(path)}
                  currentBg={effectiveBg ?? null}
                />
              ) : settingsTab === "transitions" ? (
                <TransitionsTab />
              ) : (
                <OutputTab
                  projectionOpen={projectionOpen}
                  onToggleProjection={() => {
                    if (projectionOpen) {
                      window.worshipsync.window.closeProjection()
                      onProjectionChange(false)
                    } else {
                      window.worshipsync.window.openProjection()
                      onProjectionChange(true)
                    }
                  }}
                />
              )}
            </div>
          </Tabs>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showLibrary && isPrepare && (
        <LibraryModal
          onClose={() => setShowLibrary(false)}
          onAdd={handleLibraryAdd}
          excludeIds={liveSongs.map(s => s.songId)}
        />
      )}
      {editingSong && isPrepare && (
        <EditLyricsModal
          songTitle={editingSong.title}
          artist={editingSong.artist}
          initialLyrics={editingSong.rawLyrics}
          onClose={() => setEditingSong(null)}
          onSave={handleLyricsSave}
        />
      )}

      {/* Go Live Confirmation Dialog */}
      {showGoLiveConfirm && (
        <Dialog open onOpenChange={(open) => !open && setShowGoLiveConfirm(false)}>
          <DialogContent hideClose className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl" style={{ width: 400, maxWidth: "95vw" }}>
            <div className="flex flex-col bg-background text-foreground">
              <div className="px-6 pt-5 pb-1">
                <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Lock className="h-5 w-5 text-red-400" /> Lock Lineup &amp; Go Live?
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  This will lock the lineup and start broadcasting to the audience screen.
                  Editing will be disabled during the live session.
                </p>
              </div>
              <div className="px-6 py-4 space-y-2">
                <div className="rounded-md bg-accent/50 border border-border p-3">
                  <p className="text-xs font-medium text-foreground">{selectedService?.label ?? "No service"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{liveSongs.length} songs in lineup</p>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  You can unlock at any time using the Unlock button in the sidebar.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setShowGoLiveConfirm(false)}>Cancel</Button>
                <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700" onClick={enterLive}>
                  <Radio className="h-3.5 w-3.5" /> Go Live
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ── Live Clock ──────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-3">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <span className="text-xl font-mono font-bold text-foreground tabular-nums">
        {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  )
}

// ── Appearance Tab ──────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { value: "Inter, sans-serif", label: "Inter (Sans-serif)" },
  { value: "Montserrat, sans-serif", label: "Montserrat" },
  { value: "Georgia, serif", label: "Georgia (Serif)" },
  { value: "Roboto, sans-serif", label: "Roboto" },
]

const WEIGHT_OPTIONS = [
  { value: "700", label: "Bold" },
  { value: "600", label: "Semi-Bold" },
  { value: "400", label: "Regular" },
]

const COLOR_SWATCHES = ["#ffffff", "#f5a623", "#4d8ef0", "#3ecf8e", "#f05252", "#9b59b6"]

interface AppearanceTabProps {
  song: LiveSong | null
  bgImages: string[]
  theme: ThemeStyle
  onThemeChange: (key: keyof ThemeStyle, value: any) => void
  onBgChange: (path: string | null) => void
  currentBg: string | null
}

function AppearanceTab({ song, bgImages, theme, onThemeChange, onBgChange, currentBg }: AppearanceTabProps) {
  if (!song) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        <p className="font-medium mb-1">No Item Selected</p>
        <p>Select a slide to customize its typography, colors, and background.</p>
      </div>
    )
  }

  const hasShadow = theme.textShadowOpacity > 0

  return (
    <div className="p-4 space-y-5">
      {/* Typography */}
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Typography</h4>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Font</label>
            <select
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={theme.fontFamily}
              onChange={e => onThemeChange("fontFamily", e.target.value)}
            >
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground mb-1 block">Weight</label>
              <select
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={theme.fontWeight}
                onChange={e => onThemeChange("fontWeight", e.target.value)}
              >
                {WEIGHT_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <div className="w-16">
              <label className="text-[10px] text-muted-foreground mb-1 block">Size</label>
              <Input
                className="h-8 text-xs"
                value={theme.fontSize}
                type="number"
                min={12}
                max={120}
                onChange={e => onThemeChange("fontSize", Number(e.target.value) || 48)}
              />
            </div>
          </div>
          <div className="flex gap-1.5">
            {(["left", "center", "right"] as const).map(align => (
              <button
                key={align}
                onClick={() => onThemeChange("textAlign", align)}
                className={`flex-1 h-7 rounded-md border flex items-center justify-center text-xs transition-colors ${
                  theme.textAlign === align
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "border-input text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {align === "left" ? "⫷" : align === "center" ? "☰" : "⫸"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Text Color & Effects */}
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Text Color &amp; Effects</h4>
        <div className="flex gap-1.5 mb-2">
          {COLOR_SWATCHES.map(color => (
            <button
              key={color}
              onClick={() => onThemeChange("textColor", color)}
              className={`h-6 w-6 rounded-full border-2 hover:scale-110 transition-transform ${
                theme.textColor === color ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
              style={{ background: color }}
            />
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Drop Shadow</span>
            <button
              onClick={() => onThemeChange("textShadowOpacity", hasShadow ? 0 : 40)}
              className={`h-5 w-9 rounded-full relative transition-colors ${hasShadow ? "bg-primary" : "bg-muted"}`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${hasShadow ? "right-0.5" : "left-0.5"}`} />
            </button>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Overlay Opacity</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="flex-1 h-1 accent-primary"
                min={0} max={100} step={5}
                value={theme.overlayOpacity}
                onChange={e => onThemeChange("overlayOpacity", Number(e.target.value))}
              />
              <span className="text-xs text-muted-foreground w-8 text-right">{theme.overlayOpacity}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Background */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-foreground">Background</h4>
          <button
            className="text-[10px] text-primary hover:underline"
            onClick={async () => {
              const path = await window.worshipsync.backgrounds.pickImage()
              if (path) onBgChange(path)
            }}
          >
            Browse Media
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => onBgChange(null)}
            className={`rounded-md border aspect-video flex items-center justify-center text-[9px] text-muted-foreground transition-colors ${
              !currentBg ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
            }`}
          >
            None
          </button>
          {bgImages.slice(0, 7).map((img, i) => (
            <button
              key={i}
              onClick={() => onBgChange(img)}
              className={`rounded-md overflow-hidden border-2 aspect-video bg-gray-800 transition-all ${
                currentBg === img ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
              }`}
            >
              <img src={`file://${img}`} className="w-full h-full object-cover" alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Transitions Tab ─────────────────────────────────────────────────────────

function TransitionsTab() {
  const [slideType, setSlideType] = useState("dissolve")
  const [slideDuration, setSlideDuration] = useState(0.5)
  const [bgType, setBgType] = useState("fade-to-black")
  const [bgDuration, setBgDuration] = useState(1.0)
  const [crossfadeAudio, setCrossfadeAudio] = useState(true)

  return (
    <div className="p-4 space-y-5">
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Slide Transition</h4>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Type</label>
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={slideType} onChange={e => setSlideType(e.target.value)}>
              <option value="dissolve">Dissolve</option>
              <option value="fade">Fade</option>
              <option value="cut">Cut</option>
              <option value="slide">Slide</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Duration</label>
            <div className="flex items-center gap-2">
              <input type="range" className="flex-1 h-1 accent-primary" min={0} max={2} step={0.1} value={slideDuration} onChange={e => setSlideDuration(Number(e.target.value))} />
              <span className="text-xs text-muted-foreground w-8 text-right">{slideDuration.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Background Media</h4>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Type</label>
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={bgType} onChange={e => setBgType(e.target.value)}>
              <option value="fade-to-black">Fade to Black</option>
              <option value="crossfade">Crossfade</option>
              <option value="cut">Cut</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Duration</label>
            <div className="flex items-center gap-2">
              <input type="range" className="flex-1 h-1 accent-primary" min={0} max={2} step={0.1} value={bgDuration} onChange={e => setBgDuration(Number(e.target.value))} />
              <span className="text-xs text-muted-foreground w-8 text-right">{bgDuration.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">Advanced Behavior</h4>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Crossfade Audio</span>
          <button onClick={() => setCrossfadeAudio(!crossfadeAudio)} className={`h-5 w-9 rounded-full relative transition-colors ${crossfadeAudio ? "bg-primary" : "bg-muted"}`}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${crossfadeAudio ? "right-0.5" : "left-0.5"}`} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Output Tab ──────────────────────────────────────────────────────────────

function OutputTab({ projectionOpen, onToggleProjection }: { projectionOpen: boolean; onToggleProjection: () => void }) {
  const [stageEnabled, setStageEnabled] = useState(false)
  const [ndiEnabled, setNdiEnabled] = useState(false)
  const [displayCount, setDisplayCount] = useState(1)

  useEffect(() => {
    window.worshipsync.window.getDisplayCount().then(setDisplayCount).catch(() => {})
  }, [])

  return (
    <div className="p-4 space-y-5">
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-3">Screen Routing</h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Audience Screen</span>
              <button onClick={onToggleProjection} className={`h-5 w-9 rounded-full relative transition-colors ${projectionOpen ? "bg-primary" : "bg-muted"}`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${projectionOpen ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {Array.from({ length: displayCount }, (_, i) => (
                <option key={i} value={i + 1}>Display {i + 1}{i === 0 ? " (Primary)" : ""}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Status:</span>
              <span className={`text-[10px] font-medium ${projectionOpen ? "text-green-500" : "text-muted-foreground"}`}>
                {projectionOpen ? "Connected" : "Offline"}
              </span>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Stage Display</span>
              <button onClick={() => setStageEnabled(!stageEnabled)} className={`h-5 w-9 rounded-full relative transition-colors ${stageEnabled ? "bg-primary" : "bg-muted"}`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${stageEnabled ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
            <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" disabled={!stageEnabled}>
              {Array.from({ length: displayCount }, (_, i) => (
                <option key={i} value={i + 1}>Display {i + 1}{i === 0 ? " (Primary)" : ""}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-3">Network &amp; Streaming Output</h4>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">NDI Output</span>
            <button onClick={() => setNdiEnabled(!ndiEnabled)} className={`h-5 w-9 rounded-full relative transition-colors ${ndiEnabled ? "bg-primary" : "bg-muted"}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${ndiEnabled ? "right-0.5" : "left-0.5"}`} />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">Broadcast locally to OBS / vMix</p>
        </div>
      </div>
    </div>
  )
}

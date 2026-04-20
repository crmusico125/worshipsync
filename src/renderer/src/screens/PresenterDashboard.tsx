import React, { useEffect, useState, useCallback, useRef, useMemo } from "react"
import {
  MonitorOff, ChevronLeft, ChevronRight,
  Music, GripVertical, Pencil, Plus, Cast,
  Play, Square, AlertCircle, X, Type,
  Tv, Hexagon, Image as ImageIcon, Timer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useServiceStore } from "../store/useServiceStore"
import LibraryModal from "../components/LibraryModal"

// ── Types ────────────────────────────────────────────────────────────────────

interface Slide {
  lines: string[]
  sectionLabel: string
  sectionType: string
  sectionId: number
  globalIndex: number
}

interface LiveSong {
  lineupItemId: number
  itemType: 'song' | 'countdown'
  songId: number
  title: string
  artist: string
  key: string | null
  ccliNumber: string | null
  backgroundPath: string | null
  themeId: number | null
  slides: Slide[]
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

const SECTION_ABBREVS: Record<string, string> = {
  verse: "V",
  chorus: "C",
  bridge: "B",
  "pre-chorus": "PC",
  intro: "I",
  outro: "O",
  tag: "T",
  interlude: "IL",
  blank: "B",
}

function buildSlidesForSong(
  sections: { id: number; type: string; label: string; lyrics: string }[],
  maxLines = 2,
): Slide[] {
  const slides: Slide[] = []
  let globalIdx = 0
  for (const sec of sections) {
    const lines = sec.lyrics.split("\n").filter(l => l.trim())
    if (lines.length === 0) continue
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
  slides.push({
    lines: [""], sectionLabel: "Blank", sectionType: "blank",
    sectionId: -1, globalIndex: globalIdx,
  })
  return slides
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectionOpen: boolean
  onProjectionChange: (open: boolean) => void
  onExitLive: () => void
}

export default function PresenterDashboard({ projectionOpen, onProjectionChange, onExitLive }: Props) {
  const { selectedService, lineup, loadLineup, addSongToLineup, addCountdownToLineup } = useServiceStore()

  const [liveSongs, setLiveSongs] = useState<LiveSong[]>([])
  const [selectedSongIdx, setSelectedSongIdx] = useState(0)
  const [activeSlideIdx, setActiveSlideIdx] = useState(-1)
  const [isBlank, setIsBlank] = useState(false)
  const [themeCache, setThemeCache] = useState<Record<number, any>>({})
  const [defaultTheme, setDefaultTheme] = useState<any>(null)
  const [defaultThemeBg, setDefaultThemeBg] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [displays, setDisplays] = useState<
    { id: number; label: string; width: number; height: number; isPrimary: boolean }[]
  >([])
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | undefined>(undefined)
  const slideGridRef = useRef<HTMLDivElement>(null)

  // Countdown state
  const [countdownRunning, setCountdownRunning] = useState(false)
  const [countdownDisplay, setCountdownDisplay] = useState("00:00:00")
  const [serviceTime, setServiceTime] = useState("11:00")
  const [serviceTimezone, setServiceTimezone] = useState("America/Los_Angeles")
  const [projectionFontSize, setProjectionFontSize] = useState(48)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedService) loadLineup(selectedService.id)
    window.worshipsync.window.getDisplays().then((d) => {
      setDisplays(d)
      const ext = d.find(x => !x.isPrimary)
      setSelectedDisplayId(ext?.id ?? d[0]?.id)
    })
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
    // Load service time settings
    window.worshipsync.appState.get().then((state: Record<string, any>) => {
      if (state.serviceTime) setServiceTime(state.serviceTime)
      if (state.serviceTimezone) setServiceTimezone(state.serviceTimezone)
      if (state.projectionFontSize) setProjectionFontSize(state.projectionFontSize)
    }).catch(() => {})
  }, [])

  // ── Build live songs ─────────────────────────────────────────────────────
  useEffect(() => {
    const built: LiveSong[] = lineup.map(item => {
      if (item.itemType === 'countdown') {
        return {
          lineupItemId: item.id,
          itemType: 'countdown' as const,
          songId: 0,
          title: "Countdown Timer",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: null,
          themeId: null,
          slides: [],
        }
      }

      // Skip items with missing song data
      if (!item.song) {
        return {
          lineupItemId: item.id,
          itemType: 'song' as const,
          songId: 0,
          title: "Unknown",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: null,
          themeId: null,
          slides: [],
        }
      }

      const selectedIds: number[] = JSON.parse(item.selectedSections || "[]")
      const filtered = selectedIds.length > 0
        ? item.song.sections.filter(s => selectedIds.includes(s.id))
        : item.song.sections

      // Resolve per-song maxLinesPerSlide from theme
      let maxLines = DEFAULT_THEME.maxLinesPerSlide
      const songThemeId = item.song.themeId
      if (songThemeId && themeCache[songThemeId]?.settings) {
        try {
          const parsed = JSON.parse(themeCache[songThemeId].settings)
          if (parsed.maxLinesPerSlide) maxLines = parsed.maxLinesPerSlide
        } catch {}
      }

      return {
        lineupItemId: item.id,
        itemType: 'song' as const,
        songId: item.song.id,
        title: item.song.title,
        artist: item.song.artist ?? "",
        key: item.song.key ?? null,
        ccliNumber: item.song.ccliNumber ?? null,
        backgroundPath: item.song.backgroundPath ?? null,
        themeId: item.song.themeId ?? null,
        slides: buildSlidesForSong(filtered, maxLines),
      }
    })
    setLiveSongs(built)
  }, [lineup, themeCache])

  // ── Theme + background resolution ────────────────────────────────────────
  const resolveTheme = useCallback((song: LiveSong): ThemeStyle => {
    const t = (song.themeId ? themeCache[song.themeId] : null) ?? defaultTheme
    let base = DEFAULT_THEME
    if (t?.settings) {
      try { base = { ...DEFAULT_THEME, ...JSON.parse(t.settings) } } catch {}
    }
    return base
  }, [themeCache, defaultTheme])

  const resolveBg = useCallback((song: LiveSong): string | undefined => {
    if (song.backgroundPath) return song.backgroundPath
    if (song.themeId && themeCache[song.themeId]) {
      try { return JSON.parse(themeCache[song.themeId].settings).backgroundPath ?? undefined } catch {}
    }
    return defaultThemeBg ?? undefined
  }, [themeCache, defaultThemeBg])

  // ── Slide projection ─────────────────────────────────────────────────────
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
          fontSize: theme.fontSize !== DEFAULT_THEME.fontSize ? theme.fontSize : projectionFontSize,
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
  }, [liveSongs, resolveTheme, resolveBg, projectionFontSize])

  useEffect(() => { setActiveSlideIdx(-1) }, [selectedSongIdx])

  // ── Controls ─────────────────────────────────────────────────────────────
  const clearAll = () => { window.worshipsync.slide.blank(true); setIsBlank(true); setActiveSlideIdx(-1) }
  const clearText = () => { window.worshipsync.slide.blank(true); setIsBlank(true) }
  const toBlack = () => { window.worshipsync.slide.blank(true); setIsBlank(true) }
  const showLogo = () => { window.worshipsync.slide.logo(true); setIsBlank(false) }

  const goNextSong = useCallback(() => {
    const next = selectedSongIdx + 1
    if (next < liveSongs.length) setSelectedSongIdx(next)
  }, [selectedSongIdx, liveSongs.length])

  const goPrevSlide = useCallback(() => {
    const prev = activeSlideIdx - 1
    if (prev >= 0) sendSlide(selectedSongIdx, prev)
  }, [activeSlideIdx, selectedSongIdx, sendSlide])

  const goNextSlide = useCallback(() => {
    const song = liveSongs[selectedSongIdx]
    if (!song) return
    const next = activeSlideIdx + 1
    if (next < song.slides.length) sendSlide(selectedSongIdx, next)
    else goNextSong()
  }, [activeSlideIdx, selectedSongIdx, liveSongs, sendSlide, goNextSong])

  const startLive = () => {
    window.worshipsync.window.openProjection(selectedDisplayId)
    onProjectionChange(true)
  }

  const endShow = () => {
    window.worshipsync.slide.blank(true)
    window.worshipsync.window.closeProjection()
    onProjectionChange(false)
    onExitLive()
  }

  const handleLibraryAdd = async (songIds: number[]) => {
    for (const id of songIds) await addSongToLineup(id)
  }

  // ── Countdown ───────────────────────────────────────────────────────────
  const getTargetTime = useCallback(() => {
    // Build today's service time in the configured timezone
    const now = new Date()
    const dateStr = now.toLocaleDateString("en-CA", { timeZone: serviceTimezone }) // YYYY-MM-DD
    return `${dateStr}T${serviceTime}:00`
  }, [serviceTime, serviceTimezone])

  const computeCountdownDisplay = useCallback(() => {
    // Convert to timezone-aware target
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: serviceTimezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    })
    // Get current time in the service timezone
    const nowParts = formatter.formatToParts(new Date())
    const getPart = (type: string) => nowParts.find(p => p.type === type)?.value ?? "0"
    const nowInTz = new Date(`${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}`)
    const targetInTz = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: serviceTimezone })}T${serviceTime}:00`)

    const diff = targetInTz.getTime() - nowInTz.getTime()
    if (diff <= 0) return "00:00:00"
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }, [getTargetTime, serviceTimezone, serviceTime])

  const startCountdown = useCallback(() => {
    setCountdownRunning(true)
    setIsBlank(false)
    const targetTime = getTargetTime()

    // Send initial state to projection
    window.worshipsync.slide.logo(false)
    window.worshipsync.slide.countdown({ targetTime, running: true })

    // Update local display every second
    const update = () => setCountdownDisplay(computeCountdownDisplay())
    update()
    countdownIntervalRef.current = setInterval(() => {
      const display = computeCountdownDisplay()
      setCountdownDisplay(display)
      if (display === "00:00:00") {
        stopCountdown()
      }
    }, 1000)
  }, [getTargetTime, computeCountdownDisplay])

  const stopCountdown = useCallback(() => {
    setCountdownRunning(false)
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    window.worshipsync.slide.countdown({ targetTime: "", running: false })
    window.worshipsync.slide.blank(true)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }
  }, [])

  // ── Keyboard nav ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        goNextSlide()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        goPrevSlide()
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault()
        toBlack()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goNextSlide, goPrevSlide])

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentSong = liveSongs[selectedSongIdx] ?? null
  const currentSlide = currentSong?.slides[activeSlideIdx] ?? null
  const nextSong = liveSongs[selectedSongIdx + 1] ?? null
  const effectiveTheme = currentSong ? resolveTheme(currentSong) : DEFAULT_THEME
  const effectiveBg = currentSong ? resolveBg(currentSong) : undefined

  const totalSlides = useMemo(
    () => currentSong ? currentSong.slides.length : 0,
    [currentSong],
  )

  const nextUp = useMemo(() => {
    if (!currentSong || activeSlideIdx < 0) return null
    const nextIdx = activeSlideIdx + 1
    if (nextIdx < currentSong.slides.length) {
      return { slide: currentSong.slides[nextIdx], songTitle: null }
    }
    if (nextSong && nextSong.slides.length > 0) {
      return { slide: nextSong.slides[0], songTitle: nextSong.title }
    }
    return null
  }, [currentSong, activeSlideIdx, nextSong])

  const selectedDisplay = displays.find(d => d.id === selectedDisplayId)

  if (!selectedService) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <Music className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-2">No service loaded</p>
          <p className="text-xs text-muted-foreground">Go to Builder, prepare a lineup, and click Go Live</p>
        </div>
      </div>
    )
  }

  // ── Pre-live idle ──────────────────────────────────────────────────────
  if (!projectionOpen) {
    return (
      <PreLiveIdle
        serviceLabel={selectedService.label}
        songs={liveSongs}
        canGoLive={liveSongs.length > 0}
        onStartLive={startLive}
        displays={displays}
        selectedDisplayId={selectedDisplayId}
        onDisplayChange={setSelectedDisplayId}
      />
    )
  }

  return (
    <div className="h-full flex overflow-hidden bg-background text-foreground">

      {/* ═════ LEFT: Service Lineup Panel (260px) ═════ */}
      <div className="w-[260px] shrink-0 border-r border-border flex flex-col bg-card">

        {/* Header — draggable */}
        <div
          className="px-4 py-3 border-b border-border"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <h2 className="text-sm font-semibold truncate">{selectedService.label}</h2>
          <div
            className="flex gap-2 items-center mt-2"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <span className="text-[11px] text-muted-foreground bg-input px-2 py-0.5 rounded font-medium">
              {new Date(selectedService.date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
              LIVE
            </span>
          </div>
        </div>

        {/* Lineup tab */}
        <div className="border-b border-border">
          <div className="text-center py-2 text-xs font-semibold border-b-2 border-primary text-foreground">
            Lineup
          </div>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto">
          {liveSongs.map((song, i) => {
            const isCurrent = selectedSongIdx === i
            const isCountdown = song.itemType === 'countdown'
            const Icon = isCountdown ? Timer : Music
            return (
              <button
                key={song.lineupItemId}
                onClick={() => setSelectedSongIdx(i)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-border transition-colors ${
                  isCurrent
                    ? "bg-primary/[0.08] border-l-[3px] border-l-primary pl-[9px]"
                    : "hover:bg-accent/30"
                }`}
              >
                <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                  isCurrent ? "bg-primary text-primary-foreground" : "bg-input text-muted-foreground"
                }`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-medium truncate ${
                    isCurrent ? "text-primary font-semibold" : "text-foreground"
                  }`}>
                    {song.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {isCountdown ? "Pre-Service Countdown" : `Song${song.key ? ` · Key: ${song.key}` : ""}`}
                  </p>
                </div>
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            )
          })}
        </div>

        {/* Add Item */}
        <div className="p-3 border-t border-border">
          <button
            onClick={() => setShowLibrary(true)}
            className="w-full py-2 border border-dashed border-muted-foreground rounded-md text-muted-foreground text-[13px] font-medium flex items-center justify-center gap-1.5 hover:border-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Item
          </button>
        </div>
      </div>

      {/* ═════ CENTER: Slide Grid ═════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {currentSong?.itemType === 'countdown' ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <Timer className="h-16 w-16 text-muted-foreground mb-6" />
            <h2 className="text-lg font-bold mb-2">Countdown Timer</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Counting down to service at{" "}
              <span className="font-semibold text-foreground">
                {new Date(`2000-01-01T${serviceTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
            </p>

            {/* Large timer display */}
            <div className="rounded-2xl border border-border bg-card px-12 py-8 mb-8">
              <span className="text-6xl font-mono font-bold tracking-wider text-foreground">
                {countdownRunning ? countdownDisplay : computeCountdownDisplay()}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              {!countdownRunning ? (
                <Button size="lg" className="gap-2" onClick={startCountdown}>
                  <Play className="h-5 w-5 fill-current" />
                  Start Countdown
                </Button>
              ) : (
                <Button size="lg" variant="destructive" className="gap-2" onClick={stopCountdown}>
                  <Square className="h-4 w-4 fill-current" />
                  Stop Countdown
                </Button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground mt-6 max-w-sm">
              The countdown will be shown on the projection screen when started.
              It stops automatically when it reaches zero.
            </p>
          </div>
        ) : currentSong ? (
          <>
            {/* Song header */}
            <div className="px-5 py-3 border-b border-border bg-card flex justify-between items-center gap-4">
              <div className="min-w-0">
                <h1 className="text-base font-semibold truncate">{currentSong.title}</h1>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {currentSong.artist || "Unknown artist"}
                  {currentSong.ccliNumber && ` · CCLI #${currentSong.ccliNumber}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                  <ImageIcon className="h-3 w-3" /> Background
                </Button>
                <Button size="sm" className="gap-1.5 h-7 text-xs">
                  <Pencil className="h-3 w-3" /> Edit Lyrics
                </Button>
              </div>
            </div>

            {/* Slide grid */}
            <div ref={slideGridRef} className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-4">
                {currentSong.slides.map((slide, i) => {
                  const isActive = activeSlideIdx === i
                  const bg = resolveBg(currentSong)
                  const abbrev = SECTION_ABBREVS[slide.sectionType] ?? slide.sectionLabel[0]
                  return (
                    <div key={i} className="flex flex-col gap-1.5">
                      {/* Section label row */}
                      <div className="flex items-center justify-between gap-2 px-0.5 h-5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted-foreground text-background"
                          }`}>
                            {abbrev}
                          </span>
                          <span className={`text-[11px] font-semibold ${
                            isActive ? "text-primary" : "text-muted-foreground"
                          }`}>
                            {slide.sectionLabel}
                          </span>
                        </div>
                        {isActive && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/[0.18] text-primary leading-none">
                            LIVE
                          </span>
                        )}
                      </div>

                      {/* Slide thumbnail — fixed aspect ratio via padding hack */}
                      <button
                        onClick={(e) => {
                          e.currentTarget.blur()
                          sendSlide(selectedSongIdx, i)
                        }}
                        className={`relative w-full overflow-hidden rounded-lg focus:outline-none border-2 transition-colors ${
                          isActive ? "border-primary" : "border-transparent"
                        }`}
                        style={{ outline: isActive ? "none" : "1px solid hsl(var(--border))" }}
                      >
                        <div className="w-full" style={{ paddingBottom: "56.25%" }} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          {bg && slide.sectionType !== "blank" ? (
                            <>
                              <img
                                src={`file://${bg}`}
                                className="absolute inset-0 w-full h-full object-cover"
                                alt=""
                              />
                              <div
                                className="absolute inset-0"
                                style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }}
                              />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-black" />
                          )}

                          <p
                            className="relative z-10 text-center font-bold text-[13px] leading-snug whitespace-pre-wrap px-3"
                            style={{
                              color: effectiveTheme.textColor,
                              fontFamily: effectiveTheme.fontFamily,
                              textShadow: effectiveTheme.textShadowOpacity > 0
                                ? `0 1px 3px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})` : "none",
                            }}
                          >
                            {slide.sectionType === "blank" ? "" : slide.lines.join("\n")}
                          </p>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">Select a song from the lineup</p>
          </div>
        )}
      </div>

      {/* ═════ RIGHT: Live Output Panel (300px) ═════ */}
      <div className="w-[300px] shrink-0 border-l border-border flex flex-col bg-card overflow-hidden">

        {/* Header + ON AIR */}
        <div className="px-4 pt-3 pb-3 border-b border-border">
          <div className="flex justify-between items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold">Live Output</h2>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
              ON AIR
            </span>
          </div>

          {/* Display selector */}
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
            <Cast className="h-4 w-4 text-primary shrink-0" />
            <select
              className="flex-1 bg-transparent text-xs text-foreground font-medium border-none outline-none cursor-pointer min-w-0"
              value={selectedDisplayId ?? ""}
              onChange={(e) => setSelectedDisplayId(Number(e.target.value))}
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}{d.isPrimary ? " (Primary)" : ""} — {d.width}x{d.height}
                </option>
              ))}
            </select>
            <span className="text-[10px] font-bold text-primary shrink-0">ACTIVE</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Live preview */}
          <div className="p-4 border-b border-border">
            <div
              className="relative overflow-hidden rounded-md border border-border bg-black flex items-center justify-center"
              style={{ aspectRatio: "16/9", padding: "16px" }}
            >
              {effectiveBg && currentSlide && !isBlank && (
                <img src={`file://${effectiveBg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
              )}
              {effectiveBg && currentSlide && !isBlank && (
                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }} />
              )}
              {currentSlide && !isBlank ? (
                <span
                  className="relative z-10 text-center font-bold text-xs leading-relaxed whitespace-pre-wrap"
                  style={{
                    color: effectiveTheme.textColor,
                    fontFamily: effectiveTheme.fontFamily,
                    textAlign: effectiveTheme.textAlign,
                    textShadow: `0 1px 4px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})`,
                    width: "100%",
                  }}
                >
                  {currentSlide.lines.join("\n")}
                </span>
              ) : (
                <div className="relative z-10 flex items-center justify-center h-full">
                  {isBlank ? (
                    <MonitorOff className="h-5 w-5 text-gray-700" />
                  ) : (
                    <p className="text-xs text-gray-600">No slide active</p>
                  )}
                </div>
              )}
            </div>

            {/* Info row */}
            <div className="flex justify-between items-center mt-2 text-[11px] text-muted-foreground font-medium">
              <span>
                {selectedDisplay ? `${selectedDisplay.width} × ${selectedDisplay.height}` : "—"}
              </span>
              <span>
                {activeSlideIdx >= 0 ? `Slide ${activeSlideIdx + 1} / ${totalSlides}` : "—"}
              </span>
            </div>

            {/* Prev / Next */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={goPrevSlide}
                disabled={activeSlideIdx <= 0}
                className="flex-1 py-2 bg-background border border-border rounded-md text-xs font-semibold flex items-center justify-center gap-1 hover:bg-accent/40 transition-colors disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={goNextSlide}
                className="flex-1 py-2 bg-background border border-border rounded-md text-xs font-semibold flex items-center justify-center gap-1 hover:bg-accent/40 transition-colors"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-b border-border">
            <h3 className="text-xs font-semibold mb-2.5">Quick Actions</h3>
            <div className="space-y-1.5">
              <QuickAction icon={X} label="Clear All" iconBg="bg-destructive/14" iconColor="text-destructive" onClick={clearAll} />
              <QuickAction icon={Type} label="Clear Text" onClick={clearText} />
              <QuickAction icon={MonitorOff} label="To Black" iconBg="bg-black border border-muted" onClick={toBlack} />
              <QuickAction icon={Hexagon} label="Logo Screen" onClick={showLogo} />
              <QuickAction icon={MonitorOff} label="End Show" iconBg="bg-destructive/14" iconColor="text-destructive" onClick={endShow} />
            </div>
          </div>

          {/* Next Up */}
          {nextUp && (
            <div className="p-4">
              <h3 className="text-xs font-semibold mb-2">
                Next Up:{" "}
                <span className="text-muted-foreground font-medium">
                  {nextUp.songTitle
                    ? `${nextUp.songTitle} — ${nextUp.slide.sectionLabel}`
                    : nextUp.slide.sectionLabel}
                </span>
              </h3>
              <div
                className="relative overflow-hidden rounded-md border border-border bg-black flex items-center justify-center opacity-[0.86]"
                style={{ aspectRatio: "16/9", padding: "12px" }}
              >
                {effectiveBg && nextUp.slide.sectionType !== "blank" && (
                  <>
                    <img src={`file://${effectiveBg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }} />
                  </>
                )}
                <span
                  className="relative z-10 text-center font-bold text-xs leading-relaxed whitespace-pre-wrap"
                  style={{
                    color: effectiveTheme.textColor,
                    fontFamily: effectiveTheme.fontFamily,
                    textAlign: effectiveTheme.textAlign,
                    textShadow: `0 1px 4px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})`,
                    width: "100%",
                  }}
                >
                  {nextUp.slide.lines.join("\n") || " "}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Library modal */}
      {showLibrary && (
        <LibraryModal
          onClose={() => setShowLibrary(false)}
          onAdd={handleLibraryAdd}
          onAddCountdown={addCountdownToLineup}
          excludeIds={liveSongs.filter(s => s.itemType === 'song').map(s => s.songId)}
        />
      )}
    </div>
  )
}

// ── Quick Action Button ──────────────────────────────────────────────────────

function QuickAction({
  icon: Icon, label, iconBg, iconColor, onClick,
}: {
  icon: typeof MonitorOff
  label: string
  iconBg?: string
  iconColor?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 bg-background border border-border rounded-md hover:bg-accent/30 transition-colors text-left"
    >
      <div className={`w-5 h-5 flex items-center justify-center rounded ${iconBg ?? "bg-secondary"}`}>
        <Icon className={`h-3 w-3 ${iconColor ?? "text-foreground"}`} />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

// ── Pre-Live Idle State ──────────────────────────────────────────────────────

function PreLiveIdle({
  serviceLabel, songs, canGoLive, onStartLive,
  displays, selectedDisplayId, onDisplayChange,
}: {
  serviceLabel: string
  songs: LiveSong[]
  canGoLive: boolean
  onStartLive: () => void
  displays: { id: number; label: string; width: number; height: number; isPrimary: boolean }[]
  selectedDisplayId: number | undefined
  onDisplayChange: (id: number) => void
}) {
  const totalSlides = songs.reduce((sum, s) => sum + s.slides.length, 0)

  return (
    <div className="h-full flex flex-col items-center justify-center bg-background text-foreground px-8">
      <div className="w-full max-w-md text-center">
        <div className="h-16 w-16 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-5">
          <MonitorOff className="h-8 w-8 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold mb-2">Ready to go live</h1>
        <p className="text-sm text-muted-foreground mb-1">{serviceLabel}</p>
        <p className="text-xs text-muted-foreground mb-4">
          The projection window is <span className="font-semibold">not open</span>.
          Choose a display and click Go Live.
        </p>

        {/* Display picker */}
        {displays.length > 0 && (
          <div className="flex items-center gap-2 justify-center mb-5">
            <Tv className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              className="bg-input border border-border rounded-md px-3 py-1.5 text-xs text-foreground cursor-pointer"
              value={selectedDisplayId ?? ""}
              onChange={(e) => onDisplayChange(Number(e.target.value))}
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}{d.isPrimary ? " (Primary)" : ""} — {d.width}×{d.height}
                </option>
              ))}
            </select>
          </div>
        )}

        {canGoLive ? (
          <div className="rounded-lg border border-border bg-card p-4 mb-5 flex items-center gap-4 justify-center">
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">{songs.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {songs.length === 1 ? "Song" : "Songs"}
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">{totalSlides}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                Slides
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-5 flex items-center gap-2 justify-center">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-400">
              No songs in this lineup — add some in the Builder first.
            </p>
          </div>
        )}

        <Button
          size="lg"
          className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canGoLive}
          onClick={onStartLive}
        >
          <Play className="h-4 w-4 fill-current" />
          Go Live
        </Button>

        <p className="text-[10px] text-muted-foreground mt-5">
          This will open the projection window on your external display.
        </p>
      </div>
    </div>
  )
}

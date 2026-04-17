import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import {
  MonitorOff, Monitor, ChevronLeft, ChevronRight,
  Music2, GripVertical, Pencil, Plus,
  Play, AlertCircle, XCircle, Type,
  Tv,
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
  const { selectedService, lineup, loadLineup, addSongToLineup } = useServiceStore()

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

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedService) loadLineup(selectedService.id)
    window.worshipsync.window.getDisplays().then((d) => {
      setDisplays(d)
      // Default to first external display, or primary if only one
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
  }, [])

  // ── Build live songs ─────────────────────────────────────────────────────
  useEffect(() => {
    const built: LiveSong[] = lineup.map(item => {
      const selectedIds: number[] = JSON.parse(item.selectedSections || "[]")
      const filtered = selectedIds.length > 0
        ? item.song.sections.filter(s => selectedIds.includes(s.id))
        : item.song.sections
      return {
        lineupItemId: item.id,
        songId: item.song.id,
        title: item.song.title,
        artist: item.song.artist ?? "",
        key: item.song.key ?? null,
        ccliNumber: item.song.ccliNumber ?? null,
        backgroundPath: item.song.backgroundPath ?? null,
        themeId: item.song.themeId ?? null,
        slides: buildSlidesForSong(filtered),
      }
    })
    setLiveSongs(built)
  }, [lineup])

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
  }, [liveSongs, resolveTheme, resolveBg])

  // Reset slide when switching songs
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

  // Find next slide for the "Next Up" preview
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

  if (!selectedService) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <Music2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
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

      {/* ═════ LEFT: Lineup ═════ */}
      <div className="w-48 shrink-0 border-r border-border flex flex-col bg-card">

        {/* Service header */}
        <div className="px-3 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
              <Music2 className="h-3 w-3 text-primary" />
            </div>
            <span className="text-xs font-bold text-foreground truncate flex-1">
              {selectedService.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[10px] text-muted-foreground">
              {new Date(selectedService.date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>
        </div>

        {/* Lineup label */}
        <div className="px-3 py-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Lineup
          </span>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto px-1.5">
          {liveSongs.map((song, i) => {
            const isCurrent = selectedSongIdx === i
            return (
              <button
                key={song.lineupItemId}
                onClick={() => setSelectedSongIdx(i)}
                className={`w-full text-left px-2 py-2 rounded-md mb-0.5 transition-colors group ${
                  isCurrent
                    ? "bg-primary/10 border border-primary/30"
                    : "border border-transparent hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${
                    isCurrent ? "bg-primary/20" : "bg-muted"
                  }`}>
                    <Music2 className={`h-3 w-3 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-medium truncate ${
                      isCurrent ? "text-primary" : "text-foreground"
                    }`}>
                      {song.title}
                    </p>
                    <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                      Song
                      {song.key && ` · Key: ${song.key}`}
                    </p>
                  </div>
                  <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            )
          })}
        </div>

        {/* Add Item */}
        <div className="p-2 border-t border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowLibrary(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Add Item
          </Button>
        </div>
      </div>

      {/* ═════ CENTER: Slide grid ═════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentSong ? (
          <>
            {/* Song header + tabs */}
            <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-base font-bold truncate">{currentSong.title}</h1>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {currentSong.artist || "Unknown artist"}
                    {currentSong.ccliNumber && ` · CCLI: #${currentSong.ccliNumber}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-[11px] shrink-0"
                  onClick={() => {/* Edit lyrics - would require modal integration */}}
                >
                  <Pencil className="h-3 w-3" /> Edit Lyrics
                </Button>
              </div>
            </div>

            {/* Slide grid */}
            <div ref={slideGridRef} className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2.5">
                {currentSong.slides.map((slide, i) => {
                  const isActive = activeSlideIdx === i
                  const bg = resolveBg(currentSong)
                  return (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.currentTarget.blur()
                        sendSlide(selectedSongIdx, i)
                      }}
                      className={`rounded-lg overflow-hidden border-2 transition-all text-left focus:outline-none focus-visible:outline-none ${
                        isActive
                          ? "border-primary ring-2 ring-primary/30 scale-[1.02]"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="relative" style={{ aspectRatio: "16/9" }}>
                        {/* Background */}
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
                          <div className="absolute inset-0 bg-gray-900" />
                        )}

                        {/* Badge */}
                        <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase text-white z-10 ${BADGE_COLORS[slide.sectionType] ?? "bg-slate-600"}`}>
                          {slide.sectionLabel}
                        </span>

                        {/* Lyrics */}
                        <div className="relative z-10 flex items-center justify-center h-full px-2.5 py-2">
                          <p
                            className="text-[10px] text-center leading-relaxed whitespace-pre-wrap"
                            style={{
                              color: effectiveTheme.textColor,
                              fontFamily: effectiveTheme.fontFamily,
                              textShadow: effectiveTheme.textShadowOpacity > 0
                                ? `0 1px 3px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})` : "none",
                            }}
                          >
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
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">Select a song from the lineup</p>
          </div>
        )}
      </div>

      {/* ═════ RIGHT: Live Output ═════ */}
      <div className="w-72 shrink-0 border-l border-border flex flex-col bg-card overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-foreground">Live Output</span>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-green-500/15 text-green-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            On Air
          </span>
        </div>

        {/* Projector display selector */}
        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-muted/40 rounded-md overflow-hidden">
            <div className="flex items-center gap-1.5 pl-2.5 shrink-0">
              <Tv className="h-3 w-3 text-green-500" />
            </div>
            <select
              className="flex-1 bg-transparent text-[10px] text-muted-foreground py-1.5 pr-2 border-none outline-none cursor-pointer"
              value={selectedDisplayId ?? ""}
              onChange={(e) => setSelectedDisplayId(Number(e.target.value))}
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}{d.isPrimary ? " (Primary)" : ""} — {d.width}×{d.height}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live preview */}
        <div
          className="mx-4 rounded-lg overflow-hidden border border-border bg-gray-950 shrink-0 relative"
          style={{ aspectRatio: "16/9" }}
        >
          {effectiveBg && currentSlide && !isBlank && (
            <img src={`file://${effectiveBg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
          )}
          {effectiveBg && currentSlide && !isBlank && (
            <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }} />
          )}
          {currentSlide && !isBlank ? (
            <div className={`relative h-full flex p-3 ${
              effectiveTheme.textPosition === "top" ? "items-start" : effectiveTheme.textPosition === "bottom" ? "items-end" : "items-center"
            } ${
              effectiveTheme.textAlign === "left" ? "justify-start" : effectiveTheme.textAlign === "right" ? "justify-end" : "justify-center"
            }`}>
              <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{
                color: effectiveTheme.textColor,
                fontFamily: effectiveTheme.fontFamily,
                fontWeight: effectiveTheme.fontWeight === "700" ? 700 : effectiveTheme.fontWeight === "600" ? 600 : 400,
                textAlign: effectiveTheme.textAlign,
                textShadow: effectiveTheme.textShadowOpacity > 0
                  ? `0 2px 4px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})` : "none",
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
        </div>

        {/* Slide info */}
        <div className="px-4 pt-2 pb-1 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
          <span>
            {activeSlideIdx >= 0 ? `Slide ${activeSlideIdx + 1} / ${totalSlides}` : "—"}
          </span>
        </div>

        {/* Prev / Next */}
        <div className="px-4 pb-3 flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1 h-8 text-xs"
            onClick={goPrevSlide}
            disabled={activeSlideIdx <= 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1 h-8 text-xs"
            onClick={goNextSlide}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="border-t border-border px-4 py-3 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
            Quick Actions
          </span>
          <div className="space-y-1">
            <QuickAction icon={XCircle} label="Clear All" tone="red" onClick={clearAll} />
            <QuickAction icon={Type} label="Clear Text" onClick={clearText} />
            <QuickAction icon={MonitorOff} label="To Black" onClick={toBlack} />
            <QuickAction icon={Monitor} label="Logo Screen" onClick={showLogo} />
          </div>
        </div>

        {/* Next Up */}
        {nextUp && (
          <div className="border-t border-border px-4 py-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
              Next Up: <span className="text-foreground">
                {nextUp.songTitle
                  ? `${nextUp.songTitle} — ${nextUp.slide.sectionLabel}`
                  : nextUp.slide.sectionLabel}
              </span>
            </span>
            <div
              className="rounded-md overflow-hidden border border-border bg-gray-950 relative"
              style={{ aspectRatio: "16/9" }}
            >
              {effectiveBg && nextUp.slide.sectionType !== "blank" && (
                <>
                  <img src={`file://${effectiveBg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
                  <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }} />
                </>
              )}
              <div className="relative h-full flex items-center justify-center p-2">
                <p
                  className="text-[9px] text-center leading-relaxed whitespace-pre-wrap"
                  style={{
                    color: effectiveTheme.textColor,
                    fontFamily: effectiveTheme.fontFamily,
                    textShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  }}
                >
                  {nextUp.slide.lines.join("\n") || " "}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* End Show */}
        <div className="mt-auto p-3 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={endShow}
          >
            <MonitorOff className="h-3.5 w-3.5" /> End Show
          </Button>
        </div>
      </div>

      {/* Library modal */}
      {showLibrary && (
        <LibraryModal
          onClose={() => setShowLibrary(false)}
          onAdd={handleLibraryAdd}
          excludeIds={liveSongs.map(s => s.songId)}
        />
      )}
    </div>
  )
}

// ── Quick Action Button ──────────────────────────────────────────────────────

function QuickAction({
  icon: Icon, label, tone, onClick,
}: {
  icon: typeof MonitorOff
  label: string
  tone?: "red"
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-foreground hover:bg-accent/50 transition-colors text-left"
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone === "red" ? "text-destructive" : "text-muted-foreground"}`} />
      <span>{label}</span>
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
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-5">
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
              className="bg-card border border-border rounded-md px-3 py-1.5 text-xs text-foreground cursor-pointer"
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
          className="gap-2 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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

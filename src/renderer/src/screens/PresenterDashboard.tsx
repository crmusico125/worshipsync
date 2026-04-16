import { useEffect, useState, useCallback, useRef } from "react"
import {
  MonitorOff, Monitor, Radio, SkipForward, Clock,
  Music2, Lock, ChevronDown, ChevronUp, Settings2, Image as ImageIcon, Type,
  Play, AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useServiceStore } from "../store/useServiceStore"

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
  // Append blank slide at end
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
  const { selectedService, lineup, loadLineup } = useServiceStore()

  const [liveSongs, setLiveSongs] = useState<LiveSong[]>([])
  const [selectedSongIdx, setSelectedSongIdx] = useState(0)
  const [activeSlideIdx, setActiveSlideIdx] = useState(-1)
  const [isBlank, setIsBlank] = useState(false)
  const [themeCache, setThemeCache] = useState<Record<number, any>>({})
  const [defaultTheme, setDefaultTheme] = useState<any>(null)
  const [defaultThemeBg, setDefaultThemeBg] = useState<string | null>(null)
  const [bgImages, setBgImages] = useState<string[]>([])
  const [themeOverrides, setThemeOverrides] = useState<Partial<ThemeStyle>>({})
  const [bgOverride, setBgOverride] = useState<string | null | undefined>(undefined)
  const [showAppearance, setShowAppearance] = useState(false)
  const [appearanceTab, setAppearanceTab] = useState<"text" | "bg">("text")
  const slideGridRef = useRef<HTMLDivElement>(null)

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
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

  // Re-send current slide when overrides change
  useEffect(() => {
    if (activeSlideIdx >= 0 && !isBlank) {
      sendSlide(selectedSongIdx, activeSlideIdx)
    }
  }, [themeOverrides, bgOverride])

  // Reset slide when switching songs
  useEffect(() => {
    setActiveSlideIdx(-1)
    setThemeOverrides({})
    setBgOverride(undefined)
  }, [selectedSongIdx])

  // ── Controls ─────────────────────────────────────────────────────────────
  const blank = () => { window.worshipsync.slide.blank(true); setIsBlank(true) }
  const showLogo = () => { window.worshipsync.slide.logo(true); setIsBlank(false) }

  const goNextSong = () => {
    const next = selectedSongIdx + 1
    if (next < liveSongs.length) setSelectedSongIdx(next)
  }

  const startLive = () => {
    window.worshipsync.window.openProjection()
    onProjectionChange(true)
  }

  const endShow = () => {
    window.worshipsync.slide.blank(true)
    window.worshipsync.window.closeProjection()
    onProjectionChange(false)
    onExitLive()
  }

  // ── Keyboard nav ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
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
        e.preventDefault()
        blank()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [liveSongs, selectedSongIdx, activeSlideIdx, sendSlide])

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentSong = liveSongs[selectedSongIdx] ?? null
  const currentSlide = currentSong?.slides[activeSlideIdx] ?? null
  const nextSong = liveSongs[selectedSongIdx + 1] ?? null
  const effectiveTheme = currentSong ? resolveTheme(currentSong) : DEFAULT_THEME
  const effectiveBg = currentSong ? resolveBg(currentSong) : undefined

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

  // ── Pre-live idle state: projection not open yet ─────────────────────────
  if (!projectionOpen) {
    return (
      <PreLiveIdle
        serviceLabel={selectedService.label}
        songs={liveSongs}
        canGoLive={liveSongs.length > 0}
        onStartLive={startLive}
      />
    )
  }

  return (
    <div className="h-full flex overflow-hidden bg-background text-foreground ring-2 ring-red-500/60 ring-inset">

      {/* ═════ LEFT SIDEBAR: Locked song order ═════ */}
      <div className="w-56 shrink-0 border-r border-red-500/30 flex flex-col bg-card">

        {/* Live badge */}
        <div className="px-3 py-2.5 border-b border-red-500/30 bg-red-500/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Live</span>
            <Lock className="h-3 w-3 text-red-400/70 ml-auto" />
          </div>
          <p className="text-[10px] text-red-400/70 mt-1 truncate">
            {selectedService.label}
          </p>
        </div>

        <div className="px-4 py-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Song Order
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {liveSongs.map((song, i) => {
            const isCurrent = selectedSongIdx === i
            const isNext = selectedSongIdx + 1 === i
            return (
              <button
                key={song.lineupItemId}
                onClick={() => setSelectedSongIdx(i)}
                className={`w-full text-left px-2.5 py-2 rounded-md mb-0.5 transition-colors ${
                  isCurrent ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : isNext ? "bg-accent/80 border border-border"
                  : "text-foreground hover:bg-accent border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{song.title}</p>
                    <p className={`text-[10px] truncate mt-0.5 ${
                      isCurrent ? "text-red-300/60" : "text-muted-foreground"
                    }`}>
                      {song.artist || "Unknown"}
                      {song.key && ` · ${song.key}`}
                    </p>
                  </div>
                  {isNext && (
                    <span className="text-[9px] font-bold uppercase text-muted-foreground">Next</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-red-500/20 shrink-0 space-y-1.5">
          {nextSong && (
            <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={goNextSong}>
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
        </div>
      </div>

      {/* ═════ CENTER: Slide grid ═════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentSong ? (
          <>
            {/* Song header */}
            <div className="px-6 pt-5 pb-3 border-b border-red-500/20 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold truncate">{currentSong.title}</h1>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {currentSong.artist || "Unknown artist"}
                    {currentSong.ccliNumber && ` · CCLI: ${currentSong.ccliNumber}`}
                    {currentSong.key && ` · Key: ${currentSong.key}`}
                  </p>
                </div>
                <span className="shrink-0 flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-md">
                  <Radio className="h-3 w-3 animate-pulse" /> Broadcasting
                </span>
              </div>
            </div>

            {/* Control bar */}
            <div className="flex items-center gap-2 px-6 py-2.5 border-b border-red-500/20 shrink-0">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={blank}>
                <MonitorOff className="h-3 w-3 mr-1.5" /> Blank (B)
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={showLogo}>
                <Monitor className="h-3 w-3 mr-1.5" /> Logo
              </Button>
              <span className="ml-auto text-[10px] text-muted-foreground">
                ← → navigate · Space next · B blank
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
                      onClick={() => sendSlide(selectedSongIdx, i)}
                      className={`rounded-lg overflow-hidden border-2 transition-all text-left ${
                        isActive
                          ? "border-red-500 ring-2 ring-red-500/30 scale-[1.02]"
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
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">No song selected</p>
          </div>
        )}
      </div>

      {/* ═════ RIGHT: Live preview + controls ═════ */}
      <div className="w-72 shrink-0 border-l border-red-500/30 flex flex-col bg-card overflow-hidden">

        {/* Live output preview */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Live Output
            </span>
          </div>
        </div>

        <div
          className="mx-4 mb-3 rounded-lg overflow-hidden border border-red-500/40 bg-gray-950 shrink-0 relative"
          style={{ aspectRatio: "16/9" }}
        >
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

        {/* Clock */}
        <div className="px-4 py-3 border-t border-red-500/20 shrink-0">
          <LiveClock />
        </div>

        {/* Up next */}
        {nextSong && (
          <div className="px-4 py-3 border-t border-red-500/20 shrink-0">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Up Next</h4>
            <div className="rounded-md border border-border p-2.5 bg-accent/50">
              <p className="text-xs font-medium truncate">{nextSong.title}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {nextSong.artist || "Unknown"}
                {nextSong.key && ` · ${nextSong.key}`}
                {` · ${nextSong.slides.length} slides`}
              </p>
            </div>
          </div>
        )}

        {/* Appearance (collapsible) */}
        <div className="border-t border-red-500/20 flex-1 flex flex-col min-h-0">
          <button
            onClick={() => setShowAppearance(v => !v)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-accent/50 transition-colors shrink-0"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Adjust Appearance
              </span>
            </div>
            {showAppearance ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {showAppearance && (
            <div className="flex flex-col flex-1 min-h-0 border-t border-border">
              <div className="flex border-b border-border shrink-0">
                <button
                  onClick={() => setAppearanceTab("text")}
                  className={`flex-1 gap-1.5 px-2 py-2 text-[10px] font-medium flex items-center justify-center border-b-2 transition-colors ${
                    appearanceTab === "text" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Type className="h-3 w-3" /> Text
                </button>
                <button
                  onClick={() => setAppearanceTab("bg")}
                  className={`flex-1 gap-1.5 px-2 py-2 text-[10px] font-medium flex items-center justify-center border-b-2 transition-colors ${
                    appearanceTab === "bg" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ImageIcon className="h-3 w-3" /> Background
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {appearanceTab === "text" ? (
                  <TextAdjust theme={effectiveTheme} onChange={(k, v) => setThemeOverrides(p => ({ ...p, [k]: v }))} />
                ) : (
                  <BgAdjust
                    currentBg={effectiveBg ?? null}
                    bgImages={bgImages}
                    onChange={setBgOverride}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pre-Live Idle State ─────────────────────────────────────────────────────

function PreLiveIdle({
  serviceLabel, songs, canGoLive, onStartLive,
}: {
  serviceLabel: string
  songs: LiveSong[]
  canGoLive: boolean
  onStartLive: () => void
}) {
  const totalSlides = songs.reduce((sum, s) => sum + s.slides.length, 0)

  return (
    <div className="h-full flex flex-col items-center justify-center bg-background text-foreground px-8">
      <div className="w-full max-w-md text-center">
        {/* Status icon */}
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-5">
          <MonitorOff className="h-8 w-8 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold mb-2">Ready to go live</h1>
        <p className="text-sm text-muted-foreground mb-1">
          {serviceLabel}
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          The projection window is <span className="font-semibold">not open</span>.
          Click below to start broadcasting.
        </p>

        {/* Stats */}
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

        {/* Go Live button */}
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

// ── Inline appearance controls ──────────────────────────────────────────────

const COLOR_SWATCHES = ["#ffffff", "#f5a623", "#4d8ef0", "#3ecf8e", "#f05252", "#9b59b6"]

function TextAdjust({ theme, onChange }: {
  theme: ThemeStyle
  onChange: (k: keyof ThemeStyle, v: any) => void
}) {
  return (
    <div className="p-3 space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Color</label>
        <div className="flex gap-1.5">
          {COLOR_SWATCHES.map(color => (
            <button
              key={color}
              onClick={() => onChange("textColor", color)}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                theme.textColor === color ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
              style={{ background: color }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Size</label>
        <Input
          className="h-7 text-xs"
          value={theme.fontSize}
          type="number"
          min={12} max={120}
          onChange={e => onChange("fontSize", Number(e.target.value) || 48)}
        />
      </div>
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Overlay</label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="flex-1 h-1 accent-primary"
            min={0} max={100} step={5}
            value={theme.overlayOpacity}
            onChange={e => onChange("overlayOpacity", Number(e.target.value))}
          />
          <span className="text-[10px] text-muted-foreground w-8 text-right">{theme.overlayOpacity}%</span>
        </div>
      </div>
    </div>
  )
}

function BgAdjust({ currentBg, bgImages, onChange }: {
  currentBg: string | null
  bgImages: string[]
  onChange: (path: string | null) => void
}) {
  return (
    <div className="p-3">
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => onChange(null)}
          className={`rounded-md border aspect-video flex items-center justify-center text-[9px] text-muted-foreground transition-colors ${
            !currentBg ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
          }`}
        >
          None
        </button>
        {bgImages.map((img, i) => (
          <button
            key={i}
            onClick={() => onChange(img)}
            className={`rounded-md overflow-hidden border-2 aspect-video bg-gray-800 transition-all ${
              currentBg === img ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
            }`}
          >
            <img src={`file://${img}`} className="w-full h-full object-cover" alt="" />
          </button>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState, useMemo } from "react"
import {
  Plus, BookOpen, ChevronUp, ChevronDown, Trash2, Pencil,
  Radio, Eye, Music2, Calendar, Image as ImageIcon,
  Type, Palette, Monitor, Timer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { useServiceStore } from "../store/useServiceStore"
import { useSongStore } from "../store/useSongStore"
import LibraryModal from "../components/LibraryModal"
import AddSongModal from "../components/AddSongModal"
import EditLyricsModal from "../components/EditLyricsModal"

// ── Types ────────────────────────────────────────────────────────────────────

interface Slide {
  lines: string[]
  sectionLabel: string
  sectionType: string
  sectionId: number
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

const SECTION_BADGE_COLORS: Record<string, string> = {
  verse: "bg-green-600",
  chorus: "bg-blue-600",
  bridge: "bg-amber-600",
  "pre-chorus": "bg-violet-600",
  intro: "bg-slate-600",
  outro: "bg-slate-600",
  tag: "bg-red-600",
  interlude: "bg-slate-600",
}

function buildSlides(
  sections: { id: number; type: string; label: string; lyrics: string }[],
  selectedIds: number[],
  maxLines = 2,
): Slide[] {
  const slides: Slide[] = []
  const filtered = selectedIds.length > 0
    ? sections.filter(s => selectedIds.includes(s.id))
    : sections
  for (const sec of filtered) {
    const lines = sec.lyrics.split("\n").filter(l => l.trim())
    if (lines.length === 0) continue
    for (let i = 0; i < lines.length; i += maxLines) {
      slides.push({
        lines: lines.slice(i, i + maxLines),
        sectionLabel: sec.label,
        sectionType: sec.type,
        sectionId: sec.id,
      })
    }
  }
  return slides
}

function sectionsToLyrics(sections: { label: string; lyrics: string }[]): string {
  return sections.map(s => `[${s.label}]\n${s.lyrics}`).join("\n\n")
}

// ── Main Screen ──────────────────────────────────────────────────────────────

interface Props {
  serviceId: number | null
  onGoLive: () => void
}

export default function BuilderScreen({ serviceId, onGoLive }: Props) {
  const {
    selectedService, lineup, loadLineup, addSongToLineup, addCountdownToLineup,
    removeSongFromLineup, toggleSection, loadServices, selectService,
    services, reorderLineup, updateStatus,
  } = useServiceStore()
  const { loadSongs } = useSongStore()

  const [showLibrary, setShowLibrary] = useState(false)
  const [showAddSong, setShowAddSong] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [selectedSongIdx, setSelectedSongIdx] = useState(0)
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0)

  // Theme data
  const [themeCache, setThemeCache] = useState<Record<number, any>>({})
  const [defaultTheme, setDefaultTheme] = useState<any>(null)
  const [defaultThemeBg, setDefaultThemeBg] = useState<string | null>(null)
  const [bgImages, setBgImages] = useState<string[]>([])
  const [themeOverrides, setThemeOverrides] = useState<Partial<ThemeStyle>>({})
  const [bgOverride, setBgOverride] = useState<string | null | undefined>(undefined)

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadSongs()
    loadServices()
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

  useEffect(() => {
    if (serviceId && services.length > 0) {
      const service = services.find(s => s.id === serviceId)
      if (service) selectService(service)
    }
  }, [serviceId, services])

  // Reset selection when switching songs
  useEffect(() => {
    setPreviewSlideIdx(0)
    setThemeOverrides({})
    setBgOverride(undefined)
  }, [selectedSongIdx])

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentItem = lineup[selectedSongIdx] ?? null
  const currentSong = currentItem?.song ?? null
  const selectedSectionIds: number[] = useMemo(
    () => currentItem ? JSON.parse(currentItem.selectedSections || "[]") : [],
    [currentItem],
  )
  const effectiveTheme: ThemeStyle = useMemo(() => {
    const t = (currentSong?.themeId ? themeCache[currentSong.themeId] : null) ?? defaultTheme
    let base = DEFAULT_THEME
    if (t?.settings) {
      try { base = { ...DEFAULT_THEME, ...JSON.parse(t.settings) } } catch {}
    }
    return { ...base, ...themeOverrides }
  }, [currentSong, themeCache, defaultTheme, themeOverrides])

  const slides = useMemo(
    () => currentSong ? buildSlides(currentSong.sections, selectedSectionIds, effectiveTheme.maxLinesPerSlide) : [],
    [currentSong, selectedSectionIds, effectiveTheme.maxLinesPerSlide],
  )
  const currentSlide = slides[previewSlideIdx] ?? null

  const effectiveBg: string | null = useMemo(() => {
    if (bgOverride !== undefined) return bgOverride
    if (currentSong?.backgroundPath) return currentSong.backgroundPath
    if (currentSong?.themeId && themeCache[currentSong.themeId]) {
      try { return JSON.parse(themeCache[currentSong.themeId].settings).backgroundPath ?? null } catch {}
    }
    return defaultThemeBg
  }, [currentSong, themeCache, defaultThemeBg, bgOverride])

  // ── Actions ──────────────────────────────────────────────────────────────
  const moveUp = async (i: number) => {
    if (i === 0) return
    const ids = lineup.map(l => l.id)
    ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
    await reorderLineup(ids)
    if (selectedSongIdx === i) setSelectedSongIdx(i - 1)
  }

  const moveDown = async (i: number) => {
    if (i === lineup.length - 1) return
    const ids = lineup.map(l => l.id)
    ;[ids[i], ids[i + 1]] = [ids[i + 1], ids[i]]
    await reorderLineup(ids)
    if (selectedSongIdx === i) setSelectedSongIdx(i + 1)
  }

  const handleCreated = async (songId: number) => {
    await loadSongs()
    await addSongToLineup(songId)
  }

  const handleLibraryAdd = async (songIds: number[]) => {
    for (const id of songIds) await addSongToLineup(id)
  }

  const handleLyricsSave = async (newLyrics: string) => {
    if (!currentSong) return
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
      parsed.push({
        type: currentType, label: currentLabel,
        lyrics: currentLines.join("\n").trimEnd(), orderIndex: idx++,
      })
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
      await window.worshipsync.songs.upsertSections(currentSong.id, parsed)
      if (selectedService) await loadLineup(selectedService.id)
    }
  }

  const markReady = async () => {
    if (!selectedService) return
    await updateStatus(selectedService.id, "ready")
  }

  // Empty selectedSections = "all included by default". When user unchecks a
  // section for the first time, materialize the selection by adding all other
  // IDs so the backend state matches the user's intent.
  const handleSectionToggle = async (sectionId: number, shouldBeIncluded: boolean) => {
    if (!currentItem || !currentSong) return
    if (selectedSectionIds.length === 0 && !shouldBeIncluded) {
      for (const sec of currentSong.sections) {
        if (sec.id !== sectionId) {
          await toggleSection(currentItem.id, sec.id, true)
        }
      }
    } else {
      await toggleSection(currentItem.id, sectionId, shouldBeIncluded)
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!selectedService) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-2">No service selected</p>
          <p className="text-xs text-muted-foreground">Go to Planner and pick a service to prepare</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background text-foreground">

      {/* ── Top bar: service info + actions ──────────────────────────── */}
      <div className="h-14 border-b border-border flex items-center px-5 shrink-0 gap-4">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-foreground truncate">
            {selectedService.label}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(selectedService.date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
            })}
            {" · "}
            {lineup.length} {lineup.length === 1 ? "song" : "songs"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selectedService.status !== "ready" && lineup.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={markReady}>
              Mark as ready
            </Button>
          )}
          {selectedService.status === "ready" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-500 px-2 py-1 rounded-md bg-green-500/10">
              Ready
            </span>
          )}
          <Button
            size="sm"
            className="gap-1.5 h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
            disabled={lineup.length === 0}
            onClick={onGoLive}
          >
            <Radio className="h-3.5 w-3.5" /> Go Live
          </Button>
        </div>
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── LEFT: Lineup ──────────────────────────────────────────── */}
        <div className="w-64 shrink-0 border-r border-border flex flex-col bg-card">
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Lineup
            </span>
            <span className="text-[10px] text-muted-foreground">
              {lineup.length} {lineup.length === 1 ? "song" : "songs"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            {lineup.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Music2 className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-xs font-medium text-foreground mb-1">Empty lineup</p>
                <p className="text-[10px] text-muted-foreground mb-4">
                  Add songs from your library or create new ones.
                </p>
              </div>
            ) : (
              lineup.map((item, i) => {
                const isSelected = selectedSongIdx === i
                const isCountdown = item.itemType === 'countdown'
                let slideCount = 0
                if (!isCountdown && item.song) {
                  const itemSelectedIds: number[] = JSON.parse(item.selectedSections || "[]")
                  let itemMaxLines = DEFAULT_THEME.maxLinesPerSlide
                  if (item.song.themeId && themeCache[item.song.themeId]?.settings) {
                    try { itemMaxLines = JSON.parse(themeCache[item.song.themeId].settings).maxLinesPerSlide ?? itemMaxLines } catch {}
                  }
                  slideCount = buildSlides(item.song.sections, itemSelectedIds, itemMaxLines).length
                }
                return (
                  <div
                    key={item.id}
                    className={`group rounded-md mb-0.5 transition-colors ${
                      isSelected ? "bg-primary/10 border border-primary/30" : "border border-transparent hover:bg-accent/50"
                    }`}
                  >
                    <button
                      onClick={() => setSelectedSongIdx(i)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
                    >
                      <span className={`text-[10px] font-mono w-4 shrink-0 ${
                        isSelected ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-medium truncate ${
                          isSelected ? "text-primary" : "text-foreground"
                        }`}>
                          {isCountdown ? "Countdown Timer" : item.song?.title ?? "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {isCountdown
                            ? "Pre-Service Countdown"
                            : `${item.song?.artist || "Unknown"}${item.song?.key ? ` · ${item.song.key}` : ""} · ${slideCount} slides`
                          }
                        </p>
                      </div>
                    </button>
                    {isSelected && (
                      <div className="flex items-center gap-0.5 px-2 pb-1.5">
                        <Button
                          variant="ghost" size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={i === 0}
                          onClick={(e) => { e.stopPropagation(); moveUp(i) }}
                          title="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={i === lineup.length - 1}
                          onClick={(e) => { e.stopPropagation(); moveDown(i) }}
                          title="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <div className="flex-1" />
                        <Button
                          variant="ghost" size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            const label = isCountdown ? "Countdown Timer" : item.song?.title ?? "item"
                            if (confirm(`Remove "${label}" from lineup?`)) {
                              removeSongFromLineup(item.id)
                              if (selectedSongIdx >= lineup.length - 1) {
                                setSelectedSongIdx(Math.max(0, lineup.length - 2))
                              }
                            }
                          }}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="p-3 border-t border-border shrink-0 space-y-1.5">
            <Button
              variant="outline" size="sm"
              className="w-full gap-1.5 h-8 text-xs"
              onClick={() => setShowLibrary(true)}
            >
              <BookOpen className="h-3.5 w-3.5" /> Add from Library
            </Button>
            <Button
              variant="ghost" size="sm"
              className="w-full gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAddSong(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Create new song
            </Button>
          </div>
        </div>

        {/* ─── CENTER: Song editor + sections ────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {currentItem?.itemType === 'countdown' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <Timer className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-base font-bold mb-1">Countdown Timer</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                This countdown will count down to the service start time.
                Configure the start time and timezone in Settings.
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                The countdown must be started manually in the Presenter screen to avoid accidental projection.
              </p>
            </div>
          ) : currentSong ? (
            <>
              {/* Song header */}
              <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-foreground truncate">
                      {currentSong.title}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {currentSong.artist || "Unknown artist"}
                      {currentSong.ccliNumber && ` · CCLI: ${currentSong.ccliNumber}`}
                      {currentSong.key && ` · Key: ${currentSong.key}`}
                    </p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    className="gap-1.5 h-8 text-xs shrink-0"
                    onClick={() => setEditingItemId(currentItem!.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit Lyrics
                  </Button>
                </div>
              </div>

              {/* Section toggles + slide grid */}
              <div className="flex-1 overflow-y-auto">
                {currentSong.sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8">
                    <Pencil className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">No lyrics yet</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Add lyrics and sections to this song to build slides.
                    </p>
                    <Button size="sm" className="gap-1.5" onClick={() => setEditingItemId(currentItem!.id)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit Lyrics
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Sections — what to include */}
                    <div className="px-6 py-4 border-b border-border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Sections
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {selectedSectionIds.length || currentSong.sections.length} of {currentSong.sections.length} included
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {currentSong.sections.map(sec => {
                          // No selection = all included (legacy). Empty array explicitly stores selection.
                          const included = selectedSectionIds.length === 0
                            ? true
                            : selectedSectionIds.includes(sec.id)
                          return (
                            <label
                              key={sec.id}
                              className={`flex items-start gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                                included ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/50"
                              }`}
                              onClick={(e) => {
                                // prevent double-toggle from checkbox
                                if ((e.target as HTMLElement).tagName === "BUTTON") return
                              }}
                            >
                              <Checkbox
                                checked={included}
                                onCheckedChange={(checked) => {
                                  handleSectionToggle(sec.id, checked === true)
                                }}
                                className="mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white ${SECTION_BADGE_COLORS[sec.type] ?? "bg-slate-600"}`}>
                                    {sec.label}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {sec.lyrics.split("\n")[0] || "(empty)"}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    {/* Slide grid preview */}
                    <div className="px-6 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Slides ({slides.length})
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Click to preview on right
                        </span>
                      </div>
                      {slides.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">
                          No slides — enable some sections above to generate slides.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2.5">
                          {slides.map((slide, i) => {
                            const isPreview = previewSlideIdx === i
                            return (
                              <button
                                key={i}
                                onClick={() => setPreviewSlideIdx(i)}
                                className={`rounded-lg overflow-hidden border-2 transition-all text-left ${
                                  isPreview
                                    ? "border-primary ring-2 ring-primary/30"
                                    : "border-border hover:border-primary/50"
                                }`}
                              >
                                <div className="bg-gray-900 p-2.5 relative" style={{ aspectRatio: "16/9" }}>
                                  <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase text-white ${SECTION_BADGE_COLORS[slide.sectionType] ?? "bg-slate-600"}`}>
                                    {slide.sectionLabel}
                                  </span>
                                  <div className="flex items-center justify-center h-full px-1">
                                    <p className="text-[10px] text-white text-center leading-relaxed whitespace-pre-wrap">
                                      {slide.lines.join("\n") || " "}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <Music2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-base font-bold mb-1">Pick a song to edit</h2>
              <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                Select a song from the lineup on the left, or add songs from your library.
              </p>
              <Button size="sm" className="gap-1.5" onClick={() => setShowLibrary(true)}>
                <BookOpen className="h-3.5 w-3.5" /> Browse Library
              </Button>
            </div>
          )}
        </div>

        {/* ─── RIGHT: Preview + Appearance ───────────────────────────── */}
        <div className="w-80 shrink-0 border-l border-border flex flex-col bg-card overflow-hidden">
          <AppearancePanel
            slide={currentSlide}
            theme={effectiveTheme}
            bg={effectiveBg}
            bgImages={bgImages}
            canCustomize={!!currentSong}
            onThemeChange={(key, value) => setThemeOverrides(p => ({ ...p, [key]: value }))}
            onBgChange={(path) => setBgOverride(path)}
          />
        </div>

      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showLibrary && (
        <LibraryModal
          onClose={() => setShowLibrary(false)}
          onAdd={handleLibraryAdd}
          onAddCountdown={addCountdownToLineup}
          excludeIds={lineup.filter(item => item.songId != null).map(item => item.songId!)}
        />
      )}
      {showAddSong && (
        <AddSongModal
          onClose={() => setShowAddSong(false)}
          onCreated={handleCreated}
        />
      )}
      {editingItemId !== null && currentSong && (
        <EditLyricsModal
          songTitle={currentSong.title}
          artist={currentSong.artist}
          initialLyrics={sectionsToLyrics(currentSong.sections)}
          onClose={() => setEditingItemId(null)}
          onSave={handleLyricsSave}
        />
      )}
    </div>
  )
}

// ── Appearance Panel (Right Sidebar) ────────────────────────────────────────

const FONT_OPTIONS = [
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "Montserrat, sans-serif", label: "Montserrat" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Roboto, sans-serif", label: "Roboto" },
]

const WEIGHT_OPTIONS = [
  { value: "700", label: "Bold" },
  { value: "600", label: "Semi-Bold" },
  { value: "400", label: "Regular" },
]

const COLOR_SWATCHES = ["#ffffff", "#f5a623", "#4d8ef0", "#3ecf8e", "#f05252", "#9b59b6"]

function AppearancePanel({
  slide, theme, bg, bgImages, canCustomize,
  onThemeChange, onBgChange,
}: {
  slide: Slide | null
  theme: ThemeStyle
  bg: string | null
  bgImages: string[]
  canCustomize: boolean
  onThemeChange: (key: keyof ThemeStyle, value: any) => void
  onBgChange: (path: string | null) => void
}) {
  const [tab, setTab] = useState("style")

  return (
    <>
      {/* Preview */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Slide Preview
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Eye className="h-3 w-3" /> Not broadcasting
          </span>
        </div>
        <div
          className="rounded-lg overflow-hidden border border-border bg-gray-950 relative"
          style={{ aspectRatio: "16/9" }}
        >
          {bg && slide && (
            <img src={`file://${bg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
          )}
          {bg && slide && (
            <div
              className="absolute inset-0"
              style={{ background: `rgba(0,0,0,${theme.overlayOpacity / 100})` }}
            />
          )}
          {slide ? (
            <div className={`relative h-full flex p-4 ${
              theme.textPosition === "top" ? "items-start" : theme.textPosition === "bottom" ? "items-end" : "items-center"
            } ${
              theme.textAlign === "left" ? "justify-start" : theme.textAlign === "right" ? "justify-end" : "justify-center"
            }`}>
              <p
                className="text-xs leading-relaxed whitespace-pre-wrap"
                style={{
                  color: theme.textColor,
                  fontFamily: theme.fontFamily,
                  fontWeight: theme.fontWeight === "700" ? 700 : theme.fontWeight === "600" ? 600 : 400,
                  textAlign: theme.textAlign,
                  textShadow: theme.textShadowOpacity > 0
                    ? `0 2px 4px rgba(0,0,0,${theme.textShadowOpacity / 100})` : "none",
                }}
              >
                {slide.lines.join("\n")}
              </p>
            </div>
          ) : (
            <div className="relative h-full flex items-center justify-center">
              <p className="text-[10px] text-gray-600">No slide selected</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
        <div className="px-4 border-b border-border shrink-0">
          <TabsList className="h-auto w-full bg-transparent p-0 gap-0 rounded-none">
            {[
              { value: "style", label: "Text", icon: Type },
              { value: "background", label: "Background", icon: ImageIcon },
              { value: "layout", label: "Layout", icon: Monitor },
            ].map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="flex-1 gap-1.5 rounded-none border-b-2 border-transparent px-2 py-2 text-[10px] font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <t.icon className="h-3 w-3" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!canCustomize ? (
            <div className="p-6 text-center">
              <Palette className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                Select a song to customize its appearance.
              </p>
            </div>
          ) : tab === "style" ? (
            <StyleTab theme={theme} onChange={onThemeChange} />
          ) : tab === "background" ? (
            <BackgroundTab
              currentBg={bg}
              bgImages={bgImages}
              onChange={onBgChange}
            />
          ) : (
            <LayoutTab theme={theme} onChange={onThemeChange} />
          )}
        </div>
      </Tabs>
    </>
  )
}

function StyleTab({ theme, onChange }: {
  theme: ThemeStyle
  onChange: (key: keyof ThemeStyle, value: any) => void
}) {
  const hasShadow = theme.textShadowOpacity > 0

  return (
    <div className="p-4 space-y-5">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Font</label>
        <select
          className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={theme.fontFamily}
          onChange={e => onChange("fontFamily", e.target.value)}
        >
          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Weight</label>
          <select
            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={theme.fontWeight}
            onChange={e => onChange("fontWeight", e.target.value)}
          >
            {WEIGHT_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
        <div className="w-20">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Size</label>
          <Input
            className="h-8 text-xs"
            value={theme.fontSize}
            type="number"
            min={12} max={120}
            onChange={e => onChange("fontSize", Number(e.target.value) || 48)}
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Color</label>
        <div className="flex gap-1.5">
          {COLOR_SWATCHES.map(color => (
            <button
              key={color}
              onClick={() => onChange("textColor", color)}
              className={`h-7 w-7 rounded-full border-2 hover:scale-110 transition-transform ${
                theme.textColor === color ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
              style={{ background: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground">Drop Shadow</span>
        <button
          onClick={() => onChange("textShadowOpacity", hasShadow ? 0 : 40)}
          className={`h-5 w-9 rounded-full relative transition-colors ${hasShadow ? "bg-primary" : "bg-muted"}`}
        >
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${hasShadow ? "right-0.5" : "left-0.5"}`} />
        </button>
      </div>
    </div>
  )
}

function BackgroundTab({
  currentBg, bgImages, onChange,
}: {
  currentBg: string | null
  bgImages: string[]
  onChange: (path: string | null) => void
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Background</span>
        <button
          className="text-[10px] text-primary hover:underline"
          onClick={async () => {
            const path = await window.worshipsync.backgrounds.pickImage()
            if (path) onChange(path)
          }}
        >
          Upload Image
        </button>
      </div>

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

function LayoutTab({ theme, onChange }: {
  theme: ThemeStyle
  onChange: (key: keyof ThemeStyle, value: any) => void
}) {
  return (
    <div className="p-4 space-y-5">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Alignment</label>
        <div className="flex gap-1.5">
          {(["left", "center", "right"] as const).map(align => (
            <button
              key={align}
              onClick={() => onChange("textAlign", align)}
              className={`flex-1 h-8 rounded-md border flex items-center justify-center text-xs transition-colors ${
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

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Position</label>
        <div className="flex gap-1.5">
          {(["top", "middle", "bottom"] as const).map(pos => (
            <button
              key={pos}
              onClick={() => onChange("textPosition", pos)}
              className={`flex-1 h-8 rounded-md border text-xs capitalize transition-colors ${
                theme.textPosition === pos
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-input text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
          Overlay Opacity
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="flex-1 h-1 accent-primary"
            min={0} max={100} step={5}
            value={theme.overlayOpacity}
            onChange={e => onChange("overlayOpacity", Number(e.target.value))}
          />
          <span className="text-xs text-muted-foreground w-10 text-right">{theme.overlayOpacity}%</span>
        </div>
      </div>
    </div>
  )
}

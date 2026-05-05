import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Search, Music2, Timer, Upload, Trash2, Check, Image as ImageIcon, Play, Volume2, Calendar } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import ScriptureBrowser, { type ScriptureVerse } from "./ScriptureBrowser"

interface SongRow {
  id: number
  title: string
  artist: string
  key: string | null
  ccliNumber: string | null
}

interface SongDetail extends SongRow {
  sections: { id: number; type: string; label: string; lyrics: string; orderIndex: number }[]
}

const SECTION_COLORS: Record<string, string> = {
  verse: "text-blue-600",
  chorus: "text-green-600",
  bridge: "text-amber-600",
  "pre-chorus": "text-violet-600",
  intro: "text-slate-500",
  outro: "text-slate-500",
  tag: "text-red-500",
  interlude: "text-slate-500",
}

interface Props {
  onClose: () => void
  onAdd: (songIds: number[]) => void
  onAddCountdown?: () => void
  onAddScripture?: (title: string, verses: ScriptureVerse[], ref: { book: string; chapter: number; translation: string }) => void
  onAddMedia?: (path: string) => void
  excludeIds?: number[]
}

export default function LibraryModal({ onClose, onAdd, onAddCountdown, onAddScripture, onAddMedia, excludeIds = [] }: Props) {
  const [tab, setTab] = useState("songs")
  const [songs, setSongs] = useState<SongRow[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SongDetail | null>(null)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Initial load
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const all = await window.worshipsync.songs.getAll()
      setSongs((all as SongRow[]).filter((s) => !excludeIds.includes(s.id) && s.artist !== "Scripture" && s.artist !== "Media"))
      setLoading(false)
    })()
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      const result = search.trim()
        ? await window.worshipsync.songs.search(search)
        : await window.worshipsync.songs.getAll()
      setSongs((result as SongRow[]).filter((s) => !excludeIds.includes(s.id) && s.artist !== "Scripture" && s.artist !== "Media"))
      setLoading(false)
    }, 150)
    return () => clearTimeout(timer)
  }, [search])

  // Load detail on preview change
  useEffect(() => {
    if (!previewId) { setDetail(null); return }
    window.worshipsync.songs.getById(previewId).then((s) => setDetail(s as SongDetail))
  }, [previewId])

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleAdd = () => {
    if (selectedIds.length === 0) return
    onAdd(selectedIds)
    onClose()
  }

  // ── Media state ──────────────────────────────────────────────────────────
  const [mediaImages, setMediaImages] = useState<{ path: string; filename: string; usageCount: number }[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaSelected, setMediaSelected] = useState<string | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [mediaUsingSongs,    setMediaUsingSongs]    = useState<{ id: number; title: string; artist: string }[]>([])
  const [mediaUsingServices, setMediaUsingServices] = useState<{ id: number; date: string; label: string }[]>([])

  const loadMediaImages = useCallback(async () => {
    setMediaLoading(true)
    try {
      const paths: string[] = await window.worshipsync.backgrounds.listImages()
      const items = await Promise.all(
        paths.map(async (p) => ({
          path: p,
          filename: p.split("/").pop() ?? p,
          usageCount: await window.worshipsync.backgrounds.getUsageCount(p),
        }))
      )
      setMediaImages(items)
    } catch { setMediaImages([]) }
    setMediaLoading(false)
  }, [])

  useEffect(() => { if (tab === "media") loadMediaImages() }, [tab, loadMediaImages])

  useEffect(() => {
    if (!mediaSelected) { setMediaUsingSongs([]); setMediaUsingServices([]); return }
    const isMediaFile = /\.(mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i.test(mediaSelected)
    window.worshipsync.backgrounds.getUsingSongs(mediaSelected).then(setMediaUsingSongs).catch(() => setMediaUsingSongs([]))
    if (isMediaFile) {
      window.worshipsync.backgrounds.getUsingServices(mediaSelected).then(setMediaUsingServices).catch(() => setMediaUsingServices([]))
    } else {
      setMediaUsingServices([])
    }
  }, [mediaSelected])

  const filteredMedia = useMemo(() => {
    if (!search.trim()) return mediaImages
    const q = search.toLowerCase()
    return mediaImages.filter((i) => i.filename.toLowerCase().includes(q))
  }, [mediaImages, search])

  const handleMediaUpload = async () => {
    setMediaUploading(true)
    try {
      const path = await window.worshipsync.backgrounds.pickImage()
      if (path) { await loadMediaImages(); setMediaSelected(path) }
    } finally { setMediaUploading(false) }
  }

  const handleMediaDelete = async (item: { path: string; usageCount: number }) => {
    const msg = item.usageCount > 0
      ? `This image is used by ${item.usageCount} song${item.usageCount > 1 ? "s" : ""}. Deleting will remove it from those songs too. Continue?`
      : "Delete this image from the library?"
    if (!confirm(msg)) return
    await window.worshipsync.backgrounds.deleteImage(item.path)
    if (mediaSelected === item.path) setMediaSelected(null)
    await loadMediaImages()
  }

  const selectionLabel =
    selectedIds.length === 0
      ? "No items selected"
      : selectedIds.length === 1
        ? "1 item selected"
        : `${selectedIds.length} items selected`

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl"
        style={{ width: 1100, maxWidth: "95vw", height: 640, maxHeight: "92vh" }}
      >
        <div className="flex flex-col h-full bg-background text-foreground">

          {/* ── Header ─────────────────────────────────────────────── */}
          <DialogHeader className="flex flex-row items-center px-5 pt-4 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex-1 text-base font-semibold">Library</DialogTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>
              ✕
            </Button>
          </DialogHeader>

          {/* ── Search ─────────────────────────────────────────────── */}
          <div className="px-5 py-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus
                className="pl-9"
                placeholder={
                  tab === "scriptures"
                    ? "Type a reference… e.g. John 3:16, Psalm 23, Romans 8:28-39"
                    : tab === "media"
                      ? "Search images by filename..."
                      : "Search songs, scriptures, media..."
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────────────────── */}
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <div className="px-5 border-b border-border shrink-0">
              <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
                {["songs", "scriptures", "media", "presentations", "widgets"].map((t) => (
                  <TabsTrigger
                    key={t}
                    value={t}
                    className="rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none capitalize"
                  >
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Tab content — plain div so flex height works reliably */}
            <div className="flex-1 min-h-0 overflow-hidden flex">
              {tab === "songs" ? (
                <>
                  {/* Song list */}
                  <div className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
                      <div className="p-2">
                        {loading ? (
                          <p className="py-8 text-center text-xs text-muted-foreground">Loading...</p>
                        ) : songs.length === 0 ? (
                          <p className="py-8 text-center text-xs text-muted-foreground">
                            {search ? "No matches" : "No songs in library"}
                          </p>
                        ) : (
                          songs.map((song) => {
                            const isChecked = selectedIds.includes(song.id)
                            const isPreviewed = previewId === song.id
                            return (
                              <div
                                key={song.id}
                                onClick={() => setPreviewId(song.id)}
                                className={`
                                  flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 cursor-pointer transition-colors select-none
                                  ${isChecked
                                    ? "bg-primary/10 border border-primary/20"
                                    : isPreviewed
                                      ? "bg-accent"
                                      : "hover:bg-accent border border-transparent"
                                  }
                                `}
                              >
                                <div className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${isChecked ? "bg-primary/15" : "bg-muted"}`}>
                                  <Music2 className={`h-4 w-4 ${isChecked ? "text-primary" : "text-muted-foreground"}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate ${isChecked ? "text-primary" : "text-foreground"}`}>
                                    {song.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {song.artist || "Unknown"}
                                    {song.key && ` · Key: ${song.key}`}
                                  </p>
                                </div>
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleSelect(song.id)}
                                  onClick={(e) => { e.stopPropagation(); setPreviewId(song.id) }}
                                  className="shrink-0"
                                />
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Song detail */}
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card">
                    {!detail ? (
                      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground bg-card">
                        Select a song to preview
                      </div>
                    ) : (
                      <ScrollArea className="flex-1">
                        <div className="p-6">
                          <h2 className="text-2xl font-bold text-foreground leading-snug mb-1">
                            {detail.title}
                          </h2>
                          <p className="text-sm text-muted-foreground mb-6">
                            {detail.artist || "Unknown artist"}
                            {detail.ccliNumber && ` · CCLI: ${detail.ccliNumber}`}
                            {detail.key && ` · Key: ${detail.key}`}
                          </p>

                          {detail.sections.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No sections added yet</p>
                          ) : (
                            <div className="space-y-5">
                              {detail.sections.map((sec) => (
                                <div key={sec.id}>
                                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${SECTION_COLORS[sec.type] ?? "text-muted-foreground"}`}>
                                    {sec.label}
                                  </p>
                                  <p className="text-sm leading-loose text-secondary-foreground whitespace-pre-wrap">
                                    {sec.lyrics || <span className="italic text-muted-foreground">empty</span>}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </>
              ) : tab === "widgets" ? (
                <div className="flex-1 p-6">
                  <div className="grid grid-cols-2 gap-4 max-w-lg">
                    <button
                      onClick={() => {
                        onAddCountdown?.()
                        onClose()
                      }}
                      className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors cursor-pointer group"
                    >
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Timer className="h-6 w-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Countdown Timer</p>
                        <p className="text-xs text-muted-foreground mt-1">Count down to service start time</p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : tab === "scriptures" ? (
                <ScriptureBrowser
                  search={search}
                  onAddScripture={(title, verses, ref) => {
                    onAddScripture?.(title, verses, ref)
                    onClose()
                  }}
                />
              ) : tab === "media" ? (
                <div className="flex-1 flex min-h-0 overflow-hidden">
                  {/* Media grid */}
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {filteredMedia.length} {filteredMedia.length === 1 ? "file" : "files"}
                      </span>
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={handleMediaUpload} disabled={mediaUploading}>
                        <Upload className="h-3 w-3" />
                        {mediaUploading ? "Uploading..." : "Upload"}
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      {mediaLoading ? (
                        <p className="py-12 text-center text-xs text-muted-foreground">Loading...</p>
                      ) : filteredMedia.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">
                            {search ? "No files match your search" : "No media uploaded yet"}
                          </p>
                          {!search && (
                            <Button size="sm" className="gap-1.5" onClick={handleMediaUpload}>
                              <Upload className="h-3.5 w-3.5" /> Upload Image
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 grid grid-cols-3 gap-3">
                          {filteredMedia.map((item) => {
                            const isSel = mediaSelected === item.path
                            const isVideo = /\.(mp4|webm|mov)$/i.test(item.path)
                            const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(item.path)
                            return (
                              <button
                                key={item.path}
                                onClick={() => setMediaSelected(isSel ? null : item.path)}
                                className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                                  isSel ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-muted-foreground/40"
                                }`}
                                style={{ aspectRatio: "16/9" }}
                              >
                                {isAudio ? (
                                  <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-1">
                                    <Volume2 className="h-6 w-6 text-muted-foreground" />
                                    <span className="text-[9px] text-muted-foreground uppercase font-semibold">
                                      {item.path.split(".").pop()?.toUpperCase()}
                                    </span>
                                  </div>
                                ) : isVideo ? (
                                  <video
                                    src={`file://${encodeURI(item.path)}`}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    muted
                                    preload="metadata"
                                  />
                                ) : (
                                  <div
                                    className="absolute inset-0 bg-cover bg-center"
                                    style={{ backgroundImage: `url("file://${encodeURI(item.path)}")` }}
                                  />
                                )}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                {(isVideo || isAudio) && (
                                  <div className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center">
                                    {isAudio
                                      ? <Volume2 className="h-2.5 w-2.5 text-white" />
                                      : <Play className="h-2.5 w-2.5 text-white fill-white" />
                                    }
                                  </div>
                                )}
                                {isSel && (
                                  <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                    <Check className="h-3 w-3 text-primary-foreground" />
                                  </div>
                                )}
                                {item.usageCount > 0 && (
                                  <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                                    {item.usageCount} {item.usageCount === 1 ? "song" : "songs"}
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </div>

                  {/* Detail sidebar */}
                  {mediaSelected && (() => {
                    const item = mediaImages.find((i) => i.path === mediaSelected)
                    if (!item) return null
                    return (
                      <div className="w-56 shrink-0 border-l border-border flex flex-col min-h-0 overflow-hidden">
                        <div className="p-3 border-b border-border shrink-0">
                          <div className="rounded-lg overflow-hidden border border-border" style={{ aspectRatio: "16/9" }}>
                            {/\.(mp4|webm|mov)$/i.test(item.path) ? (
                              <video src={`file://${item.path}`} className="w-full h-full object-cover" muted autoPlay loop playsInline />
                            ) : /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(item.path) ? (
                              <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-2">
                                <Volume2 className="h-8 w-8 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                                  {item.path.split(".").pop()?.toUpperCase()}
                                </span>
                              </div>
                            ) : (
                              <img src={`file://${item.path}`} className="w-full h-full object-cover" alt="" />
                            )}
                          </div>
                        </div>
                        <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto text-xs">
                          <div>
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Filename</span>
                            <p className="text-foreground truncate mt-0.5">{item.filename}</p>
                          </div>
                          {/\.(mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i.test(item.path) ? (
                            <div>
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Services ({mediaUsingServices.length})
                              </span>
                              {mediaUsingServices.length > 0 ? (
                                <div className="flex flex-col gap-1 mt-1">
                                  {mediaUsingServices.map((svc) => (
                                    <div key={svc.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted">
                                      <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-[11px] truncate font-medium">{svc.label}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {new Date(svc.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-muted-foreground mt-0.5">Not in any service</p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Used by</span>
                              <p className="text-foreground mt-0.5">
                                {item.usageCount > 0 ? `${item.usageCount} ${item.usageCount === 1 ? "song" : "songs"}` : "Not used"}
                              </p>
                              {mediaUsingSongs.filter(s => s.artist !== 'Scripture' && s.artist !== 'Media').length > 0 && (
                                <div className="flex flex-col gap-1 mt-1">
                                  {mediaUsingSongs.filter(s => s.artist !== 'Scripture' && s.artist !== 'Media').map((s) => (
                                    <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted">
                                      <Music2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <span className="text-[11px] truncate">{s.title}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="mt-auto pt-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-1.5 w-full h-7 text-xs"
                              onClick={() => handleMediaDelete(item)}
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <p className="text-sm">Presentations coming soon</p>
                </div>
              )}
            </div>
          </Tabs>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 py-3 border-t border-border bg-muted/40 shrink-0">
            <span className="flex-1 text-xs text-muted-foreground">
              {tab === "media" && mediaSelected
                ? "1 media item selected"
                : selectionLabel}
            </span>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {tab === "media" ? (
              <Button
                size="sm"
                disabled={!mediaSelected}
                onClick={() => {
                  if (mediaSelected) {
                    onAddMedia?.(mediaSelected)
                    onClose()
                  }
                }}
              >
                + Add to Lineup
              </Button>
            ) : (
              <Button size="sm" disabled={selectedIds.length === 0} onClick={handleAdd}>
                + Add to Lineup
              </Button>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}

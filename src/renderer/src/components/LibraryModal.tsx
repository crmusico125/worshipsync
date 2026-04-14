import { useState, useEffect, useRef } from "react"
import { Search, Music2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BookOpen } from "lucide-react"

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
  excludeIds?: number[]
}

export default function LibraryModal({ onClose, onAdd, excludeIds = [] }: Props) {
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
      setSongs((all as SongRow[]).filter((s) => !excludeIds.includes(s.id)))
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
      setSongs((result as SongRow[]).filter((s) => !excludeIds.includes(s.id)))
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
                placeholder="Search songs, scriptures, media..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* ── Tabs ───────────────────────────────────────────────── */}
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <div className="px-5 border-b border-border shrink-0">
              <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
                {["songs", "scriptures", "media", "presentations"].map((t) => (
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
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  {tab === "scriptures" && <BookOpen className="h-8 w-8 opacity-30" />}
                  <p className="text-sm">
                    {tab === "scriptures" ? "Scripture search coming soon" : tab === "media" ? "Media library coming soon" : "Presentations coming soon"}
                  </p>
                </div>
              )}
            </div>
          </Tabs>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 py-3 border-t border-border bg-muted/40 shrink-0">
            <span className="flex-1 text-xs text-muted-foreground">{selectionLabel}</span>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={selectedIds.length === 0} onClick={handleAdd}>
              + Add to Lineup
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}

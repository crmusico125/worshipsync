import { useEffect, useState } from "react"
import {
  Search, Plus, Music2, Pencil, Trash2, Palette, Image as ImageIcon,
  X, Hash, Gauge,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useSongStore } from "../store/useSongStore"
import type { Song, Section } from "../../../../shared/types"
import BackgroundPicker from "../components/BackgroundPicker"

interface SongWithSections extends Song {
  sections: Section[]
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

const SECTION_TYPES = [
  "verse", "chorus", "bridge", "pre-chorus",
  "intro", "outro", "tag", "interlude",
] as const

function groupAlphabetically(songs: Song[]) {
  const groups: Record<string, Song[]> = {}
  for (const song of songs) {
    const letter = song.title[0].toUpperCase()
    if (!groups[letter]) groups[letter] = []
    groups[letter].push(song)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

// ── Main Screen ──────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const {
    songs, selectedSong, searchQuery, loading,
    loadSongs, selectSong, setSearchQuery,
  } = useSongStore()

  const [editingSong, setEditingSong] = useState<SongWithSections | "new" | null>(null)
  const [themeList, setThemeList] = useState<{ id: number; name: string; type: string }[]>([])

  useEffect(() => {
    loadSongs()
    window.worshipsync.themes.getAll().then((t: any) => setThemeList(t))
  }, [])

  const grouped = searchQuery ? null : groupAlphabetically(songs)

  return (
    <div className="h-full flex overflow-hidden bg-background text-foreground">

      {/* ── Left: song list ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border overflow-hidden">

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-border shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Search by title or artist…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setEditingSong("new")}
          >
            <Plus className="h-3.5 w-3.5" /> New song
          </Button>
        </div>

        {/* Count */}
        <div className="px-4 py-2 border-b border-border shrink-0 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {loading ? "Loading…" : `${songs.length} ${songs.length === 1 ? "song" : "songs"}`}
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear search
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {!loading && songs.length === 0 && (
            <EmptyLibrary onCreate={() => setEditingSong("new")} />
          )}

          {searchQuery && songs.length > 0 && (
            <div className="space-y-1">
              {songs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  selected={selectedSong?.id === song.id}
                  onClick={() => selectSong(song.id)}
                />
              ))}
            </div>
          )}

          {!searchQuery && grouped?.map(([letter, group]) => (
            <div key={letter} className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5 mb-1.5 px-1 sticky top-0 bg-background">
                {letter}
              </div>
              <div className="space-y-1">
                {group.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    selected={selectedSong?.id === song.id}
                    onClick={() => selectSong(song.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: detail panel ─────────────────────────────────────── */}
      <aside className="w-[380px] shrink-0 overflow-y-auto bg-card">
        {selectedSong ? (
          <SongDetail
            song={selectedSong}
            themeList={themeList}
            onEdit={() => setEditingSong(selectedSong)}
            onDelete={async () => {
              if (!confirm(`Delete "${selectedSong.title}"? This cannot be undone.`)) return
              await window.worshipsync.songs.delete(selectedSong.id)
              useSongStore.getState().clearSelection()
              loadSongs()
            }}
            onChanged={async () => {
              await loadSongs()
              await selectSong(selectedSong.id)
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center px-6 text-center">
            <div>
              <Music2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a song to see its details</p>
            </div>
          </div>
        )}
      </aside>

      {/* ── Modal ───────────────────────────────────────────────────── */}
      {editingSong && (
        <SongFormModal
          song={editingSong === "new" ? null : editingSong}
          onClose={() => setEditingSong(null)}
          onSaved={async (savedId) => {
            setEditingSong(null)
            await loadSongs()
            if (savedId) await selectSong(savedId)
          }}
        />
      )}
    </div>
  )
}

// ── Song Row ─────────────────────────────────────────────────────────────

function SongRow({
  song, selected, onClick,
}: {
  song: Song
  selected: boolean
  onClick: () => void
}) {
  const tags = JSON.parse(song.tags || "[]") as string[]
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-md border transition-colors ${
        selected
          ? "bg-primary/10 border-primary/30"
          : "border-transparent hover:bg-accent/50"
      }`}
    >
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-medium truncate ${selected ? "text-primary" : "text-foreground"}`}>
          {song.title}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
          <span className="truncate">{song.artist || "Unknown"}</span>
          {song.key && (
            <>
              <span>·</span>
              <span className="shrink-0">Key {song.key}</span>
            </>
          )}
          {tags[0] && (
            <span className="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {tags[0]}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Song Detail Pane ─────────────────────────────────────────────────────

function SongDetail({
  song, themeList, onEdit, onDelete, onChanged,
}: {
  song: SongWithSections
  themeList: { id: number; name: string; type: string }[]
  onEdit: () => void
  onDelete: () => void
  onChanged: () => Promise<void>
}) {
  const tags = JSON.parse(song.tags || "[]") as string[]

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Music2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground truncate">{song.title}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {song.artist || "Unknown artist"}
              {song.ccliNumber && ` · CCLI ${song.ccliNumber}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 h-8 text-xs"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <MetaTile label="Key" icon={Hash} value={song.key ?? "—"} />
          <MetaTile label="Tempo" icon={Gauge} value={song.tempo ?? "—"} />
          <MetaTile label="Sections" icon={Music2} value={String(song.sections.length)} />
          <MetaTile label="Tags" value={tags.join(", ") || "—"} />
        </div>
      </section>

      {/* Sections */}
      <section className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Sections
          </span>
        </div>
        {song.sections.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No sections yet — click Edit to add lyrics.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {song.sections.map((sec) => (
              <div
                key={sec.id}
                className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-muted/30"
              >
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white shrink-0 ${SECTION_BADGE_COLORS[sec.type] ?? "bg-slate-600"}`}>
                  {sec.label}
                </span>
                <p className="text-[11px] text-muted-foreground flex-1 leading-relaxed truncate">
                  {sec.lyrics.split("\n")[0] || "(empty)"}
                  {sec.lyrics.split("\n").length > 1 && " …"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Theme */}
      <section className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2 mb-2">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Slide theme
          </span>
        </div>
        <Select
          value={song.themeId ? String(song.themeId) : ""}
          onChange={async (e) => {
            const themeId = e.target.value ? parseInt(e.target.value) : null
            await window.worshipsync.songs.update(song.id, { themeId })
            await onChanged()
          }}
        >
          <option value="">— Use default theme —</option>
          {themeList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.type})
            </option>
          ))}
        </Select>
        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
          Per-song theme overrides the global default for this song only.
        </p>
      </section>

      {/* Background */}
      <section className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Background
          </span>
        </div>
        <BackgroundPicker
          songId={song.id}
          songTitle={song.title}
          currentBackground={song.backgroundPath}
          onChanged={onChanged}
        />
      </section>
    </div>
  )
}

function MetaTile({
  label, value, icon: Icon,
}: {
  label: string
  value: string
  icon?: typeof Hash
}) {
  return (
    <div className="rounded-md bg-muted/30 px-2.5 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {label}
      </div>
      <div className="text-xs font-medium text-foreground mt-1 truncate">{value}</div>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────

function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="h-full flex items-center justify-center text-center">
      <div className="max-w-xs">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Music2 className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-bold mb-1">Your song library is empty</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Add your first song to start building service lineups.
        </p>
        <Button size="sm" className="gap-1.5" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" /> Add a song
        </Button>
      </div>
    </div>
  )
}

// ── Song Form Modal (add + edit) ─────────────────────────────────────────

interface ParsedSection {
  type: typeof SECTION_TYPES[number]
  label: string
  lyrics: string
  orderIndex: number
}

const DEFAULT_NEW_SECTIONS: ParsedSection[] = [
  { type: "verse",  label: "Verse 1", lyrics: "", orderIndex: 0 },
  { type: "chorus", label: "Chorus",  lyrics: "", orderIndex: 1 },
]

function SongFormModal({
  song, onClose, onSaved,
}: {
  song: SongWithSections | null
  onClose: () => void
  onSaved: (savedId?: number) => Promise<void>
}) {
  const isEdit = !!song
  const [step, setStep] = useState<"details" | "sections">("details")
  const [title, setTitle]   = useState(song?.title ?? "")
  const [artist, setArtist] = useState(song?.artist ?? "")
  const [key, setKey]       = useState(song?.key ?? "")
  const [tempo, setTempo]   = useState<"slow" | "medium" | "fast" | "">(
    (song?.tempo as any) ?? "",
  )
  const [sections, setSections] = useState<ParsedSection[]>(
    song
      ? song.sections.map((s) => ({
          type: s.type as ParsedSection["type"],
          label: s.label,
          lyrics: s.lyrics,
          orderIndex: s.orderIndex,
        }))
      : DEFAULT_NEW_SECTIONS,
  )
  const [saving, setSaving] = useState(false)

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        type: "verse",
        label: `Verse ${prev.filter((s) => s.type === "verse").length + 1}`,
        lyrics: "",
        orderIndex: prev.length,
      },
    ])
  }

  const removeSection = (i: number) => {
    setSections((prev) => prev.filter((_, j) => j !== i))
  }

  const updateSection = <K extends keyof ParsedSection>(
    i: number, field: K, value: ParsedSection[K],
  ) => {
    setSections((prev) => prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)))
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)

    const cleaned = sections
      .filter((s) => s.lyrics.trim())
      .map((s, i) => ({ ...s, orderIndex: i }))

    let savedId: number | undefined

    if (isEdit && song) {
      await window.worshipsync.songs.update(song.id, {
        title: title.trim(),
        artist: artist.trim(),
        key: key.trim() || null,
        tempo: tempo || null,
      })
      await window.worshipsync.songs.upsertSections(song.id, cleaned)
      savedId = song.id
    } else {
      const created = await window.worshipsync.songs.create({
        title: title.trim(),
        artist: artist.trim(),
        key: key.trim() || null,
        tempo: tempo || null,
        tags: "[]",
        sections: cleaned,
      }) as { id: number } | undefined
      savedId = created?.id
    }

    setSaving(false)
    await onSaved(savedId)
  }

  const canAdvance = title.trim().length > 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl flex flex-col"
        style={{ width: 600, maxWidth: "95vw", maxHeight: "85vh" }}
      >
        <div className="flex flex-col bg-background text-foreground h-full overflow-hidden">

          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-border shrink-0 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-bold">
                {isEdit ? "Edit song" : "Add new song"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === "details" ? "Basic info" : "Lyrics & sections"}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md">
              {(["details", "sections"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => canAdvance && setStep(s)}
                  disabled={!canAdvance && s !== "details"}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    step === s
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === "details" ? (
              <div className="flex flex-col gap-4">
                <Field label="Song title *">
                  <Input
                    autoFocus
                    placeholder="e.g. Way Maker"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field label="Artist / Band">
                  <Input
                    placeholder="e.g. Sinach"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Key">
                    <Input
                      placeholder="e.g. G, Bb"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </Field>
                  <Field label="Tempo">
                    <Select
                      value={tempo}
                      onChange={(e) => setTempo(e.target.value as typeof tempo)}
                    >
                      <option value="">— Select —</option>
                      <option value="slow">Slow</option>
                      <option value="medium">Medium</option>
                      <option value="fast">Fast</option>
                    </Select>
                  </Field>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Add lyrics for each section. Empty sections won't be saved.
                </p>
                {sections.map((sec, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                      <Select
                        value={sec.type}
                        onChange={(e) => updateSection(i, "type", e.target.value as ParsedSection["type"])}
                        className="h-7 text-xs w-32"
                      >
                        {SECTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </Select>
                      <Input
                        className="h-7 text-xs flex-1"
                        value={sec.label}
                        onChange={(e) => updateSection(i, "label", e.target.value)}
                        placeholder="Label e.g. Verse 1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeSection(i)}
                        title="Remove section"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      className="border-0 rounded-none font-mono text-xs leading-relaxed min-h-[100px] focus-visible:ring-0 shadow-none"
                      placeholder="Paste lyrics for this section…"
                      value={sec.lyrics}
                      onChange={(e) => updateSection(i, "lyrics", e.target.value)}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start gap-1.5"
                  onClick={addSection}
                >
                  <Plus className="h-3.5 w-3.5" /> Add section
                </Button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border shrink-0">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <div className="flex items-center gap-2">
              {step === "sections" && (
                <Button variant="outline" size="sm" onClick={() => setStep("details")}>
                  ← Back
                </Button>
              )}
              {step === "details" && !isEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !canAdvance}
                >
                  {saving ? "Saving…" : "Save without lyrics"}
                </Button>
              )}
              {step === "details" ? (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setStep("sections")}
                  disabled={!canAdvance}
                >
                  {isEdit ? "Edit sections" : "Add sections"} →
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSave}
                  disabled={saving || !canAdvance}
                >
                  {saving ? "Saving…" : isEdit ? "Save changes" : "Save song"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

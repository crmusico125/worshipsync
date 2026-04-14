import { useState, useRef, useCallback } from "react"
import { Upload } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

// ── Parser ────────────────────────────────────────────────────────────────────

const SECTION_TYPE_MAP: Record<string, string> = {
  verse: "verse", chorus: "chorus", bridge: "bridge",
  "pre-chorus": "pre-chorus", prechorus: "pre-chorus", "pre chorus": "pre-chorus",
  intro: "intro", outro: "outro", tag: "tag", interlude: "interlude",
}

const SECTION_BASE_LABELS: Record<string, string> = {
  verse: "Verse", chorus: "Chorus", bridge: "Bridge", "pre-chorus": "Pre-Chorus",
  intro: "Intro", outro: "Outro", tag: "Tag", interlude: "Interlude",
}

function parseSections(raw: string) {
  const lines = raw.split("\n")
  const result: { type: string; label: string; lyrics: string }[] = []
  const typeCounts: Record<string, number> = {}
  let currentType: string | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (!currentType) return
    const count = (typeCounts[currentType] ?? 0) + 1
    typeCounts[currentType] = count
    const base = SECTION_BASE_LABELS[currentType] ?? currentType
    result.push({
      type: currentType,
      label: count > 1 ? `${base} ${count}` : base,
      lyrics: currentLines.join("\n").trimEnd(),
    })
    currentLines = []
  }

  for (const line of lines) {
    const match = line.trim().match(/^\[(.+?)\]$/)
    if (match) {
      flush()
      currentType = SECTION_TYPE_MAP[match[1].toLowerCase().trim()] ?? "verse"
    } else if (currentType !== null) {
      currentLines.push(line)
    }
  }
  flush()
  return result
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KEYS = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
  "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
  "Am", "Bm", "Cm", "Dm", "Em", "Fm", "Gm",
]

const QUICK_TAGS = ["Verse", "Chorus", "Bridge", "Pre-Chorus"]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onCreated: (songId: number) => void
}

export default function AddSongModal({ onClose, onCreated }: Props) {
  const [tab, setTab] = useState("manual")
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [key, setKey] = useState("C")
  const [bpm, setBpm] = useState("")
  const [ccli, setCcli] = useState("")
  const [lyrics, setLyrics] = useState("")
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertTag = useCallback((tag: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const insert = `[${tag}]\n`
    setLyrics((prev) => prev.slice(0, start) + insert + prev.slice(ta.selectionEnd))
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + insert.length
      ta.focus()
    }, 0)
  }, [])

  const importFile = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".txt,.lyr"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => setLyrics(e.target?.result as string ?? "")
      reader.readAsText(file)
    }
    input.click()
  }

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const sectionData = parseSections(lyrics)
      const song = await window.worshipsync.songs.create({
        title: title.trim(),
        artist: artist.trim(),
        key: key || undefined,
        ccliNumber: ccli.trim() || undefined,
        tags: "[]",
        sections: sectionData.map((s, i) => ({ ...s, orderIndex: i })),
      })
      onCreated((song as any).id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl"
        style={{ width: 860, maxWidth: "95vw", height: 540, maxHeight: "90vh" }}
      >
        <div className="flex flex-col h-full bg-background text-foreground">

          {/* ── Header ──────────────────────────────────────────────── */}
          <DialogHeader className="flex flex-row items-center px-5 pt-4 pb-3 border-b border-border shrink-0">
            <DialogTitle className="flex-1 text-base font-semibold">Add New Song</DialogTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>
              ✕
            </Button>
          </DialogHeader>

          {/* ── Body ────────────────────────────────────────────────── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── Left panel ─────────────────────────────────────── */}
            <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-y-auto p-5 gap-4">

              {/* Entry mode tabs */}
              <Tabs value={tab} onValueChange={setTab} className="shrink-0">
                <TabsList className="w-full">
                  <TabsTrigger value="manual" className="flex-1">Manual Entry</TabsTrigger>
                  <TabsTrigger value="songselect" className="flex-1">SongSelect API</TabsTrigger>
                </TabsList>
              </Tabs>

              {tab === "manual" ? (
                <>
                  {/* Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Title <span className="text-destructive">*</span>
                    </label>
                    <Input
                      autoFocus
                      placeholder="e.g. Great Are You Lord"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && save()}
                    />
                  </div>

                  {/* Artist */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Artist
                    </label>
                    <Input
                      placeholder="e.g. All Sons & Daughters"
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                    />
                  </div>

                  {/* Key + BPM */}
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Default Key
                      </label>
                      <Select value={key} onChange={(e) => setKey(e.target.value)}>
                        {KEYS.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        BPM
                      </label>
                      <Input
                        placeholder="e.g. 72"
                        value={bpm}
                        onChange={(e) => setBpm(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* CCLI */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      CCLI Number
                    </label>
                    <Input
                      placeholder="Optional"
                      value={ccli}
                      onChange={(e) => setCcli(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-2">
                  <p className="text-sm font-medium text-foreground">SongSelect Integration</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Search and import licensed songs directly from CCLI SongSelect.
                  </p>
                  <p className="text-xs text-muted-foreground/60">Coming soon</p>
                </div>
              )}
            </div>

            {/* ── Right panel: Lyrics Editor ──────────────────────── */}
            <div className="flex-1 min-w-0 flex flex-col p-5 gap-3">

              {/* Editor header */}
              <div className="flex items-center justify-between shrink-0">
                <span className="text-sm font-semibold">Lyrics Editor</span>
                <span className="text-xs text-muted-foreground">
                  Use tags like{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">[Verse 1]</code>{" "}
                  to split slides
                </span>
              </div>

              {/* Quick-insert buttons + import */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex gap-1.5">
                  {QUICK_TAGS.map((tag) => (
                    <Button
                      key={tag}
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 text-xs"
                      onClick={() => insertTag(tag)}
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-3 text-xs text-primary hover:text-primary"
                  onClick={importFile}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Import Text File
                </Button>
              </div>

              {/* Lyrics textarea */}
              <Textarea
                ref={textareaRef}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                className="flex-1 bg-card font-mono text-sm leading-relaxed"
                placeholder={`[Verse 1]\nType or paste your lyrics here...\n\n[Chorus]\nEach section block will become a new slide automatically.`}
                spellCheck={false}
              />
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border bg-muted/40 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!title.trim() || saving} onClick={save}>
              {saving ? "Saving…" : "Save to Library"}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useState, useRef, useCallback, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SplitSquareHorizontal } from "lucide-react"

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

interface SlidePreview {
  sectionLabel: string
  sectionType: string
  lines: string[]
}

function parseLyricsToSlides(raw: string, maxLines = 2): SlidePreview[] {
  const slides: SlidePreview[] = []
  let currentType = "verse"
  let currentLabel = "Verse 1"
  let currentLines: string[] = []

  const flush = () => {
    if (currentLines.length === 0) return
    const nonEmpty = currentLines.filter(l => l.trim())
    for (let i = 0; i < nonEmpty.length; i += maxLines) {
      slides.push({
        sectionLabel: currentLabel,
        sectionType: currentType,
        lines: nonEmpty.slice(i, i + maxLines),
      })
    }
    currentLines = []
  }

  const typeMap: Record<string, string> = {
    verse: "verse", chorus: "chorus", bridge: "bridge",
    "pre-chorus": "pre-chorus", prechorus: "pre-chorus",
    intro: "intro", outro: "outro", tag: "tag", interlude: "interlude",
  }

  for (const line of raw.split("\n")) {
    const match = line.trim().match(/^\[(.+?)\]$/)
    if (match) {
      flush()
      const rawType = match[1].toLowerCase().trim().replace(/\s*\d+$/, "")
      currentType = typeMap[rawType] ?? "verse"
      currentLabel = match[1].trim()
    } else {
      currentLines.push(line)
    }
  }
  flush()
  return slides
}

interface Props {
  songTitle: string
  artist: string
  initialLyrics: string
  onClose: () => void
  onSave: (lyrics: string) => void
}

export default function EditLyricsModal({ songTitle, artist, initialLyrics, onClose, onSave }: Props) {
  const [lyrics, setLyrics] = useState(initialLyrics)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const slides = parseLyricsToSlides(lyrics)

  useEffect(() => { textareaRef.current?.focus() }, [])

  const insertTag = useCallback((tag: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const insert = `[${tag}]\n`
    setLyrics(prev => prev.slice(0, start) + insert + prev.slice(ta.selectionEnd))
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + insert.length; ta.focus() }, 0)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(lyrics) } finally { setSaving(false) }
    onClose()
  }

  const handleSaveClick = () => {
    setConfirming(true)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl"
        style={{ width: 900, maxWidth: "95vw", height: 600, maxHeight: "92vh" }}
      >
        <div className="flex flex-col h-full bg-background text-foreground">
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-border shrink-0">
            <div>
              <DialogTitle className="text-lg font-bold">Edit Lyrics</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{songTitle} {artist && `\u2022 ${artist}`}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>✕</Button>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: editor */}
            <div className="flex-1 flex flex-col p-5 min-w-0">
              <div className="flex items-center gap-2 mb-3 shrink-0">
                {["Verse", "Chorus", "Bridge"].map(tag => (
                  <Button key={tag} variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => insertTag(tag)}>
                    + {tag}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 ml-auto" disabled>
                  <SplitSquareHorizontal className="h-3.5 w-3.5" /> Auto-Split Lines
                </Button>
              </div>
              <Textarea
                ref={textareaRef}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                className="flex-1 bg-card font-mono text-sm leading-relaxed"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground mt-2 shrink-0">
                Use double line breaks to create a new slide. Wrap tags in brackets like [Verse 1].
              </p>
            </div>

            {/* Right: slide preview */}
            <div className="w-72 shrink-0 border-l border-border flex flex-col overflow-hidden">
              <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border shrink-0">
                Slide Preview ({slides.length} slides)
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {slides.map((slide, i) => (
                  <div key={i} className="rounded-lg overflow-hidden border border-border">
                    <div className="bg-gray-900 p-3 relative" style={{ aspectRatio: "16/9" }}>
                      <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-white ${SECTION_BADGE_COLORS[slide.sectionType] ?? "bg-slate-600"}`}>
                        {slide.sectionLabel}
                      </span>
                      <div className="flex items-center justify-center h-full">
                        <p className="text-[10px] text-white text-center leading-relaxed whitespace-pre-wrap">
                          {slide.lines.join("\n")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-6 py-3 border-t border-border shrink-0">
            {confirming ? (
              <>
                <p className="text-xs text-muted-foreground flex-1">
                  This will update <span className="font-semibold text-foreground">"{songTitle}"</span> in your library.
                </p>
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Go back</Button>
                <Button size="sm" disabled={saving} onClick={handleSave}>
                  {saving ? "Saving…" : "Confirm save"}
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" onClick={handleSaveClick}>Save Changes</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

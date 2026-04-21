import { useState, useEffect, useMemo, useCallback } from "react"
import { ChevronRight, ChevronLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select } from "@/components/ui/select"

const API_BASE = "https://bible.helloao.org/api"

// Preferred translations shown first in the picker
const PREFERRED = ["BSB", "eng_kjv", "eng_net", "ENGWEBP", "eng_asv", "eng_bbe", "eng_msb"]

interface Translation {
  id: string
  shortName: string
  englishName: string
  language: string
}

interface Book {
  id: string
  name: string
  numberOfChapters: number
}

interface VerseContent {
  type: string
  number?: number
  content?: (string | { noteId: number })[]
}

export interface ScriptureVerse {
  number: number
  text: string
}

interface Props {
  search: string
  onAddScripture: (title: string, verses: ScriptureVerse[], ref: { book: string; chapter: number; translation: string }) => void
}

// ── Book abbreviation aliases ────────────────────────────────────────────────
const BOOK_ALIASES: Record<string, string[]> = {
  Genesis:        ["gen"],
  Exodus:         ["ex", "exo", "exod"],
  Leviticus:      ["lev"],
  Numbers:        ["num"],
  Deuteronomy:    ["deut", "deu", "dt"],
  Joshua:         ["josh", "jos"],
  Judges:         ["judg", "jdg"],
  Ruth:           ["ru"],
  "1 Samuel":     ["1 sam", "1sam", "1sa"],
  "2 Samuel":     ["2 sam", "2sam", "2sa"],
  "1 Kings":      ["1 kgs", "1kgs", "1 ki", "1ki"],
  "2 Kings":      ["2 kgs", "2kgs", "2 ki", "2ki"],
  "1 Chronicles": ["1 chr", "1chr", "1 ch", "1ch"],
  "2 Chronicles": ["2 chr", "2chr", "2 ch", "2ch"],
  Ezra:           ["ezr"],
  Nehemiah:       ["neh", "ne"],
  Esther:         ["est", "esth"],
  Job:            ["jb"],
  Psalms:         ["ps", "psa", "psalm"],
  Proverbs:       ["prov", "pr", "pro"],
  Ecclesiastes:   ["eccl", "ecc", "eccles"],
  "Song of Solomon": ["song", "sos", "ss", "song of songs"],
  Isaiah:         ["isa", "is"],
  Jeremiah:       ["jer", "je"],
  Lamentations:   ["lam", "la"],
  Ezekiel:        ["eze", "ezek", "ezk"],
  Daniel:         ["dan", "da"],
  Hosea:          ["hos", "ho"],
  Joel:           ["joe", "jl"],
  Amos:           ["am"],
  Obadiah:        ["obad", "ob"],
  Jonah:          ["jon"],
  Micah:          ["mic", "mi"],
  Nahum:          ["nah", "na"],
  Habakkuk:       ["hab"],
  Zephaniah:      ["zeph", "zep"],
  Haggai:         ["hag"],
  Zechariah:      ["zech", "zec"],
  Malachi:        ["mal"],
  Matthew:        ["matt", "mat", "mt"],
  Mark:           ["mk", "mr"],
  Luke:           ["lk", "luk", "lu"],
  John:           ["jn", "joh"],
  Acts:           ["act", "ac"],
  Romans:         ["rom", "ro"],
  "1 Corinthians":    ["1 cor", "1cor", "1 co", "1co"],
  "2 Corinthians":    ["2 cor", "2cor", "2 co", "2co"],
  Galatians:      ["gal", "ga"],
  Ephesians:      ["eph"],
  Philippians:    ["phil", "php"],
  Colossians:     ["col"],
  "1 Thessalonians":  ["1 thess", "1thess", "1 th", "1th"],
  "2 Thessalonians":  ["2 thess", "2thess", "2 th", "2th"],
  "1 Timothy":    ["1 tim", "1tim", "1 ti", "1ti"],
  "2 Timothy":    ["2 tim", "2tim", "2 ti", "2ti"],
  Titus:          ["tit", "ti"],
  Philemon:       ["phlm", "phm"],
  Hebrews:        ["heb", "he"],
  James:          ["jas", "jam"],
  "1 Peter":      ["1 pet", "1pet", "1 pe", "1pe"],
  "2 Peter":      ["2 pet", "2pet", "2 pe", "2pe"],
  "1 John":       ["1 jn", "1jn", "1 jo", "1jo"],
  "2 John":       ["2 jn", "2jn", "2 jo", "2jo"],
  "3 John":       ["3 jn", "3jn", "3 jo", "3jo"],
  Jude:           ["jud", "jde"],
  Revelation:     ["rev", "re"],
}

// Build reverse lookup: alias → canonical name
const ALIAS_TO_NAME: Record<string, string> = {}
for (const [name, aliases] of Object.entries(BOOK_ALIASES)) {
  for (const a of aliases) ALIAS_TO_NAME[a] = name
}

function matchBook(query: string, books: Book[]): Book | null {
  const q = query.toLowerCase().trim()
  if (!q) return null

  // Exact name match
  const exact = books.find((b) => b.name.toLowerCase() === q)
  if (exact) return exact

  // Alias match
  const aliasName = ALIAS_TO_NAME[q]
  if (aliasName) {
    const found = books.find((b) => b.name.toLowerCase() === aliasName.toLowerCase())
    if (found) return found
  }

  // Prefix match on name
  const prefix = books.find((b) => b.name.toLowerCase().startsWith(q))
  if (prefix) return prefix

  // Prefix match on aliases
  for (const [name, aliases] of Object.entries(BOOK_ALIASES)) {
    if (aliases.some((a) => a.startsWith(q))) {
      const found = books.find((b) => b.name === name)
      if (found) return found
    }
  }

  return null
}

function parseReference(input: string, books: Book[]) {
  const trimmed = input.trim()
  if (!trimmed) return { book: null, chapter: null, startVerse: null, endVerse: null }

  // Try to match "BookName Chapter:VerseStart-VerseEnd"
  // Split from the right: find where the numeric part starts
  const m = trimmed.match(/^(.+?)\s+(\d+)(?:\s*:\s*(\d+)(?:\s*-\s*(\d+))?)?$/)

  if (m) {
    const book = matchBook(m[1], books)
    const chapter = parseInt(m[2])
    const sv = m[3] ? parseInt(m[3]) : null
    const ev = m[4] ? parseInt(m[4]) : sv
    return { book, chapter, startVerse: sv, endVerse: ev }
  }

  // No numeric part — just a book name
  const book = matchBook(trimmed, books)
  return { book, chapter: null, startVerse: null, endVerse: null }
}

export default function ScriptureBrowser({ search, onAddScripture }: Props) {
  const [translations, setTranslations] = useState<Translation[]>([])
  const [selectedTranslation, setSelectedTranslation] = useState("BSB")
  const [books, setBooks] = useState<Book[]>([])

  // Click-based navigation (overridden by search when search matches)
  const [clickedBookId, setClickedBookId] = useState<string | null>(null)
  const [clickedChapter, setClickedChapter] = useState<number | null>(null)

  // Verse data & selection
  const [verses, setVerses] = useState<{ number: number; text: string }[]>([])
  const [startVerse, setStartVerse] = useState<number | null>(null)
  const [endVerse, setEndVerse] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  // ── Load translations ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/available_translations.json`)
      .then((r) => r.json())
      .then((data: { translations: Translation[] }) => {
        const eng = data.translations.filter((t) => t.language === "eng")
        // Sort preferred first
        eng.sort((a, b) => {
          const ai = PREFERRED.indexOf(a.id)
          const bi = PREFERRED.indexOf(b.id)
          if (ai !== -1 && bi !== -1) return ai - bi
          if (ai !== -1) return -1
          if (bi !== -1) return 1
          return a.englishName.localeCompare(b.englishName)
        })
        setTranslations(eng)
      })
      .catch(() => {})
  }, [])

  // ── Load books when translation changes ────────────────────────────────────
  useEffect(() => {
    if (!selectedTranslation) return
    setBooks([])
    setClickedBookId(null)
    setClickedChapter(null)
    setVerses([])
    setStartVerse(null)
    setEndVerse(null)
    fetch(`${API_BASE}/${selectedTranslation}/books.json`)
      .then((r) => r.json())
      .then((data) => setBooks(data.books as Book[]))
      .catch(() => {})
  }, [selectedTranslation])

  // ── Parse search ───────────────────────────────────────────────────────────
  const parsed = useMemo(() => parseReference(search, books), [search, books])
  const searchHasMatch = parsed.book !== null

  // Active book/chapter: search wins when it matches, otherwise use clicks
  const activeBook = searchHasMatch ? parsed.book : books.find((b) => b.id === clickedBookId) ?? null
  const activeChapter = searchHasMatch ? parsed.chapter : clickedChapter
  const chapterCount = activeBook?.numberOfChapters ?? 0

  // ── Load chapter ───────────────────────────────────────────────────────────
  const loadChapter = useCallback(
    async (bookId: string, chapter: number) => {
      setLoading(true)
      setVerses([])
      try {
        const res = await fetch(`${API_BASE}/${selectedTranslation}/${bookId}/${chapter}.json`)
        const data = await res.json()
        const content = data.chapter.content as VerseContent[]
        const result: { number: number; text: string }[] = []
        for (const item of content) {
          if (item.type === "verse" && item.number && item.content) {
            const text = item.content
              .filter((c): c is string => typeof c === "string")
              .join("")
              .trim()
            if (text) result.push({ number: item.number, text })
          }
        }
        setVerses(result)
      } catch {
        setVerses([])
      }
      setLoading(false)
    },
    [selectedTranslation]
  )

  useEffect(() => {
    if (activeBook && activeChapter) {
      loadChapter(activeBook.id, activeChapter)
    } else {
      setVerses([])
    }
    setStartVerse(null)
    setEndVerse(null)
  }, [activeBook?.id, activeChapter, loadChapter])

  // Apply search verse range after verses load
  useEffect(() => {
    if (searchHasMatch && parsed.startVerse !== null && verses.length > 0) {
      setStartVerse(parsed.startVerse)
      setEndVerse(parsed.endVerse)
    }
  }, [searchHasMatch, parsed.startVerse, parsed.endVerse, verses.length])

  // ── Verse click ────────────────────────────────────────────────────────────
  const handleVerseClick = (num: number) => {
    if (startVerse === null) {
      setStartVerse(num)
      setEndVerse(num)
    } else if (num === startVerse && num === endVerse) {
      setStartVerse(null)
      setEndVerse(null)
    } else {
      setStartVerse(Math.min(startVerse, num))
      setEndVerse(Math.max(endVerse ?? startVerse, num))
    }
  }

  const isSelected = (v: number) =>
    startVerse !== null && endVerse !== null && v >= startVerse && v <= endVerse

  // ── Filtered book list ─────────────────────────────────────────────────────
  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return books
    if (searchHasMatch) return books // show all, highlight matched
    return books.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        Object.entries(BOOK_ALIASES).some(
          ([name, aliases]) =>
            b.name === name && aliases.some((a) => a.startsWith(q))
        )
    )
  }, [books, search, searchHasMatch])

  // ── Reference label ────────────────────────────────────────────────────────
  const refLabel =
    activeBook && activeChapter
      ? `${activeBook.name} ${activeChapter}${startVerse !== null ? `:${startVerse}${endVerse && endVerse !== startVerse ? `-${endVerse}` : ""}` : ""}`
      : null

  const selectedVerses =
    startVerse !== null
      ? verses.filter((v) => isSelected(v.number))
      : []

  const selectedText = selectedVerses.map((v) => v.text).join(" ")

  const handleAdd = () => {
    if (!refLabel || !activeBook || !activeChapter || selectedVerses.length === 0) return
    onAddScripture(
      `${refLabel} (${selectedTranslation})`,
      selectedVerses,
      { book: activeBook.name, chapter: activeChapter, translation: selectedTranslation }
    )
  }

  // ── Click handlers ─────────────────────────────────────────────────────────
  const handleBookClick = (bookId: string) => {
    setClickedBookId(bookId)
    setClickedChapter(null)
    setVerses([])
    setStartVerse(null)
    setEndVerse(null)
  }

  const handleChapterClick = (ch: number) => {
    setClickedChapter(ch)
    setStartVerse(null)
    setEndVerse(null)
  }

  // ── Right panel content ────────────────────────────────────────────────────
  const renderRightPanel = () => {
    // State: have book + chapter → show verses
    if (activeBook && activeChapter !== null) {
      return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Chapter header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => {
                  setClickedChapter(null)
                  setVerses([])
                  setStartVerse(null)
                  setEndVerse(null)
                }}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                <ChevronLeft className="h-3.5 w-3.5 inline" /> Chapters
              </button>
              <span className="text-sm font-semibold truncate">
                {activeBook.name} {activeChapter}
              </span>
              <span className="text-[11px] text-muted-foreground">
                ({selectedTranslation})
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                disabled={activeChapter <= 1}
                onClick={() => handleChapterClick(activeChapter - 1)}
                className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={activeChapter >= chapterCount}
                onClick={() => handleChapterClick(activeChapter + 1)}
                className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Verses */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="p-4 leading-relaxed">
                {verses.map((v) => {
                  const sel = isSelected(v.number)
                  return (
                    <span
                      key={v.number}
                      onClick={() => handleVerseClick(v.number)}
                      className={`inline cursor-pointer rounded-sm transition-colors ${
                        sel ? "bg-primary/15 text-primary" : "hover:bg-accent"
                      }`}
                    >
                      <sup className="text-[10px] font-bold text-muted-foreground mr-0.5">
                        {v.number}
                      </sup>
                      <span className="text-sm">{v.text} </span>
                    </span>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* Selection footer */}
          {refLabel && startVerse !== null && (
            <div className="px-4 py-3 border-t border-border bg-muted/40 flex items-center gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {refLabel}
                </p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {selectedText.slice(0, 120)}
                  {selectedText.length > 120 ? "…" : ""}
                </p>
              </div>
              <Button size="sm" onClick={handleAdd}>
                + Add to Lineup
              </Button>
            </div>
          )}
        </div>
      )
    }

    // State: have book, no chapter → show chapter grid
    if (activeBook) {
      return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <span className="text-sm font-semibold">{activeBook.name}</span>
            <p className="text-xs text-muted-foreground mt-0.5">Select a chapter</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 grid grid-cols-6 gap-2">
              {Array.from({ length: chapterCount }, (_, i) => i + 1).map((ch) => (
                <button
                  key={ch}
                  onClick={() => handleChapterClick(ch)}
                  className="h-10 rounded-lg border border-border text-sm font-medium hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                >
                  {ch}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )
    }

    // Empty state
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-xs">
          <p className="text-sm text-muted-foreground mb-2">
            Type a reference in the search box
          </p>
          <div className="space-y-1 text-xs text-muted-foreground/70">
            <p>Ezekiel 37:1-14</p>
            <p>John 3:16</p>
            <p>Psalm 23</p>
            <p>Romans 8:28-39</p>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            or select a book from the list
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* ── Left sidebar: translation + book list ──────────────────────── */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-border">
          <Select
            value={selectedTranslation}
            onChange={(e) => setSelectedTranslation(e.target.value)}
          >
            {translations.map((t) => (
              <option key={t.id} value={t.id}>
                {t.shortName} — {t.englishName}
              </option>
            ))}
          </Select>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1.5">
            {filteredBooks.map((book) => {
              const isActive = activeBook?.id === book.id
              return (
                <button
                  key={book.id}
                  onClick={() => handleBookClick(book.id)}
                  className={`w-full text-left flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <span className="truncate">{book.name}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────── */}
      {renderRightPanel()}
    </div>
  )
}

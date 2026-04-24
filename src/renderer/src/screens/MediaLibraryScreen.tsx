import { useEffect, useState, useMemo, useCallback } from "react"
import {
  Search, Upload, Trash2, Image as ImageIcon, X, Check, FolderOpen, Plus, Info, Music, Play, Volume2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MediaItem {
  path: string
  filename: string
  usageCount: number
}

type CollectionFilter = "all" | "recent" | "unused" | "in-use"

const COLLECTION_FILTERS: { id: CollectionFilter; label: string }[] = [
  { id: "all", label: "All Media" },
  { id: "recent", label: "Recent" },
  { id: "in-use", label: "In Use" },
  { id: "unused", label: "Unused" },
]

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function MediaLibraryScreen() {
  const [images, setImages] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<CollectionFilter>("all")
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const loadImages = useCallback(async () => {
    setLoading(true)
    try {
      const paths: string[] = await window.worshipsync.backgrounds.listImages()
      const items: MediaItem[] = await Promise.all(
        paths.map(async (p) => {
          const count = await window.worshipsync.backgrounds.getUsageCount(p)
          return {
            path: p,
            filename: p.split("/").pop() ?? p,
            usageCount: count,
          }
        }),
      )
      setImages(items)
    } catch {
      setImages([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadImages() }, [loadImages])

  const handleUpload = async () => {
    setUploading(true)
    try {
      const path = await window.worshipsync.backgrounds.pickImage()
      if (path) {
        await loadImages()
        setSelectedPath(path)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (item: MediaItem) => {
    const message =
      item.usageCount > 0
        ? `This image is used by ${item.usageCount} song${item.usageCount > 1 ? "s" : ""}. Deleting it will remove it from those songs too. Continue?`
        : "Delete this image from the library?"
    if (!confirm(message)) return
    await window.worshipsync.backgrounds.deleteImage(item.path)
    if (selectedPath === item.path) setSelectedPath(null)
    await loadImages()
  }

  // Filtering
  const filtered = useMemo(() => {
    let result = images
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) => i.filename.toLowerCase().includes(q))
    }
    if (filter === "in-use") result = result.filter((i) => i.usageCount > 0)
    else if (filter === "unused") result = result.filter((i) => i.usageCount === 0)
    else if (filter === "recent") result = [...result].reverse().slice(0, 20)
    return result
  }, [images, searchQuery, filter])

  const selectedItem = useMemo(
    () => images.find((i) => i.path === selectedPath) ?? null,
    [images, selectedPath],
  )

  return (
    <div className="h-full flex overflow-hidden bg-background text-foreground">

      {/* ── Left sidebar: filters ──────────────────────────────────────── */}
      <div className="w-[240px] shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Media Library</h2>
          </div>
          <Button
            className="gap-2 h-9 w-full text-[13px]"
            onClick={handleUpload}
            disabled={uploading}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload Media"}
          </Button>
        </div>

        {/* Filter list */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-4 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Library
            </span>
          </div>
          {COLLECTION_FILTERS.map((f) => {
            const count =
              f.id === "all"
                ? images.length
                : f.id === "in-use"
                  ? images.filter((i) => i.usageCount > 0).length
                  : f.id === "unused"
                    ? images.filter((i) => i.usageCount === 0).length
                    : Math.min(images.length, 20)
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors text-[13px] ${
                  filter === f.id
                    ? "bg-primary/10 text-primary font-semibold border-l-[3px] border-l-primary"
                    : "text-foreground hover:bg-accent/30 border-l-[3px] border-l-transparent"
                }`}
              >
                <span>{f.label}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  filter === f.id
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              </button>
            )
          })}

          <div className="px-4 mt-5 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Info
            </span>
          </div>
          <div className="px-4 py-2">
            <div className="rounded-lg bg-input p-3">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Images are shared across all songs and themes. Supported formats: JPG, PNG, WebP.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Center: media grid ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Search + count bar */}
        <div className="px-5 py-4 border-b border-border bg-card shrink-0 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 text-[13px]"
              placeholder="Search backgrounds, filenames..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          <span className="text-[12px] text-muted-foreground ml-auto">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Loading media...</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              hasImages={images.length > 0}
              searching={!!searchQuery}
              onUpload={handleUpload}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {filtered.map((item) => (
                <MediaCard
                  key={item.path}
                  item={item}
                  selected={selectedPath === item.path}
                  onClick={() => setSelectedPath(selectedPath === item.path ? null : item.path)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: detail panel ────────────────────────────────────────── */}
      {selectedItem ? (
        <MediaDetailPanel
          item={selectedItem}
          onDelete={() => handleDelete(selectedItem)}
          onClose={() => setSelectedPath(null)}
        />
      ) : (
        <div className="w-[300px] shrink-0 border-l border-border bg-card flex items-center justify-center px-6 text-center">
          <div>
            <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Select a file to see details</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Media Card ────────────────────────────────────────────────────────────────

function MediaCard({
  item, selected, onClick,
}: {
  item: MediaItem
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
        selected
          ? "border-primary ring-2 ring-primary/25"
          : "border-border hover:border-muted-foreground/40"
      }`}
      style={{ aspectRatio: "16/9" }}
    >
      {/\.(mp4|webm|mov)$/i.test(item.path) ? (
        <video
          src={`file://${encodeURI(item.path)}`}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          preload="metadata"
        />
      ) : /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(item.path) ? (
        <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-1.5">
          <Volume2 className="h-8 w-8 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-semibold uppercase">
            {item.path.split(".").pop()?.toUpperCase()}
          </span>
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("file://${encodeURI(item.path)}")` }}
        />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

      {/* Type badge */}
      {/\.(mp4|webm|mov)$/i.test(item.path) && (
        <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center">
          <Play className="h-3 w-3 text-white fill-white" />
        </div>
      )}
      {/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(item.path) && (
        <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center">
          <Volume2 className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Selected check */}
      {selected && (
        <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      )}

      {/* Usage badge */}
      {item.usageCount > 0 && (
        <div className="absolute top-2 left-2 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
          {item.usageCount} {item.usageCount === 1 ? "song" : "songs"}
        </div>
      )}
    </button>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function MediaDetailPanel({
  item, onDelete, onClose,
}: {
  item: MediaItem
  onDelete: () => void
  onClose: () => void
}) {
  const [usingSongs, setUsingSongs] = useState<{ id: number; title: string; artist: string }[]>([])

  useEffect(() => {
    window.worshipsync.backgrounds.getUsingSongs(item.path).then(setUsingSongs).catch(() => setUsingSongs([]))
  }, [item.path])

  return (
    <div className="w-[300px] shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-[13px] font-semibold">
          {/\.(mp4|webm|mov)$/i.test(item.path) ? "Video Details" : /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(item.path) ? "Audio Details" : "Image Details"}
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preview */}
      <div className="p-4 border-b border-border">
        <div
          className="relative rounded-lg overflow-hidden border border-border"
          style={{ aspectRatio: "16/9" }}
        >
          {/\.(mp4|webm|mov)$/i.test(item.path) ? (
            <video
              src={`file://${item.path}`}
              className="absolute inset-0 w-full h-full object-cover"
              muted autoPlay loop playsInline
            />
          ) : /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(item.path) ? (
            <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2">
              <Volume2 className="h-10 w-10 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-semibold uppercase">
                {item.path.split(".").pop()?.toUpperCase()} Audio
              </span>
            </div>
          ) : (
            <img
              src={`file://${item.path}`}
              className="absolute inset-0 w-full h-full object-cover"
              alt=""
            />
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
        <DetailRow label="Filename" value={item.filename} />
        <DetailRow
          label="Used by"
          value={
            item.usageCount > 0
              ? `${item.usageCount} ${item.usageCount === 1 ? "song" : "songs"}`
              : "Not used"
          }
        />

        {/* Song list */}
        {usingSongs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {usingSongs.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-input"
              >
                <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium truncate">{s.title}</p>
                  {s.artist && (
                    <p className="text-[11px] text-muted-foreground truncate">{s.artist}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DetailRow label="Path" value={item.path} mono />

        <div className="h-px bg-border my-1" />

        <Button
          variant="destructive"
          size="sm"
          className="gap-2 h-9 text-[13px] w-full"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete Image
        </Button>

        {item.usageCount > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Deleting this image will remove it from {item.usageCount}{" "}
            {item.usageCount === 1 ? "song" : "songs"} that currently use it as a background.
          </p>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className={`text-[13px] text-foreground break-all ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </span>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({
  hasImages, searching, onUpload,
}: {
  hasImages: boolean
  searching: boolean
  onUpload: () => void
}) {
  if (searching) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <div>
          <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No images match your search</p>
        </div>
      </div>
    )
  }

  if (hasImages) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <div>
          <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No images in this category</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-full text-center">
      <div className="max-w-xs">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <ImageIcon className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-sm font-bold mb-1">No media yet</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Upload background images for your songs and presentations.
        </p>
        <Button className="gap-2" onClick={onUpload}>
          <Plus className="h-4 w-4" /> Upload Image
        </Button>
      </div>
    </div>
  )
}

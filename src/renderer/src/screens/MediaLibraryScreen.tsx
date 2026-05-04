import { useEffect, useState, useMemo, useCallback } from "react"
import {
  Search, Upload, Trash2, Image as ImageIcon, X, Check,
  FolderOpen, Music, Play, Volume2, Calendar,
  Folder as FolderIcon, FolderPlus, Move, ChevronRight,
  MoreHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Folder {
  id: string
  name: string
  parentId: string | null
}

interface MediaItem {
  path: string
  filename: string
  usageCount: number
}

type ViewMode = "all" | "recent" | string   // string = folderId

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

const isImage     = (p: string) => /\.(jpg|jpeg|png|webp)$/i.test(p)
const isAudioFile = (p: string) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(p)
const isVideoFile = (p: string) => /\.(mp4|webm|mov)$/i.test(p)

function getAncestors(folderId: string, folders: Folder[]): Folder[] {
  const path: Folder[] = []
  let cur: Folder | undefined = folders.find(f => f.id === folderId)
  while (cur) {
    path.unshift(cur)
    cur = cur.parentId ? folders.find(f => f.id === cur!.parentId) : undefined
  }
  return path
}

function allDescendantIds(folderId: string, folders: Folder[]): Set<string> {
  const ids = new Set<string>()
  const queue = [folderId]
  while (queue.length) {
    const id = queue.shift()!
    ids.add(id)
    folders.filter(f => f.parentId === id).forEach(f => queue.push(f.id))
  }
  return ids
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function MediaLibraryScreen() {
  const [files,     setFiles]     = useState<MediaItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)

  // Virtual folder state (persisted in appState)
  const [folders,    setFolders]    = useState<Folder[]>([])
  const [fileFolder, setFileFolder] = useState<Record<string, string | null>>({})

  // Navigation & filters
  const [view,        setView]        = useState<ViewMode>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Selection (multi-select)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Dialogs
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showMoveDialog,   setShowMoveDialog]   = useState(false)
  const [detailItem,       setDetailItem]       = useState<MediaItem | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadFiles = useCallback(async (savedFileFolder?: Record<string, string | null>) => {
    const paths: string[] = await window.worshipsync.backgrounds.listImages()
    const items: MediaItem[] = await Promise.all(
      paths.map(async (p) => ({
        path: p,
        filename: p.split("/").pop() ?? p,
        usageCount: await window.worshipsync.backgrounds.getUsageCount(p),
      }))
    )
    setFiles(items)

    // Clean stale entries from fileFolder
    const ff = savedFileFolder ?? fileFolder
    const validPaths = new Set(paths)
    const cleaned: Record<string, string | null> = {}
    for (const [p, fid] of Object.entries(ff)) {
      if (validPaths.has(p)) cleaned[p] = fid
    }
    setFileFolder(cleaned)
    return { items, cleaned }
  }, [fileFolder])

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const state = await window.worshipsync.appState.get()
        const savedFolders: Folder[]                      = state.mediaFolders    ?? []
        const savedFileFolder: Record<string, string | null> = state.mediaFileFolder ?? {}
        setFolders(savedFolders)
        await loadFiles(savedFileFolder)
      } catch {
        setFiles([])
      }
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveFolderState = useCallback(async (
    f: Folder[],
    ff: Record<string, string | null>,
  ) => {
    await window.worshipsync.appState.set({ mediaFolders: f, mediaFileFolder: ff })
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    setUploading(true)
    try {
      const path = await window.worshipsync.backgrounds.pickImage()
      if (path) {
        // Assign to current folder if navigating inside one
        const targetFolder = isFolderView(view) ? view : null
        const newFF = { ...fileFolder, [path]: targetFolder }
        setFileFolder(newFF)
        await saveFolderState(folders, newFF)
        await loadFiles(newFF)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (paths: string[]) => {
    const anyUsed = paths.some(p => (files.find(f => f.path === p)?.usageCount ?? 0) > 0)
    const msg = anyUsed
      ? `Some files are used by songs. Deleting will remove them from those songs. Continue?`
      : `Delete ${paths.length} ${paths.length === 1 ? "file" : "files"}?`
    if (!confirm(msg)) return
    for (const p of paths) await window.worshipsync.backgrounds.deleteImage(p)
    const newFF = { ...fileFolder }
    paths.forEach(p => delete newFF[p])
    setFileFolder(newFF)
    await saveFolderState(folders, newFF)
    setSelectedPaths(new Set())
    setDetailItem(null)
    await loadFiles(newFF)
  }

  const handleCreateFolder = useCallback(async (name: string) => {
    const parentId = isFolderView(view) ? view : null
    const f: Folder = { id: generateId(), name, parentId }
    const newFolders = [...folders, f]
    setFolders(newFolders)
    await saveFolderState(newFolders, fileFolder)
  }, [folders, fileFolder, view, saveFolderState])

  const handleMoveFiles = useCallback(async (paths: string[], targetFolderId: string | null) => {
    const newFF = { ...fileFolder }
    paths.forEach(p => { newFF[p] = targetFolderId })
    setFileFolder(newFF)
    setSelectedPaths(new Set())
    await saveFolderState(folders, newFF)
  }, [folders, fileFolder, saveFolderState])

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    if (!confirm("Delete this folder? Files inside will move to its parent.")) return
    const folder  = folders.find(f => f.id === folderId)
    const parentId = folder?.parentId ?? null
    const toDelete = allDescendantIds(folderId, folders)
    const newFF    = { ...fileFolder }
    for (const [p, fid] of Object.entries(newFF)) {
      if (fid && toDelete.has(fid)) newFF[p] = parentId
    }
    const newFolders = folders.filter(f => !toDelete.has(f.id))
    setFolders(newFolders)
    setFileFolder(newFF)
    if (isFolderView(view) && toDelete.has(view)) setView(folder?.parentId ?? "all")
    await saveFolderState(newFolders, newFF)
  }, [folders, fileFolder, view, saveFolderState])

  // ── Derived ───────────────────────────────────────────────────────────────

  const isFolderView = (v: ViewMode): v is string =>
    v !== "all" && v !== "recent"

  const breadcrumb = useMemo(() =>
    isFolderView(view) ? getAncestors(view, folders) : [],
  [view, folders])

  const subFolders = useMemo(() =>
    isFolderView(view) ? folders.filter(f => f.parentId === view) : [],
  [view, folders])

  const rootFolders = useMemo(() =>
    folders.filter(f => f.parentId === null),
  [folders])

  // Files shown in current view (before type/search filter)
  const viewFiles = useMemo(() => {
    if (view === "recent") return [...files].reverse().slice(0, 30)
    if (view === "all")    return files
    return files.filter(f => fileFolder[f.path] === view)
  }, [view, files, fileFolder])

  // Apply search filter
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return viewFiles
    const q = searchQuery.toLowerCase()
    return viewFiles.filter(f => f.filename.toLowerCase().includes(q))
  }, [viewFiles, searchQuery])

  // Selection helpers
  const toggleSelect = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const selectAll  = useCallback(() => setSelectedPaths(new Set(filteredFiles.map(f => f.path))), [filteredFiles])
  const clearSel   = useCallback(() => setSelectedPaths(new Set()), [])

  // File count / thumbnail for folder cards
  function folderFileCount(folderId: string) {
    return files.filter(f => fileFolder[f.path] === folderId).length
  }
  function folderThumbnail(folderId: string): string | null {
    return files.find(f => fileFolder[f.path] === folderId && isImage(f.path))?.path ?? null
  }


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden bg-background text-foreground">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">

        <div className="px-4 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-semibold mb-4">Media Library</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Library section */}
          <div className="px-4 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Library</span>
          </div>
          {(["all", "recent"] as const).map(id => (
            <button
              key={id}
              onClick={() => { setView(id); clearSel() }}
              className={`w-full text-left flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors
                ${view === id
                  ? "bg-primary/10 text-primary font-semibold border-l-2 border-l-primary"
                  : "text-foreground hover:bg-accent/40 border-l-2 border-l-transparent"}`}
            >
              {id === "all"
                ? <FolderOpen className="h-4 w-4 shrink-0" />
                : <Calendar   className="h-4 w-4 shrink-0" />}
              <span className="flex-1">{id === "all" ? "All Media" : "Recent"}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${view === id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {id === "all" ? files.length : Math.min(files.length, 30)}
              </span>
            </button>
          ))}

          {/* Collections section */}
          <div className="px-4 mt-5 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Collections</span>
          </div>

          {rootFolders.length === 0 && (
            <p className="px-4 py-2 text-[12px] text-muted-foreground italic">No collections yet</p>
          )}

          <FolderTree
            folders={folders}
            parentId={null}
            view={view}
            onSelect={(id) => { setView(id); clearSel() }}
            fileFolder={fileFolder}
            files={files}
            level={0}
          />

          <button
            onClick={() => setShowCreateFolder(true)}
            className="w-full text-left flex items-center gap-2 px-4 py-2 mt-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Collection
          </button>
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            JPG, PNG, WebP, MP4, WebM, MOV, MP3, WAV, OGG, M4A, AAC, FLAC
          </p>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3 mb-3">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm flex-1 min-w-0">
              <button
                onClick={() => { setView("all"); clearSel() }}
                className={`hover:text-foreground transition-colors shrink-0 ${breadcrumb.length === 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                Library
              </button>
              {breadcrumb.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1 min-w-0">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <button
                    onClick={() => { setView(f.id); clearSel() }}
                    className={`truncate hover:text-foreground transition-colors ${i === breadcrumb.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowCreateFolder(true)}
                className="flex items-center gap-1.5 text-xs font-medium border border-border rounded-md px-3 py-1.5 hover:bg-accent transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New Folder
              </button>
              <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleUpload} disabled={uploading}>
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : "Upload Media"}
              </Button>
            </div>
          </div>

          {/* Search + type pills */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-xs"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            <span className="ml-auto text-[11px] text-muted-foreground">
              {filteredFiles.length + (isFolderView(view) ? subFolders.length : 0)} items
            </span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5 relative">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading media…</p>
            </div>
          ) : subFolders.length === 0 && filteredFiles.length === 0 ? (
            <EmptyState searching={!!searchQuery} onUpload={handleUpload} onCreateFolder={() => setShowCreateFolder(true)} />
          ) : (() => {
              const imgs  = filteredFiles.filter(f => isImage(f.path))
              const vids  = filteredFiles.filter(f => isVideoFile(f.path))
              const auds  = filteredFiles.filter(f => isAudioFile(f.path))
              const groups = [
                { label: "Images", items: imgs },
                { label: "Video",  items: vids },
                { label: "Audio",  items: auds },
              ].filter(g => g.items.length > 0)

              return (
                <div className="space-y-8">
                  {/* Folder cards */}
                  {subFolders.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Folders <span className="font-normal normal-case tracking-normal text-muted-foreground/60">({subFolders.length})</span>
                      </h3>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                        {subFolders.map(folder => (
                          <FolderCard
                            key={folder.id}
                            folder={folder}
                            fileCount={folderFileCount(folder.id)}
                            thumbnail={folderThumbnail(folder.id)}
                            onOpen={() => { setView(folder.id); clearSel() }}
                            onDelete={() => handleDeleteFolder(folder.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* File groups */}
                  {groups.map(group => (
                    <div key={group.label}>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        {group.label} <span className="font-normal normal-case tracking-normal text-muted-foreground/60">({group.items.length})</span>
                      </h3>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                        {group.items.map(item => (
                          <MediaCard
                            key={item.path}
                            item={item}
                            selected={selectedPaths.has(item.path)}
                            selectionMode={selectedPaths.size > 0}
                            onSelect={() => toggleSelect(item.path)}
                            onInfo={() => setDetailItem(prev => prev?.path === item.path ? null : item)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

          {/* Floating selection bar */}
          <div
            className="sticky bottom-5 flex justify-center pointer-events-none"
            style={{
              opacity: selectedPaths.size > 0 ? 1 : 0,
              transform: selectedPaths.size > 0 ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 180ms ease, transform 180ms ease',
            }}
          >
            <div className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-2xl border border-border bg-card/80 shadow-xl backdrop-blur-md">
              {/* Count */}
              <span className="text-xs font-semibold text-foreground px-2">
                {selectedPaths.size} {selectedPaths.size === 1 ? 'item' : 'items'} selected
              </span>

              <div className="w-px h-4 bg-border mx-0.5" />

              {/* Select all */}
              <button
                onClick={selectAll}
                className="text-xs font-medium text-primary hover:text-primary/80 px-2.5 py-1.5 rounded-xl hover:bg-primary/10 transition-colors"
              >
                Select all
              </button>

              <div className="w-px h-4 bg-border mx-0.5" />

              {/* Move */}
              <button
                onClick={() => setShowMoveDialog(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-foreground px-2.5 py-1.5 rounded-xl hover:bg-accent transition-colors"
              >
                <Move className="h-3.5 w-3.5" />
                Move to
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete([...selectedPaths])}
                className="flex items-center gap-1.5 text-xs font-medium text-destructive px-2.5 py-1.5 rounded-xl hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>

              <div className="w-px h-4 bg-border mx-0.5" />

              {/* Dismiss */}
              <button
                onClick={clearSel}
                className="p-1.5 rounded-xl hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {detailItem && (
        <MediaDetailPanel
          item={detailItem}
          folders={folders}
          fileFolder={fileFolder}
          onDelete={() => handleDelete([detailItem.path])}
          onMove={(folderId) => handleMoveFiles([detailItem.path], folderId)}
          onClose={() => setDetailItem(null)}
        />
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      {showCreateFolder && (
        <CreateFolderDialog
          onConfirm={async (name) => { await handleCreateFolder(name); setShowCreateFolder(false) }}
          onClose={() => setShowCreateFolder(false)}
        />
      )}

      {showMoveDialog && (
        <MoveFolderDialog
          folders={folders}
          excludeIds={new Set()}
          onMove={async (targetId) => { await handleMoveFiles([...selectedPaths], targetId); setShowMoveDialog(false) }}
          onClose={() => setShowMoveDialog(false)}
        />
      )}
    </div>
  )
}

// ── Folder Tree (sidebar) ─────────────────────────────────────────────────────

function FolderTree({
  folders, parentId, view, onSelect, fileFolder, files, level,
}: {
  folders: Folder[]
  parentId: string | null
  view: ViewMode
  onSelect: (id: string) => void
  fileFolder: Record<string, string | null>
  files: MediaItem[]
  level: number
}) {
  const children = folders.filter(f => f.parentId === parentId)
  return (
    <>
      {children.map(folder => {
        const isActive  = view === folder.id
        const count     = files.filter(f => fileFolder[f.path] === folder.id).length
        return (
          <div key={folder.id}>
            <button
              onClick={() => onSelect(folder.id)}
              className={`w-full text-left flex items-center gap-2 py-2 text-[13px] transition-colors
                ${isActive
                  ? "bg-primary/10 text-primary font-semibold border-l-2 border-l-primary"
                  : "text-foreground hover:bg-accent/40 border-l-2 border-l-transparent"}`}
              style={{ paddingLeft: `${16 + level * 14}px`, paddingRight: "16px" }}
            >
              <FolderIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{folder.name}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
            <FolderTree
              folders={folders}
              parentId={folder.id}
              view={view}
              onSelect={onSelect}
              fileFolder={fileFolder}
              files={files}
              level={level + 1}
            />
          </div>
        )
      })}
    </>
  )
}

// ── Folder Card ───────────────────────────────────────────────────────────────

function FolderCard({
  folder, fileCount, thumbnail, onOpen, onDelete,
}: {
  folder: Folder
  fileCount: number
  thumbnail: string | null
  onOpen: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  return (
    <div className="group relative rounded-lg border border-border overflow-hidden cursor-pointer hover:border-muted-foreground/40 transition-all">
      {/* Preview area */}
      <div
        className="relative bg-muted/30 flex items-center justify-center"
        style={{ aspectRatio: "16/9" }}
        onClick={onOpen}
      >
        {thumbnail ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{ backgroundImage: `url("file://${encodeURI(thumbnail)}")` }}
          />
        ) : null}
        <FolderIcon className="h-10 w-10 text-muted-foreground/60 relative z-10" />
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-card flex items-center gap-2" onClick={onOpen}>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{folder.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{fileCount} {fileCount === 1 ? "item" : "items"}</p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all shrink-0"
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-2 bottom-10 z-50 bg-card border border-border rounded-md shadow-lg overflow-hidden min-w-[120px]">
            <button
              onClick={() => { setShowMenu(false); onDelete() }}
              className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete folder
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Media Card ────────────────────────────────────────────────────────────────

function MediaCard({
  item, selected, onSelect, onInfo, selectionMode,
}: {
  item: MediaItem
  selected: boolean
  onSelect: () => void
  onInfo: () => void
  selectionMode: boolean
}) {
  return (
    <div
      className={`group relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
        selected
          ? "border-primary ring-2 ring-primary/25"
          : "border-border hover:border-muted-foreground/40"
      }`}
      style={{ aspectRatio: "16/9" }}
      onClick={selectionMode ? onSelect : onInfo}
    >
      {isVideoFile(item.path) ? (
        <video
          src={`file://${encodeURI(item.path)}`}
          className="absolute inset-0 w-full h-full object-cover"
          muted preload="metadata"
        />
      ) : isAudioFile(item.path) ? (
        <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-1.5">
          <Volume2 className="h-7 w-7 text-muted-foreground" />
          <span className="text-[9px] font-semibold uppercase text-muted-foreground">
            {item.path.split(".").pop()?.toUpperCase()}
          </span>
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("file://${encodeURI(item.path)}")` }}
        />
      )}

      {/* Overlay */}
      <div className={`absolute inset-0 transition-colors ${selected ? "bg-black/10" : "bg-black/0 group-hover:bg-black/20"}`} />

      {/* Type badge */}
      {isVideoFile(item.path) && (
        <div className="absolute bottom-2 right-2 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center">
          <Play className="h-2.5 w-2.5 text-white fill-white" />
        </div>
      )}

      {/* Usage badge */}
      {item.usageCount > 0 && (
        <div className="absolute top-2 left-2 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
          {item.usageCount} {item.usageCount === 1 ? "song" : "songs"}
        </div>
      )}

      {/* Checkbox — click toggles multi-select without opening detail panel */}
      <div
        className={`absolute top-2 right-2 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        onClick={e => { e.stopPropagation(); onSelect() }}
      >
        <div className={`h-5 w-5 rounded-full flex items-center justify-center border-2 transition-colors ${
          selected ? "bg-primary border-primary" : "bg-black/40 border-white/60"
        }`}>
          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
      </div>

      {/* Filename on hover */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white truncate">{item.filename}</p>
      </div>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function MediaDetailPanel({
  item, folders, fileFolder, onDelete, onMove, onClose,
}: {
  item: MediaItem
  folders: Folder[]
  fileFolder: Record<string, string | null>
  onDelete: () => void
  onMove: (folderId: string | null) => void
  onClose: () => void
}) {
  const [usingSongs,    setUsingSongs]    = useState<{ id: number; title: string; artist: string }[]>([])
  const [usingServices, setUsingServices] = useState<{ id: number; date: string; label: string }[]>([])
  const [showMoveMenu,  setShowMoveMenu]  = useState(false)

  useEffect(() => {
    window.worshipsync.backgrounds.getUsingSongs(item.path).then(setUsingSongs).catch(() => setUsingSongs([]))
    window.worshipsync.backgrounds.getUsingServices(item.path).then(setUsingServices).catch(() => setUsingServices([]))
  }, [item.path])

  const currentFolderId = fileFolder[item.path] ?? null
  const currentFolder   = folders.find(f => f.id === currentFolderId)

  return (
    <div className="w-[280px] shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-[13px] font-semibold">File Info</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preview */}
      <div className="p-3 border-b border-border">
        <div className="relative rounded-lg overflow-hidden border border-border" style={{ aspectRatio: "16/9" }}>
          {isVideoFile(item.path) ? (
            <video src={`file://${item.path}`} className="absolute inset-0 w-full h-full object-cover" muted autoPlay loop playsInline />
          ) : isAudioFile(item.path) ? (
            <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2">
              <Volume2 className="h-8 w-8 text-muted-foreground" />
            </div>
          ) : (
            <img src={`file://${item.path}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
          )}
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {/* Filename */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Filename</span>
          <p className="text-xs mt-1 break-all">{item.filename}</p>
        </div>

        {/* Current folder */}
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Collection</span>
          <div className="relative mt-1">
            <button
              onClick={() => setShowMoveMenu(v => !v)}
              className="flex items-center gap-2 text-xs bg-input rounded-md px-3 py-2 w-full hover:bg-accent transition-colors"
            >
              <FolderIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-left truncate">{currentFolder?.name ?? "None (Library root)"}</span>
              <Move className="h-3 w-3 text-muted-foreground shrink-0" />
            </button>
            {showMoveMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoveMenu(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  <button
                    onClick={() => { onMove(null); setShowMoveMenu(false) }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors ${currentFolderId === null ? "text-primary font-semibold" : ""}`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> Library root
                  </button>
                  {folders.map(f => (
                    <button
                      key={f.id}
                      onClick={() => { onMove(f.id); setShowMoveMenu(false) }}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors ${currentFolderId === f.id ? "text-primary font-semibold" : ""}`}
                    >
                      <FolderIcon className="h-3.5 w-3.5" /> {f.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Songs using this */}
        {usingSongs.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Songs ({usingSongs.length})</span>
            <div className="mt-1 space-y-1">
              {usingSongs.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-input">
                  <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate">{s.title}</p>
                    {s.artist && <p className="text-[10px] text-muted-foreground truncate">{s.artist}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services using this */}
        {usingServices.length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Services ({usingServices.length})</span>
            <div className="mt-1 space-y-1">
              {usingServices.map(svc => (
                <div key={svc.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-input">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate">{svc.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(svc.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-px bg-border" />

        <Button variant="destructive" size="sm" className="gap-2 w-full text-xs h-8" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete {isVideoFile(item.path) ? "Video" : isAudioFile(item.path) ? "Audio" : "Image"}
        </Button>
      </div>
    </div>
  )
}

// ── Create Folder Dialog ──────────────────────────────────────────────────────

function CreateFolderDialog({
  onConfirm, onClose,
}: {
  onConfirm: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent hideClose className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl" style={{ width: 380, maxWidth: "95vw" }}>
        <div className="flex flex-col bg-background text-foreground">
          <div className="px-6 pt-5 pb-1">
            <DialogTitle className="text-lg font-bold">New Folder</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Give your collection a name.</p>
          </div>
          <div className="px-6 py-5">
            <Input
              autoFocus
              placeholder="e.g. Backgrounds, Sermon Series…"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit() }}
            />
          </div>
          <div className="flex justify-end gap-2 px-6 pb-5">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={!name.trim()}>Create Folder</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Move Folder Dialog ────────────────────────────────────────────────────────

function MoveFolderDialog({
  folders, excludeIds, onMove, onClose,
}: {
  folders: Folder[]
  excludeIds: Set<string>
  onMove: (targetId: string | null) => void
  onClose: () => void
}) {
  const [targetId, setTargetId] = useState<string | null>(null)
  const available = folders.filter(f => !excludeIds.has(f.id))
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-6">
        <DialogTitle className="mb-4">Move to folder</DialogTitle>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="space-y-0.5 max-h-60 overflow-y-auto p-1.5">
            <button
              onClick={() => setTargetId(null)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${targetId === null ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"}`}
            >
              <FolderOpen className="h-4 w-4" /> Library root
            </button>
            {available.map(f => (
              <button
                key={f.id}
                onClick={() => setTargetId(f.id)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${targetId === f.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent"}`}
              >
                <FolderIcon className="h-4 w-4" /> {f.name}
              </button>
            ))}
            {available.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">No folders yet. Create one first.</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onMove(targetId)}>Move Here</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({
  searching, onUpload, onCreateFolder,
}: {
  searching: boolean
  onUpload: () => void
  onCreateFolder: () => void
}) {
  if (searching) {
    return (
      <div className="h-full flex items-center justify-center text-center">
        <div>
          <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No files match your search</p>
        </div>
      </div>
    )
  }
  return (
    <div className="h-full flex items-center justify-center text-center">
      <div className="max-w-xs">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <ImageIcon className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-sm font-bold mb-1">Nothing here yet</h3>
        <p className="text-xs text-muted-foreground mb-4">Upload media or create a folder to organize your library.</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onCreateFolder}>
            <FolderPlus className="h-3.5 w-3.5" /> New Folder
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onUpload}>
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from "react"
import { Search, Plus, Upload, Play, Pencil, Trash2, Calendar, Clock, LayoutTemplate } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

interface ServiceDate {
  id: number
  date: string
  label: string
  status: 'empty' | 'in-progress' | 'ready'
  notes: string | null
  createdAt: string
  updatedAt: string
}

type ServiceRow = ServiceDate & { itemCount: number }

interface Props {
  onOpenBuilder: (serviceId: number) => void
  onGoLive: () => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

function isUpcoming(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + "T00:00:00") >= today
}

function getStatusBadge(service: ServiceRow) {
  if (!isUpcoming(service.date)) {
    return { label: "PAST", className: "bg-muted text-muted-foreground" }
  }
  if (service.status === "ready") {
    return { label: "READY", className: "bg-green-500/15 text-green-500" }
  }
  return { label: "DRAFT", className: "bg-secondary text-muted-foreground" }
}

// ── Create Lineup Dialog ───────────────────────────────────────────────────────

const TEMPLATES = [
  { value: "standard", label: "Standard Sunday Service" },
  { value: "blank", label: "Blank Lineup" },
  { value: "midweek", label: "Midweek Bible Study" },
  { value: "special", label: "Special Event" },
]

function CreateLineupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("Sunday Service (Morning)")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("09:00")
  const [template, setTemplate] = useState("standard")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    if (!date) { setError("Date is required"); return }
    if (!name.trim()) { setError("Lineup name is required"); return }
    setSaving(true)
    try {
      await window.worshipsync.services.create({ date, label: name.trim(), status: "empty" })
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e?.message?.includes("UNIQUE") ? "A lineup for this date already exists." : "Failed to create lineup.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl"
        style={{ width: 440, maxWidth: "95vw" }}
      >
        <div className="flex flex-col bg-background text-foreground">

          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-1">
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">Create New Lineup</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Set up a new service lineup or event presentation.
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground -mt-1 -mr-1" onClick={onClose}>✕</Button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 flex flex-col gap-4">

            {/* Lineup Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Lineup Name</label>
              <Input
                autoFocus
                placeholder="e.g. Sunday Service (Morning)"
                value={name}
                onChange={(e) => { setName(e.target.value); setError("") }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    className="pl-9"
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setError("") }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="time"
                    className="pl-9"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Template */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Template (Optional)</label>
              <div className="relative">
                <LayoutTemplate className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Start with pre-configured items like welcome slides and standard sections.
              </p>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!date || !name.trim() || saving} onClick={save} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {saving ? "Creating…" : "Create Lineup"}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ManageLineupsScreen({ onOpenBuilder, onGoLive }: Props) {
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      if (window.worshipsync.services.getAllWithCounts) {
        const rows = await window.worshipsync.services.getAllWithCounts()
        setServices(rows)
      } else {
        // Fallback if preload hasn't been rebuilt yet
        const rows = await window.worshipsync.services.getAll()
        setServices(rows.reverse().map(s => ({ ...s, itemCount: 0 })))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    await window.worshipsync.services.delete(id)
    setDeletingId(null)
    await load()
  }

  const filtered = services.filter((s) => {
    const matchSearch = !search.trim() ||
      s.label.toLowerCase().includes(search.toLowerCase()) ||
      s.date.includes(search)

    const matchTab =
      tab === "all" ? true :
      tab === "upcoming" ? isUpcoming(s.date) :
      tab === "past" ? !isUpcoming(s.date) :
      tab === "drafts" ? (s.status === "empty" || s.status === "in-progress") :
      true

    return matchSearch && matchTab
  })

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background text-foreground">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-4 shrink-0">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Lineups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create and organize your service presentations and plans.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> Create New Lineup
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filter tabs + search ─────────────────────────────────────── */}
      <div className="px-8 pb-4 shrink-0 flex items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
            {[
              { value: "all", label: "All Lineups" },
              { value: "upcoming", label: "Upcoming" },
              { value: "past", label: "Past" },
              { value: "drafts", label: "Drafts" },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-none border-b-2 border-transparent px-4 py-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Search lineups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 pb-6">
        {/* Table header */}
        <div className="grid gap-3 px-4 py-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border"
          style={{ gridTemplateColumns: "2fr 1.2fr 0.8fr 0.7fr 0.6fr" }}>
          <span>Lineup Name</span>
          <span>Date &amp; Time</span>
          <span>Status</span>
          <span>Items</span>
          <span className="text-right">Actions</span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              {search ? "No lineups match your search." : "No lineups yet."}
            </p>
            {!search && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create New Lineup
              </Button>
            )}
          </div>
        ) : (
          filtered.map((service) => {
            const badge = getStatusBadge(service)
            return (
              <div
                key={service.id}
                className="grid gap-3 px-4 py-3.5 rounded-lg mb-1 items-center hover:bg-accent/50 transition-colors group border border-transparent hover:border-border"
                style={{ gridTemplateColumns: "2fr 1.2fr 0.8fr 0.7fr 0.6fr" }}
              >
                {/* Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{service.label}</p>
                    {service.notes && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{service.notes}</p>
                    )}
                  </div>
                </div>

                {/* Date */}
                <div className="text-sm text-foreground">{formatDate(service.date)}</div>

                {/* Status */}
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Items */}
                <div className="text-sm text-muted-foreground">
                  {service.itemCount} {service.itemCount === 1 ? "item" : "items"}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-green-500"
                    title="Go Live"
                    onClick={() => { onOpenBuilder(service.id); onGoLive() }}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Edit lineup"
                    onClick={() => onOpenBuilder(service.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Delete lineup"
                    disabled={deletingId === service.id}
                    onClick={() => handleDelete(service.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {showCreate && (
        <CreateLineupDialog
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}

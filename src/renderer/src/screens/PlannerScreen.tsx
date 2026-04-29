import { useEffect, useState, useMemo } from "react"
import {
  Calendar, ChevronRight, Plus, Music2, CheckCircle2,
  Circle, AlertCircle, Trash2, ArrowRight, Sparkles, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useServiceStore } from "../store/useServiceStore"

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNextSundays(count: number): string[] {
  const sundays: string[] = []
  const d = new Date()
  const daysUntil = (7 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + daysUntil)
  for (let i = 0; i < count; i++) {
    sundays.push(d.toISOString().split("T")[0])
    d.setDate(d.getDate() + 7)
  }
  return sundays
}

function getDaysAway(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })
}

function formatShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  })
}

function daysAwayLabel(d: number): string {
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ago`
  if (d === 0) return "Today"
  if (d === 1) return "Tomorrow"
  return `In ${d} days`
}

// ── Main Screen ──────────────────────────────────────────────────────────────

interface Props {
  onOpenService: (serviceId: number) => void
  onGoLive: (serviceId: number) => void
}

export default function PlannerScreen({ onOpenService, onGoLive }: Props) {
  const {
    services, loadServices, createService, deleteService, updateService,
  } = useServiceStore()
  const [showNew, setShowNew] = useState(false)
  const [editingService, setEditingService] = useState<any | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [songCounts, setSongCounts] = useState<Record<number, number>>({})
  const [itemCounts, setItemCounts] = useState<Record<number, number>>({})

  useEffect(() => { loadServices() }, [])

  // Load lineup counts for all services
  useEffect(() => {
    if (services.length === 0) return
    window.worshipsync.services.getAllWithCounts().then((rows: any[]) => {
      const songs: Record<number, number> = {}
      const items: Record<number, number> = {}
      rows.forEach((r) => { songs[r.id] = r.songCount; items[r.id] = r.itemCount })
      setSongCounts(songs)
      setItemCounts(items)
    }).catch(() => {})
  }, [services])

  // ── Derived: find the "next" service to prepare ─────────────────────────
  const sortedUpcoming = useMemo(() => {
    return [...services]
      .filter((s) => getDaysAway(s.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [services])

  const nextService = sortedUpcoming[0] ?? null
  const pastServices = useMemo(() =>
    [...services]
      .filter((s) => getDaysAway(s.date) < 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    [services]
  )

  const handleInitSundays = async () => {
    setInitializing(true)
    const sundays = getNextSundays(6)
    for (const date of sundays) {
      const exists = services.find((s) => s.date === date)
      if (!exists) await createService(date, "Sunday Service")
    }
    setInitializing(false)
  }

  const openInBuilder = (service: any) => {
    onOpenService(service.id)
  }

  const goLive = (service: any) => {
    onGoLive(service.id)
  }

  if (services.length === 0) {
    return (
      <EmptyState onCreate={() => setShowNew(true)} onInit={handleInitSundays} initializing={initializing} />
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* ── Hero: Next service to prepare ────────────────────────────── */}
        {nextService && (
          <NextServiceHero
            service={nextService}
            songCount={songCounts[nextService.id] ?? 0}
            itemCount={itemCounts[nextService.id] ?? 0}
            onPrepare={() => openInBuilder(nextService)}
            onGoLive={() => goLive(nextService)}
            onEdit={() => setEditingService(nextService)}
          />
        )}

        {/* ── Upcoming services ────────────────────────────────────────── */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Upcoming Services
            </h2>
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => setShowNew(true)}>
              <Plus className="h-3.5 w-3.5" /> New service
            </Button>
          </div>

          {sortedUpcoming.length <= 1 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No other upcoming services scheduled.
              </p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleInitSundays} disabled={initializing}>
                <Sparkles className="h-3.5 w-3.5" />
                {initializing ? "Adding…" : "Add next 6 Sundays"}
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sortedUpcoming.slice(1).map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  itemCount={itemCounts[service.id] ?? 0}
                  onOpen={() => openInBuilder(service)}
                  onEdit={() => setEditingService(service)}
                  onDelete={() => { if (confirm("Delete this service?")) deleteService(service.id) }}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Past services ────────────────────────────────────────────── */}
        {pastServices.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Past Services
            </h2>
            <div className="space-y-1.5">
              {pastServices.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  itemCount={itemCounts[service.id] ?? 0}
                  past
                  onOpen={() => openInBuilder(service)}
                  onEdit={() => setEditingService(service)}
                  onDelete={() => { if (confirm("Delete this service?")) deleteService(service.id) }}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {showNew && (
        <NewServiceDialog
          onClose={() => setShowNew(false)}
          onCreate={async (date, label) => {
            await createService(date, label)
            setShowNew(false)
          }}
        />
      )}

      {editingService && (
        <EditServiceDialog
          service={editingService}
          onClose={() => setEditingService(null)}
          onSave={async (data) => {
            await updateService(editingService.id, data)
            setEditingService(null)
          }}
        />
      )}
    </div>
  )
}

// ── Next Service Hero ────────────────────────────────────────────────────────

function NextServiceHero({
  service, songCount, itemCount, onPrepare, onGoLive, onEdit,
}: {
  service: any
  songCount: number
  itemCount: number
  onPrepare: () => void
  onGoLive: () => void
  onEdit: () => void
}) {
  const daysAway = getDaysAway(service.date)
  const isToday = daysAway === 0
  const isSoon = daysAway <= 3 && daysAway > 0

  const checks = useMemo(() => [
    { label: "Service date created", done: true },
    { label: "Songs added to lineup", done: songCount > 0 },
    { label: "At least 3 songs", done: songCount >= 3 },
    { label: "Marked as ready", done: service.status === "ready" },
  ], [songCount, service.status])

  const completedCount = checks.filter((c) => c.done).length
  const progress = (completedCount / checks.length) * 100

  return (
    <section className="rounded-2xl border border-border bg-card shadow-elevation-1 overflow-hidden">
      {/* Banner strip */}
      <div
        className={`px-6 py-2.5 flex items-center gap-2 text-xs font-semibold ${
          isToday
            ? "bg-green-500/10 text-green-400 border-b border-green-500/20"
            : isSoon
              ? "bg-amber-500/10 text-amber-400 border-b border-amber-500/20"
              : "bg-primary/5 text-primary border-b border-primary/10"
        }`}
      >
        <div className={`h-2 w-2 rounded-full ${
          isToday ? "bg-green-500 animate-pulse" : isSoon ? "bg-amber-500" : "bg-primary"
        }`} />
        {isToday ? "TODAY'S SERVICE" : "NEXT UP"}
        <span className="ml-auto font-normal text-muted-foreground">
          {daysAwayLabel(daysAway)}
        </span>
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-foreground truncate">
              {service.label}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(service.date)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Edit service" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {isToday ? (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onPrepare}>
                  Review lineup
                </Button>
                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={onGoLive}>
                  <Sparkles className="h-3.5 w-3.5" /> Go Live
                </Button>
              </>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={onPrepare}>
                Prepare lineup <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Progress + checklist */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Readiness
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {completedCount} / {checks.length}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
            <div
              className={`h-full transition-all ${
                progress === 100 ? "bg-green-500" : progress >= 50 ? "bg-amber-500" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {checks.map((check) => (
              <div key={check.label} className="flex items-center gap-2">
                {check.done ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={`text-xs ${check.done ? "text-foreground" : "text-muted-foreground"}`}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick stat */}
        <div className="mt-5 pt-5 border-t border-border flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">
              <span className="font-semibold">{itemCount}</span>{" "}
              <span className="text-muted-foreground">
                {itemCount === 1 ? "item" : "items"} in lineup
              </span>
            </span>
          </div>
          {itemCount === 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" />
              Lineup is empty — click "Prepare lineup" to add items
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Service Row ──────────────────────────────────────────────────────────────

function ServiceRow({
  service, itemCount, past, onOpen, onEdit, onDelete,
}: {
  service: any
  itemCount: number
  past?: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const daysAway = getDaysAway(service.date)

  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/40 transition-all cursor-pointer"
      onClick={onOpen}
    >
      {/* Date chip */}
      <div className="h-11 w-11 shrink-0 rounded-xl bg-secondary flex flex-col items-center justify-center text-center">
        <span className="text-[9px] uppercase font-bold text-muted-foreground leading-none">
          {new Date(service.date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="text-base font-bold text-foreground leading-none mt-0.5">
          {new Date(service.date + "T00:00:00").getDate()}
        </span>
      </div>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{service.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {past ? formatShort(service.date) : daysAwayLabel(daysAway)}
          {" · "}
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </p>
      </div>

      {/* Status pill */}
      <StatusPill status={service.status} past={past} />

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Edit"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  )
}

function StatusPill({ status, past }: { status: string; past?: boolean }) {
  if (past) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        Past
      </span>
    )
  }
  if (status === "ready") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500/15 text-green-500">
        Ready
      </span>
    )
  }
  if (status === "in-progress") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
        In prep
      </span>
    )
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      Draft
    </span>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  onCreate, onInit, initializing,
}: {
  onCreate: () => void
  onInit: () => void
  initializing: boolean
}) {
  return (
    <div className="h-full flex items-center justify-center bg-background text-foreground">
      <div className="text-center max-w-md px-6">
        <div className="h-16 w-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
          <Calendar className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold mb-2">Welcome to WorshipSync</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Plan your service lineups and present them live. Start by adding your
          upcoming service dates.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5" /> New service
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onInit} disabled={initializing}>
            <Sparkles className="h-3.5 w-3.5" />
            {initializing ? "Creating…" : "Add next 6 Sundays"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Service Dialog ──────────────────────────────────────────────────────

function EditServiceDialog({
  service, onClose, onSave,
}: {
  service: any
  onClose: () => void
  onSave: (data: { label: string; date: string }) => Promise<void>
}) {
  const [label, setLabel] = useState(service.label)
  const [date, setDate] = useState(service.date)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    if (!date) { setError("Please pick a date"); return }
    if (!label.trim()) { setError("Please enter a service name"); return }
    setSaving(true)
    try {
      await onSave({ label: label.trim(), date })
    } catch (e: any) {
      setError(e?.message?.includes("UNIQUE") ? "A service already exists for this date." : "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideClose className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl" style={{ width: 420, maxWidth: "95vw" }}>
        <div className="flex flex-col bg-background text-foreground">
          <div className="px-6 pt-5 pb-1">
            <DialogTitle className="text-lg font-bold">Edit service</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Update the name or date for this service.</p>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Service name</label>
              <Input
                autoFocus
                value={label}
                onChange={(e) => { setLabel(e.target.value); setError("") }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Date</label>
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

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={saving} onClick={save} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── New Service Dialog ───────────────────────────────────────────────────────

function NewServiceDialog({
  onClose, onCreate,
}: {
  onClose: () => void
  onCreate: (date: string, label: string) => Promise<void>
}) {
  const [date, setDate] = useState("")
  const [label, setLabel] = useState("Sunday Service")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    if (!date) { setError("Please pick a date"); return }
    setSaving(true)
    try {
      await onCreate(date, label.trim() || "Sunday Service")
    } catch (e: any) {
      setError(e?.message?.includes("UNIQUE") ? "A service already exists for this date." : "Failed to create service.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideClose className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl" style={{ width: 420, maxWidth: "95vw" }}>
        <div className="flex flex-col bg-background text-foreground">
          <div className="px-6 pt-5 pb-1">
            <DialogTitle className="text-lg font-bold">New service date</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Create a new service to start building its lineup.
            </p>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Service name</label>
              <Input
                autoFocus
                placeholder="e.g. Sunday Service"
                value={label}
                onChange={(e) => { setLabel(e.target.value); setError("") }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Date</label>
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

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!date || saving} onClick={save} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

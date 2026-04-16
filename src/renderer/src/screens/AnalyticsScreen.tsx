import { useEffect, useState } from "react"
import {
  BarChart3, Calendar, TrendingUp, AlertCircle, Music2,
  CheckCircle2, Clock, History,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface SongWithUsage {
  id: number
  title: string
  artist: string
  key: string | null
  usageCount: number
  lastUsedDate: string | null
  lastUsedLabel: string | null
}

interface ServiceDate {
  id: number
  date: string
  label: string
  status: string
  createdAt: string
  updatedAt: string
}

function weeksAgo(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00")
  const today = new Date()
  return Math.floor(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 7),
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

type SortKey = "usage" | "recent" | "alpha" | "never"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "usage", label: "Most used" },
  { key: "recent", label: "Recent" },
  { key: "alpha", label: "A–Z" },
  { key: "never", label: "Overdue" },
]

export default function AnalyticsScreen() {
  const [songUsage, setSongUsage] = useState<SongWithUsage[]>([])
  const [serviceHistory, setServiceHistory] = useState<ServiceDate[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>("usage")

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [usage, history] = await Promise.all([
      window.worshipsync.analytics.getSongUsage() as Promise<SongWithUsage[]>,
      window.worshipsync.analytics.getServiceHistory() as Promise<ServiceDate[]>,
    ])
    setSongUsage(usage)
    setServiceHistory(history)
    setLoading(false)
  }

  const sorted = [...songUsage].sort((a, b) => {
    if (sortBy === "usage") return b.usageCount - a.usageCount
    if (sortBy === "alpha") return a.title.localeCompare(b.title)
    if (sortBy === "never") {
      if (!a.lastUsedDate && !b.lastUsedDate) return 0
      if (!a.lastUsedDate) return -1
      if (!b.lastUsedDate) return 1
      return a.lastUsedDate.localeCompare(b.lastUsedDate)
    }
    if (!a.lastUsedDate && !b.lastUsedDate) return 0
    if (!a.lastUsedDate) return 1
    if (!b.lastUsedDate) return -1
    return b.lastUsedDate.localeCompare(a.lastUsedDate)
  })

  const maxUsage = Math.max(...songUsage.map((s) => s.usageCount), 1)
  const totalServices = serviceHistory.length
  const totalUnique = songUsage.filter((s) => s.usageCount > 0).length
  const neverUsed = songUsage.filter((s) => s.usageCount === 0).length
  const overdueCount = songUsage.filter(
    (s) => s.lastUsedDate && weeksAgo(s.lastUsedDate) >= 8,
  ).length

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4 animate-pulse" />
          Loading analytics…
        </div>
      </div>
    )
  }

  const stats = [
    {
      label: "Total services",
      value: totalServices,
      sub: "logged",
      icon: Calendar,
    },
    {
      label: "Songs used",
      value: totalUnique,
      sub: `of ${songUsage.length} in library`,
      icon: Music2,
    },
    {
      label: "Overdue rotation",
      value: overdueCount,
      sub: "not used in 8+ wks",
      icon: AlertCircle,
      tone: overdueCount > 0 ? "amber" as const : undefined,
    },
    {
      label: "Never used",
      value: neverUsed,
      sub: "songs in library",
      icon: Clock,
    },
  ]

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </span>
                  <Icon
                    className={`h-3.5 w-3.5 ${
                      stat.tone === "amber" ? "text-amber-500" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="text-2xl font-bold leading-none">{stat.value}</div>
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  {stat.sub}
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

          {/* ── Song usage table ──────────────────────────────────────── */}
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex-1">
                Song usage
              </span>
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortBy(opt.key)}
                    className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                      sortBy === opt.key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto">
              {sorted.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No songs in library yet.
                </div>
              ) : (
                sorted.map((song) => {
                  const status = getRotationStatus(song)
                  const barWidth = maxUsage > 0 ? (song.usageCount / maxUsage) * 100 : 0
                  return (
                    <div
                      key={song.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-background"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-foreground truncate">
                          {song.title}
                        </div>
                        <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              song.usageCount === 0 ? "bg-muted-foreground/30" : "bg-primary"
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-foreground tabular-nums">
                          {song.usageCount}×
                        </div>
                        <div className={`text-[10px] mt-0.5 ${status.className}`}>
                          {status.label}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* ── Right column ──────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Rotation health */}
            <section className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Rotation health
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                {(() => {
                  const items = songUsage
                    .filter((s) => s.usageCount > 0)
                    .sort((a, b) => {
                      if (!a.lastUsedDate) return 1
                      if (!b.lastUsedDate) return -1
                      return a.lastUsedDate.localeCompare(b.lastUsedDate)
                    })
                    .slice(0, 6)
                  if (items.length === 0) {
                    return (
                      <div className="text-center py-4 text-xs text-muted-foreground">
                        No usage data yet.
                      </div>
                    )
                  }
                  return items.map((song) => {
                    const weeks = song.lastUsedDate ? weeksAgo(song.lastUsedDate) : 99
                    const isOverdue = weeks >= 8
                    const isOverused = song.usageCount >= 4 && weeks <= 3
                    return (
                      <div
                        key={song.id}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-background border border-border"
                      >
                        <div
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            isOverused
                              ? "bg-destructive"
                              : isOverdue
                                ? "bg-amber-500"
                                : "bg-green-500"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-foreground truncate">
                            {song.title}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {isOverused
                              ? "Consider a break"
                              : isOverdue
                                ? `${weeks} weeks since last use`
                                : "Good rotation"}
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </section>

            {/* Service history */}
            <section className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Service history
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                {serviceHistory.length === 0 ? (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    No services logged yet.
                  </div>
                ) : (
                  serviceHistory.slice(0, 8).map((service) => (
                    <div
                      key={service.id}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-background border border-border"
                    >
                      <div
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          service.status === "ready"
                            ? "bg-green-500"
                            : service.status === "in-progress"
                              ? "bg-amber-500"
                              : "bg-muted-foreground/40"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-foreground truncate">
                          {service.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(service.date)}
                        </div>
                      </div>
                      <ServiceStatusBadge status={service.status} />
                    </div>
                  ))
                )}
              </div>
            </section>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={loadData}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getRotationStatus(song: SongWithUsage): { label: string; className: string } {
  if (song.usageCount === 0) return { label: "Never used", className: "text-muted-foreground" }
  if (!song.lastUsedDate) return { label: "Unknown", className: "text-muted-foreground" }
  const weeks = weeksAgo(song.lastUsedDate)
  if (weeks <= 2) return { label: `${weeks}w ago`, className: "text-green-500" }
  if (weeks <= 6) return { label: `${weeks}w ago`, className: "text-primary" }
  if (weeks <= 10) return { label: `${weeks}w ago`, className: "text-amber-500" }
  return { label: `${weeks}w ago`, className: "text-destructive" }
}

function ServiceStatusBadge({ status }: { status: string }) {
  if (status === "ready") {
    return (
      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500">
        Ready
      </span>
    )
  }
  if (status === "in-progress") {
    return (
      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
        In prep
      </span>
    )
  }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
      Empty
    </span>
  )
}

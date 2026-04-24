import { useState, useEffect } from "react"
import {
  CalendarClock,
  Clock,
  MonitorPlay,
  Music,
  Image,
  ListTodo,
  CalendarPlus,
  ImagePlus,
  Settings2,
  Projector,
  Monitor,
  ListOrdered,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AppScreen } from "../../../../shared/types"

interface ServiceWithCount {
  id: number
  date: string
  label: string
  status: "empty" | "in-progress" | "ready"
  itemCount: number
}

interface Display {
  id: number
  label: string
  width: number
  height: number
  isPrimary: boolean
}

interface ServiceSchedule {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  label: string
  timezone?: string
}

function getTzAbbr(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? tz
  } catch {
    return tz
  }
}

interface Props {
  onGoLive: (serviceId: number) => void
  onOpenBuilder: (serviceId: number) => void
  onNavigate: (screen: AppScreen) => void
}

function StatusPill({ status }: { status: "empty" | "in-progress" | "ready" }) {
  const map = {
    "empty":       "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground",
    "in-progress": "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary",
    "ready":       "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500/15 text-green-500",
  }
  const labels = { "empty": "Empty", "in-progress": "Draft", "ready": "Ready" }
  return <span className={map[status]}>{labels[status]}</span>
}

export default function OverviewScreen({ onGoLive, onOpenBuilder, onNavigate }: Props) {
  const [now, setNow] = useState(new Date())
  const [services, setServices] = useState<ServiceWithCount[]>([])
  const [songCount, setSongCount] = useState(0)
  const [mediaCount, setMediaCount] = useState(0)
  const [displays, setDisplays] = useState<Display[]>([])
  const [serviceTime, setServiceTime] = useState("11:00")
  const [serviceTimezone, setServiceTimezone] = useState("America/Los_Angeles")
  const [serviceSchedules, setServiceSchedules] = useState<ServiceSchedule[]>([])

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    window.worshipsync.services.getAllWithCounts().then(setServices as any).catch(() => {})
    window.worshipsync.songs.getAll().then((s) => setSongCount(s.length)).catch(() => {})
    window.worshipsync.backgrounds.listImages().then((m) => setMediaCount(m.length)).catch(() => {})
    window.worshipsync.window.getDisplays().then(setDisplays as any).catch(() => {})
    window.worshipsync.appState.get().then((state: any) => {
      if (state.serviceTime)      setServiceTime(state.serviceTime)
      if (state.serviceTimezone)  setServiceTimezone(state.serviceTimezone)
      if (state.serviceSchedules) setServiceSchedules(state.serviceSchedules)
    }).catch(() => {})
  }, [])

  const todayStr = now.toLocaleDateString("en-CA")
  const sorted = [...services].sort((a, b) => a.date.localeCompare(b.date))
  const upcoming = sorted.filter((s) => s.date >= todayStr)
  const recent = sorted.filter((s) => s.date < todayStr).reverse().slice(0, 3)
  const nextService = upcoming[0] ?? null

  const daysUntil = nextService
    ? Math.round(
        (new Date(nextService.date + "T00:00:00").getTime() -
          new Date(todayStr + "T00:00:00").getTime()) / 86400000,
      )
    : null

  const clockStr =
    now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })

  // Match next service's day-of-week to a saved schedule to get its timezone
  const effectiveTz = (() => {
    if (!nextService) return serviceTimezone
    const dow = new Date(nextService.date + "T12:00:00").getDay()
    return serviceSchedules.find((s) => s.dayOfWeek === dow)?.timezone ?? serviceTimezone
  })()

  const displayTime = serviceTime
    ? new Date(`2000-01-01T${serviceTime}`).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true,
      })
    : ""

  const tzAbbr = getTzAbbr(effectiveTz)

  const nextDate = nextService ? new Date(nextService.date + "T00:00:00") : null
  const nextMonth = nextDate?.toLocaleDateString("en-US", { month: "short" }).toUpperCase() ?? ""
  const nextDay = nextDate?.getDate() ?? ""

  const subtitleText = nextService
    ? daysUntil === 0
      ? "Today is service day."
      : daysUntil === 1
        ? "Next service is tomorrow."
        : `Next service in ${daysUntil} days.`
    : "No upcoming services found."

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Overview</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitleText}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-3.5 py-2 flex items-center gap-2.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold tabular-nums">{clockStr}</span>
          </div>
        </div>

        {/* ── Row 1: Next Service (2/3) + Displays (1/3) ─────────────────── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Next Upcoming Service */}
          <div className="col-span-2 rounded-2xl border border-border bg-card shadow-elevation-1 p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Next Upcoming Service
                </span>
              </div>
              {nextService && <StatusPill status={nextService.status} />}
            </div>

            {nextService ? (
              <div className="flex items-center gap-6">
                {/* Date block */}
                <div className="bg-secondary border border-border rounded-xl px-4 py-3 text-center shrink-0">
                  <div className="text-[10px] font-bold text-primary uppercase tracking-widest">{nextMonth}</div>
                  <div className="text-3xl font-bold text-foreground leading-none mt-1">{nextDay}</div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-foreground truncate">{nextService.label}</div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />{displayTime}
                      <span className="text-[10px] font-medium bg-muted rounded px-1.5 py-0.5">{tzAbbr}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ListOrdered className="h-3.5 w-3.5" />
                      {nextService.itemCount} {nextService.itemCount === 1 ? "item" : "items"}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" className="gap-1.5" onClick={() => onGoLive(nextService.id)}>
                    <MonitorPlay className="h-3.5 w-3.5" /> Go Live
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOpenBuilder(nextService.id)}>
                    Open Planner
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-6 gap-2.5">
                <p className="text-xs text-muted-foreground">No upcoming services scheduled.</p>
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5" onClick={() => onNavigate("planner")}>
                  <CalendarPlus className="h-3.5 w-3.5" /> Create a Service
                </Button>
              </div>
            )}
          </div>

          {/* Display Outputs */}
          <div className="rounded-2xl border border-border bg-card shadow-elevation-1 p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Display Outputs
              </span>
            </div>

            <div className="flex flex-col divide-y divide-border">
              {displays.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No displays detected.</p>
              )}
              {displays.map((d, i) => {
                const Icon = i === 0 ? Projector : Monitor
                return (
                  <div key={d.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {d.isPrimary ? "Operator Display" : "Projection Screen"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{d.width}×{d.height}</div>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-[hsl(var(--success))] shrink-0" />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Row 2: Recent Services (2/3) + Quick Actions (1/3) ─────────── */}
        <div className="grid grid-cols-3 gap-4">

          {/* Recent Services */}
          <div className="col-span-2 rounded-2xl border border-border bg-card shadow-elevation-1 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Recent Services
                </span>
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onNavigate("planner")}>
                View All
              </Button>
            </div>

            {recent.length === 0 ? (
              <div className="p-5">
                <p className="text-xs text-muted-foreground">No past services yet.</p>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {["Service", "Date", "Items", "Status", ""].map((h) => (
                      <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-2.5 px-4 first:pl-5 last:pr-5 last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="py-3 px-4 pl-5 font-semibold text-foreground">{s.label}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{s.itemCount} items</td>
                      <td className="py-3 px-4"><StatusPill status={s.status} /></td>
                      <td className="py-3 px-4 pr-5 text-right">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenBuilder(s.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-border bg-card shadow-elevation-1 p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Quick Actions
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 flex-1">
              {[
                { icon: CalendarPlus, label: "New Service",  action: () => onNavigate("planner")  },
                { icon: Music,        label: "Add Song",     action: () => onNavigate("library")  },
                { icon: ImagePlus,    label: "Upload Media", action: () => onNavigate("media")    },
                { icon: Settings2,    label: "Settings",     action: () => onNavigate("settings") },
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="bg-secondary border border-border rounded-lg p-3 flex flex-col items-center justify-center gap-2 text-xs font-medium text-foreground text-center hover:bg-accent/30 transition-colors cursor-pointer"
                >
                  <Icon className="h-5 w-5 text-primary" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 3: Library Stats ────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card shadow-elevation-1 p-5">
          <div className="flex items-center gap-2 mb-5">
            <Music className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Library Statistics
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: Music,       label: "Total Songs",        value: songCount,          bg: "bg-primary/10",                        color: "text-primary"                   },
              { icon: Image,       label: "Media Assets",       value: mediaCount,         bg: "bg-[hsl(var(--warning)/0.12)]",        color: "text-[hsl(var(--warning))]"     },
              { icon: ListTodo,    label: "Saved Services",     value: services.length,    bg: "bg-[hsl(var(--success)/0.12)]",        color: "text-[hsl(var(--success))]"     },
              { icon: CalendarPlus,label: "Upcoming Services",  value: upcoming.length,    bg: "bg-secondary",                         color: "text-muted-foreground"          },
            ].map(({ icon: Icon, label, value, bg, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${bg} ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground leading-none">{value.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

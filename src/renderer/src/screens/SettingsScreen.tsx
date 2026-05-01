import { useState, useEffect, useCallback } from "react"
import {
  Download, Upload, CheckCircle2, AlertCircle, Database, Clock,
  Church, CalendarDays, Plus, Trash2, X, Monitor, Wifi, Copy, Check,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

// ── Types & helpers ───────────────────────────────────────────────────────────

interface ServiceSchedule {
  id: string
  dayOfWeek: number  // 0 = Sunday … 6 = Saturday
  startTime: string  // "HH:MM"
  endTime: string    // "HH:MM"
  label: string
  timezone?: string  // IANA tz — falls back to global serviceTimezone if absent
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

const DAYS_FULL  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`
}

function hasConflict(
  schedules: ServiceSchedule[],
  candidate: Pick<ServiceSchedule, "dayOfWeek" | "startTime" | "endTime">,
  excludeId?: string,
): boolean {
  return schedules
    .filter((s) => s.id !== excludeId && s.dayOfWeek === candidate.dayOfWeek)
    .some((s) => {
      const sS = toMins(s.startTime), sE = toMins(s.endTime)
      const cS = toMins(candidate.startTime), cE = toMins(candidate.endTime)
      return cS < sE && sS < cE
    })
}

// IANA timezone list — value is the identifier used by Intl, label shown in the select.
// Sorted roughly west-to-east within each continent group.
const TIMEZONES = [
  // ── Americas ──
  { value: "Pacific/Honolulu",          label: "Pacific/Honolulu" },
  { value: "America/Anchorage",         label: "America/Anchorage" },
  { value: "America/Los_Angeles",       label: "America/Los_Angeles" },
  { value: "America/Vancouver",         label: "America/Vancouver" },
  { value: "America/Tijuana",           label: "America/Tijuana" },
  { value: "America/Phoenix",           label: "America/Phoenix" },
  { value: "America/Denver",            label: "America/Denver" },
  { value: "America/Edmonton",          label: "America/Edmonton" },
  { value: "America/Chicago",           label: "America/Chicago" },
  { value: "America/Winnipeg",          label: "America/Winnipeg" },
  { value: "America/Mexico_City",       label: "America/Mexico_City" },
  { value: "America/New_York",          label: "America/New_York" },
  { value: "America/Toronto",           label: "America/Toronto" },
  { value: "America/Indiana/Indianapolis", label: "America/Indiana/Indianapolis" },
  { value: "America/Halifax",           label: "America/Halifax" },
  { value: "America/St_Johns",          label: "America/St_Johns" },
  { value: "America/Sao_Paulo",         label: "America/Sao_Paulo" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires" },
  { value: "America/Santiago",          label: "America/Santiago" },
  { value: "America/Bogota",            label: "America/Bogota" },
  { value: "America/Lima",              label: "America/Lima" },
  { value: "America/Caracas",           label: "America/Caracas" },
  // ── Europe / Africa ──
  { value: "Atlantic/Reykjavik",        label: "Atlantic/Reykjavik" },
  { value: "Europe/London",             label: "Europe/London" },
  { value: "Europe/Lisbon",             label: "Europe/Lisbon" },
  { value: "Europe/Dublin",             label: "Europe/Dublin" },
  { value: "Europe/Paris",              label: "Europe/Paris" },
  { value: "Europe/Berlin",             label: "Europe/Berlin" },
  { value: "Europe/Rome",               label: "Europe/Rome" },
  { value: "Europe/Madrid",             label: "Europe/Madrid" },
  { value: "Europe/Amsterdam",          label: "Europe/Amsterdam" },
  { value: "Europe/Brussels",           label: "Europe/Brussels" },
  { value: "Europe/Warsaw",             label: "Europe/Warsaw" },
  { value: "Europe/Stockholm",          label: "Europe/Stockholm" },
  { value: "Europe/Zurich",             label: "Europe/Zurich" },
  { value: "Europe/Athens",             label: "Europe/Athens" },
  { value: "Europe/Helsinki",           label: "Europe/Helsinki" },
  { value: "Europe/Bucharest",          label: "Europe/Bucharest" },
  { value: "Europe/Istanbul",           label: "Europe/Istanbul" },
  { value: "Europe/Moscow",             label: "Europe/Moscow" },
  { value: "Africa/Cairo",              label: "Africa/Cairo" },
  { value: "Africa/Lagos",              label: "Africa/Lagos" },
  { value: "Africa/Nairobi",            label: "Africa/Nairobi" },
  { value: "Africa/Johannesburg",       label: "Africa/Johannesburg" },
  // ── Middle East / Asia ──
  { value: "Asia/Dubai",                label: "Asia/Dubai" },
  { value: "Asia/Riyadh",               label: "Asia/Riyadh" },
  { value: "Asia/Tehran",               label: "Asia/Tehran" },
  { value: "Asia/Karachi",              label: "Asia/Karachi" },
  { value: "Asia/Kolkata",              label: "Asia/Kolkata" },
  { value: "Asia/Colombo",              label: "Asia/Colombo" },
  { value: "Asia/Dhaka",                label: "Asia/Dhaka" },
  { value: "Asia/Yangon",               label: "Asia/Yangon" },
  { value: "Asia/Bangkok",              label: "Asia/Bangkok" },
  { value: "Asia/Ho_Chi_Minh",          label: "Asia/Ho_Chi_Minh" },
  { value: "Asia/Jakarta",              label: "Asia/Jakarta" },
  { value: "Asia/Kuala_Lumpur",         label: "Asia/Kuala_Lumpur" },
  { value: "Asia/Singapore",            label: "Asia/Singapore" },
  { value: "Asia/Manila",               label: "Asia/Manila" },
  { value: "Asia/Hong_Kong",            label: "Asia/Hong_Kong" },
  { value: "Asia/Shanghai",             label: "Asia/Shanghai" },
  { value: "Asia/Taipei",               label: "Asia/Taipei" },
  { value: "Asia/Seoul",                label: "Asia/Seoul" },
  { value: "Asia/Tokyo",                label: "Asia/Tokyo" },
  // ── Pacific / Oceania ──
  { value: "Australia/Perth",           label: "Australia/Perth" },
  { value: "Australia/Darwin",          label: "Australia/Darwin" },
  { value: "Australia/Adelaide",        label: "Australia/Adelaide" },
  { value: "Australia/Brisbane",        label: "Australia/Brisbane" },
  { value: "Australia/Sydney",          label: "Australia/Sydney" },
  { value: "Australia/Melbourne",       label: "Australia/Melbourne" },
  { value: "Pacific/Auckland",          label: "Pacific/Auckland" },
  { value: "Pacific/Fiji",              label: "Pacific/Fiji" },
  { value: "Pacific/Guam",              label: "Pacific/Guam" },
]

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-elevation-1 p-5">
      {children}
    </div>
  )
}

function CardHeader({ icon: Icon, title, description }: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [dataStatus, setDataStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  // Church
  const [churchName, setChurchName]           = useState("")
  const [churchNameSaved, setChurchNameSaved] = useState(false)

  // Service schedules
  const [schedules, setSchedules]             = useState<ServiceSchedule[]>([])
  const [adding, setAdding]                   = useState(false)
  const [newDay, setNewDay]                   = useState(0)
  const [newStart, setNewStart]               = useState("09:00")
  const [newEnd, setNewEnd]                   = useState("11:00")
  const [newLabel, setNewLabel]               = useState("")
  const [newTimezone, setNewTimezone]         = useState("America/Los_Angeles")
  const [scheduleError, setScheduleError]     = useState("")

  // Service defaults
  const [serviceTime, setServiceTime]         = useState("11:00")
  const [serviceTimezone, setServiceTimezone] = useState("America/Los_Angeles")
  const [timeSaved, setTimeSaved]             = useState(false)

  // Projection
  const [projectionFontSize, setProjectionFontSize] = useState(48)
  const [fontSizeSaved, setFontSizeSaved]            = useState(false)

  // Stage display
  const [stageRunning, setStageRunning]     = useState(false)
  const [stageURL, setStageURL]             = useState("")
  const [stagePortInput, setStagePortInput] = useState("4040")
  const [stageClients, setStageClients]     = useState(0)
  const [stageCopied, setStageCopied]       = useState(false)
  const [stageLoading, setStageLoading]     = useState(false)

  const refreshStageStatus = useCallback(async () => {
    const s = await window.worshipsync.stageDisplay.getStatus()
    setStageRunning(s.running)
    setStageURL(s.url)
    setStagePortInput(String(s.port))
    setStageClients(s.clients)
  }, [])

  useEffect(() => {
    window.worshipsync.appState.get().then((state: Record<string, any>) => {
      if (state.churchName)         setChurchName(state.churchName)
      if (state.serviceSchedules)   setSchedules(state.serviceSchedules)
      if (state.serviceTime)        setServiceTime(state.serviceTime)
      if (state.serviceTimezone)  { setServiceTimezone(state.serviceTimezone); setNewTimezone(state.serviceTimezone) }
      if (state.projectionFontSize) setProjectionFontSize(state.projectionFontSize)
    }).catch(() => {})
    refreshStageStatus().catch(() => {})
  }, [refreshStageStatus])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveChurchName = async () => {
    await window.worshipsync.appState.set({ churchName })
    setChurchNameSaved(true)
    setTimeout(() => setChurchNameSaved(false), 2000)
  }

  const persistSchedules = async (updated: ServiceSchedule[]) => {
    setSchedules(updated)
    await window.worshipsync.appState.set({ serviceSchedules: updated })
  }

  const handleAddSchedule = async () => {
    setScheduleError("")
    if (toMins(newEnd) <= toMins(newStart)) {
      setScheduleError("End time must be after start time.")
      return
    }
    const candidate = { dayOfWeek: newDay, startTime: newStart, endTime: newEnd }
    if (hasConflict(schedules, candidate)) {
      setScheduleError("This time slot conflicts with an existing schedule on that day.")
      return
    }
    await persistSchedules([
      ...schedules,
      { id: Date.now().toString(), label: newLabel.trim(), timezone: newTimezone, ...candidate },
    ])
    setAdding(false)
    setNewDay(0); setNewStart("09:00"); setNewEnd("11:00"); setNewLabel("")
  }

  const handleDeleteSchedule = async (id: string) =>
    persistSchedules(schedules.filter((s) => s.id !== id))

  const handleSaveTime = async () => {
    await window.worshipsync.appState.set({ serviceTime, serviceTimezone })
    setTimeSaved(true)
    setTimeout(() => setTimeSaved(false), 2000)
  }

  const handleSaveFontSize = async () => {
    await window.worshipsync.appState.set({ projectionFontSize })
    setFontSizeSaved(true)
    setTimeout(() => setFontSizeSaved(false), 2000)
  }

  const handleExport = async () => {
    setDataStatus(null)
    const res = await (window.worshipsync as any).data.export()
    if (res?.success)       setDataStatus({ type: "success", msg: "Backup saved successfully." })
    else if (!res?.canceled) setDataStatus({ type: "error",   msg: "Export failed." })
  }

  const handleImport = async () => {
    setDataStatus(null)
    const res = await (window.worshipsync as any).data.import()
    if (res?.success)  setDataStatus({ type: "success", msg: "Data imported. Restart the app to reload everything." })
    else if (res?.error) setDataStatus({ type: "error", msg: res.error })
  }

  const sortedSchedules = [...schedules].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || toMins(a.startTime) - toMins(b.startTime),
  )

  const handleStageToggle = async () => {
    setStageLoading(true)
    if (stageRunning) {
      await window.worshipsync.stageDisplay.stop()
    } else {
      const port = parseInt(stagePortInput) || 4040
      await window.worshipsync.stageDisplay.start(port)
    }
    await refreshStageStatus()
    setStageLoading(false)
  }

  const handleCopyURL = () => {
    navigator.clipboard.writeText(stageURL).then(() => {
      setStageCopied(true)
      setTimeout(() => setStageCopied(false), 2000)
    })
  }

  // ── Nav items ─────────────────────────────────────────────────────────────

  type Tab = "church" | "service" | "projection" | "stage" | "data"
  const [activeTab, setActiveTab] = useState<Tab>("church")

  const NAV: { value: Tab; icon: React.ElementType; label: string }[] = [
    { value: "church",     icon: Church,   label: "Church"        },
    { value: "service",    icon: Clock,    label: "Service"       },
    { value: "projection", icon: Monitor,  label: "Projection"    },
    { value: "stage",      icon: Wifi,     label: "Stage Display" },
    { value: "data",       icon: Database, label: "Data"          },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden bg-background text-foreground">
      {/* ── Side nav ── */}
      <nav className="w-44 shrink-0 border-r border-border bg-card flex flex-col gap-0.5 p-3 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-3">
          Settings
        </p>
        {NAV.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === value
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Church */}
        {activeTab === "church" && (
          <div className="p-6 flex flex-col gap-4 max-w-2xl">

            {/* Church name */}
            <Card>
              <CardHeader icon={Church} title="Church name"
                description="Displayed at the bottom of the countdown screen on the projection window." />
              <div className="flex flex-col gap-3">
                <Input
                  type="text"
                  placeholder="e.g. Grace Community Church"
                  value={churchName}
                  onChange={(e) => setChurchName(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleSaveChurchName}>Save</Button>
                  {churchNameSaved && (
                    <span className="text-xs text-green-500 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                </div>
              </div>
            </Card>

            {/* Service schedules */}
            <Card>
              <CardHeader icon={CalendarDays} title="Service schedules"
                description="Define recurring weekly services. Multiple services per day are allowed as long as their time slots don't overlap." />

              {sortedSchedules.length > 0 && (
                <div className="mb-3 flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {sortedSchedules.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 bg-secondary/40 hover:bg-secondary/70 transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary rounded-full px-2 py-0.5 shrink-0 w-10 text-center">
                        {DAYS_SHORT[s.dayOfWeek]}
                      </span>
                      <span className="text-xs font-mono text-foreground shrink-0">
                        {fmt12(s.startTime)} – {fmt12(s.endTime)}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                        {getTzAbbr(s.timezone ?? serviceTimezone)}
                      </span>
                      {s.label
                        ? <span className="text-xs text-muted-foreground truncate flex-1">{s.label}</span>
                        : <span className="flex-1" />}
                      <button
                        onClick={() => handleDeleteSchedule(s.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {adding ? (
                <div className="rounded-xl border border-border bg-secondary/30 p-3 flex flex-col gap-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-muted-foreground">Day</label>
                      <Select value={newDay.toString()} onChange={(e) => setNewDay(Number(e.target.value))}>
                        {DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-muted-foreground">Start time</label>
                      <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-muted-foreground">End time</label>
                      <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-muted-foreground">Timezone</label>
                      <Select value={newTimezone} onChange={(e) => setNewTimezone(e.target.value)}>
                        {TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-muted-foreground">Label (optional)</label>
                      <Input
                        type="text"
                        placeholder="e.g. Morning Service…"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                      />
                    </div>
                  </div>
                  {scheduleError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {scheduleError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddSchedule}>Add</Button>
                    <Button size="sm" variant="outline" onClick={() => { setAdding(false); setScheduleError("") }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm" variant="outline" className="gap-1.5 w-full"
                  onClick={() => { setAdding(true); setScheduleError("") }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add schedule
                </Button>
              )}
            </Card>
          </div>
        )}

        {/* Service */}
        {activeTab === "service" && (
          <div className="p-6 flex flex-col gap-4 max-w-2xl">
            <Card>
              <CardHeader icon={Clock} title="Countdown default time"
                description="Fallback start time used by the countdown timer when no schedule matches. Set your timezone so the countdown stays accurate." />
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium">Start time</label>
                  <Input type="time" value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium">Timezone</label>
                  <Select value={serviceTimezone} onChange={(e) => setServiceTimezone(e.target.value)}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSaveTime}>Save</Button>
                {timeSaved && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                  </span>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Projection */}
        {activeTab === "projection" && (
          <div className="p-6 flex flex-col gap-4 max-w-2xl">
            <Card>
              <CardHeader icon={Monitor} title="Projection font size"
                description="Base font size for lyrics on the projection screen. Text will auto-scale down for longer lines but never exceed this size." />
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="range" min={24} max={96} step={2}
                  value={projectionFontSize}
                  onChange={(e) => setProjectionFontSize(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm font-mono font-semibold w-14 text-right">{projectionFontSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSaveFontSize}>Save</Button>
                {fontSizeSaved && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                  </span>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Stage display */}
        {activeTab === "stage" && (
          <div className="p-6 flex flex-col gap-4 max-w-2xl">
            <Card>
              <CardHeader
                icon={Wifi}
                title="Stage display"
                description="Open this URL on any phone, tablet, or laptop on the same Wi-Fi network to see a live stage display — current lyrics, song info, and countdown."
              />

              {/* Toggle */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium">Stage display server</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {stageRunning ? "Running — devices can connect now" : "Stopped"}
                  </p>
                </div>
                <button
                  onClick={handleStageToggle}
                  disabled={stageLoading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    stageRunning ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    stageRunning ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
              </div>

              {/* Port */}
              {!stageRunning && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Port (default 4040)</label>
                    <input
                      type="number"
                      min={1024}
                      max={65535}
                      value={stagePortInput}
                      onChange={e => setStagePortInput(e.target.value)}
                      className="h-8 rounded-md border border-border bg-background px-3 text-sm font-mono w-28"
                    />
                  </div>
                </div>
              )}

              {/* URL card */}
              {stageRunning && (
                <div className="rounded-xl border border-border bg-secondary/40 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                    <span className="text-xs font-medium text-green-500">Live on your local network</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono font-semibold bg-background border border-border rounded-lg px-3 py-2 truncate">
                      {stageURL}
                    </code>
                    <button
                      onClick={handleCopyURL}
                      className="h-9 px-3 flex items-center gap-1.5 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors shrink-0"
                    >
                      {stageCopied
                        ? <><Check className="h-3.5 w-3.5 text-green-500" /> Copied</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {stageClients === 0
                      ? "No devices connected"
                      : `${stageClients} device${stageClients > 1 ? "s" : ""} connected`}
                    <button
                      onClick={refreshStageStatus}
                      className="ml-auto text-primary hover:text-primary/80 transition-colors font-medium"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                icon={Monitor}
                title="What the stage display shows"
                description="The page updates in real-time as slides advance. No app install required on the device — just a browser."
              />
              <ul className="text-xs text-muted-foreground space-y-1.5">
                {[
                  "Current slide lyrics (large text)",
                  "Song title, artist, and section label",
                  "Slide position (e.g. 2 / 5)",
                  "Countdown timer when active",
                  "Blank indicator when screen is blanked",
                  "Auto-reconnects if connection drops",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {/* Data */}
        {activeTab === "data" && (
          <div className="p-6 flex flex-col gap-4 max-w-2xl">
            <Card>
              <CardHeader icon={Database} title="Data backup"
                description="Export all songs, service plans, themes, and background images into a single file. Import that file on another computer to transfer everything." />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1.5" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" /> Export backup…
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleImport}>
                  <Upload className="h-3.5 w-3.5" /> Import backup…
                </Button>
              </div>
              {dataStatus && (
                <div className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                  dataStatus.type === "success"
                    ? "border-green-500/30 bg-green-500/10 text-green-500"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}>
                  {dataStatus.type === "success"
                    ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    : <AlertCircle  className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  <span>{dataStatus.msg}</span>
                </div>
              )}
            </Card>
          </div>
        )}

      </div>
    </div>
  )
}

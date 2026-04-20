import { useState, useEffect } from "react"
import { Download, Upload, CheckCircle2, AlertCircle, Database, Clock, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

const TIMEZONES = [
  { value: "America/Los_Angeles", label: "Pacific (PST/PDT)" },
  { value: "America/Denver", label: "Mountain (MST/MDT)" },
  { value: "America/Chicago", label: "Central (CST/CDT)" },
  { value: "America/New_York", label: "Eastern (EST/EDT)" },
  { value: "America/Anchorage", label: "Alaska (AKST/AKDT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Central Europe (CET/CEST)" },
  { value: "Asia/Manila", label: "Philippines (PHT)" },
  { value: "Asia/Tokyo", label: "Japan (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
]

export default function SettingsScreen() {
  const [dataStatus, setDataStatus] = useState<{
    type: "success" | "error"
    msg: string
  } | null>(null)

  // Service time settings
  const [serviceTime, setServiceTime] = useState("11:00")
  const [serviceTimezone, setServiceTimezone] = useState("America/Los_Angeles")
  const [timeSaved, setTimeSaved] = useState(false)

  // Projection font size
  const [projectionFontSize, setProjectionFontSize] = useState(48)
  const [fontSizeSaved, setFontSizeSaved] = useState(false)

  useEffect(() => {
    window.worshipsync.appState.get().then((state: Record<string, any>) => {
      if (state.serviceTime) setServiceTime(state.serviceTime)
      if (state.serviceTimezone) setServiceTimezone(state.serviceTimezone)
      if (state.projectionFontSize) setProjectionFontSize(state.projectionFontSize)
    }).catch(() => {})
  }, [])

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
    if (res?.success) {
      setDataStatus({ type: "success", msg: "Backup saved successfully." })
    } else if (!res?.canceled) {
      setDataStatus({ type: "error", msg: "Export failed." })
    }
  }

  const handleImport = async () => {
    setDataStatus(null)
    const res = await (window.worshipsync as any).data.import()
    if (res?.success) {
      setDataStatus({
        type: "success",
        msg: "Data imported successfully. Restart the app to reload everything.",
      })
    } else if (res?.error) {
      setDataStatus({ type: "error", msg: res.error })
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-bold mb-1">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Configure your service defaults and manage data.
          </p>
        </div>

        {/* ── Service start time card ──────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card shadow-elevation-1 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">Service start time</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Set the default service start time for the countdown timer.
                This is used when a countdown is added to the lineup.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium">Start Time</label>
              <Input
                type="time"
                value={serviceTime}
                onChange={(e) => setServiceTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium">Timezone</label>
              <Select
                value={serviceTimezone}
                onChange={(e) => setServiceTimezone(e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-1.5" onClick={handleSaveTime}>
              Save
            </Button>
            {timeSaved && (
              <span className="text-xs text-green-500 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
        </section>

        {/* ── Projection font size card ────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card shadow-elevation-1 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Type className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">Projection font size</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Set the base font size for lyrics on the projection screen.
                Text will auto-scale down for longer lines but never exceed this size.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <input
              type="range"
              min={24}
              max={96}
              step={2}
              value={projectionFontSize}
              onChange={(e) => setProjectionFontSize(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-mono font-semibold w-14 text-right">{projectionFontSize}px</span>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-1.5" onClick={handleSaveFontSize}>
              Save
            </Button>
            {fontSizeSaved && (
              <span className="text-xs text-green-500 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
        </section>

        {/* ── Data backup card ────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card shadow-elevation-1 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">Data backup</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Export all your songs, service plans, themes, and background images
                into a single file. Import that file on another computer to transfer
                everything across.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gap-1.5" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Export backup…
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleImport}
            >
              <Upload className="h-3.5 w-3.5" />
              Import backup…
            </Button>
          </div>

          {dataStatus && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                dataStatus.type === "success"
                  ? "border-green-500/30 bg-green-500/10 text-green-500"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {dataStatus.type === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              )}
              <span>{dataStatus.msg}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

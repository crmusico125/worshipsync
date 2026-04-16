import { useState } from "react"
import { Download, Upload, CheckCircle2, AlertCircle, Database } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SettingsScreen() {
  const [dataStatus, setDataStatus] = useState<{
    type: "success" | "error"
    msg: string
  } | null>(null)

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
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-lg font-bold mb-1">Settings</h1>
        <p className="text-xs text-muted-foreground mb-6">
          Back up and restore your songs, services, themes, and media.
        </p>

        {/* ── Data backup card ────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Database className="h-4 w-4 text-primary" />
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

import { useEffect, useState } from "react"
import {
  Plus, Palette, Star, Trash2, Save, Type, AlignLeft, AlignCenter,
  AlignRight, Image as ImageIcon, Layers, Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import BackgroundPickerPanel from "../components/BackgroundPickerPanel"

interface ThemeSettings {
  fontFamily: string
  fontSize: number
  fontWeight: string
  textColor: string
  textAlign: "left" | "center" | "right"
  textPosition: "top" | "middle" | "bottom"
  overlayOpacity: number
  textShadowOpacity: number
  maxLinesPerSlide: number
  backgroundPath: string | null
}

interface Theme {
  id: number
  name: string
  type: "global" | "seasonal" | "per-song"
  isDefault: boolean
  seasonStart: string | null
  seasonEnd: string | null
  settings: string
  createdAt: string
}

const DEFAULT_SETTINGS: ThemeSettings = {
  fontFamily: "Montserrat, sans-serif",
  fontSize: 48,
  fontWeight: "600",
  textColor: "#ffffff",
  textAlign: "center",
  textPosition: "middle",
  overlayOpacity: 45,
  textShadowOpacity: 40,
  maxLinesPerSlide: 2,
  backgroundPath: null,
}

const FONT_OPTIONS = [
  "Montserrat, sans-serif",
  "Inter, sans-serif",
  "Georgia, serif",
  "Arial, sans-serif",
  "Times New Roman, serif",
  "Trebuchet MS, sans-serif",
  "Palatino, serif",
]

const TEXT_COLORS = [
  { hex: "#ffffff", label: "White" },
  { hex: "#f5f0e0", label: "Cream" },
  { hex: "#f5c842", label: "Gold" },
  { hex: "#60a5fa", label: "Blue" },
  { hex: "#f472b6", label: "Pink" },
  { hex: "#4ade80", label: "Green" },
]

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  global:     { label: "Global",   className: "bg-primary/15 text-primary" },
  seasonal:   { label: "Seasonal", className: "bg-green-500/15 text-green-500" },
  "per-song": { label: "Per-song", className: "bg-amber-500/15 text-amber-500" },
}

export default function ThemesScreen() {
  const [themeList, setThemeList] = useState<Theme[]>([])
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null)
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [previewLyric] = useState("You are the way maker\nMiracle worker")

  useEffect(() => { loadThemes() }, [])

  const loadThemes = async () => {
    const list = (await window.worshipsync.themes.getAll()) as Theme[]
    setThemeList(list)
    if (!selectedTheme && list.length > 0) {
      selectTheme(list.find((t) => t.isDefault) ?? list[0])
    }
  }

  const selectTheme = (theme: Theme) => {
    setSelectedTheme(theme)
    setName(theme.name)
    try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(theme.settings) }) }
    catch { setSettings(DEFAULT_SETTINGS) }
  }

  const handleSetDefault = async () => {
    if (!selectedTheme) return
    for (const t of themeList) {
      if (t.isDefault) {
        await window.worshipsync.themes.update(t.id, { isDefault: false })
      }
    }
    await window.worshipsync.themes.update(selectedTheme.id, { isDefault: true })
    await loadThemes()
  }

  const handleSave = async () => {
    if (!selectedTheme) return
    setSaving(true)
    await window.worshipsync.themes.update(selectedTheme.id, {
      name,
      settings: JSON.stringify(settings),
    })
    await loadThemes()
    setSaving(false)
  }

  const handleDelete = async (theme: Theme) => {
    if (theme.isDefault) return
    if (!confirm(`Delete theme "${theme.name}"?`)) return
    await window.worshipsync.themes.delete(theme.id)
    setSelectedTheme(null)
    await loadThemes()
  }

  const updateSetting = <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="h-full flex overflow-hidden bg-background text-foreground">

      {/* ── Left: theme list ────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-border shrink-0">
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => setShowNewModal(true)}
          >
            <Plus className="h-3.5 w-3.5" /> New theme
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="text-[10px] text-muted-foreground leading-relaxed px-2.5 py-2 mb-1.5 rounded-md bg-muted/40 border-l-2 border-primary">
            Priority: <span className="text-foreground font-medium">per-song</span> &gt; seasonal &gt; global
          </div>

          {themeList.map((theme) => {
            const badge = TYPE_BADGES[theme.type]
            const isSelected = selectedTheme?.id === theme.id
            return (
              <button
                key={theme.id}
                onClick={() => selectTheme(theme)}
                className={`w-full text-left px-2.5 py-2 rounded-md mb-1 border transition-colors ${
                  isSelected
                    ? "bg-primary/10 border-primary/30"
                    : "border-transparent hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold truncate flex-1 ${
                    isSelected ? "text-primary" : "text-foreground"
                  }`}>
                    {theme.name}
                  </span>
                  {theme.isDefault && (
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.className}`}>
                    {badge.label}
                  </span>
                  {theme.seasonStart && (
                    <span className="text-[9px] text-muted-foreground">
                      {theme.seasonStart} – {theme.seasonEnd}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Center: editor ──────────────────────────────────────────── */}
      {selectedTheme ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-3">
            <Palette className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-xs font-semibold"
              placeholder="Theme name"
            />
            <div className="ml-auto flex items-center gap-2">
              {!selectedTheme.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSetDefault}
                >
                  <Star className="h-3.5 w-3.5" /> Set as default
                </Button>
              )}
              {!selectedTheme.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive gap-1.5"
                  onClick={() => handleDelete(selectedTheme)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
              <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save theme"}
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-5xl">

              {/* Font */}
              <Card icon={Type} title="Font">
                <Field label="Font family">
                  <Select
                    value={settings.fontFamily}
                    onChange={(e) => updateSetting("fontFamily", e.target.value)}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f.split(",")[0]}</option>
                    ))}
                  </Select>
                </Field>

                <Field label={`Font size · ${settings.fontSize}px`}>
                  <input
                    type="range"
                    min={24} max={96} step={2}
                    value={settings.fontSize}
                    onChange={(e) => updateSetting("fontSize", parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </Field>

                <Field label="Font weight">
                  <SegmentedControl
                    value={settings.fontWeight}
                    onChange={(v) => updateSetting("fontWeight", v)}
                    options={[
                      { value: "400", label: "Regular" },
                      { value: "500", label: "Medium" },
                      { value: "600", label: "Semi" },
                      { value: "700", label: "Bold" },
                    ]}
                  />
                </Field>
              </Card>

              {/* Color & alignment */}
              <Card icon={Palette} title="Color & alignment">
                <Field label="Text color">
                  <div className="flex items-center gap-2 flex-wrap">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        onClick={() => updateSetting("textColor", c.hex)}
                        title={c.label}
                        className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                          settings.textColor === c.hex
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-card border-transparent"
                            : "border-border"
                        }`}
                        style={{ background: c.hex }}
                      />
                    ))}
                    <label
                      className="h-7 w-7 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary"
                      title="Custom color"
                    >
                      <input
                        type="color"
                        value={settings.textColor}
                        onChange={(e) => updateSetting("textColor", e.target.value)}
                        className="opacity-0 w-0 h-0"
                      />
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </label>
                  </div>
                </Field>

                <Field label="Text alignment">
                  <SegmentedControl
                    value={settings.textAlign}
                    onChange={(v) => updateSetting("textAlign", v as ThemeSettings["textAlign"])}
                    options={[
                      { value: "left",   label: "", icon: AlignLeft },
                      { value: "center", label: "", icon: AlignCenter },
                      { value: "right",  label: "", icon: AlignRight },
                    ]}
                  />
                </Field>

                <Field label="Text position">
                  <SegmentedControl
                    value={settings.textPosition}
                    onChange={(v) => updateSetting("textPosition", v as ThemeSettings["textPosition"])}
                    options={[
                      { value: "top",    label: "Top" },
                      { value: "middle", label: "Middle" },
                      { value: "bottom", label: "Bottom" },
                    ]}
                  />
                </Field>
              </Card>

              {/* Layout */}
              <Card icon={Layers} title="Layout">
                <Field label={`Background overlay · ${settings.overlayOpacity}%`}>
                  <input
                    type="range"
                    min={0} max={100} step={5}
                    value={settings.overlayOpacity}
                    onChange={(e) => updateSetting("overlayOpacity", parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </Field>

                <Field label={`Text shadow · ${settings.textShadowOpacity}%`}>
                  <input
                    type="range"
                    min={0} max={100} step={5}
                    value={settings.textShadowOpacity}
                    onChange={(e) => updateSetting("textShadowOpacity", parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </Field>

                <Field label="Max lines per slide">
                  <SegmentedControl
                    value={String(settings.maxLinesPerSlide)}
                    onChange={(v) => updateSetting("maxLinesPerSlide", parseInt(v))}
                    options={[
                      { value: "1", label: "1" },
                      { value: "2", label: "2" },
                      { value: "3", label: "3" },
                      { value: "4", label: "4" },
                    ]}
                  />
                </Field>
              </Card>

              {/* Live preview */}
              <Card icon={Eye} title="Live preview">
                <div
                  className="rounded-md overflow-hidden bg-gray-950 relative"
                  style={{ aspectRatio: "16/9" }}
                >
                  {settings.backgroundPath && (
                    settings.backgroundPath.startsWith("color:") ? (
                      <div
                        className="absolute inset-0"
                        style={{ background: settings.backgroundPath.replace("color:", "") }}
                      />
                    ) : (
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                          backgroundImage: `url("file://${encodeURI(settings.backgroundPath)}")`,
                        }}
                      />
                    )
                  )}
                  <div
                    className="absolute inset-0"
                    style={{ background: `rgba(0,0,0,${settings.overlayOpacity / 100})` }}
                  />
                  <div className={`relative h-full flex p-6 ${
                    settings.textPosition === "top" ? "items-start"
                    : settings.textPosition === "bottom" ? "items-end"
                    : "items-center"
                  } ${
                    settings.textAlign === "left" ? "justify-start"
                    : settings.textAlign === "right" ? "justify-end"
                    : "justify-center"
                  }`}>
                    <div
                      style={{
                        fontFamily: settings.fontFamily,
                        fontSize: Math.round(settings.fontSize * 0.28),
                        fontWeight: settings.fontWeight,
                        color: settings.textColor,
                        textAlign: settings.textAlign,
                        lineHeight: 1.5,
                        textShadow: `0 1px 4px rgba(0,0,0,${(settings.textShadowOpacity / 100).toFixed(2)})`,
                      }}
                    >
                      {previewLyric.split("\n").slice(0, settings.maxLinesPerSlide).map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Preview — actual size on projector
                </p>
              </Card>

              {/* Background — spans full width */}
              <div className="xl:col-span-2">
                <Card icon={ImageIcon} title="Background">
                  <BackgroundPickerPanel
                    currentBackground={settings.backgroundPath ?? null}
                    previewLabel="Way Maker · Chorus"
                    onSelect={(bg) => updateSetting("backgroundPath", bg)}
                  />
                </Card>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center">
          <div>
            <Palette className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Select a theme to edit</p>
          </div>
        </div>
      )}

      {showNewModal && (
        <NewThemeModal
          onClose={() => setShowNewModal(false)}
          onSaved={async () => {
            await loadThemes()
            setShowNewModal(false)
          }}
        />
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function Card({
  icon: Icon, title, children,
}: {
  icon: typeof Type
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}

function SegmentedControl({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; icon?: typeof Type }[]
}) {
  return (
    <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md">
      {options.map((opt) => {
        const Icon = opt.icon
        const isSelected = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── New Theme Modal ──────────────────────────────────────────────────────

function NewThemeModal({
  onClose, onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<"global" | "seasonal" | "per-song">("global")
  const [seasonStart, setSeasonStart] = useState("")
  const [seasonEnd, setSeasonEnd] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    await window.worshipsync.themes.create({
      name: name.trim(),
      type,
      isDefault: false,
      seasonStart: seasonStart || null,
      seasonEnd: seasonEnd || null,
      settings: JSON.stringify({
        fontFamily: "Montserrat, sans-serif",
        fontSize: 48,
        fontWeight: "600",
        textColor: "#ffffff",
        textAlign: "center",
        textPosition: "middle",
        overlayOpacity: 45,
        textShadowOpacity: 40,
        maxLinesPerSlide: 2,
      }),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="p-0 gap-0 overflow-hidden rounded-xl border border-border shadow-xl"
        style={{ width: 440, maxWidth: "95vw" }}
      >
        <div className="flex flex-col bg-background text-foreground">
          <div className="px-6 pt-5 pb-1">
            <DialogTitle className="text-lg font-bold">New theme</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Create a new theme for slide appearance.
            </p>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Name</label>
              <Input
                autoFocus
                placeholder="e.g. Christmas, Easter, Default"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && handleSave()}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Type</label>
              <SegmentedControl
                value={type}
                onChange={(v) => setType(v as typeof type)}
                options={[
                  { value: "global",   label: "Global" },
                  { value: "seasonal", label: "Seasonal" },
                  { value: "per-song", label: "Per-song" },
                ]}
              />
            </div>

            {type === "seasonal" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Season start</label>
                  <Input
                    placeholder="MM-DD"
                    value={seasonStart}
                    onChange={(e) => setSeasonStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Season end</label>
                  <Input
                    placeholder="MM-DD"
                    value={seasonEnd}
                    onChange={(e) => setSeasonEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!name.trim() || saving}
              onClick={handleSave}
            >
              <Plus className="h-3.5 w-3.5" />
              {saving ? "Creating…" : "Create theme"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

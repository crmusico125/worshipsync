import { useEffect, useState } from "react";

interface ThemeSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  textColor: string;
  textAlign: "left" | "center" | "right";
  textPosition: "top" | "middle" | "bottom";
  overlayOpacity: number;
  textShadowOpacity: number;
  maxLinesPerSlide: number;
}

interface Theme {
  id: number;
  name: string;
  type: "global" | "seasonal" | "per-song";
  isDefault: boolean;
  seasonStart: string | null;
  seasonEnd: string | null;
  settings: string;
  createdAt: string;
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
};

const FONT_OPTIONS = [
  "Montserrat, sans-serif",
  "Georgia, serif",
  "Arial, sans-serif",
  "Times New Roman, serif",
  "Trebuchet MS, sans-serif",
  "Palatino, serif",
];

const TEXT_COLORS = [
  { hex: "#ffffff", label: "White" },
  { hex: "#f5f0e0", label: "Cream" },
  { hex: "#f5c842", label: "Gold" },
  { hex: "#60a5fa", label: "Blue" },
  { hex: "#f472b6", label: "Pink" },
  { hex: "#4ade80", label: "Green" },
];

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> =
  {
    global: {
      label: "Global",
      color: "var(--accent-blue)",
      bg: "var(--accent-blue-dim)",
    },
    seasonal: {
      label: "Seasonal",
      color: "var(--accent-green)",
      bg: "var(--accent-green-dim)",
    },
    "per-song": {
      label: "Per-song",
      color: "var(--accent-amber)",
      bg: "var(--accent-amber-dim)",
    },
  };

export default function ThemesScreen() {
  const [themeList, setThemeList] = useState<Theme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [previewLyric] = useState("You are the way maker\nMiracle worker");

  useEffect(() => {
    loadThemes();
  }, []);

  const loadThemes = async () => {
    const list = (await window.worshipsync.themes.getAll()) as Theme[];
    setThemeList(list);
    if (!selectedTheme && list.length > 0) {
      selectTheme(list.find((t) => t.isDefault) ?? list[0]);
    }
  };

  const selectTheme = (theme: Theme) => {
    setSelectedTheme(theme);
    setName(theme.name);
    try {
      setSettings(JSON.parse(theme.settings));
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  };

  const handleSave = async () => {
    if (!selectedTheme) return;
    setSaving(true);
    await window.worshipsync.themes.update(selectedTheme.id, {
      name,
      settings: JSON.stringify(settings),
    });
    await loadThemes();
    setSaving(false);
  };

  const handleDelete = async (theme: Theme) => {
    if (theme.isDefault) return;
    if (!confirm(`Delete theme "${theme.name}"?`)) return;
    await window.worshipsync.themes.delete(theme.id);
    setSelectedTheme(null);
    await loadThemes();
  };

  const updateSetting = <K extends keyof ThemeSettings>(
    key: K,
    value: ThemeSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const overlayAlpha = ((settings.overlayOpacity ?? 45) / 100).toFixed(2);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Left: theme list ─────────────────────────────────────────────── */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border-subtle)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", fontSize: 11 }}
            onClick={() => setShowNewModal(true)}
          >
            + New theme
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {/* Priority note */}
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              lineHeight: 1.6,
              padding: "6px 8px",
              marginBottom: 8,
              background: "var(--surface-2)",
              borderRadius: 6,
              borderLeft: "2px solid var(--accent-blue)",
            }}
          >
            Priority: per-song {">"} seasonal {">"} global
          </div>

          {themeList.map((theme) => {
            const badge = TYPE_BADGE[theme.type];
            const isSelected = selectedTheme?.id === theme.id;
            return (
              <div
                key={theme.id}
                onClick={() => selectTheme(theme)}
                style={{
                  padding: "9px 10px",
                  borderRadius: 8,
                  marginBottom: 5,
                  cursor: "pointer",
                  border: `1px solid ${isSelected ? "rgba(77,142,240,0.3)" : "var(--border-subtle)"}`,
                  background: isSelected
                    ? "var(--accent-blue-dim)"
                    : "var(--surface-1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: 600,
                      color: isSelected
                        ? "var(--accent-blue)"
                        : "var(--text-primary)",
                    }}
                  >
                    {theme.name}
                  </div>
                  {theme.isDefault && (
                    <div
                      style={{
                        fontSize: 8,
                        padding: "1px 5px",
                        borderRadius: 10,
                        background: "var(--accent-green-dim)",
                        color: "var(--accent-green)",
                        border: "1px solid var(--accent-green)",
                        fontWeight: 600,
                      }}
                    >
                      DEFAULT
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 10,
                    display: "inline-block",
                    background: badge.bg,
                    color: badge.color,
                    fontWeight: 600,
                  }}
                >
                  {badge.label}
                </div>
                {theme.seasonStart && (
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--text-muted)",
                      marginTop: 3,
                    }}
                  >
                    {theme.seasonStart} – {theme.seasonEnd}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Center: editor ───────────────────────────────────────────────── */}
      {selectedTheme ? (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Name + save */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              className="input"
              style={{ flex: 1, fontSize: 14, fontWeight: 600 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="btn btn-success"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save theme"}
            </button>
            {!selectedTheme.isDefault && (
              <button
                className="btn"
                style={{ color: "var(--accent-red)", fontSize: 11 }}
                onClick={() => handleDelete(selectedTheme)}
              >
                Delete
              </button>
            )}
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {/* Font family */}
            <div
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div className="label">Font family</div>
              <select
                className="input"
                value={settings.fontFamily}
                onChange={(e) => updateSetting("fontFamily", e.target.value)}
                style={{ appearance: "none" }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.split(",")[0]}
                  </option>
                ))}
              </select>

              <div className="label">Font size</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={24}
                  max={96}
                  step={2}
                  value={settings.fontSize}
                  onChange={(e) =>
                    updateSetting("fontSize", parseInt(e.target.value))
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}>
                  {settings.fontSize}px
                </span>
              </div>

              <div className="label">Font weight</div>
              <div style={{ display: "flex", gap: 5 }}>
                {["400", "500", "600", "700"].map((w) => (
                  <button
                    key={w}
                    onClick={() => updateSetting("fontWeight", w)}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      borderRadius: 5,
                      cursor: "pointer",
                      border: `1px solid ${settings.fontWeight === w ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                      background:
                        settings.fontWeight === w
                          ? "var(--accent-blue-dim)"
                          : "var(--surface-2)",
                      color:
                        settings.fontWeight === w
                          ? "var(--accent-blue)"
                          : "var(--text-muted)",
                      fontSize: 11,
                      fontWeight: parseInt(w),
                    }}
                  >
                    {w === "400"
                      ? "Regular"
                      : w === "500"
                        ? "Medium"
                        : w === "600"
                          ? "Semi"
                          : "Bold"}
                  </button>
                ))}
              </div>
            </div>

            {/* Text color + alignment */}
            <div
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div className="label">Text color</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {TEXT_COLORS.map((c) => (
                  <div
                    key={c.hex}
                    onClick={() => updateSetting("textColor", c.hex)}
                    title={c.label}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: c.hex,
                      cursor: "pointer",
                      border: `1px solid ${c.hex === "#ffffff" ? "#666" : c.hex}`,
                      outline:
                        settings.textColor === c.hex
                          ? "2px solid var(--accent-blue)"
                          : "none",
                      outlineOffset: 2,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={settings.textColor}
                  onChange={(e) => updateSetting("textColor", e.target.value)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    background: "none",
                  }}
                  title="Custom color"
                />
              </div>

              <div className="label">Text alignment</div>
              <div style={{ display: "flex", gap: 5 }}>
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => updateSetting("textAlign", a)}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 11,
                      border: `1px solid ${settings.textAlign === a ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                      background:
                        settings.textAlign === a
                          ? "var(--accent-blue-dim)"
                          : "var(--surface-2)",
                      color:
                        settings.textAlign === a
                          ? "var(--accent-blue)"
                          : "var(--text-muted)",
                    }}
                  >
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>

              <div className="label">Text position</div>
              <div style={{ display: "flex", gap: 5 }}>
                {(["top", "middle", "bottom"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => updateSetting("textPosition", p)}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 11,
                      border: `1px solid ${settings.textPosition === p ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                      background:
                        settings.textPosition === p
                          ? "var(--accent-blue-dim)"
                          : "var(--surface-2)",
                      color:
                        settings.textPosition === p
                          ? "var(--accent-blue)"
                          : "var(--text-muted)",
                    }}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Overlay + shadow */}
            <div
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div className="label">Background overlay opacity</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.overlayOpacity}
                  onChange={(e) =>
                    updateSetting("overlayOpacity", parseInt(e.target.value))
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36 }}>
                  {settings.overlayOpacity}%
                </span>
              </div>

              <div className="label">Text shadow opacity</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={settings.textShadowOpacity}
                  onChange={(e) =>
                    updateSetting("textShadowOpacity", parseInt(e.target.value))
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36 }}>
                  {settings.textShadowOpacity}%
                </span>
              </div>

              <div className="label">Max lines per slide</div>
              <div style={{ display: "flex", gap: 5 }}>
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => updateSetting("maxLinesPerSlide", n)}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 12,
                      border: `1px solid ${settings.maxLinesPerSlide === n ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                      background:
                        settings.maxLinesPerSlide === n
                          ? "var(--accent-blue-dim)"
                          : "var(--surface-2)",
                      color:
                        settings.maxLinesPerSlide === n
                          ? "var(--accent-blue)"
                          : "var(--text-muted)",
                      fontWeight: settings.maxLinesPerSlide === n ? 600 : 400,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Live preview */}
            <div
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div className="label">Live preview</div>
              <div
                style={{
                  background: "#07070f",
                  borderRadius: 8,
                  aspectRatio: "16/9",
                  display: "flex",
                  alignItems:
                    settings.textPosition === "top"
                      ? "flex-start"
                      : settings.textPosition === "bottom"
                        ? "flex-end"
                        : "center",
                  justifyContent: "center",
                  padding: "10% 8%",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Overlay */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `rgba(0,0,0,${overlayAlpha})`,
                  }}
                />
                {/* Lyrics */}
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontFamily: settings.fontFamily,
                    fontSize: Math.round(settings.fontSize * 0.25),
                    fontWeight: settings.fontWeight,
                    color: settings.textColor,
                    textAlign: settings.textAlign,
                    lineHeight: 1.5,
                    textShadow: `0 1px 4px rgba(0,0,0,${(settings.textShadowOpacity / 100).toFixed(2)})`,
                  }}
                >
                  {previewLyric
                    .split("\n")
                    .slice(0, settings.maxLinesPerSlide)
                    .map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                </div>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                Preview — actual size on projector
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Select a theme to edit
          </div>
        </div>
      )}

      {showNewModal && (
        <NewThemeModal
          onClose={() => setShowNewModal(false)}
          onSaved={async () => {
            await loadThemes();
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}

function NewThemeModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"global" | "seasonal" | "per-song">(
    "global",
  );
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
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
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: 14,
          width: 400,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>New theme</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="label">Name *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Christmas, Easter, Default"
            autoFocus
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="label">Type</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["global", "seasonal", "per-song"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  flex: 1,
                  padding: "6px 4px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 11,
                  border: `1px solid ${type === t ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                  background:
                    type === t ? "var(--accent-blue-dim)" : "var(--surface-2)",
                  color:
                    type === t ? "var(--accent-blue)" : "var(--text-muted)",
                  fontWeight: type === t ? 600 : 400,
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {type === "seasonal" && (
          <div style={{ display: "flex", gap: 10 }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <label className="label">Season start (MM-DD)</label>
              <input
                className="input"
                value={seasonStart}
                onChange={(e) => setSeasonStart(e.target.value)}
                placeholder="12-01"
              />
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <label className="label">Season end (MM-DD)</label>
              <input
                className="input"
                value={seasonEnd}
                onChange={(e) => setSeasonEnd(e.target.value)}
                placeholder="01-06"
              />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving..." : "Create theme"}
          </button>
        </div>
      </div>
    </div>
  );
}

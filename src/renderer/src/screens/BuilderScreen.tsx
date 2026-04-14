import { useEffect, useState, useRef } from "react";
import { useServiceStore } from "../store/useServiceStore";
import { useSongStore } from "../store/useSongStore";
import LibraryModal from "../components/LibraryModal"
import AddSongModal from "../components/AddSongModal";

interface Props {
  serviceId: number | null;
  onGoLive: () => void;
}

// ── Lyrics paste parser ───────────────────────────────────────────────────────

const SECTION_TYPE_MAP: Record<string, string> = {
  verse: "verse",
  chorus: "chorus",
  bridge: "bridge",
  "pre-chorus": "pre-chorus",
  prechorus: "pre-chorus",
  "pre chorus": "pre-chorus",
  intro: "intro",
  outro: "outro",
  tag: "tag",
  interlude: "interlude",
}

const SECTION_BASE_LABELS: Record<string, string> = {
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  "pre-chorus": "Pre-Chorus",
  intro: "Intro",
  outro: "Outro",
  tag: "Tag",
  interlude: "Interlude",
}

function parseLyricsText(raw: string): { title: string; sections: DraftSection[] } {
  const lines = raw.split("\n")
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++

  let title = ""
  if (i < lines.length) {
    title = lines[i].trim().replace(/\s+lyrics\s*$/i, "").trim()
    i++
  }

  const parsedSections: DraftSection[] = []
  const typeCounts: Record<string, number> = {}
  let currentType: string | null = null
  let currentLyrics: string[] = []

  const flush = () => {
    if (!currentType) return
    const lyrics = currentLyrics.join("\n").trimEnd()
    const count = (typeCounts[currentType] ?? 0) + 1
    typeCounts[currentType] = count
    const base = SECTION_BASE_LABELS[currentType] ?? currentType
    const label = count > 1 ? `${base} ${count}` : base
    parsedSections.push({ tempId: makeTempId(), type: currentType, label, lyrics })
    currentLyrics = []
  }

  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const headerMatch = trimmed.match(/^\[(.+?)\]$/)
    if (headerMatch) {
      flush()
      const rawType = headerMatch[1].toLowerCase().trim()
      currentType = SECTION_TYPE_MAP[rawType] ?? "verse"
    } else if (currentType !== null) {
      currentLyrics.push(lines[i])
    }
  }
  flush()

  return { title, sections: parsedSections }
}

const SECTION_TYPES = [
  "verse",
  "chorus",
  "bridge",
  "pre-chorus",
  "intro",
  "outro",
  "tag",
  "interlude",
] as const;

interface DraftSection {
  tempId: string;
  type: string;
  label: string;
  lyrics: string;
}

function makeTempId() {
  return Math.random().toString(36).slice(2);
}

function defaultLabel(type: string, sections: DraftSection[]): string {
  const same = sections.filter((s) => s.type === type).length + 1;
  const base: Record<string, string> = {
    verse: "Verse",
    chorus: "Chorus",
    bridge: "Bridge",
    "pre-chorus": "Pre-Chorus",
    intro: "Intro",
    outro: "Outro",
    tag: "Tag",
    interlude: "Interlude",
  };
  const name = base[type] ?? type;
  return same > 1 ? `${name} ${same}` : name;
}

// ── Quick-create form ─────────────────────────────────────────────────────────

interface CreateFormProps {
  onCreated: (songId: number) => void;
  onCancel: () => void;
}

function QuickCreateForm({ onCreated, onCancel }: CreateFormProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [key, setKey] = useState("");
  const [sections, setSections] = useState<DraftSection[]>([
    { tempId: makeTempId(), type: "verse", label: "Verse 1", lyrics: "" },
    { tempId: makeTempId(), type: "chorus", label: "Chorus", lyrics: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const addSection = () => {
    const type = "verse";
    setSections((prev) => [
      ...prev,
      { tempId: makeTempId(), type, label: defaultLabel(type, prev), lyrics: "" },
    ]);
  };

  const updateSection = (tempId: string, field: keyof DraftSection, value: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.tempId !== tempId) return s;
        const updated = { ...s, [field]: value };
        // Auto-update label when type changes (only if label still matches old default)
        if (field === "type") {
          const oldDefault = defaultLabel(s.type, prev.filter((x) => x.tempId !== tempId));
          if (s.label === oldDefault || s.label === "") {
            updated.label = defaultLabel(value, prev.filter((x) => x.tempId !== tempId));
          }
        }
        return updated;
      }),
    );
  };

  const removeSection = (tempId: string) => {
    setSections((prev) => prev.filter((s) => s.tempId !== tempId));
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const song = await window.worshipsync.songs.create({
        title: title.trim(),
        artist: artist.trim(),
        key: key.trim() || undefined,
        tags: "[]",
        sections: sections
          .filter((s) => s.lyrics.trim() || s.label.trim())
          .map((s, i) => ({
            type: s.type,
            label: s.label || defaultLabel(s.type, sections),
            lyrics: s.lyrics,
            orderIndex: i,
          })),
      });
      onCreated((song as any).id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Fields */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        <div style={{ marginBottom: 10 }}>
          <div className="label" style={{ marginBottom: 4 }}>Title *</div>
          <input
            ref={titleRef}
            className="input"
            style={{ width: "100%" }}
            placeholder="Song title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ marginBottom: 4 }}>Artist</div>
            <input
              className="input"
              style={{ width: "100%" }}
              placeholder="Artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>
          <div style={{ width: 64 }}>
            <div className="label" style={{ marginBottom: 4 }}>Key</div>
            <input
              className="input"
              style={{ width: "100%" }}
              placeholder="G"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
        </div>

        {/* Sections */}
        <div className="label" style={{ marginBottom: 6 }}>Sections</div>
        {sections.map((sec) => (
          <div
            key={sec.tempId}
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              marginBottom: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "6px 8px",
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--border-subtle)",
                alignItems: "center",
              }}
            >
              <select
                className="input"
                style={{ flex: 1, fontSize: 11, padding: "3px 6px" }}
                value={sec.type}
                onChange={(e) => updateSection(sec.tempId, "type", e.target.value)}
              >
                {SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ flex: 1, fontSize: 11, padding: "3px 6px" }}
                placeholder="Label"
                value={sec.label}
                onChange={(e) => updateSection(sec.tempId, "label", e.target.value)}
              />
              <button
                className="btn"
                style={{ fontSize: 12, padding: "2px 6px", color: "var(--text-muted)" }}
                onClick={() => removeSection(sec.tempId)}
                title="Remove section"
              >
                ✕
              </button>
            </div>
            <textarea
              className="input"
              style={{
                width: "100%",
                minHeight: 72,
                resize: "vertical",
                fontSize: 11,
                lineHeight: 1.5,
                borderRadius: 0,
                border: "none",
                padding: "6px 8px",
                fontFamily: "var(--font-mono)",
              }}
              placeholder={`Lyrics for ${sec.label}…`}
              value={sec.lyrics}
              onChange={(e) => updateSection(sec.tempId, "lyrics", e.target.value)}
            />
          </div>
        ))}

        <button
          className="btn"
          style={{ width: "100%", fontSize: 11, marginBottom: 4 }}
          onClick={addSection}
        >
          + Add section
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button className="btn" style={{ flex: 1, fontSize: 11 }} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 2, fontSize: 11, fontWeight: 600 }}
          disabled={!title.trim() || saving}
          onClick={save}
        >
          {saving ? "Creating…" : "Create & add to lineup"}
        </button>
      </div>
    </div>
  );
}

// ── Inline section editor ─────────────────────────────────────────────────────

interface SectionEditorProps {
  songId: number;
  initialSections: { id: number; type: string; label: string; lyrics: string; orderIndex: number }[];
  onSaved: () => void;
  onCancel: () => void;
}

function InlineSectionEditor({ songId, initialSections, onSaved, onCancel }: SectionEditorProps) {
  const [sections, setSections] = useState<DraftSection[]>(() =>
    initialSections.map((s) => ({
      tempId: makeTempId(),
      type: s.type,
      label: s.label,
      lyrics: s.lyrics,
    })),
  );
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    const type = "verse";
    setSections((prev) => [
      ...prev,
      { tempId: makeTempId(), type, label: defaultLabel(type, prev), lyrics: "" },
    ]);
  };

  const update = (tempId: string, field: keyof DraftSection, value: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.tempId !== tempId) return s;
        const updated = { ...s, [field]: value };
        if (field === "type") {
          const oldDefault = defaultLabel(s.type, prev.filter((x) => x.tempId !== tempId));
          if (s.label === oldDefault || s.label === "") {
            updated.label = defaultLabel(value, prev.filter((x) => x.tempId !== tempId));
          }
        }
        return updated;
      }),
    );
  };

  const remove = (tempId: string) => {
    setSections((prev) => prev.filter((s) => s.tempId !== tempId));
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.worshipsync.songs.upsertSections(
        songId,
        sections.map((s, i) => ({
          type: s.type,
          label: s.label,
          lyrics: s.lyrics,
          orderIndex: i,
        })),
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-default)",
        background: "var(--surface-1)",
        padding: "10px 12px",
      }}
    >
      <div className="label" style={{ marginBottom: 8 }}>Edit sections</div>

      {sections.map((sec) => (
        <div
          key={sec.tempId}
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: 7,
            marginBottom: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 5,
              padding: "5px 8px",
              background: "var(--surface-2)",
              borderBottom: "1px solid var(--border-subtle)",
              alignItems: "center",
            }}
          >
            <select
              className="input"
              style={{ fontSize: 10, padding: "2px 4px", flex: 1 }}
              value={sec.type}
              onChange={(e) => update(sec.tempId, "type", e.target.value)}
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ fontSize: 10, padding: "2px 4px", flex: 1 }}
              value={sec.label}
              onChange={(e) => update(sec.tempId, "label", e.target.value)}
            />
            <button
              className="btn"
              style={{ fontSize: 10, padding: "1px 5px", color: "var(--text-muted)" }}
              onClick={() => remove(sec.tempId)}
            >
              ✕
            </button>
          </div>
          <textarea
            className="input"
            style={{
              width: "100%",
              minHeight: 60,
              resize: "vertical",
              fontSize: 11,
              lineHeight: 1.5,
              borderRadius: 0,
              border: "none",
              padding: "6px 8px",
              fontFamily: "var(--font-mono)",
            }}
            placeholder="Lyrics…"
            value={sec.lyrics}
            onChange={(e) => update(sec.tempId, "lyrics", e.target.value)}
          />
        </div>
      ))}

      <button
        className="btn"
        style={{ width: "100%", fontSize: 10, marginBottom: 8 }}
        onClick={addSection}
      >
        + Add section
      </button>

      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1, fontSize: 10 }} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 2, fontSize: 10, fontWeight: 600 }}
          disabled={saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save sections"}
        </button>
      </div>
    </div>
  );
}

// ── Paste lyrics form ─────────────────────────────────────────────────────────

interface PasteLyricsProps {
  onCreated: (songId: number) => void
  onCancel: () => void
}

function PasteLyricsForm({ onCreated, onCancel }: PasteLyricsProps) {
  const [raw, setRaw] = useState("")
  const [title, setTitle] = useState("")
  const [sections, setSections] = useState<DraftSection[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!raw.trim()) { setTitle(""); setSections([]); return }
    const result = parseLyricsText(raw)
    setTitle(result.title)
    setSections(result.sections)
  }, [raw])

  const save = async () => {
    if (!title.trim() || sections.length === 0) return
    setSaving(true)
    try {
      const song = await window.worshipsync.songs.create({
        title: title.trim(),
        artist: "",
        tags: "[]",
        sections: sections.map((s, i) => ({
          type: s.type,
          label: s.label,
          lyrics: s.lyrics,
          orderIndex: i,
        })),
      })
      onCreated((song as any).id)
    } finally {
      setSaving(false)
    }
  }

  const hasSections = sections.length > 0
  const hasInput = raw.trim().length > 0

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Paste song lyrics</div>
          <textarea
            className="input"
            autoFocus
            style={{
              width: "100%",
              minHeight: 160,
              resize: "vertical",
              fontSize: 11,
              lineHeight: 1.6,
              fontFamily: "var(--font-mono)",
            }}
            placeholder={`For All You've Done Lyrics\n[Verse]\nMy Saviour, Redeemer\nLifted me from the miry clay\n\n[Chorus]\nAnd You lived, You died...`}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </div>

        {hasInput && !hasSections && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "4px 0" }}>
            No sections detected — make sure headers are in [Brackets]
          </div>
        )}

        {hasSections && (
          <>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Title</div>
              <input
                className="input"
                style={{ width: "100%" }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title"
              />
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Parsed sections ({sections.length})
              </div>
              {sections.map((sec) => (
                <div
                  key={sec.tempId}
                  style={{
                    marginBottom: 6,
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 7,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "4px 8px",
                      background: "var(--surface-2)",
                      borderBottom: "1px solid var(--border-subtle)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--accent-blue)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {sec.label}
                  </div>
                  <div
                    style={{
                      padding: "6px 8px",
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {sec.lyrics || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>empty</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button className="btn" style={{ flex: 1, fontSize: 11 }} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 2, fontSize: 11, fontWeight: 600 }}
          disabled={!title.trim() || !hasSections || saving}
          onClick={save}
        >
          {saving ? "Creating…" : "Create & add to lineup"}
        </button>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BuilderScreen({ serviceId, onGoLive }: Props) {
  const {
    selectedService,
    lineup,
    loadLineup,
    addSongToLineup,
    removeSongFromLineup,
    toggleSection,
    loadServices,
    selectService,
    services,
    reorderLineup,
  } = useServiceStore();
  const { loadSongs } = useSongStore();

  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showAddSongModal, setShowAddSongModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  useEffect(() => {
    loadSongs();
    loadServices();
  }, []);

  useEffect(() => {
    if (serviceId && services.length > 0) {
      const service = services.find((s) => s.id === serviceId);
      if (service) selectService(service);
    }
  }, [serviceId, services]);

const moveUp = async (i: number) => {
    if (i === 0) return;
    const ids = lineup.map((l) => l.id);
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    await reorderLineup(ids);
  };

  const moveDown = async (i: number) => {
    if (i === lineup.length - 1) return;
    const ids = lineup.map((l) => l.id);
    [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
    await reorderLineup(ids);
  };

  const handleCreated = async (songId: number) => {
    await loadSongs();
    await addSongToLineup(songId);
  };

  const handleLibraryAdd = async (songIds: number[]) => {
    for (const id of songIds) {
      await addSongToLineup(id);
    }
  };

  const handleSectionsSaved = async () => {
    setEditingItemId(null);
    if (selectedService) await loadLineup(selectedService.id);
  };

  if (!selectedService) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>No service selected</div>
          <div style={{ fontSize: 11 }}>Go to Planner and click "Open in builder"</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Left: lineup ─────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedService.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              {new Date(selectedService.date + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
          <button className="btn" style={{ fontSize: 11 }} onClick={() => setShowAddSongModal(true)}>
            + New song
          </button>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setShowLibraryModal(true)}>
            + Add song
          </button>
          <button
            className="btn btn-success"
            style={{ fontSize: 11, fontWeight: 600 }}
            onClick={onGoLive}
          >
            Go live →
          </button>
        </div>

        {/* Lineup items */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {lineup.length === 0 ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                No songs in this lineup yet
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setShowLibraryModal(true)}>
                  Add from library
                </button>
                <button className="btn btn-primary" onClick={() => setShowAddSongModal(true)}>
                  + Create new song
                </button>
              </div>
            </div>
          ) : (
            lineup.map((item, i) => {
              const selectedIds: number[] = JSON.parse(item.selectedSections || "[]");
              const isEditing = editingItemId === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid var(--border-default)",
                    borderRadius: 10,
                    marginBottom: 10,
                    overflow: "hidden",
                    background: "var(--surface-1)",
                  }}
                >
                  {/* Song header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: "var(--surface-2)",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        flexShrink: 0,
                        background: ["#1a1a4e", "#1e3a1a", "#3d1010", "#2a1a00", "#1a0a2e", "#0a2e1a"][i % 6],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {i + 1}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.song.title}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                        {item.song.artist}
                        {item.song.key && ` · Key of ${item.song.key}`}
                      </div>
                    </div>

                    {/* Edit sections button */}
                    <button
                      className="btn"
                      style={{
                        fontSize: 10,
                        padding: "3px 8px",
                        flexShrink: 0,
                        background: isEditing ? "var(--accent-blue-dim)" : undefined,
                        color: isEditing ? "var(--accent-blue)" : undefined,
                        border: isEditing ? "1px solid var(--accent-blue)" : undefined,
                      }}
                      onClick={() => setEditingItemId(isEditing ? null : item.id)}
                    >
                      {isEditing ? "Close editor" : "Edit sections"}
                    </button>

                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      <button
                        className="btn"
                        title="Move up"
                        disabled={i === 0}
                        onClick={() => moveUp(i)}
                        style={{
                          fontSize: 13,
                          padding: "2px 8px",
                          opacity: i === 0 ? 0.3 : 1,
                          cursor: i === 0 ? "default" : "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ↑
                      </button>
                      <button
                        className="btn"
                        title="Move down"
                        disabled={i === lineup.length - 1}
                        onClick={() => moveDown(i)}
                        style={{
                          fontSize: 13,
                          padding: "2px 8px",
                          opacity: i === lineup.length - 1 ? 0.3 : 1,
                          cursor: i === lineup.length - 1 ? "default" : "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ↓
                      </button>
                    </div>

                    <button
                      className="btn"
                      style={{ fontSize: 10, padding: "3px 8px", color: "var(--accent-red)", flexShrink: 0 }}
                      onClick={() => {
                        if (isEditing) setEditingItemId(null);
                        removeSongFromLineup(item.id);
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Section toggles */}
                  {!isEditing && (
                    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
                      <div className="label" style={{ marginBottom: 4 }}>
                        Sections — tap to toggle on/off for this service
                      </div>
                      {item.song.sections.length === 0 ? (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
                          No sections — click "Edit sections" to add lyrics
                        </div>
                      ) : (
                        item.song.sections.map((sec) => {
                          const included = selectedIds.includes(sec.id);
                          return (
                            <div
                              key={sec.id}
                              onClick={() => toggleSection(item.id, sec.id, !included)}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 9,
                                padding: "7px 10px",
                                borderRadius: 7,
                                cursor: "pointer",
                                border: `1px solid ${included ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                                background: included ? "var(--accent-blue-dim)" : "var(--surface-2)",
                                opacity: included ? 1 : 0.5,
                                transition: "all 0.1s",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  minWidth: 64,
                                  paddingTop: 1,
                                  color: included ? "var(--accent-blue)" : "var(--text-muted)",
                                }}
                              >
                                {sec.label}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  lineHeight: 1.5,
                                  flex: 1,
                                  color: included ? "var(--text-primary)" : "var(--text-muted)",
                                }}
                              >
                                {sec.lyrics.split("\n")[0]}
                                {sec.lyrics.split("\n").length > 1 && (
                                  <span style={{ color: "var(--text-muted)" }}> ...</span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 600,
                                  padding: "1px 6px",
                                  borderRadius: 10,
                                  flexShrink: 0,
                                  background: included ? "var(--accent-blue-dim)" : "var(--surface-3)",
                                  color: included ? "var(--accent-blue)" : "var(--text-muted)",
                                  border: `1px solid ${included ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                                }}
                              >
                                {included ? "on" : "off"}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Inline section editor */}
                  {isEditing && (
                    <InlineSectionEditor
                      songId={item.song.id}
                      initialSections={item.song.sections}
                      onSaved={() => handleSectionsSaved()}
                      onCancel={() => setEditingItemId(null)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Library modal ────────────────────────────────────────────────── */}
      {showLibraryModal && (
        <LibraryModal
          onClose={() => setShowLibraryModal(false)}
          onAdd={handleLibraryAdd}
          excludeIds={lineup.map((item) => item.songId)}
        />
      )}

      {showAddSongModal && (
        <AddSongModal
          onClose={() => setShowAddSongModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

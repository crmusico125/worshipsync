import BackgroundPicker from "../components/BackgroundPicker";
import { useEffect, useState } from "react";
import { useSongStore } from "../store/useSongStore";
import type { Song, Section } from "../../../../shared/types";

interface SongWithSections extends Song {
  sections: Section[];
}

const SECTION_TYPE_COLORS: Record<string, string> = {
  verse: "#4d8ef0",
  chorus: "#3ecf8e",
  bridge: "#f5a623",
  "pre-chorus": "#9f7aea",
  outro: "#888",
  intro: "#888",
  tag: "#f05252",
  interlude: "#888",
};

const BG_COLORS = [
  "#1a1a4e",
  "#1e3a1a",
  "#3d1010",
  "#2a1a00",
  "#1a0a2e",
  "#0a2e1a",
  "#2e1a0a",
  "#0a1a2e",
];

function songBgColor(id: number) {
  return BG_COLORS[id % BG_COLORS.length];
}

function groupAlphabetically(songs: Song[]) {
  const groups: Record<string, Song[]> = {};
  for (const song of songs) {
    const letter = song.title[0].toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(song);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export default function LibraryScreen() {
  const {
    songs,
    selectedSong,
    searchQuery,
    loading,
    loadSongs,
    selectSong,
    setSearchQuery,
  } = useSongStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [themeList, setThemeList] = useState<
    { id: number; name: string; type: string }[]
  >([]);

  useEffect(() => {
    loadSongs();
    window.worshipsync.themes.getAll().then((t: any) => setThemeList(t));
  }, []);

  const grouped = searchQuery ? null : groupAlphabetically(songs);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Left: song list ─────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Search by title or artist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            className="btn btn-success"
            onClick={() => setShowAddModal(true)}
          >
            + New song
          </button>
        </div>

        {/* Count */}
        <div
          style={{
            padding: "6px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {loading ? "Loading..." : `${songs.length} songs`}
          </span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {searchQuery
            ? // Flat search results
              songs.map((song) => (
                <SongRow
                  key={song.id}
                  song={song}
                  selected={selectedSong?.id === song.id}
                  onClick={() => selectSong(song.id)}
                />
              ))
            : // Grouped alphabetically
              grouped?.map(([letter, group]) => (
                <div key={letter} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      paddingBottom: 4,
                      marginBottom: 5,
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    {letter}
                  </div>
                  {group.map((song) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      selected={selectedSong?.id === song.id}
                      onClick={() => selectSong(song.id)}
                    />
                  ))}
                </div>
              ))}
        </div>
      </div>

      {/* ── Right: detail panel ─────────────────────────────────────────── */}
      <div
        style={{
          width: 340,
          flexShrink: 0,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {selectedSong ? (
          <>
            {/* Header */}
            <div className="card">
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 9,
                    flexShrink: 0,
                    background: songBgColor(selectedSong.id),
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: 2,
                    }}
                  >
                    {selectedSong.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {selectedSong.artist}
                    {selectedSong.ccliNumber &&
                      ` · CCLI #${selectedSong.ccliNumber}`}
                  </div>
                </div>
                {/* Action buttons */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => setShowEditModal(true)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn"
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      color: "var(--accent-red)",
                      borderColor: "var(--accent-red)",
                    }}
                    onClick={async () => {
                      if (
                        !confirm(
                          `Delete "${selectedSong.title}"? This cannot be undone.`,
                        )
                      )
                        return;
                      await window.worshipsync.songs.delete(selectedSong.id);
                      useSongStore.getState().clearSelection();
                      loadSongs();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Meta grid — same as before */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                {[
                  ["Key", selectedSong.key ?? "—"],
                  ["Tempo", selectedSong.tempo ?? "—"],
                  ["Sections", `${selectedSong.sections.length}`],
                  [
                    "Tags",
                    JSON.parse(selectedSong.tags || "[]").join(", ") || "—",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      background: "var(--surface-2)",
                      borderRadius: 6,
                      padding: "6px 8px",
                    }}
                  >
                    <div className="label" style={{ marginBottom: 2 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Sections — same as before */}
              <div className="label" style={{ marginBottom: 6 }}>
                Sections
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {selectedSong.sections.map((sec) => (
                  <div
                    key={sec.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "7px 9px",
                      borderRadius: 6,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        minWidth: 58,
                        paddingTop: 1,
                        color:
                          SECTION_TYPE_COLORS[sec.type] ?? "var(--text-muted)",
                      }}
                    >
                      {sec.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                        flex: 1,
                      }}
                    >
                      {sec.lyrics.split("\n")[0]}
                      {sec.lyrics.split("\n").length > 1 && (
                        <span style={{ color: "var(--text-muted)" }}> ...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div className="card">
              <div className="label" style={{ marginBottom: 8 }}>
                Slide theme
              </div>
              <select
                className="input"
                value={selectedSong.themeId ? String(selectedSong.themeId) : ""}
                onChange={async (e) => {
                  const themeId = e.target.value
                    ? parseInt(e.target.value)
                    : null;
                  await window.worshipsync.songs.update(selectedSong.id, {
                    themeId,
                  });
                  await loadSongs();
                  await selectSong(selectedSong.id);
                }}
                style={{ appearance: "none" }}
              >
                <option value="">— Use default theme —</option>
                {themeList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.type})
                  </option>
                ))}
              </select>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                Per-song theme overrides the global default for this song only.
              </div>
            </div>

            {/* Background */}
            <div className="card">
              <div className="label" style={{ marginBottom: 10 }}>
                Background
              </div>
              <BackgroundPicker
                songId={selectedSong.id}
                songTitle={selectedSong.title}
                currentBackground={selectedSong.backgroundPath}
                onChanged={async () => {
                  await loadSongs();
                  await selectSong(selectedSong.id);
                }}
              />
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 12,
              textAlign: "center",
              padding: 24,
            }}
          >
            Select a song to see its details
          </div>
        )}
      </div>

      {/* Add song modal — placeholder for now */}
      {showAddModal && (
        <AddSongModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            loadSongs();
            setShowAddModal(false);
          }}
        />
      )}
      {showEditModal && selectedSong && (
        <EditSongModal
          song={selectedSong}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => {
            setShowEditModal(false);
            await loadSongs();
            await selectSong(selectedSong.id);
          }}
        />
      )}
    </div>
  );
}

function SongRow({
  song,
  selected,
  onClick,
}: {
  song: Song;
  selected: boolean;
  onClick: () => void;
}) {
  const tags = JSON.parse(song.tags || "[]") as string[];
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 10px",
        borderRadius: 8,
        marginBottom: 4,
        cursor: "pointer",
        border: `1px solid ${selected ? "rgba(77,142,240,0.3)" : "var(--border-subtle)"}`,
        background: selected ? "var(--accent-blue-dim)" : "var(--surface-1)",
        transition: "background 0.1s",
      }}
    >
      {/* Color swatch */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 6,
          flexShrink: 0,
          background: songBgColor(song.id),
        }}
      />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: selected ? "var(--accent-blue)" : "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {song.title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            marginTop: 2,
            display: "flex",
            gap: 5,
            alignItems: "center",
          }}
        >
          <span>{song.artist}</span>
          {song.key && (
            <>
              <span>·</span>
              <span>Key of {song.key}</span>
            </>
          )}
          {tags[0] && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 10,
                background: "var(--surface-3)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {tags[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface ParsedSection {
  type:
    | "verse"
    | "chorus"
    | "bridge"
    | "pre-chorus"
    | "outro"
    | "intro"
    | "tag"
    | "interlude";
  label: string;
  lyrics: string;
  orderIndex: number;
}

function AddSongModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"details" | "sections">("details");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [key, setKey] = useState("");
  const [tempo, setTempo] = useState<"slow" | "medium" | "fast" | "">("");
  const [sections, setSections] = useState<ParsedSection[]>([
    { type: "verse", label: "Verse 1", lyrics: "", orderIndex: 0 },
    { type: "chorus", label: "Chorus", lyrics: "", orderIndex: 1 },
  ]);
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        type: "verse",
        label: `Verse ${prev.filter((s) => s.type === "verse").length + 1}`,
        lyrics: "",
        orderIndex: prev.length,
      },
    ]);
  };

  const removeSection = (i: number) => {
    setSections((prev) => prev.filter((_, j) => j !== i));
  };

  const updateSection = (
    i: number,
    field: keyof ParsedSection,
    value: string,
  ) => {
    setSections((prev) =>
      prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)),
    );
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await window.worshipsync.songs.create({
      title: title.trim(),
      artist: artist.trim(),
      key: key.trim() || null,
      tempo: tempo || null,
      tags: "[]",
      sections: sections
        .filter((s) => s.lyrics.trim())
        .map((s, i) => ({ ...s, orderIndex: i })),
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
          width: 540,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
            Add new song
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["details", "sections"] as const).map((s) => (
              <div
                key={s}
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 20,
                  fontWeight: 500,
                  cursor: "pointer",
                  background:
                    step === s ? "var(--accent-blue-dim)" : "var(--surface-3)",
                  color:
                    step === s ? "var(--accent-blue)" : "var(--text-muted)",
                  border: `1px solid ${step === s ? "var(--accent-blue)" : "transparent"}`,
                }}
                onClick={() => title.trim() && setStep(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {step === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="label">Song title *</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Way Maker"
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="label">Artist / Band</label>
                <input
                  className="input"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="e.g. Sinach"
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <label className="label">Key</label>
                  <input
                    className="input"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="e.g. G, Bb"
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
                  <label className="label">Tempo</label>
                  <select
                    className="input"
                    value={tempo}
                    onChange={(e) => setTempo(e.target.value as typeof tempo)}
                    style={{ appearance: "none" }}
                  >
                    <option value="">— select —</option>
                    <option value="slow">Slow</option>
                    <option value="medium">Medium</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === "sections" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Add lyrics for each section. Empty sections won't be saved.
              </div>
              {sections.map((sec, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface-2)",
                  }}
                >
                  {/* Section header */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "8px 10px",
                      background: "var(--surface-3)",
                      alignItems: "center",
                    }}
                  >
                    <select
                      className="input"
                      style={{ width: 140, padding: "3px 6px", fontSize: 11 }}
                      value={sec.type}
                      onChange={(e) => updateSection(i, "type", e.target.value)}
                    >
                      {[
                        "verse",
                        "chorus",
                        "bridge",
                        "pre-chorus",
                        "intro",
                        "outro",
                        "tag",
                        "interlude",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      style={{ flex: 1, padding: "3px 6px", fontSize: 11 }}
                      value={sec.label}
                      onChange={(e) =>
                        updateSection(i, "label", e.target.value)
                      }
                      placeholder="Label e.g. Verse 1"
                    />
                    <button
                      className="btn"
                      style={{
                        padding: "3px 8px",
                        fontSize: 11,
                        color: "var(--accent-red)",
                      }}
                      onClick={() => removeSection(i)}
                    >
                      ✕
                    </button>
                  </div>
                  {/* Lyrics textarea */}
                  <textarea
                    className="input"
                    style={{
                      width: "100%",
                      minHeight: 90,
                      resize: "vertical",
                      border: "none",
                      borderRadius: 0,
                      background: "transparent",
                      fontSize: 12,
                      lineHeight: 1.6,
                      fontFamily: "var(--font-mono)",
                      padding: "8px 10px",
                    }}
                    placeholder="Paste lyrics for this section..."
                    value={sec.lyrics}
                    onChange={(e) => updateSection(i, "lyrics", e.target.value)}
                  />
                </div>
              ))}
              <button
                className="btn"
                style={{ alignSelf: "flex-start", fontSize: 11 }}
                onClick={addSection}
              >
                + Add section
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step === "details" && (
              <>
                <button
                  className="btn btn-success"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                >
                  {saving ? "Saving..." : "Save without lyrics"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep("sections")}
                  disabled={!title.trim()}
                >
                  Add sections →
                </button>
              </>
            )}
            {step === "sections" && (
              <>
                <button className="btn" onClick={() => setStep("details")}>
                  ← Back
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                >
                  {saving ? "Saving..." : "Save song"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditSongModal({
  song,
  onClose,
  onSaved,
}: {
  song: SongWithSections;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"details" | "sections">("details");
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [key, setKey] = useState(song.key ?? "");
  const [tempo, setTempo] = useState<"slow" | "medium" | "fast" | "">(
    song.tempo ?? "",
  );
  const [sections, setSections] = useState<ParsedSection[]>(
    song.sections.map((s) => ({
      type: s.type as ParsedSection["type"],
      label: s.label,
      lyrics: s.lyrics,
      orderIndex: s.orderIndex,
    })),
  );
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        type: "verse",
        label: `Verse ${prev.filter((s) => s.type === "verse").length + 1}`,
        lyrics: "",
        orderIndex: prev.length,
      },
    ]);
  };

  const removeSection = (i: number) => {
    setSections((prev) => prev.filter((_, j) => j !== i));
  };

  const updateSection = (
    i: number,
    field: keyof ParsedSection,
    value: string,
  ) => {
    setSections((prev) =>
      prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)),
    );
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    await window.worshipsync.songs.update(song.id, {
      title: title.trim(),
      artist: artist.trim(),
      key: key.trim() || null,
      tempo: tempo || null,
    });

    await window.worshipsync.songs.upsertSections(
      song.id,
      sections
        .filter((s) => s.lyrics.trim())
        .map((s, i) => ({ ...s, orderIndex: i })),
    );

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
          width: 540,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
            Edit song
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["details", "sections"] as const).map((s) => (
              <div
                key={s}
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 20,
                  fontWeight: 500,
                  cursor: "pointer",
                  background:
                    step === s ? "var(--accent-blue-dim)" : "var(--surface-3)",
                  color:
                    step === s ? "var(--accent-blue)" : "var(--text-muted)",
                  border: `1px solid ${step === s ? "var(--accent-blue)" : "transparent"}`,
                }}
                onClick={() => setStep(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {step === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="label">Song title *</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="label">Artist / Band</label>
                <input
                  className="input"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <label className="label">Key</label>
                  <input
                    className="input"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="e.g. G, Bb"
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
                  <label className="label">Tempo</label>
                  <select
                    className="input"
                    value={tempo}
                    onChange={(e) => setTempo(e.target.value as typeof tempo)}
                    style={{ appearance: "none" }}
                  >
                    <option value="">— select —</option>
                    <option value="slow">Slow</option>
                    <option value="medium">Medium</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === "sections" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Edit lyrics for each section. Empty sections won't be saved.
              </div>
              {sections.map((sec, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface-2)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "8px 10px",
                      background: "var(--surface-3)",
                      alignItems: "center",
                    }}
                  >
                    <select
                      className="input"
                      style={{ width: 140, padding: "3px 6px", fontSize: 11 }}
                      value={sec.type}
                      onChange={(e) => updateSection(i, "type", e.target.value)}
                    >
                      {[
                        "verse",
                        "chorus",
                        "bridge",
                        "pre-chorus",
                        "intro",
                        "outro",
                        "tag",
                        "interlude",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      style={{ flex: 1, padding: "3px 6px", fontSize: 11 }}
                      value={sec.label}
                      onChange={(e) =>
                        updateSection(i, "label", e.target.value)
                      }
                    />
                    <button
                      className="btn"
                      style={{
                        padding: "3px 8px",
                        fontSize: 11,
                        color: "var(--accent-red)",
                      }}
                      onClick={() => removeSection(i)}
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    className="input"
                    style={{
                      width: "100%",
                      minHeight: 100,
                      resize: "vertical",
                      border: "none",
                      borderRadius: 0,
                      background: "transparent",
                      fontSize: 12,
                      lineHeight: 1.6,
                      fontFamily: "var(--font-mono)",
                      padding: "8px 10px",
                    }}
                    value={sec.lyrics}
                    onChange={(e) => updateSection(i, "lyrics", e.target.value)}
                    placeholder="Paste lyrics for this section..."
                  />
                </div>
              ))}
              <button
                className="btn"
                style={{ alignSelf: "flex-start", fontSize: 11 }}
                onClick={addSection}
              >
                + Add section
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step === "details" && (
              <button
                className="btn btn-primary"
                onClick={() => setStep("sections")}
              >
                Edit sections →
              </button>
            )}
            {step === "sections" && (
              <button className="btn" onClick={() => setStep("details")}>
                ← Back
              </button>
            )}
            <button
              className="btn btn-success"
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

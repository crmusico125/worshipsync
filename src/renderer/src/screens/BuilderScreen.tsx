import { useEffect, useState } from "react";
import { useServiceStore } from "../store/useServiceStore";
import { useSongStore } from "../store/useSongStore";

interface Props {
  serviceId: number | null;
  onGoLive: () => void;
}

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
  const { songs, loadSongs } = useSongStore();
  const [songSearch, setSongSearch] = useState("");
  const [showSongPicker, setShowSongPicker] = useState(false);

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

  const filteredSongs = songs.filter(
    (s) =>
      !lineup.find((item) => item.songId === s.id) &&
      (s.title.toLowerCase().includes(songSearch.toLowerCase()) ||
        s.artist.toLowerCase().includes(songSearch.toLowerCase())),
  );

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

  if (!selectedService) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 8 }}>No service selected</div>
          <div style={{ fontSize: 11 }}>
            Go to Planner and click "Open in builder"
          </div>
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {selectedService.label}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}
            >
              {new Date(selectedService.date + "T00:00:00").toLocaleDateString(
                "en-US",
                { weekday: "long", month: "long", day: "numeric" },
              )}
            </div>
          </div>
          <button
            className="btn"
            style={{ fontSize: 11 }}
            onClick={() => setShowSongPicker(true)}
          >
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
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                No songs in this lineup yet
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowSongPicker(true)}
              >
                + Add first song
              </button>
            </div>
          ) : (
            lineup.map((item, i) => {
              const selectedIds: number[] = JSON.parse(
                item.selectedSections || "[]",
              );
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
                    {/* Order number */}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        flexShrink: 0,
                        background: [
                          "#1a1a4e",
                          "#1e3a1a",
                          "#3d1010",
                          "#2a1a00",
                          "#1a0a2e",
                          "#0a2e1a",
                        ][i % 6],
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

                    {/* Song info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {item.song.title}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          marginTop: 1,
                        }}
                      >
                        {item.song.artist}
                        {item.song.key && ` · Key of ${item.song.key}`}
                      </div>
                    </div>

                    {/* Reorder buttons */}
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
                          cursor:
                            i === lineup.length - 1 ? "default" : "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ↓
                      </button>
                    </div>

                    {/* Remove button */}
                    <button
                      className="btn"
                      style={{
                        fontSize: 10,
                        padding: "3px 8px",
                        color: "var(--accent-red)",
                        flexShrink: 0,
                      }}
                      onClick={() => removeSongFromLineup(item.id)}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Sections */}
                  <div
                    style={{
                      padding: "8px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                    }}
                  >
                    <div className="label" style={{ marginBottom: 4 }}>
                      Sections — tap to toggle on/off for this service
                    </div>
                    {item.song.sections.map((sec) => {
                      const included = selectedIds.includes(sec.id);
                      return (
                        <div
                          key={sec.id}
                          onClick={() =>
                            toggleSection(item.id, sec.id, !included)
                          }
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 9,
                            padding: "7px 10px",
                            borderRadius: 7,
                            cursor: "pointer",
                            border: `1px solid ${included ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                            background: included
                              ? "var(--accent-blue-dim)"
                              : "var(--surface-2)",
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
                              color: included
                                ? "var(--accent-blue)"
                                : "var(--text-muted)",
                            }}
                          >
                            {sec.label}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              lineHeight: 1.5,
                              flex: 1,
                              color: included
                                ? "var(--text-primary)"
                                : "var(--text-muted)",
                            }}
                          >
                            {sec.lyrics.split("\n")[0]}
                            {sec.lyrics.split("\n").length > 1 && (
                              <span style={{ color: "var(--text-muted)" }}>
                                {" "}
                                ...
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: 10,
                              flexShrink: 0,
                              background: included
                                ? "var(--accent-blue-dim)"
                                : "var(--surface-3)",
                              color: included
                                ? "var(--accent-blue)"
                                : "var(--text-muted)",
                              border: `1px solid ${included ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                            }}
                          >
                            {included ? "on" : "off"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: song picker ────────────────────────────────────────────── */}
      {showSongPicker && (
        <div
          style={{
            width: 300,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid var(--border-subtle)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
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
              placeholder="Search songs..."
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              autoFocus
            />
            <button
              className="btn"
              style={{ fontSize: 11 }}
              onClick={() => setShowSongPicker(false)}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            {filteredSongs.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  padding: "12px 0",
                  textAlign: "center",
                }}
              >
                {songs.length === 0
                  ? "No songs in library"
                  : "All songs already in lineup"}
              </div>
            ) : (
              filteredSongs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => {
                    addSongToLineup(song.id);
                    setShowSongPicker(false);
                    setSongSearch("");
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 7,
                    marginBottom: 4,
                    cursor: "pointer",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-1)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface-2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "var(--surface-1)")
                  }
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {song.title}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    {song.artist}
                    {song.key && ` · Key of ${song.key}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

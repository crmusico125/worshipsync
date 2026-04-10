import { useEffect, useState, useCallback, useRef } from "react";
import { useServiceStore } from "../store/useServiceStore";

interface Slide {
  lines: string[];
  sectionLabel: string;
  sectionId: number;
  slideIndex: number;
  totalSlides: number;
}

interface SectionWithSlides {
  id: number;
  songId: number;
  label: string;
  type: string;
  lyrics: string;
  slides: Slide[];
  lineupItemId: number;
}

interface LiveSong {
  lineupItemId: number;
  songId: number;
  title: string;
  artist: string;
  key: string | null;
  backgroundPath: string | null;
  sections: SectionWithSlides[];
}

function buildSlides(
  lyrics: string,
  sectionLabel: string,
  sectionId: number,
  lineupItemId: number,
  maxLines = 2,
): Slide[] {
  const lines = lyrics.split("\n").filter((l) => l.trim());
  const slides: Slide[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    slides.push({
      lines: lines.slice(i, i + maxLines),
      sectionLabel,
      sectionId,
      slideIndex: slides.length,
      totalSlides: Math.ceil(lines.length / maxLines),
    });
  }
  if (slides.length === 0) {
    slides.push({
      lines: [""],
      sectionLabel,
      sectionId,
      slideIndex: 0,
      totalSlides: 1,
    });
  }
  return slides;
}

interface Props {
  onClose: () => void;
  projectionOpen: boolean;
}

export default function LiveScreen({ onClose, projectionOpen }: Props) {
  const { selectedService, lineup } = useServiceStore();

  const [liveSongs, setLiveSongs] = useState<LiveSong[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isBlank, setIsBlank] = useState(false);
  const [isLogo, setIsLogo] = useState(false);
  const [defaultThemeBackground, setDefaultThemeBackground] = useState<
    string | null
  >(null);

  useEffect(() => {
    // Load default theme background on mount
    window.worshipsync.themes.getDefault().then((theme: any) => {
      if (theme?.settings) {
        try {
          const settings = JSON.parse(theme.settings);
          setDefaultThemeBackground(settings.backgroundPath ?? null);
        } catch {}
      }
    });
  }, []);

  // Build live songs from lineup
  useEffect(() => {
    const built: LiveSong[] = lineup.map((item) => {
      const selectedIds: number[] = JSON.parse(item.selectedSections || "[]");
      const activeSections = item.song.sections
        .filter((s) => selectedIds.includes(s.id))
        .map((s) => ({
          ...s,
          lineupItemId: item.id,
          slides: buildSlides(s.lyrics, s.label, s.id, item.id),
        }));
      return {
        lineupItemId: item.id,
        songId: item.song.id,
        title: item.song.title,
        artist: item.song.artist,
        key: item.song.key,
        backgroundPath: item.song.backgroundPath,
        sections: activeSections,
      };
    });
    setLiveSongs(built);
  }, [lineup]);

  // Send current slide to projection window
  const sendCurrentSlide = useCallback(
    (songIdx: number, secIdx: number, slideIdx: number, songs: LiveSong[]) => {
      if (!songs[songIdx]?.sections[secIdx]) return;
      const section = songs[songIdx].sections[secIdx];
      const slide = section.slides[slideIdx];
      if (!slide) return;

      // Per-song background takes priority, falls back to theme background
      const backgroundPath =
        songs[songIdx].backgroundPath ?? defaultThemeBackground ?? undefined;

      window.worshipsync.slide.show({
        lines: slide.lines,
        songTitle: songs[songIdx].title,
        sectionLabel: section.label,
        slideIndex: slideIdx,
        totalSlides: section.slides.length,
        backgroundPath,
      });
    },
    [defaultThemeBackground],
  );

  // Navigation
  const goToSlide = useCallback(
    (songIdx: number, secIdx: number, slideIdx: number) => {
      const songs = liveSongs;
      if (!songs[songIdx]?.sections[secIdx]) return;
      const section = songs[songIdx].sections[secIdx];
      const clampedSlide = Math.max(
        0,
        Math.min(slideIdx, section.slides.length - 1),
      );

      setCurrentSongIndex(songIdx);
      setCurrentSectionIndex(secIdx);
      setCurrentSlideIndex(clampedSlide);
      setIsBlank(false);
      setIsLogo(false);
      sendCurrentSlide(songIdx, secIdx, clampedSlide, songs);
    },
    [liveSongs, sendCurrentSlide],
  );

  const nextSlide = useCallback(() => {
    const song = liveSongs[currentSongIndex];
    if (!song) return;
    const section = song.sections[currentSectionIndex];
    if (!section) return;

    if (currentSlideIndex < section.slides.length - 1) {
      goToSlide(currentSongIndex, currentSectionIndex, currentSlideIndex + 1);
    } else if (currentSectionIndex < song.sections.length - 1) {
      goToSlide(currentSongIndex, currentSectionIndex + 1, 0);
    } else if (currentSongIndex < liveSongs.length - 1) {
      goToSlide(currentSongIndex + 1, 0, 0);
    }
  }, [
    liveSongs,
    currentSongIndex,
    currentSectionIndex,
    currentSlideIndex,
    goToSlide,
  ]);

  const prevSlide = useCallback(() => {
    if (currentSlideIndex > 0) {
      goToSlide(currentSongIndex, currentSectionIndex, currentSlideIndex - 1);
    } else if (currentSectionIndex > 0) {
      const prevSection =
        liveSongs[currentSongIndex].sections[currentSectionIndex - 1];
      goToSlide(
        currentSongIndex,
        currentSectionIndex - 1,
        prevSection.slides.length - 1,
      );
    } else if (currentSongIndex > 0) {
      const prevSong = liveSongs[currentSongIndex - 1];
      const lastSec = prevSong.sections[prevSong.sections.length - 1];
      goToSlide(
        currentSongIndex - 1,
        prevSong.sections.length - 1,
        lastSec.slides.length - 1,
      );
    }
  }, [
    liveSongs,
    currentSongIndex,
    currentSectionIndex,
    currentSlideIndex,
    goToSlide,
  ]);

  const toggleBlank = useCallback(() => {
    const next = !isBlank;
    setIsBlank(next);
    setIsLogo(false);
    window.worshipsync.slide.blank(next);
  }, [isBlank]);

  const toggleLogo = useCallback(() => {
    const next = !isLogo;
    setIsLogo(next);
    setIsBlank(false);
    window.worshipsync.slide.logo(next);
  }, [isLogo]);

  const jumpToChorus = useCallback(() => {
    const song = liveSongs[currentSongIndex];
    if (!song) return;
    const chorusIdx = song.sections.findIndex(
      (s) => s.type === "chorus" || s.label.toLowerCase().includes("chorus"),
    );
    if (chorusIdx !== -1) goToSlide(currentSongIndex, chorusIdx, 0);
  }, [liveSongs, currentSongIndex, goToSlide]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      switch (e.key) {
        case " ":
        case "ArrowRight":
          e.preventDefault();
          nextSlide();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prevSlide();
          break;
        case "b":
        case "B":
          toggleBlank();
          break;
        case "l":
        case "L":
          toggleLogo();
          break;
        case "r":
        case "R":
          jumpToChorus();
          break;
        case "1":
        case "2":
        case "3":
        case "4": {
          const idx = parseInt(e.key) - 1;
          if (liveSongs[idx]) goToSlide(idx, 0, 0);
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    nextSlide,
    prevSlide,
    toggleBlank,
    toggleLogo,
    jumpToChorus,
    goToSlide,
    liveSongs,
  ]);

  // Send first slide when songs are loaded
  useEffect(() => {
    if (liveSongs.length > 0 && projectionOpen) {
      sendCurrentSlide(0, 0, 0, liveSongs);
    }
  }, [liveSongs, projectionOpen]);

  const currentSong = liveSongs[currentSongIndex];
  const currentSection = currentSong?.sections[currentSectionIndex];
  const currentSlide = currentSection?.slides[currentSlideIndex];

  const SECTION_COLORS: Record<string, string> = {
    verse: "#4d8ef0",
    chorus: "#3ecf8e",
    bridge: "#f5a623",
    "pre-chorus": "#9f7aea",
    outro: "#888",
    intro: "#888",
    tag: "#f05252",
    interlude: "#888",
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
            Go to Planner → select a Sunday → Open in builder → Go live
          </div>
        </div>
      </div>
    );
  }

  if (liveSongs.length === 0) {
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
          <div style={{ marginBottom: 8 }}>No songs in lineup</div>
          <div style={{ fontSize: 11 }}>Add songs in the Builder first</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Left col: song list + section pads ───────────────────────────── */}
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
        {/* Projector status */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 7,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flexShrink: 0,
              background: projectionOpen
                ? "var(--accent-green)"
                : "var(--border-default)",
              animation: projectionOpen ? "pulse 2s infinite" : "none",
            }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {projectionOpen ? "Projector live" : "Projector off"}
          </span>
          {!projectionOpen && (
            <button
              className="btn btn-success"
              style={{ fontSize: 10, padding: "2px 8px", marginLeft: "auto" }}
              onClick={() => {
                window.worshipsync.window.openProjection();
              }}
            >
              Open
            </button>
          )}
        </div>

        {/* Song list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {liveSongs.map((song, songIdx) => (
            <div key={song.lineupItemId} style={{ marginBottom: 8 }}>
              {/* Song header */}
              <div
                onClick={() => goToSlide(songIdx, 0, 0)}
                style={{
                  padding: "7px 9px",
                  borderRadius: 7,
                  cursor: "pointer",
                  marginBottom: 4,
                  border: `1px solid ${currentSongIndex === songIdx ? "rgba(77,142,240,0.3)" : "var(--border-subtle)"}`,
                  background:
                    currentSongIndex === songIdx
                      ? "var(--accent-blue-dim)"
                      : "var(--surface-2)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color:
                      currentSongIndex === songIdx
                        ? "var(--accent-blue)"
                        : "var(--text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {song.title}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    marginTop: 1,
                  }}
                >
                  {song.key ? `Key of ${song.key}` : song.artist}
                </div>
              </div>

              {/* Section pads — only show for current song */}
              {currentSongIndex === songIdx &&
                song.sections.map((sec, secIdx) => {
                  const isCurrentSec = currentSectionIndex === secIdx;
                  const firstLine = sec.lyrics.split("\n")[0] || sec.label;
                  const isPlayed = secIdx < currentSectionIndex;

                  return (
                    <div
                      key={sec.id}
                      onClick={() => goToSlide(songIdx, secIdx, 0)}
                      style={{
                        padding: "6px 9px",
                        borderRadius: 6,
                        marginBottom: 3,
                        cursor: "pointer",
                        marginLeft: 8,
                        border: `1px solid ${isCurrentSec ? "rgba(77,142,240,0.4)" : "var(--border-subtle)"}`,
                        background: isCurrentSec
                          ? "var(--accent-blue-dim)"
                          : "var(--surface-1)",
                        opacity: isPlayed ? 0.45 : 1,
                        transition: "all 0.1s",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 2,
                          color: isCurrentSec
                            ? "var(--accent-blue)"
                            : (SECTION_COLORS[sec.type] ?? "var(--text-muted)"),
                        }}
                      >
                        {sec.label}
                        {isCurrentSec && (
                          <span
                            style={{
                              marginLeft: 5,
                              fontSize: 8,
                              color: "var(--accent-green)",
                            }}
                          >
                            ● LIVE
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: isCurrentSec
                            ? "var(--accent-blue)"
                            : "var(--text-secondary)",
                          lineHeight: 1.4,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {firstLine}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Center: live preview + controls ──────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Live preview */}
        <div
          style={{
            flex: 1,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflow: "hidden",
          }}
        >
          {/* Audience screen preview */}
          <div
            style={{
              flex: 1,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 6,
              padding: 24,
              position: "relative",
              border: "1px solid var(--border-subtle)",
              overflow: "hidden",
              background: "#03030a",
            }}
          >
            {/* Background layer */}
            {(() => {
              const bg = currentSong?.backgroundPath ?? defaultThemeBackground;
              if (!bg || isBlank || isLogo) return null;
              if (bg.startsWith("color:")) {
                return (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: bg.replace("color:", ""),
                    }}
                  />
                );
              }
              return (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url("file://${encodeURI(bg)}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              );
            })()}

            {/* Dark overlay */}
            {!isBlank && !isLogo && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.45)",
                }}
              />
            )}

            {isBlank && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#000",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 13 }}>
                  Screen blank
                </span>
              </div>
            )}
            {isLogo && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#000",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    color: "rgba(255,255,255,0.15)",
                    fontSize: 24,
                    fontWeight: 700,
                  }}
                >
                  {selectedService.label}
                </span>
              </div>
            )}
            {!isBlank && !isLogo && currentSlide && (
              <>
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: 600,
                    textAlign: "center",
                    lineHeight: 1.5,
                  }}
                >
                  {currentSlide.lines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    color: "rgba(255,255,255,0.25)",
                    fontSize: 10,
                    marginTop: 8,
                  }}
                >
                  {currentSong?.title} · {currentSection?.label} ·{" "}
                  {currentSlideIndex + 1}/{currentSection?.slides.length}
                </div>
              </>
            )}
          </div>

          {/* Next slide preview */}
          {currentSlide && (
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: 8,
                padding: "8px 14px",
                border: "1px solid var(--border-subtle)",
                flexShrink: 0,
              }}
            >
              <div className="label" style={{ marginBottom: 4 }}>
                Next slide
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {(() => {
                  // Calculate next slide text
                  const nextSlideIdx = currentSlideIndex + 1;
                  if (nextSlideIdx < (currentSection?.slides.length ?? 0)) {
                    return currentSection?.slides[nextSlideIdx].lines.join(
                      " / ",
                    );
                  }
                  const nextSecIdx = currentSectionIndex + 1;
                  if (nextSecIdx < (currentSong?.sections.length ?? 0)) {
                    const nextSec = currentSong?.sections[nextSecIdx];
                    return `[${nextSec?.label}] ${nextSec?.slides[0]?.lines[0] ?? ""}`;
                  }
                  const nextSongIdx = currentSongIndex + 1;
                  if (nextSongIdx < liveSongs.length) {
                    return `[Next song] ${liveSongs[nextSongIdx].title}`;
                  }
                  return "End of lineup";
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Control bar */}
        <div
          style={{
            padding: "10px 14px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexShrink: 0,
            background: "var(--surface-1)",
          }}
        >
          <button
            className="btn btn-danger"
            style={{ fontSize: 12, fontWeight: 600, minWidth: 100 }}
            onClick={toggleBlank}
          >
            {isBlank ? "■ Unblank" : "■ Black"}
          </button>
          <button
            className="btn"
            style={{ fontSize: 12, minWidth: 60 }}
            onClick={toggleLogo}
          >
            {isLogo ? "Hide logo" : "Logo"}
          </button>
          <button
            className="btn"
            style={{ fontSize: 12 }}
            onClick={jumpToChorus}
          >
            ↩ Chorus
          </button>

          <div style={{ flex: 1 }} />

          <button
            className="btn"
            style={{ fontSize: 13, padding: "5px 14px" }}
            onClick={prevSlide}
          >
            ‹ Prev
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 13, padding: "5px 18px", fontWeight: 600 }}
            onClick={nextSlide}
          >
            Next ›
          </button>
        </div>
      </div>

      {/* ── Right col: keyboard shortcuts ────────────────────────────────── */}
      <div
        style={{
          width: 160,
          flexShrink: 0,
          borderLeft: "1px solid var(--border-subtle)",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div className="label">Keyboard</div>
        {[
          ["Space / →", "Next slide"],
          ["←", "Prev slide"],
          ["B", "Black screen"],
          ["L", "Logo screen"],
          ["R", "Back to chorus"],
          ["1 – 4", "Jump to song"],
        ].map(([key, desc]) => (
          <div
            key={key}
            style={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
                borderRadius: 4,
                padding: "2px 6px",
                display: "inline-block",
                color: "var(--text-secondary)",
              }}
            >
              {key}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {desc}
            </div>
          </div>
        ))}

        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: 10,
          }}
        >
          <div className="label" style={{ marginBottom: 8 }}>
            Stream Deck
          </div>
          {[
            { label: "‹ Prev", color: "#fbbf24" },
            { label: "Next ›", color: "#4ade80" },
            { label: "↩ Chorus", color: "#60a5fa" },
            { label: "■ Black", color: "#f87171" },
          ].map((btn) => (
            <div
              key={btn.label}
              style={{
                padding: "5px 8px",
                borderRadius: 5,
                marginBottom: 4,
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                fontSize: 10,
                fontWeight: 600,
                color: btn.color,
              }}
            >
              {btn.label}
            </div>
          ))}
        </div>

        <div style={{ marginTop: "auto" }}>
          <button
            className="btn btn-danger"
            style={{ width: "100%", fontSize: 11 }}
            onClick={onClose}
          >
            End service
          </button>
        </div>
      </div>
    </div>
  );
}

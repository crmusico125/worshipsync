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
  themeId: number | null;
  sections: SectionWithSlides[];
}

interface ResolvedThemeStyle {
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

const DEFAULT_THEME_STYLE: ResolvedThemeStyle = {
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
  const [themeCache, setThemeCache] = useState<Record<number, any>>({});
  const [defaultTheme, setDefaultTheme] = useState<any>(null);

  // ── Load lineup + themes on mount ───────────────────────────────────────────
  useEffect(() => {
    // Reload lineup once on mount to pick up any changes made in Library
    const { selectedService, loadLineup } = useServiceStore.getState();
    if (selectedService) {
      loadLineup(selectedService.id);
    }

    // Load default theme
    window.worshipsync.themes.getDefault().then((theme: any) => {
      setDefaultTheme(theme);
      if (theme?.settings) {
        try {
          const settings = JSON.parse(theme.settings);
          setDefaultThemeBackground(settings.backgroundPath ?? null);
        } catch {}
      }
    });

    // Load ALL themes into cache
    window.worshipsync.themes.getAll().then((all: any[]) => {
      const cache: Record<number, any> = {};
      all.forEach((t) => {
        cache[t.id] = t;
      });
      setThemeCache(cache);
    });
  }, []);

  // ── Build live songs ─────────────────────────────────────────────────────────
  useEffect(() => {
    const built: LiveSong[] = lineup.map((item) => {
      const selectedIds: number[] = JSON.parse(item.selectedSections || "[]");
      const filtered = item.song.sections.filter((s) => selectedIds.includes(s.id));
      // Fall back to all sections if selectedIds is empty or contains stale IDs
      // (sections:upsert deletes+reinserts with new auto-increment IDs)
      const sectionsToUse = filtered.length > 0 ? filtered : item.song.sections;
      const activeSections = sectionsToUse.map((s) => ({
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
        themeId: item.song.themeId,
        sections: activeSections,
      };
    });
    setLiveSongs(built);
  }, [lineup]);

  // ── Resolve theme style for a song ──────────────────────────────────────────
  const resolveThemeStyle = useCallback(
    (song: LiveSong): ResolvedThemeStyle => {
      const songTheme = song.themeId ? themeCache[song.themeId] : null;
      const activeTheme = songTheme ?? defaultTheme;
      if (!activeTheme?.settings) return DEFAULT_THEME_STYLE;
      try {
        const s = JSON.parse(activeTheme.settings);
        return {
          fontFamily: s.fontFamily ?? DEFAULT_THEME_STYLE.fontFamily,
          fontSize: s.fontSize ?? DEFAULT_THEME_STYLE.fontSize,
          fontWeight: s.fontWeight ?? DEFAULT_THEME_STYLE.fontWeight,
          textColor: s.textColor ?? DEFAULT_THEME_STYLE.textColor,
          textAlign: s.textAlign ?? DEFAULT_THEME_STYLE.textAlign,
          textPosition: s.textPosition ?? DEFAULT_THEME_STYLE.textPosition,
          overlayOpacity:
            s.overlayOpacity ?? DEFAULT_THEME_STYLE.overlayOpacity,
          textShadowOpacity:
            s.textShadowOpacity ?? DEFAULT_THEME_STYLE.textShadowOpacity,
          maxLinesPerSlide:
            s.maxLinesPerSlide ?? DEFAULT_THEME_STYLE.maxLinesPerSlide,
        };
      } catch {
        return DEFAULT_THEME_STYLE;
      }
    },
    [themeCache, defaultTheme],
  );

  // ── Resolve background for a song ───────────────────────────────────────────
  const resolveBackground = useCallback(
    (song: LiveSong): string | undefined => {
      const songTheme = song.themeId ? themeCache[song.themeId] : null;
      const songThemeBg = songTheme
        ? (() => {
            try {
              return JSON.parse(songTheme.settings).backgroundPath ?? null;
            } catch {
              return null;
            }
          })()
        : null;
      return (
        song.backgroundPath ??
        songThemeBg ??
        defaultThemeBackground ??
        undefined
      );
    },
    [themeCache, defaultThemeBackground],
  );

  // ── Send current slide to projection ────────────────────────────────────────
  const sendCurrentSlide = useCallback(
    (songIdx: number, secIdx: number, slideIdx: number, songs: LiveSong[]) => {
      if (!songs[songIdx]?.sections[secIdx]) return;
      const section = songs[songIdx].sections[secIdx];
      const slide = section.slides[slideIdx];
      if (!slide) return;

      const song = songs[songIdx];
      const style = resolveThemeStyle(song);
      const backgroundPath = resolveBackground(song);

      window.worshipsync.slide.show({
        lines: slide.lines,
        songTitle: song.title,
        sectionLabel: section.label,
        slideIndex: slideIdx,
        totalSlides: section.slides.length,
        backgroundPath,
        theme: {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          textColor: style.textColor,
          textAlign: style.textAlign,
          textPosition: style.textPosition,
          overlayOpacity: style.overlayOpacity,
          textShadowOpacity: style.textShadowOpacity,
          maxLinesPerSlide: style.maxLinesPerSlide,
        },
      });
    },
    [resolveThemeStyle, resolveBackground],
  );

  // ── Navigation ───────────────────────────────────────────────────────────────
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

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
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

  // ── Send first slide on load (once) ─────────────────────────────────────────
  const initialSlideSent = useRef(false);
  useEffect(() => {
    if (liveSongs.length > 0 && projectionOpen && !initialSlideSent.current) {
      initialSlideSent.current = true;
      sendCurrentSlide(0, 0, 0, liveSongs);
    }
  }, [liveSongs, projectionOpen, sendCurrentSlide]);

  // ── Derived state ────────────────────────────────────────────────────────────
  const currentSong = liveSongs[currentSongIndex];
  const currentSection = currentSong?.sections[currentSectionIndex];
  const currentSlide = currentSection?.slides[currentSlideIndex];

  // Resolve current song's theme style for the operator preview
  const currentThemeStyle = currentSong
    ? resolveThemeStyle(currentSong)
    : DEFAULT_THEME_STYLE;

  const currentBg = currentSong ? resolveBackground(currentSong) : undefined;

  const overlayAlpha = (currentThemeStyle.overlayOpacity / 100).toFixed(2);

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

  // ── Empty states ─────────────────────────────────────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Left col: song list + section pads ─────────────────────────── */}
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
              onClick={() => window.worshipsync.window.openProjection()}
            >
              Open
            </button>
          )}
        </div>

        {/* Lineup overview — always visible */}
        <div
          style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--border-subtle)",
            padding: "6px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {liveSongs.map((song, songIdx) => {
            const isActive = currentSongIndex === songIdx;
            const isPast = songIdx < currentSongIndex;
            return (
              <div
                key={song.lineupItemId}
                onClick={() => goToSlide(songIdx, 0, 0)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: isActive ? "var(--accent-blue-dim)" : "transparent",
                  border: `1px solid ${isActive ? "rgba(77,142,240,0.3)" : "transparent"}`,
                  opacity: isPast ? 0.5 : 1,
                  transition: "all 0.1s",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--font-mono)",
                    color: isActive ? "var(--accent-blue)" : "var(--text-muted)",
                    minWidth: 12,
                    flexShrink: 0,
                  }}
                >
                  {songIdx + 1}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--accent-blue)" : isPast ? "var(--text-muted)" : "var(--text-primary)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {song.title}
                </span>
                {isActive && (
                  <span style={{ fontSize: 8, color: "var(--accent-green)", flexShrink: 0 }}>
                    ● LIVE
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Current song section + slide tree */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {currentSong?.sections.map((sec, secIdx) => {
            const isCurrentSec = currentSectionIndex === secIdx;
            const isPlayed = secIdx < currentSectionIndex;
            const sectionColor = SECTION_COLORS[sec.type] ?? "var(--text-muted)";
            return (
              <div key={sec.id} style={{ marginBottom: 4 }}>
                {/* Section label header */}
                <div
                  onClick={() => goToSlide(currentSongIndex, secIdx, 0)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: "6px 6px 0 0",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: isCurrentSec ? "var(--accent-blue-dim)" : "var(--surface-2)",
                    border: `1px solid ${isCurrentSec ? "rgba(77,142,240,0.4)" : "var(--border-subtle)"}`,
                    borderBottom: "none",
                    opacity: isPlayed ? 0.45 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: isCurrentSec ? "var(--accent-blue)" : sectionColor,
                    }}
                  >
                    {sec.label}
                  </span>
                  {isCurrentSec && (
                    <span style={{ fontSize: 8, color: "var(--accent-green)", marginLeft: "auto" }}>
                      ● LIVE
                    </span>
                  )}
                </div>

                {/* Individual slide rows */}
                {sec.slides.map((slide, slideIdx) => {
                  const isActiveSlide = isCurrentSec && currentSlideIndex === slideIdx;
                  const slidePreview = slide.lines.filter(Boolean).join(" / ") || "—";
                  return (
                    <div
                      key={slideIdx}
                      onClick={() => goToSlide(currentSongIndex, secIdx, slideIdx)}
                      style={{
                        padding: "5px 9px 5px 22px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: isActiveSlide ? "rgba(77,142,240,0.18)" : "var(--surface-1)",
                        border: `1px solid ${isCurrentSec ? "rgba(77,142,240,0.4)" : "var(--border-subtle)"}`,
                        borderTop: "1px solid var(--border-subtle)",
                        borderRadius: slideIdx === sec.slides.length - 1 ? "0 0 6px 6px" : 0,
                        opacity: isPlayed ? 0.45 : 1,
                        transition: "background 0.1s",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 8,
                          fontFamily: "var(--font-mono)",
                          color: isActiveSlide ? "var(--accent-blue)" : "var(--text-muted)",
                          flexShrink: 0,
                          minWidth: 14,
                        }}
                      >
                        {slideIdx + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          lineHeight: 1.3,
                          color: isActiveSlide ? "var(--accent-blue)" : "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          fontWeight: isActiveSlide ? 600 : 400,
                        }}
                      >
                        {slidePreview}
                      </span>
                      {isActiveSlide && (
                        <span style={{ fontSize: 8, color: "var(--accent-blue)", flexShrink: 0 }}>▶</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Center: live preview + controls ────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
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
          {/* Blank / logo state banner */}
          {(isBlank || isLogo) && (
            <div
              style={{
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 7,
                background: isBlank ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.12)",
                border: `1px solid ${isBlank ? "var(--accent-red)" : "var(--accent-amber)"}`,
                fontSize: 12,
                fontWeight: 700,
                color: isBlank ? "var(--accent-red)" : "var(--accent-amber)",
                textAlign: "center",
                letterSpacing: "0.08em",
              }}
            >
              {isBlank ? "■ SCREEN BLANKED" : "◆ LOGO SCREEN"}
            </div>
          )}

          {/* Audience screen preview */}
          <div
            style={{
              flex: 1,
              borderRadius: 10,
              position: "relative",
              border: "1px solid var(--border-subtle)",
              overflow: "hidden",
              background: "#03030a",
              display: "flex",
              alignItems:
                currentThemeStyle.textPosition === "top"
                  ? "flex-start"
                  : currentThemeStyle.textPosition === "bottom"
                    ? "flex-end"
                    : "center",
              justifyContent: "center",
              padding: "5%",
            }}
          >
            {/* Background layer */}
            {currentBg &&
              !isBlank &&
              !isLogo &&
              (() => {
                if (currentBg.startsWith("color:")) {
                  return (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: currentBg.replace("color:", ""),
                      }}
                    />
                  );
                }
                return (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `url("file://${encodeURI(currentBg)}")`,
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
                  background: `rgba(0,0,0,${overlayAlpha})`,
                }}
              />
            )}

            {/* Blank */}
            {isBlank && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#000",
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

            {/* Logo */}
            {isLogo && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#000",
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

            {/* Lyrics — themed */}
            {!isBlank && !isLogo && currentSlide && (
              <>
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontFamily: currentThemeStyle.fontFamily,
                    // Scale font down proportionally for the preview box
                    fontSize: Math.round(currentThemeStyle.fontSize * 0.32),
                    fontWeight: currentThemeStyle.fontWeight,
                    color: currentThemeStyle.textColor,
                    textAlign: currentThemeStyle.textAlign,
                    lineHeight: 1.5,
                    textShadow: `0 1px 6px rgba(0,0,0,${(currentThemeStyle.textShadowOpacity / 100).toFixed(2)})`,
                    width: "100%",
                  }}
                >
                  {currentSlide.lines.map((line, i) => (
                    <div key={i}>{line || "\u00A0"}</div>
                  ))}
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: 8,
                    right: 12,
                    zIndex: 1,
                    color: "rgba(255,255,255,0.25)",
                    fontSize: 10,
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
            borderTop: `1px solid ${isBlank ? "var(--accent-red)" : isLogo ? "var(--accent-amber)" : "var(--border-subtle)"}`,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexShrink: 0,
            background: isBlank ? "rgba(239,68,68,0.1)" : isLogo ? "rgba(245,158,11,0.08)" : "var(--surface-1)",
            transition: "background 0.2s, border-color 0.2s",
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

      {/* ── Right col: keyboard shortcuts ──────────────────────────────── */}
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
            onClick={() => {
              window.worshipsync.slide.blank(true);
              onClose();
            }}
          >
            End service
          </button>
        </div>
      </div>
    </div>
  );
}

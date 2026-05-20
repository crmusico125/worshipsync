import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  MonitorOff,
  ChevronRight,
  ChevronDown,
  Music,
  Pencil,
  Cast,
  Play,
  Pause,
  Square,
  AlertCircle,
  X,
  Image as ImageIcon,
  Timer,
  BookOpen,
  Film,
  Volume2,
  RefreshCw,
  Keyboard,
  Search,
  Calendar,
  Tv,
  Repeat,
  SkipBack,
  SkipForward,
  Megaphone,
  Plus,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { useServiceStore, type ServiceDate } from "../store/useServiceStore";
import LibraryModal from "../components/LibraryModal";
import BackgroundPickerPanel from "../components/BackgroundPickerPanel";
import EditLyricsModal from "../components/EditLyricsModal";


// ── Audio singleton — survives PresenterDashboard unmounts ───────────────────
const _audio: {
  el: HTMLAudioElement | null;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  path: string | null;
} = { el: null, ctx: null, analyser: null, path: null };

// ── Types ────────────────────────────────────────────────────────────────────

interface Slide {
  lines: string[];
  sectionLabel: string;
  sectionType: string;
  sectionId: number;
  globalIndex: number;
}

interface LiveSong {
  lineupItemId: number;
  itemType: "song" | "countdown" | "scripture" | "media" | "announcement" | "section";
  songId: number;
  title: string;
  artist: string;
  key: string | null;
  ccliNumber: string | null;
  backgroundPath: string | null;
  mediaPath: string | null;
  themeId: number | null;
  notes: string | null;
  itemStyle: string | null;
  slides: Slide[];
}

interface ThemeStyle {
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

const DEFAULT_THEME: ThemeStyle = {
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

const SECTION_ABBREVS: Record<string, string> = {
  verse: "V",
  chorus: "C",
  bridge: "B",
  "pre-chorus": "PC",
  intro: "I",
  outro: "O",
  tag: "T",
  interlude: "IL",
  blank: "B",
};

function buildSlidesForSong(
  sections: { id: number; type: string; label: string; lyrics: string }[],
  maxLines = 2,
): Slide[] {
  const slides: Slide[] = [];
  let globalIdx = 0;
  for (const sec of sections) {
    // Split into paragraphs on blank lines — each paragraph boundary forces a new slide
    const paragraphs: string[][] = [];
    let current: string[] = [];
    for (const line of sec.lyrics.split("\n")) {
      if (line.trim() === "") {
        if (current.length > 0) { paragraphs.push(current); current = []; }
      } else {
        current.push(line);
      }
    }
    if (current.length > 0) paragraphs.push(current);

    if (paragraphs.length === 0) {
      // Media/blank slides: create one slide with empty line so background shows
      slides.push({
        lines: [""],
        sectionLabel: sec.label,
        sectionType: sec.type,
        sectionId: sec.id,
        globalIndex: globalIdx++,
      });
      continue;
    }
    for (const para of paragraphs) {
      for (let i = 0; i < para.length; i += maxLines) {
        slides.push({
          lines: para.slice(i, i + maxLines),
          sectionLabel: sec.label,
          sectionType: sec.type,
          sectionId: sec.id,
          globalIndex: globalIdx++,
        });
      }
    }
  }
  slides.push({
    lines: [""],
    sectionLabel: "Blank",
    sectionType: "blank",
    sectionId: -1,
    globalIndex: globalIdx,
  });
  return slides;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectionOpen: boolean;
  onProjectionChange: (open: boolean) => void;
  onExitLive: () => void;
  onSwitchToBuilder?: () => void;
}

export default function PresenterDashboard({
  projectionOpen,
  onProjectionChange,
  onExitLive,
  onSwitchToBuilder,
}: Props) {
  const {
    selectedService,
    lineup,
    loadLineup,
    selectService,
    addSongToLineup,
    addCountdownToLineup,
    addScriptureToLineup,
    addMediaToLineup,
    mediaLoopPrefs,
  } = useServiceStore();

  const [liveSongs, setLiveSongs] = useState<LiveSong[]>([]);
  const [selectedSongIdx, setSelectedSongIdx] = useState(0);
  const [activeSlideIdx, setActiveSlideIdx] = useState(-1);
  const [isBlank, setIsBlank] = useState(false);
  const [isLogo, setIsLogo] = useState(false);
  const [isTextCleared, setIsTextCleared] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmEndShow, setConfirmEndShow] = useState(false);
  const confirmEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [themeCache, setThemeCache] = useState<Record<number, any>>({});
  const [defaultTheme, setDefaultTheme] = useState<any>(null);
  const [defaultThemeBg, setDefaultThemeBg] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [pendingBgSave, setPendingBgSave] = useState<{ songId: number; lineupItemId: number; itemType: string; path: string | null } | null>(null);
  const [savingBg, setSavingBg] = useState(false);
  const [showEditLyrics, setShowEditLyrics] = useState(false);
  const [editLyricsInitial, setEditLyricsInitial] = useState("");
  const [displays, setDisplays] = useState<
    {
      id: number;
      label: string;
      width: number;
      height: number;
      isPrimary: boolean;
    }[]
  >([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<
    number | undefined
  >(undefined);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const [selectedConfidenceDisplayId, setSelectedConfidenceDisplayId] = useState<number | undefined>(undefined);
  const slideGridRef = useRef<HTMLDivElement>(null);

  // ── Scripture picker ─────────────────────────────────────────────────────


  // ── Run-of-show inline search ────────────────────────────────────────────
  const [rosSearch, setRosSearch] = useState("")
  const [rosResults, setRosResults] = useState<{ id: number; title: string; artist: string }[]>([])
  const rosSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRosSearch = useCallback((q: string) => {
    setRosSearch(q)
    if (rosSearchTimer.current) clearTimeout(rosSearchTimer.current)
    if (!q.trim()) { setRosResults([]); return }
    rosSearchTimer.current = setTimeout(async () => {
      const results = await window.worshipsync.songs.search(q)
      setRosResults(results as { id: number; title: string; artist: string }[])
    }, 200)
  }, [])

  // ── Service switcher ─────────────────────────────────────────────────────
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState("");
  const [recentServices, setRecentServices] = useState<ServiceDate[]>([]);
  const [switcherResults, setSwitcherResults] = useState<ServiceDate[]>([]);
  const switcherSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Countdown state
  const [countdownRunning, setCountdownRunning] = useState(false);
  const [countdownDisplay, setCountdownDisplay] = useState("00:00:00");
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoLoop, setVideoLoop] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoTimerStoppedAtRef = useRef<number | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoop, setAudioLoop] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vizFrameRef = useRef<number | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(new Array(64).fill(0));
  const [serviceTime, setServiceTime] = useState("11:00");
  const [serviceTimezone, setServiceTimezone] = useState("America/Los_Angeles");
  const [serviceSchedules, setServiceSchedules] = useState<Array<{
    id: string; dayOfWeek: number; startTime: string; endTime: string;
    label: string; timezone?: string;
  }>>([]);
  const [projectionFontSize, setProjectionFontSize] = useState(48);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Live runtime timer
  const liveStartRef = useRef<number>(0);
  const [liveRuntime, setLiveRuntime] = useState("00:00:00");

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedService) loadLineup(selectedService.id);
    window.worshipsync.window.getDisplays().then((d) => {
      setDisplays(d);
      const ext = d.find((x) => !x.isPrimary);
      setSelectedDisplayId(ext?.id ?? d[0]?.id);
      setSelectedConfidenceDisplayId(ext?.id ?? d[0]?.id);
    });
    window.worshipsync.themes.getDefault().then((t: any) => {
      setDefaultTheme(t);
      if (t?.settings) {
        try {
          setDefaultThemeBg(JSON.parse(t.settings).backgroundPath ?? null);
        } catch {}
      }
    });
    window.worshipsync.themes.getAll().then((all: any[]) => {
      const c: Record<number, any> = {};
      all.forEach((t) => {
        c[t.id] = t;
      });
      setThemeCache(c);
    });
    // Load service time settings
    window.worshipsync.appState
      .get()
      .then((state: Record<string, any>) => {
        if (state.serviceTime)      setServiceTime(state.serviceTime);
        if (state.serviceTimezone)  setServiceTimezone(state.serviceTimezone);
        if (state.serviceSchedules) setServiceSchedules(state.serviceSchedules);
        if (state.projectionFontSize) setProjectionFontSize(state.projectionFontSize);
      })
      .catch(() => {});

    const cleanupDisplays = window.worshipsync.window.onDisplaysChanged((d) => {
      setDisplays(d);
      setSelectedDisplayId((prev) => {
        if (prev !== undefined && d.find((x) => x.id === prev)) return prev;
        return d.find((x) => !x.isPrimary)?.id ?? d[0]?.id;
      });
    });

    // Check if confidence window is already open (e.g. survived a navigation)
    window.worshipsync.confidence.isOpen().then((open) => setConfidenceOpen(open)).catch(() => {});

    const cleanupConfidence = window.worshipsync.confidence.onClosed(() => {
      setConfidenceOpen(false);
    });

    return () => {
      cleanupDisplays();
      cleanupConfidence();
    };
  }, []);

  // ── Build live songs ─────────────────────────────────────────────────────
  useEffect(() => {
    const built: LiveSong[] = lineup.map((item) => {
      if (item.itemType === "section") {
        return {
          lineupItemId: item.id,
          itemType: "section" as const,
          songId: 0,
          title: item.title ?? "Section",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: null,
          mediaPath: null,
          themeId: null,
          notes: null,
          itemStyle: null,
          slides: [],
        };
      }
      if (item.itemType === "countdown") {
        return {
          lineupItemId: item.id,
          itemType: "countdown" as const,
          songId: 0,
          title: "Countdown Timer",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: null,
          mediaPath: null,
          themeId: null,
          notes: item.notes ?? null,
          itemStyle: null,
          slides: [],
        };
      }

      // First-class scripture items — build slides from parsed verses
      if (item.itemType === "scripture") {
        let verses: { label: string; text: string }[] = [];
        try { verses = JSON.parse(item.scriptureRef ?? "{}").verses ?? []; } catch {}
        let globalIdx = 0;
        const scriptureSlides: Slide[] = verses.map(v => ({
          lines: [v.text],
          sectionLabel: v.label,
          sectionType: "verse",
          sectionId: globalIdx,
          globalIndex: globalIdx++,
        }));
        scriptureSlides.push({ lines: [""], sectionLabel: "Blank", sectionType: "blank", sectionId: -1, globalIndex: globalIdx });
        return {
          lineupItemId: item.id,
          itemType: "scripture" as const,
          songId: 0,
          title: item.title ?? "Scripture",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: item.overrideBackgroundPath ?? null,
          mediaPath: null,
          themeId: null,
          notes: item.notes ?? null,
          itemStyle: null,
          slides: scriptureSlides,
        };
      }

      // Announcement items — single slide from body content
      if (item.itemType === "announcement") {
        const content = item.scriptureRef ?? "";
        const lines = content.split("\n");
        const announcementSlides: Slide[] = lines.filter(l => l.trim()).length > 0 ? [{
          lines,
          sectionLabel: "Announcement",
          sectionType: "announcement",
          sectionId: 0,
          globalIndex: 0,
        }] : [];
        announcementSlides.push({ lines: [""], sectionLabel: "Blank", sectionType: "blank", sectionId: -1, globalIndex: announcementSlides.length });
        return {
          lineupItemId: item.id,
          itemType: "announcement" as const,
          songId: 0,
          title: item.title ?? "Announcement",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: item.overrideBackgroundPath ?? null,
          mediaPath: null,
          themeId: null,
          notes: item.notes ?? null,
          itemStyle: item.itemStyle ?? null,
          slides: announcementSlides,
        };
      }

      // First-class media items — no slides
      if (item.itemType === "media") {
        return {
          lineupItemId: item.id,
          itemType: "media" as const,
          songId: 0,
          title: item.title ?? "Media",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: null,
          mediaPath: item.mediaPath ?? null,
          themeId: null,
          notes: item.notes ?? null,
          itemStyle: null,
          slides: [],
        };
      }

      // Skip items with missing song data
      if (!item.song) {
        return {
          lineupItemId: item.id,
          itemType: "song" as const,
          songId: 0,
          title: "Unknown",
          artist: "",
          key: null,
          ccliNumber: null,
          backgroundPath: null,
          mediaPath: null,
          themeId: null,
          notes: item.notes ?? null,
          itemStyle: null,
          slides: [],
        };
      }

      let filtered = item.song.sections;
      if (item.sectionOrder) {
        try {
          const ids: number[] = JSON.parse(item.sectionOrder);
          const reordered = ids.map(id => filtered.find(s => s.id === id)).filter(Boolean) as typeof filtered;
          if (reordered.length === filtered.length) filtered = reordered;
        } catch {}
      }

      // Resolve per-song maxLinesPerSlide from theme
      let maxLines = DEFAULT_THEME.maxLinesPerSlide;
      const songThemeId = item.song.themeId;
      if (songThemeId && themeCache[songThemeId]?.settings) {
        try {
          const parsed = JSON.parse(themeCache[songThemeId].settings);
          if (parsed.maxLinesPerSlide) maxLines = parsed.maxLinesPerSlide;
        } catch {}
      }

      return {
        lineupItemId: item.id,
        itemType: "song" as const,
        songId: item.song.id,
        title: item.song.title,
        artist: item.song.artist ?? "",
        key: item.song.key ?? null,
        ccliNumber: item.song.ccliNumber ?? null,
        backgroundPath: item.overrideBackgroundPath ?? item.song.backgroundPath ?? null,
        mediaPath: null,
        themeId: item.song.themeId ?? null,
        notes: item.notes ?? null,
        itemStyle: null,
        slides: buildSlidesForSong(filtered, maxLines),
      };
    });
    setLiveSongs(built);
  }, [lineup, themeCache]);

  // Sync lineup to stage display / PWA controller whenever the live song list or selection changes

  // ── Theme + background resolution ────────────────────────────────────────
  const resolveTheme = useCallback(
    (song: LiveSong): ThemeStyle => {
      const t =
        (song.themeId ? themeCache[song.themeId] : null) ?? defaultTheme;
      let base = DEFAULT_THEME;
      if (t?.settings) {
        try {
          base = { ...DEFAULT_THEME, ...JSON.parse(t.settings) };
        } catch {}
      }
      return base;
    },
    [themeCache, defaultTheme],
  );

  const resolveBg = useCallback(
    (song: LiveSong): string | undefined => {
      if (song.backgroundPath) return song.backgroundPath;
      if (song.themeId && themeCache[song.themeId]) {
        try {
          return (
            JSON.parse(themeCache[song.themeId].settings).backgroundPath ??
            undefined
          );
        } catch {}
      }
      return defaultThemeBg ?? undefined;
    },
    [themeCache, defaultThemeBg],
  );

  // ── Slide projection ─────────────────────────────────────────────────────
  const sendSlide = useCallback(
    (songIdx: number, slideIdx: number) => {
      const song = liveSongs[songIdx];
      if (!song) return;
      const slide = song.slides[slideIdx];
      if (!slide) return;
      const baseTheme = resolveTheme(song);
      const itemStyleOverride = song.itemStyle ? (() => { try { return JSON.parse(song.itemStyle); } catch { return {}; } })() : {};
      const theme = { ...baseTheme, ...itemStyleOverride };
      const bg = resolveBg(song);
      setSelectedSongIdx(songIdx);
      setActiveSlideIdx(slideIdx);
      setIsBlank(false);
      setIsLogo(false);
      setIsTextCleared(false);

      // Compute next slide for stage display
      let nextLines: string[] | undefined;
      let nextSectionLabel: string | undefined;
      const nextSlide = song.slides[slideIdx + 1];
      if (nextSlide && nextSlide.sectionType !== "blank" && nextSlide.lines.filter(Boolean).length) {
        nextLines = nextSlide.lines;
        nextSectionLabel = nextSlide.sectionLabel;
      }
      if (!nextLines) {
        // Find next lineup item with real slides (skip sections which have slides:[])
        let nextSong: typeof liveSongs[0] | null = null;
        for (let k = songIdx + 1; k < liveSongs.length; k++) {
          if (liveSongs[k].slides.length > 0) { nextSong = liveSongs[k]; break; }
        }
        const firstNextSlide = nextSong?.slides.find((s) => s.sectionType !== "blank");
        if (firstNextSlide && firstNextSlide.lines.filter(Boolean).length) {
          nextLines = firstNextSlide.lines;
          nextSectionLabel = `${nextSong!.title} \u2014 ${firstNextSlide.sectionLabel}`;
        }
      }

      if (slide.sectionType === "blank") {
        window.worshipsync.slide.blank(true);
        // Keep the stage display "next" section current even while the screen is blank
        if (nextLines?.length) {
          window.worshipsync.slide.stageNext({
            nextLines,
            nextSectionLabel: nextSectionLabel ?? "",
          });
        }
        setIsBlank(true);
      } else {
        window.worshipsync.slide.blank(false);
        window.worshipsync.slide.logo(false);
        window.worshipsync.slide.show({
          lines: slide.lines,
          songTitle: song.title,
          artist: song.artist,
          sectionLabel: slide.sectionLabel,
          sectionType: slide.sectionType,
          itemType: song.itemType,
          slideIndex: slide.globalIndex,
          totalSlides: song.slides.length,
          backgroundPath: bg,
          nextLines,
          nextSectionLabel,
          theme: {
            fontFamily: theme.fontFamily,
            fontSize:
              theme.fontSize !== DEFAULT_THEME.fontSize
                ? theme.fontSize
                : projectionFontSize,
            fontWeight: theme.fontWeight,
            textColor: theme.textColor,
            textAlign: theme.textAlign,
            textPosition: theme.textPosition,
            overlayOpacity: theme.overlayOpacity,
            textShadowOpacity: theme.textShadowOpacity,
            maxLinesPerSlide: theme.maxLinesPerSlide,
          },
        });
      }
    },
    [liveSongs, resolveTheme, resolveBg, projectionFontSize],
  );

  // Refs that always hold the latest projection state — used inside the
  // projection:ready callback so display moves restore the correct content.
  const countdownRunningRef = useRef(countdownRunning);
  countdownRunningRef.current = countdownRunning;
  const isBlankRef = useRef(isBlank);
  isBlankRef.current = isBlank;
  const isLogoRef = useRef(isLogo);
  isLogoRef.current = isLogo;
  const activeSlideIdxRef = useRef(activeSlideIdx);
  activeSlideIdxRef.current = activeSlideIdx;
  const selectedSongIdxRef = useRef(selectedSongIdx);
  selectedSongIdxRef.current = selectedSongIdx;

  // ── Controls ─────────────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    window.worshipsync.slide.blank(true);
    setIsBlank(true);
    setIsLogo(false);
    setIsTextCleared(false);
    setActiveSlideIdx(-1);
  }, []);
  const clearText = useCallback(() => {
    if (isTextCleared) {
      // Restore — re-send the active slide
      if (activeSlideIdx >= 0) sendSlide(selectedSongIdx, activeSlideIdx);
      setIsTextCleared(false);
      return;
    }
    const song = liveSongs[selectedSongIdx];
    if (!song) {
      window.worshipsync.slide.blank(true);
      setIsBlank(true);
      return;
    }
    const theme = resolveTheme(song);
    const bg = resolveBg(song);
    const currentSlide = song.slides[activeSlideIdx];
    window.worshipsync.slide.blank(false);
    window.worshipsync.slide.logo(false);
    window.worshipsync.slide.show({
      lines: [],
      songTitle: song.title,
      artist: song.artist,
      sectionLabel: currentSlide?.sectionLabel ?? "",
      slideIndex: currentSlide?.globalIndex ?? 0,
      totalSlides: song.slides.length,
      backgroundPath: bg,
      theme: {
        fontFamily: theme.fontFamily,
        fontSize: theme.fontSize !== DEFAULT_THEME.fontSize ? theme.fontSize : projectionFontSize,
        fontWeight: theme.fontWeight,
        textColor: theme.textColor,
        textAlign: theme.textAlign,
        textPosition: theme.textPosition,
        overlayOpacity: theme.overlayOpacity,
        textShadowOpacity: theme.textShadowOpacity,
        maxLinesPerSlide: theme.maxLinesPerSlide,
      },
    });
    setIsBlank(false);
    setIsLogo(false);
    setIsTextCleared(true);
  }, [isTextCleared, activeSlideIdx, selectedSongIdx, liveSongs, sendSlide, resolveTheme, resolveBg, projectionFontSize]);
  const toBlack = useCallback(() => {
    window.worshipsync.slide.blank(true);
    setIsBlank(true);
    setIsLogo(false);
    setIsTextCleared(false);
  }, []);
  const showLogo = useCallback(() => {
    window.worshipsync.slide.logo(true);
    setIsBlank(false);
    setIsLogo(true);
    setIsTextCleared(false);
  }, []);

  const jumpToItem = useCallback((idx: number) => {
    const item = liveSongs[idx];
    if (!item) return;
    // Items without slides (countdown, media, etc.) just select via state
    if (!item.slides || item.slides.length === 0) {
      setSelectedSongIdx(idx);
      setActiveSlideIdx(-1);
    } else {
      sendSlide(idx, 0);
    }
  }, [liveSongs, sendSlide]);

  // ── Audio viz (component-level so they survive song switches / remounts) ───
  const stopViz = useCallback(() => {
    if (vizFrameRef.current) { cancelAnimationFrame(vizFrameRef.current); vizFrameRef.current = null; }
    setWaveformBars(new Array(64).fill(0));
  }, []);

  const startViz = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setWaveformBars(Array.from({ length: 64 }, (_, ii) => {
        const idx = Math.floor((ii / 64) * data.length);
        return data[idx] / 255;
      }));
      vizFrameRef.current = requestAnimationFrame(tick);
    };
    vizFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const goNextSong = useCallback(() => {
    // Skip section headers when navigating
    let next = selectedSongIdx + 1;
    while (next < liveSongs.length && liveSongs[next]?.itemType === "section") next++;
    if (next < liveSongs.length) jumpToItem(next);
  }, [selectedSongIdx, liveSongs, jumpToItem]);

  const goPrevSong = useCallback(() => {
    let prev = selectedSongIdx - 1;
    while (prev >= 0 && liveSongs[prev]?.itemType === "section") prev--;
    if (prev >= 0) jumpToItem(prev);
  }, [selectedSongIdx, liveSongs, jumpToItem]);

  const goPrevSlide = useCallback(() => {
    const prev = activeSlideIdx - 1;
    if (prev >= 0) sendSlide(selectedSongIdx, prev);
  }, [activeSlideIdx, selectedSongIdx, sendSlide]);

  const goNextSlide = useCallback(() => {
    const song = liveSongs[selectedSongIdx];
    if (!song) return;
    const next = activeSlideIdx + 1;
    if (next < song.slides.length) sendSlide(selectedSongIdx, next);
    else goNextSong();
  }, [activeSlideIdx, selectedSongIdx, liveSongs, sendSlide, goNextSong]);

  const startLive = () => {
    window.worshipsync.window.openProjection(selectedDisplayId);
    onProjectionChange(true);
  };

  const endShow = () => {
    if (!confirmEndShow) {
      setConfirmEndShow(true);
      confirmEndTimer.current = setTimeout(() => setConfirmEndShow(false), 3000);
      return;
    }
    if (confirmEndTimer.current) clearTimeout(confirmEndTimer.current);
    setConfirmEndShow(false);
    // Stop video
    if (videoPreviewRef.current) { videoPreviewRef.current.pause(); videoPreviewRef.current.currentTime = 0; }
    if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
    setVideoPlaying(false); setVideoCurrentTime(0); setVideoDuration(0); setVideoLoop(false);
    // Stop audio and tear down singleton
    if (_audio.el) { _audio.el.pause(); _audio.el = null; }
    if (_audio.ctx) { _audio.ctx.close(); _audio.ctx = null; }
    _audio.analyser = null; _audio.path = null;
    audioRef.current = null; audioContextRef.current = null; analyserRef.current = null;
    if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; }
    stopViz();
    setAudioPlaying(false); setAudioCurrentTime(0); setAudioDuration(0);
    window.worshipsync.slide.blank(true);
    window.worshipsync.window.closeProjection();
    onProjectionChange(false);
    onExitLive();
  };

  // ── Switcher callbacks ───────────────────────────────────────────────────
  const [pendingSwitch, setPendingSwitch] = useState<ServiceDate | null>(null);

  const openSwitcher = useCallback(async () => {
    const recent = await window.worshipsync.services.getRecent();
    setRecentServices(recent);
    setSwitcherSearch("");
    setSwitcherResults([]);
    setPendingSwitch(null);
    setShowSwitcher(true);
  }, []);

  const handleSwitcherSearch = useCallback((q: string) => {
    setSwitcherSearch(q);
    setPendingSwitch(null);
    if (switcherSearchTimer.current) clearTimeout(switcherSearchTimer.current);
    if (!q.trim()) {
      setSwitcherResults([]);
      return;
    }
    switcherSearchTimer.current = setTimeout(async () => {
      const results = await window.worshipsync.services.search(q);
      setSwitcherResults(results);
    }, 300);
  }, []);

  const requestSwitch = useCallback((svc: ServiceDate) => {
    if (svc.id === selectedService?.id) return;
    setPendingSwitch(svc);
  }, [selectedService]);

  const confirmSwitch = useCallback(async () => {
    if (!pendingSwitch) return;
    await selectService(pendingSwitch);
    setSelectedSongIdx(0);
    setActiveSlideIdx(-1);
    setShowSwitcher(false);
    setPendingSwitch(null);
  }, [pendingSwitch, selectService]);


  const handleLibraryAdd = async (songIds: number[]) => {
    for (const id of songIds) await addSongToLineup(id);
  };

  const handleAddScripture = async (
    title: string,
    verses: { number: number; text: string }[],
    ref: { book: string; chapter: number; translation: string },
  ) => {
    const scriptureRef = JSON.stringify({
      verses: verses.map(v => ({
        label: `${ref.book} ${ref.chapter}:${v.number} ${ref.translation}`,
        text: v.text,
      }))
    });
    await addScriptureToLineup({ title, scriptureRef });
  };

  const handleAddMedia = async (path: string) => {
    const filename = path.split("/").pop() ?? "Media";
    const isVideo = /\.(mp4|webm|mov)$/i.test(path);
    const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(path);
    const label = isVideo ? "Video" : isAudio ? "Audio" : "Image";
    await addMediaToLineup({ title: `${label}: ${filename}`, mediaPath: path });
  };

  // ── Background picker ────────────────────────────────────────────────────
  const handleBackgroundSelect = useCallback(async (bg: string | null) => {
    const song = liveSongs[selectedSongIdx];
    if (!song) return;
    // Apply immediately to the live session
    setLiveSongs(prev => prev.map((s, i) =>
      i === selectedSongIdx ? { ...s, backgroundPath: bg } : s
    ));
    if (song.itemType === 'scripture') {
      // Scripture items save directly to the lineup item — no "session only" concept
      await window.worshipsync.lineup.setOverrideBg(song.lineupItemId, bg);
      if (selectedService) await loadLineup(selectedService.id);
      setShowBgPicker(false);
    } else {
      setPendingBgSave({ songId: song.songId, lineupItemId: song.lineupItemId, itemType: song.itemType, path: bg });
    }
  }, [liveSongs, selectedSongIdx, selectedService, loadLineup]);

  const handleSaveBg = useCallback(async () => {
    if (!pendingBgSave) return;
    setSavingBg(true);
    try {
      await window.worshipsync.backgrounds.setBackground(pendingBgSave.songId, pendingBgSave.path);
      setPendingBgSave(null);
      setShowBgPicker(false);
    } finally {
      setSavingBg(false);
    }
  }, [pendingBgSave]);

  // ── Edit lyrics ──────────────────────────────────────────────────────────
  const handleOpenEditLyrics = useCallback(async () => {
    const song = liveSongs[selectedSongIdx];
    if (!song) return;
    const full = await window.worshipsync.songs.getById(song.songId);
    if (!full) return;
    const raw = full.sections.map((s: { label: string; lyrics: string }) => `[${s.label}]\n${s.lyrics}`).join("\n\n");
    setEditLyricsInitial(raw);
    setShowEditLyrics(true);
  }, [liveSongs, selectedSongIdx]);

  const handleSaveLyrics = useCallback(async (lyrics: string) => {
    const song = liveSongs[selectedSongIdx];
    if (!song) return;
    const full = await window.worshipsync.songs.getById(song.songId);
    if (!full) return;
    // Parse sections from the edited text and upsert
    const sections: { type: string; label: string; lyrics: string; orderIndex: number }[] = [];
    const blocks = lyrics.split(/\n(?=\[)/);
    blocks.forEach((block, i) => {
      const match = block.match(/^\[([^\]]+)\]\n?([\s\S]*)$/);
      if (!match) return;
      const label = match[1].trim();
      const sectionLyrics = match[2].trimEnd();
      const existing = full.sections.find((s: { label: string; type: string }) => s.label === label);
      sections.push({ type: existing?.type ?? "verse", label, lyrics: sectionLyrics, orderIndex: i });
    });
    await window.worshipsync.songs.upsertSections(song.songId, sections);
    await loadLineup(selectedService!.id);
    setShowEditLyrics(false);
  }, [liveSongs, selectedSongIdx, selectedService, loadLineup]);

  // ── Countdown ───────────────────────────────────────────────────────────
  // Resolve the timezone for the current service: match day-of-week to a saved schedule,
  // fall back to the global serviceTimezone setting.
  const getEffectiveTz = useCallback(() => {
    if (selectedService?.date && serviceSchedules.length > 0) {
      const dow = new Date(selectedService.date + "T12:00:00").getDay();
      const match = serviceSchedules.find((s) => s.dayOfWeek === dow);
      if (match?.timezone) return match.timezone;
    }
    return serviceTimezone;
  }, [selectedService, serviceSchedules, serviceTimezone]);

  const getTargetTime = useCallback(() => {
    const tz = getEffectiveTz();
    const dateStr = selectedService?.date ?? new Date().toLocaleDateString("en-CA", { timeZone: tz });
    return `${dateStr}T${serviceTime}:00`;
  }, [serviceTime, getEffectiveTz, selectedService]);

  // Restore whatever is currently active on a freshly created projection window.
  // Uses refs so the callback is stable but always sees current state.
  const restoreProjectionState = useCallback(() => {
    if (countdownRunningRef.current) {
      window.worshipsync.slide.logo(false);
      window.worshipsync.slide.countdown({ targetTime: getTargetTime(), running: true });
    } else if (isLogoRef.current) {
      window.worshipsync.slide.logo(true);
    } else if (activeSlideIdxRef.current >= 0 && !isBlankRef.current) {
      sendSlide(selectedSongIdxRef.current, activeSlideIdxRef.current);
    } else {
      window.worshipsync.slide.blank(true);
    }
  }, [getTargetTime, sendSlide]);

  // When going live, start blank and register the projection:ready listener.
  // The same listener fires after a display move — refs ensure it restores
  // the current state rather than the initial blank.
  useEffect(() => {
    if (!projectionOpen) return;
    window.worshipsync.slide.blank(true);
    setIsBlank(true);
    setActiveSlideIdx(-1);
    const cleanup = window.worshipsync.window.onProjectionReady(restoreProjectionState);
    return cleanup;
  }, [projectionOpen, restoreProjectionState]);

  // Live runtime counter
  useEffect(() => {
    if (!projectionOpen) return;
    liveStartRef.current = Date.now();
    setLiveRuntime("00:00:00");
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - liveStartRef.current) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      setLiveRuntime(`${pad(h)}:${pad(m)}:${pad(s)}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [projectionOpen]);

  // On mount: restore audio state from singleton if audio was playing before unmount
  useEffect(() => {
    if (_audio.el && !_audio.el.paused) {
      audioRef.current = _audio.el;
      audioContextRef.current = _audio.ctx;
      analyserRef.current = _audio.analyser;
      setAudioPlaying(true);
      setAudioDuration(_audio.el.duration || 0);
      setAudioCurrentTime(_audio.el.currentTime);
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      audioTimerRef.current = setInterval(() => setAudioCurrentTime(_audio.el?.currentTime ?? 0), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync audioLoop from builder preference when selecting an audio item
  useEffect(() => {
    const song = liveSongs[selectedSongIdx];
    if (song?.itemType === "media" && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(song.mediaPath ?? "")) {
      const saved = mediaLoopPrefs[song.lineupItemId] ?? false;
      setAudioLoop(saved);
      if (audioRef.current) audioRef.current.loop = saved;
      if (_audio.el) _audio.el.loop = saved;
    }
  }, [selectedSongIdx, liveSongs, mediaLoopPrefs]);

  // When the selected item changes, stop viz/timer if leaving audio; reconnect if returning
  useEffect(() => {
    const song = liveSongs[selectedSongIdx];
    const isAudio = song?.itemType === "media" &&
      /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(song?.mediaPath ?? "");
    if (!isAudio) {
      stopViz();
      if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; }
      return;
    }
    // Returned to audio item — reconnect singleton and restart viz/timer if playing
    if (_audio.el && !_audio.el.paused) {
      audioRef.current = _audio.el;
      audioContextRef.current = _audio.ctx;
      analyserRef.current = _audio.analyser;
      if (!vizFrameRef.current) startViz();
      if (!audioTimerRef.current) {
        audioTimerRef.current = setInterval(() => setAudioCurrentTime(_audio.el?.currentTime ?? 0), 100);
      }
    }
  }, [liveSongs, selectedSongIdx, startViz, stopViz]);

  const computeCountdownDisplay = useCallback(() => {
    const dateStr = selectedService?.date ?? new Date().toLocaleDateString("en-CA");
    const target = new Date(`${dateStr}T${serviceTime}:00`);
    if (isNaN(target.getTime())) return "00:00:00";
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return "00:00:00";
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return d > 0
      ? `${pad(d)}d ${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(h)}:${pad(m)}:${pad(s)}`;
  }, [serviceTime, selectedService]);

  const startCountdown = useCallback(() => {
    setCountdownRunning(true);
    setIsBlank(false);
    const targetTime = getTargetTime();

    // Send initial state to projection
    window.worshipsync.slide.logo(false);
    window.worshipsync.slide.countdown({ targetTime, running: true });

    // Update local display every second
    const update = () => setCountdownDisplay(computeCountdownDisplay());
    update();
    countdownIntervalRef.current = setInterval(() => {
      const display = computeCountdownDisplay();
      setCountdownDisplay(display);
      if (display === "00:00:00") {
        stopCountdown();
      }
    }, 1000);
  }, [getTargetTime, computeCountdownDisplay]);

  const stopCountdown = useCallback(() => {
    setCountdownRunning(false);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    window.worshipsync.slide.countdown({ targetTime: "", running: false });
    window.worshipsync.slide.blank(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (confirmEndTimer.current) clearTimeout(confirmEndTimer.current);
      if (countdownIntervalRef.current)
        clearInterval(countdownIntervalRef.current);
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (vizFrameRef.current) cancelAnimationFrame(vizFrameRef.current);
      // Don't pause audio or close AudioContext — singleton keeps it alive across navigation
      audioRef.current = null;
      audioContextRef.current = null;
      analyserRef.current = null;
    };
  }, []);

  // ── Keyboard nav ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNextSlide();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevSlide();
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) goPrevSong();
        else goNextSong();
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        if (isBlank) {
          if (activeSlideIdx >= 0) sendSlide(selectedSongIdx, activeSlideIdx);
          else { window.worshipsync.slide.blank(false); setIsBlank(false); }
        } else {
          toBlack();
        }
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        if (isBlank) {
          if (activeSlideIdx >= 0) sendSlide(selectedSongIdx, activeSlideIdx);
          else { window.worshipsync.slide.blank(false); setIsBlank(false); }
        }
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "Escape") {
        setShowHelp(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNextSlide, goPrevSlide, goNextSong, goPrevSong, isBlank, activeSlideIdx, selectedSongIdx, sendSlide, toBlack]);



  // Scroll active slide into view when it changes
  useEffect(() => {
    if (activeSlideIdx < 0 || !slideGridRef.current) return;
    const el = slideGridRef.current.querySelector<HTMLElement>(`[data-slide-idx="${activeSlideIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeSlideIdx, selectedSongIdx]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentSong = liveSongs[selectedSongIdx] ?? null;
  const currentSlide = currentSong?.slides[activeSlideIdx] ?? null;
  const nextSong = liveSongs[selectedSongIdx + 1] ?? null;
  const effectiveTheme = currentSong
    ? resolveTheme(currentSong)
    : DEFAULT_THEME;
  const effectiveBg = currentSong ? resolveBg(currentSong) : undefined;

  const nextUp = useMemo(() => {
    if (!currentSong || activeSlideIdx < 0) return null;
    const nextIdx = activeSlideIdx + 1;
    if (nextIdx < currentSong.slides.length) {
      return { slide: currentSong.slides[nextIdx], songTitle: null };
    }
    if (nextSong && nextSong.slides.length > 0) {
      return { slide: nextSong.slides[0], songTitle: nextSong.title };
    }
    return null;
  }, [currentSong, activeSlideIdx, nextSong]);

  const sectionTabs = useMemo(() => {
    if (!currentSong || currentSong.slides.length === 0) return [];
    const seen = new Set<number>();
    const tabs: { sectionId: number; label: string; firstSlideIdx: number }[] = [];
    currentSong.slides.forEach((slide, i) => {
      if (slide.sectionType === "blank" || seen.has(slide.sectionId)) return;
      seen.add(slide.sectionId);
      let label: string;
      if (currentSong.itemType === "scripture") {
        // Extract verse number from labels like "John 3:16 ESV" → "16"
        const verseMatch = slide.sectionLabel.match(/:(\d+)/);
        label = verseMatch ? verseMatch[1] : String(tabs.length + 1);
      } else {
        const abbrev = SECTION_ABBREVS[slide.sectionType] ?? slide.sectionLabel[0]?.toUpperCase() ?? "?";
        const numMatch = slide.sectionLabel.match(/\d+$/);
        label = numMatch ? abbrev + numMatch[0] : abbrev;
      }
      tabs.push({ sectionId: slide.sectionId, label, firstSlideIdx: i });
    });
    return tabs;
  }, [currentSong]);

  const activeSectionId = currentSlide?.sectionId ?? -1;

  if (!selectedService) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <Music className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            No service loaded
          </p>
          <p className="text-xs text-muted-foreground">
            Go to Builder, prepare a lineup, and click Go Live
          </p>
        </div>
      </div>
    );
  }

  // ── Pre-live idle ──────────────────────────────────────────────────────
  if (!projectionOpen) {
    return (
      <PreLiveIdle
        serviceLabel={selectedService.label}
        songs={liveSongs}
        canGoLive={liveSongs.length > 0}
        onStartLive={startLive}
        displays={displays}
        selectedDisplayId={selectedDisplayId}
        onDisplayChange={setSelectedDisplayId}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background text-foreground relative">
      {/* Click-away overlay for switcher */}
      {showSwitcher && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowSwitcher(false); setPendingSwitch(null); }} />
      )}

      {/* ═════ TOP HEADER BAR ═════ */}
      <div
        className="h-12 shrink-0 border-b border-border bg-card flex items-center px-4 gap-3 relative z-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* ON AIR */}
        <div className="flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-[11px] font-bold text-red-400 tracking-widest">ON AIR</span>
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Service name + switcher */}
        <div className="relative" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <button
            onClick={openSwitcher}
            className="flex items-center gap-1 group hover:text-primary transition-colors"
          >
            <span className="text-sm font-semibold truncate max-w-[180px]">{selectedService.label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
          </button>

          {/* Switcher dropdown */}
          {showSwitcher && (
            <div className="absolute top-full left-0 mt-1 w-72 z-50 bg-card border border-border shadow-xl rounded-lg overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={switcherSearch}
                    onChange={(e) => handleSwitcherSearch(e.target.value)}
                    placeholder="Search lineups…"
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-input rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {!switcherSearch.trim() ? (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Lineups</p>
                    {recentServices.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No upcoming services</p>}
                    {recentServices.map((svc) => (
                      <SwitcherRow key={svc.id} svc={svc} isCurrent={svc.id === selectedService.id} isPending={pendingSwitch?.id === svc.id} onSelect={() => requestSwitch(svc)} />
                    ))}
                  </>
                ) : switcherResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No results</p>
                ) : (
                  switcherResults.map((svc) => (
                    <SwitcherRow key={svc.id} svc={svc} isCurrent={svc.id === selectedService.id} isPending={pendingSwitch?.id === svc.id} onSelect={() => requestSwitch(svc)} />
                  ))
                )}
              </div>
              {pendingSwitch && (
                <div className="border-t border-border bg-amber-500/10 px-3 py-2 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <p className="text-[11px] text-amber-500 font-medium flex-1 truncate min-w-0">Switch to "{pendingSwitch.label}"?</p>
                  <button onClick={() => { setShowSwitcher(false); setPendingSwitch(null); }} className="text-[11px] text-muted-foreground hover:text-foreground shrink-0">Cancel</button>
                  <button onClick={confirmSwitch} className="text-[11px] font-semibold text-amber-500 hover:text-amber-400 shrink-0">Confirm</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Runtime */}
        <span className="text-[11px] text-muted-foreground shrink-0">Live Runtime: {liveRuntime}</span>

        <div className="flex-1" />

        {/* Keyboard help */}
        <button
          onClick={() => setShowHelp(true)}
          title="Keyboard shortcuts (?)"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <Keyboard className="h-3.5 w-3.5" />
        </button>

        {/* Edit in Builder */}
        {onSwitchToBuilder && (
          <button
            onClick={onSwitchToBuilder}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className="h-7 flex items-center gap-1.5 px-2.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border border-border"
          >
            <Pencil className="h-3 w-3" /> Builder
          </button>
        )}

        {/* End Show */}
        <button
          onClick={endShow}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          className={`h-7 flex items-center gap-1.5 px-3 rounded text-xs font-semibold transition-colors ${
            confirmEndShow
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/30"
          }`}
        >
          {confirmEndShow ? "Confirm?" : "End Show"}
        </button>
      </div>

      {/* ═════ BODY: Left + Center + Right ═════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

      {/* ═════ LEFT: Run of Show (220px) ═════ */}
      <div className="w-[220px] shrink-0 border-r border-border flex flex-col bg-card">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Run of Show</span>
          <button onClick={() => setShowLibrary(true)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors font-medium">+ Add</button>
        </div>

        {/* Inline song search */}
        <div className="px-2 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              value={rosSearch}
              onChange={e => handleRosSearch(e.target.value)}
              placeholder="Quick-add song…"
              className="w-full pl-6 pr-6 py-1.5 text-xs bg-input border border-border rounded focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
            />
            {rosSearch && (
              <button
                onClick={() => { setRosSearch(""); setRosResults([]); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {rosResults.length > 0 && (
            <div className="mt-1.5 border border-border rounded-md bg-background shadow-lg overflow-hidden">
              {rosResults.slice(0, 6).map(song => (
                <button
                  key={song.id}
                  onClick={async () => {
                    await addSongToLineup(song.id)
                    setRosSearch("")
                    setRosResults([])
                    setSelectedSongIdx(liveSongs.length)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-accent/40 transition-colors border-b border-border last:border-0 text-left"
                >
                  <Music className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate">{song.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{song.artist || "Unknown"}</p>
                  </div>
                  <Plus className="h-3 w-3 text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}
          {rosSearch.trim() && rosResults.length === 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1">No songs found</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {liveSongs.map((song, i) => {
            const isCurrent = selectedSongIdx === i;
            const isFinished = i < selectedSongIdx;
            const isNextItem = i === selectedSongIdx + 1;
            const isSection = song.itemType === "section";
            const isCountdown = song.itemType === "countdown";
            const isScripture = song.itemType === "scripture";
            const isMedia = song.itemType === "media";
            const isAudioItem = isMedia && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(song.mediaPath ?? "");
            const isVideoItem = isMedia && /\.(mp4|webm|mov)$/i.test(song.mediaPath ?? "");
            const isAnnouncement = song.itemType === "announcement";

            // Section headers — visual dividers, not selectable items
            if (isSection) {
              return (
                <div key={song.lineupItemId} className="flex items-center gap-2 px-3 pt-3 pb-1">
                  <Layers className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 truncate">
                    {song.title}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              );
            }

            const Icon = isCountdown ? Timer : isScripture ? BookOpen : isMedia ? (isVideoItem ? Film : isAudioItem ? Volume2 : ImageIcon) : isAnnouncement ? Megaphone : Music;
            return (
              <button
                key={song.lineupItemId}
                onClick={() => {
                  setSelectedSongIdx(i);
                  setActiveSlideIdx(-1);
                  // Stop the timer — stamp when we stopped so restore can calculate elapsed time
                  if (videoTimerRef.current) {
                    clearInterval(videoTimerRef.current);
                    videoTimerRef.current = null;
                    if (videoPlaying) videoTimerStoppedAtRef.current = Date.now();
                  }
                  if (vizFrameRef.current) { cancelAnimationFrame(vizFrameRef.current); vizFrameRef.current = null; }
                  // Keep audio playing — viz/timer are handled by the currentSong effect
                  audioRef.current = null;
                  audioContextRef.current = null;
                  analyserRef.current = null;
                }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2.5 border-b border-border transition-colors ${
                  isCurrent ? "bg-red-500/[0.08] border-l-2 border-l-red-500" : isFinished ? "opacity-50" : "hover:bg-accent/30"
                }`}
              >
                <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isCurrent ? "bg-red-500 text-white" : "bg-input text-muted-foreground"}`}>
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-medium truncate ${isCurrent ? "text-red-400 font-semibold" : isFinished ? "text-muted-foreground" : "text-foreground"}`}>
                    {song.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {isCountdown ? "Countdown" : isScripture ? "Scripture" : isMedia ? (isVideoItem ? "Video" : isAudioItem ? "Audio" : "Image") : isAnnouncement ? "Announcement" : song.artist || "Song"}
                  </p>
                </div>
                {isFinished && <span className="text-[9px] font-semibold text-muted-foreground/70 shrink-0 bg-muted px-1 py-0.5 rounded leading-none">Done</span>}
                {isNextItem && <span className="text-[9px] font-semibold text-primary shrink-0 bg-primary/10 px-1 py-0.5 rounded leading-none">NEXT</span>}
                {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═════ CENTER: Main Slide Area ═════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {currentSong?.itemType === "section" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
            <Layers className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground">{currentSong.title}</p>
            <p className="text-xs text-muted-foreground max-w-xs">This is a section divider. Select an item below it to continue presenting.</p>
          </div>
        ) : currentSong?.itemType === "announcement" ? (
          /* ── Announcement ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <Megaphone className="h-16 w-16 text-muted-foreground mb-6" />
            <h2 className="text-lg font-bold mb-1">{currentSong.title}</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md whitespace-pre-wrap">
              {currentSong.slides[0]?.lines.join("\n") || "No content — edit in the builder."}
            </p>
            <Button
              size="lg" className="gap-2"
              disabled={!currentSong.slides[0]?.lines.filter(Boolean).length}
              onClick={() => sendSlide(selectedSongIdx, 0)}
            >
              <Cast className="h-5 w-5" /> Show on Screen
            </Button>
            <p className="text-[11px] text-muted-foreground mt-6 max-w-sm">
              The announcement will be shown full-screen on the projection display.
            </p>
          </div>
        ) : currentSong?.itemType === "countdown" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <Timer className="h-16 w-16 text-muted-foreground mb-6" />
            <h2 className="text-lg font-bold mb-2">Countdown Timer</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Counting down to service at{" "}
              <span className="font-semibold text-foreground">
                {new Date(`2000-01-01T${serviceTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </span>
              {" "}
              <span className="text-xs font-medium bg-muted rounded px-1.5 py-0.5">
                {(() => {
                  const tz = getEffectiveTz();
                  try {
                    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? tz;
                  } catch { return tz; }
                })()}
              </span>
            </p>
            <div className="rounded-2xl border border-border bg-card px-12 py-8 mb-8">
              <span className="text-6xl font-mono font-bold tracking-wider text-foreground">
                {countdownRunning ? countdownDisplay : computeCountdownDisplay()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {!countdownRunning ? (
                <Button size="lg" className="gap-2" onClick={startCountdown}>
                  <Play className="h-5 w-5 fill-current" /> Start Countdown
                </Button>
              ) : (
                <Button size="lg" variant="destructive" className="gap-2" onClick={stopCountdown}>
                  <Square className="h-4 w-4 fill-current" /> Stop Countdown
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-6 max-w-sm">
              The countdown will be shown on the projection screen when started. It stops automatically when it reaches zero.
            </p>
          </div>
        ) : currentSong?.itemType === "media" && /\.(mp4|webm|mov)$/i.test(currentSong.mediaPath ?? "") ? (
          /* ── Video media ── */
          (() => {
            const bg = currentSong.mediaPath!;
            const pct = videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0;
            const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
            const ext = bg.split(".").pop()?.toUpperCase() ?? "VIDEO";

            const stopVideo = () => {
              window.worshipsync.slide.videoControl("stop");
              if (videoPreviewRef.current) { videoPreviewRef.current.pause(); videoPreviewRef.current.currentTime = 0; }
              videoTimerStoppedAtRef.current = null;
              setVideoPlaying(false); setVideoCurrentTime(0); setIsBlank(true);
              if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
            };
            const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
              if (!videoDuration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const seekTo = Math.max(0, Math.min(videoDuration, ((e.clientX - rect.left) / rect.width) * videoDuration));
              if (videoPreviewRef.current) videoPreviewRef.current.currentTime = seekTo;
              setVideoCurrentTime(seekTo);
              window.worshipsync.slide.videoSeek(seekTo);
            };
            const handleSkipVideo = (delta: number) => {
              const newTime = Math.max(0, Math.min(videoDuration, (videoPreviewRef.current?.currentTime ?? 0) + delta));
              if (videoPreviewRef.current) videoPreviewRef.current.currentTime = newTime;
              setVideoCurrentTime(newTime);
              window.worshipsync.slide.videoSeek(newTime);
            };
            const handlePlay = () => {
              const preview = videoPreviewRef.current;
              const dur = preview?.duration ?? 0;
              setVideoDuration(dur); setVideoCurrentTime(0);
              window.worshipsync.slide.blank(false);
              window.worshipsync.slide.logo(false);
              window.worshipsync.slide.show({
                lines: [],
                songTitle: currentSong.title,
                sectionLabel: "",
                itemType: "media",
                slideIndex: 0,
                totalSlides: 1,
                backgroundPath: bg,
                theme: {
                  fontFamily: DEFAULT_THEME.fontFamily,
                  fontSize: DEFAULT_THEME.fontSize,
                  fontWeight: DEFAULT_THEME.fontWeight,
                  textColor: DEFAULT_THEME.textColor,
                  textAlign: DEFAULT_THEME.textAlign,
                  textPosition: DEFAULT_THEME.textPosition,
                  overlayOpacity: 0,
                  textShadowOpacity: 0,
                  maxLinesPerSlide: DEFAULT_THEME.maxLinesPerSlide,
                },
              });
              window.worshipsync.slide.videoLoop(videoLoop);
              setIsBlank(false);
              window.worshipsync.slide.videoControl("play");
              if (preview) { preview.loop = videoLoop; preview.play(); }
              setVideoPlaying(true);
              if (videoTimerRef.current) clearInterval(videoTimerRef.current);
              videoTimerRef.current = setInterval(() => { setVideoCurrentTime(videoPreviewRef.current?.currentTime ?? 0); }, 100);
            };
            const handlePause = () => {
              window.worshipsync.slide.videoControl("pause");
              videoPreviewRef.current?.pause();
              setVideoPlaying(false);
              if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
            };
            const handleToggleLoop = () => {
              const next = !videoLoop;
              setVideoLoop(next);
              if (videoPreviewRef.current) videoPreviewRef.current.loop = next;
              window.worshipsync.slide.videoLoop(next);
            };

            return (
              <>
                {/* Header */}
                <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold truncate">{currentSong.title}</h1>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>Video</span><span>·</span><span className="tabular-nums">{fmt(videoDuration)}</span><span>·</span><span>{ext}</span>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={() => setShowLibrary(true)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Replace
                  </Button>
                </div>

                {/* Player body */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-muted/20 overflow-y-auto">
                  <div className="w-full max-w-2xl flex flex-col gap-5">

                    {/* Video preview */}
                    <div className="relative rounded-xl overflow-hidden bg-black border border-border shadow-md" style={{ aspectRatio: "16/9" }}>
                      <video
                        ref={videoPreviewRef}
                        src={`file://${encodeURI(bg)}`}
                        className="w-full h-full object-cover"
                        muted playsInline preload="auto"
                        loop={videoLoop}
                        onLoadedMetadata={() => {
                          const v = videoPreviewRef.current;
                          if (!v) return;
                          setVideoDuration(v.duration);
                          if (videoPlaying) {
                            // Calculate where the projection currently is
                            const elapsed = videoTimerStoppedAtRef.current
                              ? (Date.now() - videoTimerStoppedAtRef.current) / 1000
                              : 0;
                            videoTimerStoppedAtRef.current = null;
                            const seekTo = Math.min(videoCurrentTime + elapsed, v.duration - 0.05);
                            v.currentTime = seekTo;
                            window.worshipsync.slide.videoSeek(seekTo);
                            v.play().catch(() => {});
                            if (videoTimerRef.current) clearInterval(videoTimerRef.current);
                            videoTimerRef.current = setInterval(() => setVideoCurrentTime(videoPreviewRef.current?.currentTime ?? 0), 100);
                          } else {
                            v.currentTime = videoCurrentTime || 0.001;
                          }
                        }}
                        onEnded={videoLoop ? undefined : stopVideo}
                      />
                    </div>

                    {/* Seek bar + timestamps */}
                    <div className="flex flex-col gap-1.5">
                      <div className="relative flex items-center cursor-pointer group py-2" onClick={handleSeek}>
                        <div className="w-full h-1.5 bg-secondary rounded-full relative">
                          <div className="absolute left-0 top-0 h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-primary rounded-full shadow-md -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ left: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums px-0.5">
                        <span>{fmt(videoCurrentTime)}</span>
                        <span>{fmt(videoDuration)}</span>
                      </div>
                    </div>

                    {/* Transport controls */}
                    <div className="flex items-center justify-center gap-5">
                      <button onClick={() => handleSkipVideo(-videoDuration)} title="Skip to start" className="text-muted-foreground hover:text-foreground transition-colors">
                        <SkipBack className="h-5 w-5" />
                      </button>
                      <button onClick={() => handleSkipVideo(-10)} title="Back 10s" className="text-muted-foreground hover:text-foreground transition-colors text-[11px] font-bold w-8 text-center">
                        −10s
                      </button>
                      <button
                        onClick={videoPlaying ? handlePause : handlePlay}
                        className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all shadow-lg"
                      >
                        {videoPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-0.5" />}
                      </button>
                      <button onClick={() => handleSkipVideo(10)} title="Forward 10s" className="text-muted-foreground hover:text-foreground transition-colors text-[11px] font-bold w-8 text-center">
                        +10s
                      </button>
                      <button onClick={() => handleSkipVideo(videoDuration)} title="Skip to end" className="text-muted-foreground hover:text-foreground transition-colors">
                        <SkipForward className="h-5 w-5" />
                      </button>
                      <button
                        onClick={handleToggleLoop}
                        title={videoLoop ? "Loop on" : "Loop off"}
                        className={`transition-colors ${videoLoop ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Repeat className="h-5 w-5" />
                      </button>
                    </div>

                    <p className="text-center text-[11px] text-muted-foreground">
                      Preview plays here (muted) · Audio plays on the projection screen
                    </p>
                  </div>
                </div>
              </>
            );
          })()
        ) : currentSong?.itemType === "media" && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(currentSong.mediaPath ?? "") ? (
          /* ── Audio media ── */
          (() => {
            const bg = currentSong.mediaPath!;
            const pct = audioDuration ? (audioCurrentTime / audioDuration) * 100 : 0;
            const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
            const ext = bg.split(".").pop()?.toUpperCase() ?? "AUDIO";
            const ensureAudio = () => {
              if (!audioRef.current) {
                if (_audio.el && _audio.path === bg) {
                  // Restore from singleton (same file, still alive)
                  audioRef.current = _audio.el;
                  audioContextRef.current = _audio.ctx;
                  analyserRef.current = _audio.analyser;
                } else {
                  // New file — tear down any previous singleton
                  if (_audio.el) { _audio.el.pause(); }
                  if (_audio.ctx) { _audio.ctx.close(); }
                  audioRef.current = new Audio(`file://${encodeURI(bg)}`);
                  audioRef.current.loop = audioLoop;
                  audioRef.current.onloadedmetadata = () => setAudioDuration(audioRef.current?.duration ?? 0);
                  audioRef.current.onended = () => { setAudioPlaying(false); setAudioCurrentTime(0); if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; } stopViz(); };
                  const ctx = new AudioContext();
                  const analyser = ctx.createAnalyser();
                  analyser.fftSize = 256;
                  ctx.createMediaElementSource(audioRef.current).connect(analyser);
                  analyser.connect(ctx.destination);
                  audioContextRef.current = ctx;
                  analyserRef.current = analyser;
                  // Save to singleton
                  _audio.el = audioRef.current;
                  _audio.ctx = ctx;
                  _audio.analyser = analyser;
                  _audio.path = bg;
                }
              }
              return audioRef.current;
            };
            const handlePlay = () => {
              window.worshipsync.slide.blank(true);
              setIsBlank(true);
              const audio = ensureAudio();
              audioContextRef.current?.resume();
              audio.play();
              setAudioPlaying(true);
              if (audioTimerRef.current) clearInterval(audioTimerRef.current);
              audioTimerRef.current = setInterval(() => setAudioCurrentTime(audioRef.current?.currentTime ?? 0), 100);
              startViz();
            };
            const handlePause = () => { audioRef.current?.pause(); setAudioPlaying(false); if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null; } stopViz(); };
            const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => { if (!audioDuration || !audioRef.current) return; const rect = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = Math.max(0, Math.min(audioDuration, ((e.clientX - rect.left) / rect.width) * audioDuration)); setAudioCurrentTime(audioRef.current.currentTime); };
            const handleSkip = (delta: number) => { if (!audioRef.current) return; audioRef.current.currentTime = Math.max(0, Math.min(audioDuration, audioRef.current.currentTime + delta)); setAudioCurrentTime(audioRef.current.currentTime); };
            const handleToggleLoop = () => { const next = !audioLoop; setAudioLoop(next); if (audioRef.current) audioRef.current.loop = next; };
            return (
              <>
                {/* Header */}
                <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold truncate">{currentSong.title}</h1>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>Audio</span><span>·</span><span className="tabular-nums">{fmt(audioDuration)}</span><span>·</span><span>{ext}</span>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={() => setShowLibrary(true)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Replace
                  </Button>
                </div>

                {/* Player body */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-muted/20">
                  <div className="w-full max-w-2xl flex flex-col gap-6">

                    {/* Waveform — mirrored bars */}
                    <div className="relative rounded-xl overflow-hidden bg-black/70 border border-border/60" style={{ height: 160 }}>
                      <div className="absolute inset-0 flex items-center gap-[2px] px-4 py-5">
                        {waveformBars.map((v, wbi) => {
                          const h = Math.max(3, v * 100);
                          return (
                            <div key={wbi} className="flex-1 flex flex-col" style={{ height: "100%" }}>
                              {/* Top half — grows up from center */}
                              <div className="flex-1 flex flex-col justify-end">
                                <div className="w-full rounded-t-[1px] bg-primary" style={{ height: `${h}%`, opacity: 0.85 }} />
                              </div>
                              {/* Bottom half — mirror, shorter + more transparent */}
                              <div className="flex-1 flex flex-col justify-start">
                                <div className="w-full rounded-b-[1px] bg-primary" style={{ height: `${h * 0.55}%`, opacity: 0.35 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Seek bar + timestamps */}
                    <div className="flex flex-col gap-1.5">
                      <div
                        className="relative flex items-center cursor-pointer group py-2"
                        onClick={handleSeek}
                      >
                        <div className="w-full h-1.5 bg-secondary rounded-full relative">
                          <div className="absolute left-0 top-0 h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-primary rounded-full shadow-md -translate-x-1/2 transition-opacity opacity-0 group-hover:opacity-100"
                            style={{ left: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums px-0.5">
                        <span>{fmt(audioCurrentTime)}</span>
                        <span>{fmt(audioDuration)}</span>
                      </div>
                    </div>

                    {/* Transport controls */}
                    <div className="flex items-center justify-center gap-5">
                      {/* Skip to start */}
                      <button
                        onClick={() => handleSkip(-audioDuration)}
                        title="Skip to start"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <SkipBack className="h-5 w-5" />
                      </button>

                      {/* −10s */}
                      <button
                        onClick={() => handleSkip(-10)}
                        title="Back 10 seconds"
                        className="text-muted-foreground hover:text-foreground transition-colors text-[11px] font-bold w-8 text-center"
                      >
                        −10s
                      </button>

                      {/* Play / Pause */}
                      <button
                        onClick={audioPlaying ? handlePause : handlePlay}
                        className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all shadow-lg"
                      >
                        {audioPlaying
                          ? <Pause className="h-6 w-6 fill-current" />
                          : <Play className="h-6 w-6 fill-current ml-0.5" />}
                      </button>

                      {/* +10s */}
                      <button
                        onClick={() => handleSkip(10)}
                        title="Forward 10 seconds"
                        className="text-muted-foreground hover:text-foreground transition-colors text-[11px] font-bold w-8 text-center"
                      >
                        +10s
                      </button>

                      {/* Skip to end */}
                      <button
                        onClick={() => handleSkip(audioDuration)}
                        title="Skip to end"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <SkipForward className="h-5 w-5" />
                      </button>

                      {/* Loop toggle */}
                      <button
                        onClick={handleToggleLoop}
                        title={audioLoop ? "Loop on" : "Loop off"}
                        className={`transition-colors ${audioLoop ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Repeat className="h-5 w-5" />
                      </button>
                    </div>

                    <p className="text-center text-[11px] text-muted-foreground">
                      Audio plays through this computer only · Nothing is shown on the projection screen
                    </p>
                  </div>
                </div>
              </>
            );
          })()
        ) : currentSong?.itemType === "media" ? (
          /* ── Image media ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            {(() => {
              const imgPath = currentSong.mediaPath;
              return (
                <>
                  <div className="rounded-2xl border border-border overflow-hidden mb-6 w-full max-w-lg" style={{ aspectRatio: "16/9" }}>
                    {imgPath ? (
                      <img src={`file://${imgPath}`} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-black flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <h2 className="text-lg font-bold mb-1">{currentSong.title}</h2>
                  <p className="text-sm text-muted-foreground mb-6">Image · Click Show to project</p>
                  <Button size="lg" className="gap-2" disabled={!imgPath} onClick={() => {
                    if (!imgPath) return;
                    window.worshipsync.slide.blank(false);
                    window.worshipsync.slide.logo(false);
                    window.worshipsync.slide.show({
                      lines: [],
                      songTitle: currentSong.title,
                      sectionLabel: "",
                      itemType: "media",
                      slideIndex: 0,
                      totalSlides: 1,
                      backgroundPath: imgPath,
                      theme: {
                        fontFamily: DEFAULT_THEME.fontFamily,
                        fontSize: DEFAULT_THEME.fontSize,
                        fontWeight: DEFAULT_THEME.fontWeight,
                        textColor: DEFAULT_THEME.textColor,
                        textAlign: DEFAULT_THEME.textAlign,
                        textPosition: DEFAULT_THEME.textPosition,
                        overlayOpacity: 0,
                        textShadowOpacity: 0,
                        maxLinesPerSlide: DEFAULT_THEME.maxLinesPerSlide,
                      },
                    });
                    setIsBlank(false);
                    setIsLogo(false);
                  }}>
                    <Cast className="h-5 w-5" /> Show on Screen
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-6 max-w-sm">The image will be shown full-screen on the projection display.</p>
                </>
              );
            })()}
          </div>
        ) : currentSong ? (
          /* ── Song / Scripture — Banani layout ── */
          <>
            {/* Dual Preview */}
            <div className="shrink-0 border-b border-border bg-card px-4 py-3">
              <div className="flex gap-3">
                {/* LIVE */}
                <div className="flex-[72] flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-red-400 tracking-wider">LIVE: AUDIENCE</span>
                    <span className="flex-1" />
                    {currentSlide && <span className="text-[10px] text-muted-foreground">{currentSlide.sectionLabel}</span>}
                  </div>
                  <div className="relative overflow-hidden rounded-md border-2 border-red-500/60 bg-black" style={{ aspectRatio: "16/9", containerType: "inline-size" }}>
                    {!isLogo && effectiveBg && currentSlide && !isBlank && (
                      effectiveBg.startsWith("color:") ? (
                        <div className="absolute inset-0" style={{ background: effectiveBg.replace("color:", "") }} />
                      ) : /\.(mp4|webm|mov)$/i.test(effectiveBg) ? (
                        <video src={`file://${encodeURI(effectiveBg)}`} className="absolute inset-0 w-full h-full object-cover" muted preload="metadata" />
                      ) : (
                        <>
                          <img src={`file://${effectiveBg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
                          <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }} />
                        </>
                      )
                    )}
                    {isLogo ? (
                      <div className="absolute inset-0 bg-black flex items-center justify-center">
                        <span style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, color: "rgba(255,255,255,0.15)", letterSpacing: "-0.03em", fontSize: 14 }}>
                          WorshipSync
                        </span>
                      </div>
                    ) : currentSlide && !isBlank ? (
                      currentSlide.sectionType === "verse" && currentSong?.itemType === "scripture" ? (
                        /* Scripture: verse text + reference at bottom */
                        <div className="absolute inset-0 flex flex-col px-3 pt-2 pb-1.5">
                          <div className="flex-1 flex items-center justify-center min-h-0">
                            <p className="text-center font-bold leading-snug whitespace-pre-wrap relative z-10 w-full"
                              style={{ fontSize: "4.5cqw", color: effectiveTheme.textColor, fontFamily: effectiveTheme.fontFamily }}>
                              {isTextCleared ? "" : currentSlide.lines.join("\n")}
                            </p>
                          </div>
                          <p className="text-center font-semibold relative z-10 shrink-0 truncate"
                            style={{ fontSize: "2.2cqw", color: "rgba(255,255,255,0.65)", fontFamily: effectiveTheme.fontFamily }}>
                            {currentSlide.sectionLabel}
                          </p>
                        </div>
                      ) : (
                        /* Songs / other: centered text */
                        <div className="absolute inset-0 flex items-center justify-center px-3">
                          <p className="text-center font-bold leading-snug whitespace-pre-wrap relative z-10 w-full"
                            style={{ fontSize: "5cqw", color: effectiveTheme.textColor, fontFamily: effectiveTheme.fontFamily, textAlign: effectiveTheme.textAlign, textShadow: effectiveTheme.textShadowOpacity > 0 ? `0 1px 3px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})` : "none" }}>
                            {isTextCleared ? "" : currentSlide.lines.join("\n")}
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <MonitorOff className="h-4 w-4 text-gray-600" />
                      </div>
                    )}
                  </div>
                </div>

                {/* NEXT */}
                <div className="flex-[28] flex flex-col gap-1.5 min-w-0 opacity-75">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-green-400 tracking-wider">NEXT</span>
                    <span className="flex-1" />
                    {nextUp && (
                      <span className="text-[10px] text-muted-foreground">
                        {nextUp.songTitle ? `${nextUp.songTitle} — ${nextUp.slide.sectionLabel}` : nextUp.slide.sectionLabel}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const nextUpSong = nextUp?.songTitle ? nextSong : currentSong;
                    const nextUpTheme = nextUpSong ? resolveTheme(nextUpSong) : effectiveTheme;
                    const nextUpBg = nextUpSong ? resolveBg(nextUpSong) : effectiveBg;
                    return (
                      <div className="relative overflow-hidden rounded-md border-2 border-green-500/50 bg-black" style={{ aspectRatio: "16/9", containerType: "inline-size" }}>
                        {nextUpBg && nextUp && nextUp.slide.sectionType !== "blank" && (
                          nextUpBg.startsWith("color:") ? (
                            <div className="absolute inset-0" style={{ background: nextUpBg.replace("color:", "") }} />
                          ) : (
                            <>
                              <img src={`file://${nextUpBg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
                              <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${nextUpTheme.overlayOpacity / 100})` }} />
                            </>
                          )
                        )}
                        {nextUp && nextUp.slide.sectionType !== "blank" ? (
                          nextUp.slide.sectionType === "verse" && nextUpSong?.itemType === "scripture" ? (
                            /* Scripture: verse text + reference at bottom */
                            <div className="absolute inset-0 flex flex-col px-3 pt-2 pb-1.5">
                              <div className="flex-1 flex items-center justify-center min-h-0">
                                <p className="text-center font-bold leading-snug whitespace-pre-wrap relative z-10 w-full"
                                  style={{ fontSize: "4.5cqw", color: nextUpTheme.textColor, fontFamily: nextUpTheme.fontFamily }}>
                                  {nextUp.slide.lines.join("\n")}
                                </p>
                              </div>
                              <p className="text-center font-semibold relative z-10 shrink-0 truncate"
                                style={{ fontSize: "2.2cqw", color: "rgba(255,255,255,0.65)", fontFamily: nextUpTheme.fontFamily }}>
                                {nextUp.slide.sectionLabel}
                              </p>
                            </div>
                          ) : (
                            /* Songs / other: centered text */
                            <div className="absolute inset-0 flex items-center justify-center px-3">
                              <p className="text-center font-bold leading-snug whitespace-pre-wrap relative z-10 w-full"
                                style={{ fontSize: "5cqw", color: nextUpTheme.textColor, fontFamily: nextUpTheme.fontFamily, textAlign: nextUpTheme.textAlign }}>
                                {nextUp.slide.lines.join("\n")}
                              </p>
                            </div>
                          )
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-[10px] text-gray-600">No next slide</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Song header + section tabs */}
            <div className="shrink-0 px-4 py-2.5 border-b border-border bg-card flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                <h2 className="text-sm font-semibold truncate max-w-[160px]">{currentSong.title}</h2>
                <div className="flex gap-1 flex-wrap">
                  {sectionTabs.map(tab => (
                    <button
                      key={tab.sectionId}
                      onClick={() => sendSlide(selectedSongIdx, tab.firstSlideIdx)}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded leading-none transition-colors ${
                        activeSectionId === tab.sectionId
                          ? "bg-red-500 text-white"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activeSlideIdx >= 0 && currentSong.slides.length > 1 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {activeSlideIdx + 1} / {currentSong.slides.filter(s => s.sectionType !== "blank").length}
                  </span>
                )}
                {currentSong.itemType === "song" && (
                  <Button size="sm" className="h-7 text-xs gap-1 px-2" onClick={handleOpenEditLyrics}>
                    <Pencil className="h-3 w-3" /> Lyrics
                  </Button>
                )}
              </div>
            </div>

            {/* Slide grid — 4 columns */}
            <div ref={slideGridRef} className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-3 gap-3">
                {currentSong.slides.map((slide, i) => {
                  const isActive = activeSlideIdx === i;
                  const isNextSlide = activeSlideIdx >= 0 && i === activeSlideIdx + 1;
                  const bg = resolveBg(currentSong);
                  const abbrev = SECTION_ABBREVS[slide.sectionType] ?? slide.sectionLabel[0];
                  return (
                    <div key={i} data-slide-idx={i} className="flex flex-col gap-1">
                      {/* Label row */}
                      <div className="flex items-center justify-between gap-1 px-0.5 h-4">
                        <div className="flex items-center gap-1 min-w-0">
                          {currentSong.itemType !== "scripture" && slide.sectionType !== "blank" && (
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded leading-none shrink-0 ${isActive ? "bg-red-500 text-white" : "bg-muted-foreground text-background"}`}>
                              {abbrev}
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold truncate ${isActive ? "text-red-400" : "text-muted-foreground"}`}>
                            {slide.sectionLabel}
                          </span>
                        </div>
                        {isActive && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/20 text-red-400 leading-none shrink-0">LIVE</span>}
                        {isNextSlide && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-green-500/20 text-green-400 leading-none shrink-0">NEXT</span>}
                      </div>
                      <button
                        onClick={(e) => { e.currentTarget.blur(); sendSlide(selectedSongIdx, i); }}
                        className={`relative w-full overflow-hidden rounded-md focus:outline-none border-2 transition-colors ${
                          isActive ? "border-red-500" : isNextSlide ? "border-green-500/50" : "border-transparent"
                        }`}
                        style={{ outline: isActive || isNextSlide ? "none" : "1px solid hsl(var(--border))" }}
                      >
                        <div className="w-full" style={{ paddingBottom: "56.25%" }} />
                        <div className="absolute inset-0">
                          {/* Background */}
                          {bg && slide.sectionType !== "blank" ? (
                            bg.startsWith("color:") ? (
                              <div className="absolute inset-0" style={{ background: bg.replace("color:", "") }} />
                            ) : /\.(mp4|webm|mov)$/i.test(bg) ? (
                              <video src={`file://${encodeURI(bg)}`} className="absolute inset-0 w-full h-full object-cover" muted preload="metadata" />
                            ) : (
                              <>
                                <img src={`file://${bg}`} className="absolute inset-0 w-full h-full object-cover" alt="" />
                                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})` }} />
                              </>
                            )
                          ) : (
                            <div className="absolute inset-0 bg-black" />
                          )}

                          {slide.sectionType === "verse" && currentSong.itemType === "scripture" ? (
                            /* Scripture: verse text centered + reference at bottom */
                            <div className="absolute inset-0 flex flex-col px-1.5 pt-1.5 pb-1">
                              <div className="flex-1 flex items-center justify-center min-h-0">
                                <p className="text-center font-bold text-[9px] leading-snug whitespace-pre-wrap relative z-10"
                                  style={{ color: effectiveTheme.textColor, fontFamily: effectiveTheme.fontFamily }}>
                                  {slide.lines.join("\n")}
                                </p>
                              </div>
                              <p className="text-center text-[7px] font-semibold relative z-10 shrink-0 truncate"
                                style={{ color: "rgba(255,255,255,0.6)", fontFamily: effectiveTheme.fontFamily }}>
                                {slide.sectionLabel}
                              </p>
                            </div>
                          ) : (
                            /* Songs / other: original centered layout */
                            <div className="absolute inset-0 flex items-center justify-center">
                              <p className="relative z-10 text-center font-bold text-[11px] leading-snug whitespace-pre-wrap px-2"
                                style={{ color: effectiveTheme.textColor, fontFamily: effectiveTheme.fontFamily, textShadow: effectiveTheme.textShadowOpacity > 0 ? `0 1px 3px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})` : "none" }}>
                                {slide.sectionType === "blank" ? "" : slide.lines.join("\n")}
                              </p>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Select an item from the lineup</p>
          </div>
        )}
      </div>

      {/* ═════ RIGHT: Controls Panel (280px) ═════ */}
      <div className="w-[280px] shrink-0 border-l border-border flex flex-col bg-card overflow-hidden">

        {/* TO BLACK — primary safety button */}
        <div className="p-3 border-b border-border shrink-0">
          {isBlank ? (
            <button
              onClick={() => {
                if (activeSlideIdx >= 0) sendSlide(selectedSongIdx, activeSlideIdx);
                else { window.worshipsync.slide.blank(false); setIsBlank(false); }
              }}
              className="w-full py-3 rounded-lg text-sm font-bold flex items-center gap-2.5 px-3.5 transition-all bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25"
            >
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span>Screen Blanked</span>
              <span className="ml-auto text-[10px] font-semibold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Unblank [B]</span>
            </button>
          ) : (
            <button
              onClick={toBlack}
              className="w-full py-3 rounded-lg text-sm font-bold flex items-center gap-2.5 px-3.5 transition-all bg-background border border-border text-muted-foreground hover:bg-zinc-800 hover:text-white hover:border-zinc-600"
            >
              <MonitorOff className="h-4 w-4 shrink-0" />
              <span>To Black</span>
              <span className="ml-auto text-[10px] font-normal opacity-40">[B]</span>
            </button>
          )}
        </div>

        {/* Quick Actions — 3-up row */}
        <div className="p-3 border-b border-border shrink-0">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Quick Actions</h3>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={clearText}
              className={`py-2 px-2 rounded-md text-[11px] font-semibold border transition-colors text-center ${isTextCleared ? "bg-primary/20 text-primary border-primary/40" : "bg-background border-border hover:bg-accent/40 text-foreground"}`}
            >
              {isTextCleared ? "Restore" : "Clear Text"}
            </button>
            <button
              onClick={clearAll}
              className="py-2 px-2 rounded-md text-[11px] font-semibold border border-border bg-background hover:bg-accent/40 text-foreground transition-colors text-center"
            >
              Clear All
            </button>
            <button
              onClick={() => {
                if (isLogo) {
                  window.worshipsync.slide.logo(false);
                  setIsLogo(false);
                  window.worshipsync.slide.blank(true);
                  setIsBlank(true);
                } else {
                  showLogo();
                }
              }}
              className={`py-2 px-2 rounded-md text-[11px] font-semibold border transition-colors text-center ${isLogo ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-background border-border hover:bg-accent/40 text-foreground"}`}
            >
              {isLogo ? "Hide Logo" : "Show Logo"}
            </button>
          </div>
        </div>

        {/* Active Background — not shown for audio/video items */}
        {!(currentSong?.itemType === "media" && /\.(mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i.test(currentSong.mediaPath ?? "")) && <div className="px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Active Background</h3>
          <div
            className="flex items-center gap-2.5 p-2 rounded-md bg-background/40 border border-border cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => setShowBgPicker(v => !v)}
          >
            <div className="w-14 h-8 rounded overflow-hidden shrink-0 border border-border bg-black flex items-center justify-center">
              {effectiveBg ? (
                effectiveBg.startsWith("color:") ? (
                  <div className="w-full h-full" style={{ background: effectiveBg.replace("color:", "") }} />
                ) : (
                  <img src={`file://${effectiveBg}`} className="w-full h-full object-cover" alt="" />
                )
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {effectiveBg ? (
                <>
                  <p className="text-[11px] font-medium truncate">{effectiveBg.split("/").pop() ?? "Background"}</p>
                  <p className={`text-[10px] ${/\.(mp4|webm|mov)$/i.test(effectiveBg) ? "text-green-400" : "text-muted-foreground"}`}>
                    {/\.(mp4|webm|mov)$/i.test(effectiveBg) ? "Playing • Looped" : "Static"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-medium text-muted-foreground">No background</p>
                  <p className="text-[10px] text-muted-foreground/60">Click to set one</p>
                </>
              )}
            </div>
          </div>
        </div>}

        {/* Cue Notes */}
        {currentSong?.notes && (
          <div className="px-4 py-3 border-b border-border shrink-0">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Cue Notes (Live)</h3>
            <p className="text-[11px] text-amber-400/90 leading-relaxed whitespace-pre-wrap break-words">
              {currentSong.notes}
            </p>
          </div>
        )}

        {/* Output Routing */}
        <div className="px-4 py-3 border-b border-border flex-1 overflow-y-auto">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Output Routing</h3>

          <div className="flex items-center gap-2 mb-2 p-2 rounded-md bg-background/40 border border-border">
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Main Projection</p>
              <select
                className="w-full bg-transparent text-[11px] text-foreground border-none outline-none cursor-pointer"
                value={selectedDisplayId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedDisplayId(id);
                  if (projectionOpen) window.worshipsync.window.moveProjection(id);
                }}
              >
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}{d.isPrimary ? " (Primary)" : ""} — {d.width}×{d.height}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentSong && currentSong.itemType === "song" && (
            <div className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${confidenceOpen ? "bg-amber-500/10 border-amber-500/30" : "bg-background/40 border-border"}`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${confidenceOpen ? "bg-amber-400" : "bg-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Confidence Monitor</p>
                <select
                  className="w-full bg-transparent text-[11px] text-foreground border-none outline-none cursor-pointer"
                  value={selectedConfidenceDisplayId ?? ""}
                  onChange={(e) => {
                    const id = Number(e.target.value) || undefined;
                    setSelectedConfidenceDisplayId(id);
                    if (confidenceOpen && id !== undefined) window.worshipsync.confidence.move(id);
                  }}
                >
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}{d.isPrimary ? " (Primary)" : ""} — {d.width}×{d.height}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  if (confidenceOpen) { window.worshipsync.confidence.close(); setConfidenceOpen(false); }
                  else { window.worshipsync.confidence.open(selectedConfidenceDisplayId); setConfidenceOpen(true); }
                }}
                className={`text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded transition-colors ${confidenceOpen ? "text-amber-400 hover:text-red-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                {confidenceOpen ? "ON" : "OFF"}
              </button>
            </div>
          )}
        </div>

        {/* Next Slide button */}
        <div className="p-3 shrink-0">
          <button
            onClick={goNextSlide}
            className="w-full py-3 bg-foreground text-background rounded-lg text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            Next Slide <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      </div>{/* end BODY */}

      {/* Keyboard shortcuts overlay */}
      {showHelp && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl w-[420px] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Shortcut groups */}
            <div className="px-5 py-4 space-y-5 text-sm">
              {(
                [
                  {
                    group: "Navigation",
                    items: [
                      { keys: ["→", "Space"], label: "Next slide" },
                      { keys: ["←"], label: "Previous slide" },
                      { keys: ["Tab"], label: "Next item" },
                      { keys: ["⇧ Tab"], label: "Previous item" },
                    ],
                  },
                  {
                    group: "Output",
                    items: [
                      { keys: ["B"], label: "Toggle blank screen (black)" },
                      { keys: ["U"], label: "Unblank screen" },
                    ],
                  },
                  {
                    group: "Interface",
                    items: [
                      { keys: ["?"], label: "Toggle this help overlay" },
                      { keys: ["Esc"], label: "Close overlay" },
                    ],
                  },
                ] as { group: string; items: { keys: string[]; label: string }[] }[]
              ).map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    {group}
                  </p>
                  <div className="space-y-1.5">
                    {items.map(({ keys, label }) => (
                      <div key={label} className="flex items-center justify-between gap-4">
                        <span className="text-foreground/80">{label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {keys.map((k, i) => (
                            <React.Fragment key={k}>
                              {i > 0 && (
                                <span className="text-[10px] text-muted-foreground">or</span>
                              )}
                              <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded border border-border bg-background text-[11px] font-mono font-medium shadow-sm">
                                {k}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="px-5 pb-4 text-[10px] text-muted-foreground">
              Press <kbd className="inline-flex items-center px-1 rounded border border-border bg-background font-mono text-[10px]">Esc</kbd> or click outside to dismiss.
            </p>
          </div>
        </div>
      )}

      {/* Library modal */}
      {showLibrary && (
        <LibraryModal
          onClose={() => setShowLibrary(false)}
          onAdd={handleLibraryAdd}
          onAddCountdown={addCountdownToLineup}
          onAddScripture={handleAddScripture}
          onAddMedia={handleAddMedia}
          excludeIds={liveSongs
            .filter((s) => s.itemType === "song")
            .map((s) => s.songId)}
        />
      )}

      {showBgPicker && liveSongs[selectedSongIdx] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowBgPicker(false); setPendingBgSave(null); }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-[420px] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <span className="text-sm font-semibold">Background</span>
              <button onClick={() => { setShowBgPicker(false); setPendingBgSave(null); }} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <BackgroundPickerPanel
                currentBackground={liveSongs[selectedSongIdx].backgroundPath}
                previewLabel={liveSongs[selectedSongIdx].title}
                onSelect={handleBackgroundSelect}
              />
            </div>
            {pendingBgSave && (
              <div className="shrink-0 border-t border-border bg-muted/40 px-4 py-3 flex items-center gap-3">
                <p className="text-xs text-muted-foreground flex-1">
                  Applied for this session only.
                </p>
                <button
                  onClick={() => { setPendingBgSave(null); setShowBgPicker(false); }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Keep session only
                </button>
                <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSaveBg} disabled={savingBg}>
                  {savingBg ? "Saving…" : "Save to song"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {showEditLyrics && liveSongs[selectedSongIdx] && (
        <EditLyricsModal
          songTitle={liveSongs[selectedSongIdx].title}
          artist={liveSongs[selectedSongIdx].artist}
          initialLyrics={editLyricsInitial}
          onClose={() => setShowEditLyrics(false)}
          onSave={handleSaveLyrics}
        />
      )}
    </div>
  );
}

// ── Service Switcher Row ─────────────────────────────────────────────────────

function SwitcherRow({
  svc,
  isCurrent,
  isPending,
  onSelect,
}: {
  svc: ServiceDate;
  isCurrent: boolean;
  isPending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={isCurrent}
      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors
        ${isCurrent ? "bg-accent/40 cursor-default" : "hover:bg-accent"}
        ${isPending ? "bg-amber-500/10" : ""}`}
    >
      <Calendar className={`h-3.5 w-3.5 shrink-0 ${isPending ? "text-amber-500" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium truncate ${isPending ? "text-amber-500" : ""}`}>{svc.label}</p>
        <p className="text-[10px] text-muted-foreground">
          {new Date(svc.date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      {isCurrent && (
        <span className="text-[10px] font-semibold text-primary shrink-0">Active</span>
      )}
      {isPending && (
        <span className="text-[10px] font-semibold text-amber-500 shrink-0">Tap confirm</span>
      )}
    </button>
  );
}

// ── Pre-Live Idle State ──────────────────────────────────────────────────────

function PreLiveIdle({
  serviceLabel,
  songs,
  canGoLive,
  onStartLive,
  displays,
  selectedDisplayId,
  onDisplayChange,
}: {
  serviceLabel: string;
  songs: LiveSong[];
  canGoLive: boolean;
  onStartLive: () => void;
  displays: {
    id: number;
    label: string;
    width: number;
    height: number;
    isPrimary: boolean;
  }[];
  selectedDisplayId: number | undefined;
  onDisplayChange: (id: number) => void;
}) {
  const totalSlides = songs.reduce((sum, s) => sum + s.slides.length, 0);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-background text-foreground px-8">
      <div className="w-full max-w-md text-center">
        <div className="h-16 w-16 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-5">
          <MonitorOff className="h-8 w-8 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold mb-2">Ready to go live</h1>
        <p className="text-sm text-muted-foreground mb-1">{serviceLabel}</p>
        <p className="text-xs text-muted-foreground mb-4">
          The projection window is{" "}
          <span className="font-semibold">not open</span>. Choose a display and
          click Go Live.
        </p>

        {/* Display picker */}
        {displays.length > 0 && (
          <div className="flex items-center gap-2 justify-center mb-5">
            <Tv className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              className="bg-input border border-border rounded-md px-3 py-1.5 text-xs text-foreground cursor-pointer"
              value={selectedDisplayId ?? ""}
              onChange={(e) => onDisplayChange(Number(e.target.value))}
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.isPrimary ? " (Primary)" : ""} — {d.width}×{d.height}
                </option>
              ))}
            </select>
          </div>
        )}

        {canGoLive ? (
          <div className="rounded-lg border border-border bg-card p-4 mb-5 flex items-center gap-4 justify-center">
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">
                {songs.length}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {songs.length === 1 ? "Song" : "Songs"}
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">
                {totalSlides}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                Slides
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-5 flex items-center gap-2 justify-center">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-400">
              No songs in this lineup — add some in the Builder first.
            </p>
          </div>
        )}

        <Button
          size="lg"
          className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canGoLive}
          onClick={onStartLive}
        >
          <Play className="h-4 w-4 fill-current" />
          Go Live
        </Button>

        <p className="text-[10px] text-muted-foreground mt-5">
          This will open the projection window on your external display.
        </p>
      </div>
    </div>
  );
}

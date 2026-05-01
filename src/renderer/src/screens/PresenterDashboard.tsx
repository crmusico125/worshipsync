import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  MonitorOff,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Music,
  GripVertical,
  Pencil,
  Plus,
  Cast,
  Play,
  Square,
  AlertCircle,
  X,
  Type,
  Tv,
  Hexagon,
  Image as ImageIcon,
  Timer,
  BookOpen,
  Film,
  Volume2,
  RefreshCw,
  Keyboard,
  Search,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServiceStore, type ServiceDate } from "../store/useServiceStore";
import LibraryModal from "../components/LibraryModal";

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
  itemType: "song" | "countdown";
  songId: number;
  title: string;
  artist: string;
  key: string | null;
  ccliNumber: string | null;
  backgroundPath: string | null;
  themeId: number | null;
  notes: string | null;
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
    const lines = sec.lyrics.split("\n").filter((l) => l.trim());
    if (lines.length === 0) {
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
    for (let i = 0; i < lines.length; i += maxLines) {
      slides.push({
        lines: lines.slice(i, i + maxLines),
        sectionLabel: sec.label,
        sectionType: sec.type,
        sectionId: sec.id,
        globalIndex: globalIdx++,
      });
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
}

export default function PresenterDashboard({
  projectionOpen,
  onProjectionChange,
  onExitLive,
}: Props) {
  const {
    selectedService,
    lineup,
    loadLineup,
    selectService,
    addSongToLineup,
    addCountdownToLineup,
  } = useServiceStore();

  const [liveSongs, setLiveSongs] = useState<LiveSong[]>([]);
  const [selectedSongIdx, setSelectedSongIdx] = useState(0);
  const [activeSlideIdx, setActiveSlideIdx] = useState(-1);
  const [isBlank, setIsBlank] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmEndShow, setConfirmEndShow] = useState(false);
  const confirmEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [themeCache, setThemeCache] = useState<Record<number, any>>({});
  const [defaultTheme, setDefaultTheme] = useState<any>(null);
  const [defaultThemeBg, setDefaultThemeBg] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
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
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vizFrameRef = useRef<number | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(new Array(48).fill(0));
  const [serviceTime, setServiceTime] = useState("11:00");
  const [serviceTimezone, setServiceTimezone] = useState("America/Los_Angeles");
  const [serviceSchedules, setServiceSchedules] = useState<Array<{
    id: string; dayOfWeek: number; startTime: string; endTime: string;
    label: string; timezone?: string;
  }>>([]);
  const [projectionFontSize, setProjectionFontSize] = useState(48);
  const [churchName, setChurchName] = useState("");
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

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
        if (state.churchName)       setChurchName(state.churchName);
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
          themeId: null,
          notes: item.notes ?? null,
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
          themeId: null,
          notes: item.notes ?? null,
          slides: [],
        };
      }

      const selectedIds: number[] = JSON.parse(item.selectedSections || "[]");
      const filtered =
        selectedIds.length > 0
          ? item.song.sections.filter((s) => selectedIds.includes(s.id))
          : item.song.sections;

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
        backgroundPath: item.song.backgroundPath ?? null,
        themeId: item.song.themeId ?? null,
        notes: item.notes ?? null,
        slides: buildSlidesForSong(filtered, maxLines),
      };
    });
    setLiveSongs(built);
  }, [lineup, themeCache]);

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
      const theme = resolveTheme(song);
      const bg = resolveBg(song);
      setSelectedSongIdx(songIdx);
      setActiveSlideIdx(slideIdx);
      setIsBlank(false);

      // Compute next slide for stage display
      let nextLines: string[] | undefined;
      let nextSectionLabel: string | undefined;
      const nextSlide = song.slides[slideIdx + 1];
      if (nextSlide && nextSlide.sectionType !== "blank" && nextSlide.lines.filter(Boolean).length) {
        nextLines = nextSlide.lines;
        nextSectionLabel = nextSlide.sectionLabel;
      }
      if (!nextLines) {
        // Fall through to first slide of next song
        const nextSong = liveSongs[songIdx + 1];
        const firstNextSlide = nextSong?.slides.find((s) => s.sectionType !== "blank");
        if (firstNextSlide && firstNextSlide.lines.filter(Boolean).length) {
          nextLines = firstNextSlide.lines;
          nextSectionLabel = `${nextSong!.title} \u2014 ${firstNextSlide.sectionLabel}`;
        }
      }

      if (slide.sectionType === "blank") {
        window.worshipsync.slide.blank(true);
        setIsBlank(true);
      } else {
        window.worshipsync.slide.blank(false);
        window.worshipsync.slide.logo(false);
        window.worshipsync.slide.show({
          lines: slide.lines,
          songTitle: song.title,
          artist: song.artist,
          sectionLabel: slide.sectionLabel,
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

  useEffect(() => {
    setActiveSlideIdx(-1);
  }, [selectedSongIdx]);

  // Refs that always hold the latest projection state — used inside the
  // projection:ready callback so display moves restore the correct content.
  const countdownRunningRef = useRef(countdownRunning);
  countdownRunningRef.current = countdownRunning;
  const isBlankRef = useRef(isBlank);
  isBlankRef.current = isBlank;
  const activeSlideIdxRef = useRef(activeSlideIdx);
  activeSlideIdxRef.current = activeSlideIdx;
  const selectedSongIdxRef = useRef(selectedSongIdx);
  selectedSongIdxRef.current = selectedSongIdx;

  // ── Controls ─────────────────────────────────────────────────────────────
  const clearAll = () => {
    window.worshipsync.slide.blank(true);
    setIsBlank(true);
    setActiveSlideIdx(-1);
  };
  const clearText = () => {
    window.worshipsync.slide.blank(true);
    setIsBlank(true);
  };
  const toBlack = () => {
    window.worshipsync.slide.blank(true);
    setIsBlank(true);
  };
  const showLogo = () => {
    window.worshipsync.slide.logo(true);
    setIsBlank(false);
  };

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

  const goNextSong = useCallback(() => {
    const next = selectedSongIdx + 1;
    if (next < liveSongs.length) jumpToItem(next);
  }, [selectedSongIdx, liveSongs.length, jumpToItem]);

  const goPrevSong = useCallback(() => {
    const prev = selectedSongIdx - 1;
    if (prev >= 0) jumpToItem(prev);
  }, [selectedSongIdx, jumpToItem]);

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
    const sections = verses.map((v, i) => ({
      type: "verse" as const,
      label: `${ref.book} ${ref.chapter}:${v.number} ${ref.translation}`,
      lyrics: v.text,
      orderIndex: i,
    }));
    const song = await window.worshipsync.songs.create({
      title,
      artist: "Scripture",
      tags: "",
      sections,
    });
    await addSongToLineup(song.id);
  };

  const handleAddMedia = async (path: string) => {
    const filename = path.split("/").pop() ?? "Media";
    const isVideo = /\.(mp4|webm|mov)$/i.test(path);
    const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(path);
    const label = isVideo ? "Video" : isAudio ? "Audio" : "Image";
    const song = await window.worshipsync.songs.create({
      title: `${label}: ${filename}`,
      artist: "Media",
      tags: "",
      sections: [
        { type: "interlude" as const, label, lyrics: " ", orderIndex: 0 },
      ],
    });
    await window.worshipsync.backgrounds.setBackground(song.id, path);
    await addSongToLineup(song.id);
  };

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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      audioContextRef.current?.close();
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
        toBlack();
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "Escape") {
        setShowHelp(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNextSlide, goPrevSlide, goNextSong, goPrevSong]);


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

  const totalSlides = useMemo(
    () => (currentSong ? currentSong.slides.length : 0),
    [currentSong],
  );

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

  const selectedDisplay = displays.find((d) => d.id === selectedDisplayId);

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
    <div className="h-full flex overflow-hidden bg-background text-foreground relative">
      {/* Overlay to close switcher when clicking outside */}
      {showSwitcher && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowSwitcher(false); setPendingSwitch(null); }}
        />
      )}
      {/* ═════ LEFT: Service Lineup Panel (260px) ═════ */}
      <div className="w-[260px] shrink-0 border-r border-border flex flex-col bg-card">
        {/* Header — draggable */}
        <div
          className="px-4 py-3 border-b border-border relative"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <button
            onClick={openSwitcher}
            className="flex items-center gap-1 min-w-0 group hover:text-primary transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <span className="text-sm font-semibold truncate">{selectedService.label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          {/* Service switcher dropdown */}
          {showSwitcher && (
            <div className="absolute top-full left-0 w-full z-50 bg-card border border-border shadow-xl rounded-b-lg overflow-hidden"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
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
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Upcoming Lineups
                    </p>
                    {recentServices.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No upcoming services</p>
                    )}
                    {recentServices.map((svc) => (
                      <SwitcherRow
                        key={svc.id}
                        svc={svc}
                        isCurrent={svc.id === selectedService.id}
                        isPending={pendingSwitch?.id === svc.id}
                        onSelect={() => requestSwitch(svc)}
                      />
                    ))}
                  </>
                ) : switcherResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No results</p>
                ) : (
                  switcherResults.map((svc) => (
                    <SwitcherRow
                      key={svc.id}
                      svc={svc}
                      isCurrent={svc.id === selectedService.id}
                      isPending={pendingSwitch?.id === svc.id}
                      onSelect={() => requestSwitch(svc)}
                    />
                  ))
                )}
              </div>
              {/* Confirmation bar */}
              {pendingSwitch && (
                <div className="border-t border-border bg-amber-500/10 px-3 py-2 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <p className="text-[11px] text-amber-500 font-medium flex-1 truncate min-w-0">
                    Switch to "{pendingSwitch.label}"?
                  </p>
                  <button
                    onClick={() => { setShowSwitcher(false); setPendingSwitch(null); }}
                    className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSwitch}
                    className="text-[11px] font-semibold text-amber-500 hover:text-amber-400 shrink-0"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}

          <div
            className="flex gap-2 items-center mt-2"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <span className="text-[11px] text-muted-foreground bg-input px-2 py-0.5 rounded font-medium">
              {new Date(selectedService.date + "T00:00:00").toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                },
              )}
            </span>
            <span className="text-[11px] text-muted-foreground bg-input px-2 py-0.5 rounded font-medium">
              Item {selectedSongIdx + 1} of {liveSongs.length}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
              LIVE
            </span>
          </div>
        </div>

        {/* Lineup tab */}
        <div className="border-b border-border">
          <div className="text-center py-2 text-xs font-semibold border-b-2 border-primary text-foreground">
            Lineup
          </div>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto">
          {liveSongs.map((song, i) => {
            const isCurrent = selectedSongIdx === i;
            const isCountdown = song.itemType === "countdown";
            const isScripture = song.artist === "Scripture";
            const isMedia = song.artist === "Media";
            const isAudioItem =
              isMedia &&
              /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(song.backgroundPath ?? "");
            const isVideoItem =
              isMedia && /\.(mp4|webm|mov)$/i.test(song.backgroundPath ?? "");
            const Icon = isCountdown
              ? Timer
              : isScripture
                ? BookOpen
                : isMedia
                  ? isVideoItem
                    ? Film
                    : isAudioItem
                      ? Volume2
                      : ImageIcon
                  : Music;
            return (
              <React.Fragment key={song.lineupItemId}>
              <button
                onClick={() => {
                  setSelectedSongIdx(i);
                  setVideoPlaying(false);
                  setVideoCurrentTime(0);
                  setVideoDuration(0);
                  if (videoTimerRef.current) {
                    clearInterval(videoTimerRef.current);
                    videoTimerRef.current = null;
                  }
                  if (videoPreviewRef.current) {
                    videoPreviewRef.current.pause();
                    videoPreviewRef.current.currentTime = 0;
                  }
                  // Stop audio when switching songs
                  if (vizFrameRef.current) { cancelAnimationFrame(vizFrameRef.current); vizFrameRef.current = null }
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                    audioRef.current = null;
                  }
                  if (audioTimerRef.current) {
                    clearInterval(audioTimerRef.current);
                    audioTimerRef.current = null;
                  }
                  audioContextRef.current?.close();
                  audioContextRef.current = null;
                  analyserRef.current = null;
                  setAudioPlaying(false);
                  setAudioCurrentTime(0);
                  setAudioDuration(0);
                  setWaveformBars(new Array(48).fill(0));
                }}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-border transition-colors ${
                  isCurrent
                    ? "bg-primary/[0.08] border-l-[3px] border-l-primary pl-[9px]"
                    : "hover:bg-accent/30"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-input text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13px] font-medium truncate ${
                      isCurrent
                        ? "text-primary font-semibold"
                        : "text-foreground"
                    }`}
                  >
                    {song.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {isCountdown
                      ? "Pre-Service Countdown"
                      : isScripture
                        ? "Scripture"
                        : isMedia
                          ? isVideoItem
                            ? "Video"
                            : isAudioItem
                              ? "Audio"
                              : "Image"
                          : `Song${song.key ? ` · Key: ${song.key}` : ""}`}
                  </p>
                </div>
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Add Item */}
        <div className="p-3 border-t border-border">
          <button
            onClick={() => setShowLibrary(true)}
            className="w-full py-2 border border-dashed border-muted-foreground rounded-md text-muted-foreground text-[13px] font-medium flex items-center justify-center gap-1.5 hover:border-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Item
          </button>
        </div>
      </div>

      {/* ═════ CENTER: Slide Grid ═════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {currentSong?.itemType === "countdown" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <Timer className="h-16 w-16 text-muted-foreground mb-6" />
            <h2 className="text-lg font-bold mb-2">Countdown Timer</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Counting down to service at{" "}
              <span className="font-semibold text-foreground">
                {new Date(`2000-01-01T${serviceTime}`).toLocaleTimeString(
                  "en-US",
                  { hour: "numeric", minute: "2-digit", hour12: true },
                )}
              </span>
              {" "}
              <span className="text-xs font-medium bg-muted rounded px-1.5 py-0.5">
                {(() => {
                  const tz = getEffectiveTz();
                  try {
                    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
                      .formatToParts(new Date())
                      .find((p) => p.type === "timeZoneName")?.value ?? tz;
                  } catch { return tz; }
                })()}
              </span>
            </p>

            {/* Large timer display */}
            <div className="rounded-2xl border border-border bg-card px-12 py-8 mb-8">
              <span className="text-6xl font-mono font-bold tracking-wider text-foreground">
                {countdownRunning
                  ? countdownDisplay
                  : computeCountdownDisplay()}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              {!countdownRunning ? (
                <Button size="lg" className="gap-2" onClick={startCountdown}>
                  <Play className="h-5 w-5 fill-current" />
                  Start Countdown
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="destructive"
                  className="gap-2"
                  onClick={stopCountdown}
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop Countdown
                </Button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground mt-6 max-w-sm">
              The countdown will be shown on the projection screen when started.
              It stops automatically when it reaches zero.
            </p>
          </div>
        ) : currentSong?.artist === "Media" && /\.(mp4|webm|mov)$/i.test(resolveBg(currentSong) ?? "") ? (
          /* ── Video media — full-panel layout ── */
          (() => {
            const bg = resolveBg(currentSong)!
            const pct = videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0
            const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`
            const ext = bg.split(".").pop()?.toUpperCase() ?? "VIDEO"

            const stopVideo = () => {
              window.worshipsync.slide.videoControl("stop")
              if (videoPreviewRef.current) { videoPreviewRef.current.pause(); videoPreviewRef.current.currentTime = 0 }
              setVideoPlaying(false); setVideoCurrentTime(0); setIsBlank(true)
              if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null }
            }

            const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
              if (!videoDuration) return
              const rect = e.currentTarget.getBoundingClientRect()
              const seekTo = ((e.clientX - rect.left) / rect.width) * videoDuration
              if (videoPreviewRef.current) videoPreviewRef.current.currentTime = seekTo
              setVideoCurrentTime(seekTo)
              window.worshipsync.slide.videoSeek(seekTo)
            }

            const handlePlay = () => {
              const preview = videoPreviewRef.current
              const dur = preview?.duration ?? 0
              setVideoDuration(dur); setVideoCurrentTime(0)
              sendSlide(selectedSongIdx, 0)
              window.worshipsync.slide.videoControl("play")
              preview?.play()
              setVideoPlaying(true)
              if (videoTimerRef.current) clearInterval(videoTimerRef.current)
              videoTimerRef.current = setInterval(() => {
                setVideoCurrentTime(videoPreviewRef.current?.currentTime ?? 0)
              }, 100)
            }

            const handlePause = () => {
              window.worshipsync.slide.videoControl("pause")
              videoPreviewRef.current?.pause()
              setVideoPlaying(false)
              if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null }
            }

            return (
              <>
                {/* Header */}
                <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold truncate">{currentSong.title}</h1>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>Video</span>
                      <span>·</span>
                      <span className="tabular-nums">{fmt(videoDuration)}</span>
                      <span>·</span>
                      <span>{ext}</span>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={() => setShowLibrary(true)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Replace
                  </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-muted/30 flex flex-col items-center justify-center p-6">
                  <div className="w-full max-w-3xl flex flex-col gap-4">

                    {/* Video preview */}
                    <div className="relative rounded-xl overflow-hidden bg-black border border-border shadow-md" style={{ aspectRatio: "16/9" }}>
                      <video
                        ref={videoPreviewRef}
                        src={`file://${encodeURI(bg)}`}
                        className="w-full h-full object-cover"
                        muted playsInline preload="metadata"
                        onLoadedMetadata={() => setVideoDuration(videoPreviewRef.current?.duration ?? 0)}
                        onEnded={stopVideo}
                      />

                      {/* Play/Pause overlay */}
                      <button
                        onClick={videoPlaying ? handlePause : handlePlay}
                        className="absolute inset-0 flex items-center justify-center group"
                      >
                        {!videoPlaying && (
                          <div className="w-16 h-16 rounded-full bg-black/60 border-2 border-white/80 flex items-center justify-center transition-transform group-hover:scale-110">
                            <Play className="h-8 w-8 text-white fill-white ml-1" />
                          </div>
                        )}
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right shrink-0">{fmt(videoCurrentTime)}</span>
                      <div
                        className="flex-1 relative flex items-center cursor-pointer py-2"
                        onClick={handleSeek}
                      >
                        <div className="w-full h-1.5 bg-secondary rounded-full relative">
                          <div
                            className="absolute left-0 top-0 h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-background border-2 border-primary rounded-full shadow-sm -translate-x-1/2"
                            style={{ left: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-10 shrink-0">{fmt(videoDuration)}</span>
                    </div>

                    <p className="text-center text-[11px] text-muted-foreground">
                      Preview plays here (muted) · Audio plays on the projection screen
                    </p>
                  </div>
                </div>
              </>
            )
          })()
        ) : currentSong?.artist === "Media" && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(resolveBg(currentSong) ?? "") ? (
          /* ── Audio media — full-panel layout ── */
          (() => {
            const bg = resolveBg(currentSong)!
            const pct = audioDuration ? (audioCurrentTime / audioDuration) * 100 : 0
            const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`
            const ext = bg.split(".").pop()?.toUpperCase() ?? "AUDIO"

            const stopViz = () => {
              if (vizFrameRef.current) { cancelAnimationFrame(vizFrameRef.current); vizFrameRef.current = null }
              setWaveformBars(new Array(48).fill(0))
            }

            const startViz = () => {
              const analyser = analyserRef.current
              if (!analyser) return
              const data = new Uint8Array(analyser.frequencyBinCount)
              const tick = () => {
                analyser.getByteFrequencyData(data)
                setWaveformBars(
                  Array.from({ length: 48 }, (_, i) => {
                    const idx = Math.floor((i / 48) * data.length)
                    return data[idx] / 255
                  })
                )
                vizFrameRef.current = requestAnimationFrame(tick)
              }
              vizFrameRef.current = requestAnimationFrame(tick)
            }

            const ensureAudio = () => {
              if (!audioRef.current) {
                audioRef.current = new Audio(`file://${encodeURI(bg)}`)
                audioRef.current.onloadedmetadata = () => setAudioDuration(audioRef.current?.duration ?? 0)
                audioRef.current.onended = () => {
                  setAudioPlaying(false); setAudioCurrentTime(0)
                  if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null }
                  stopViz()
                }
                // Wire up Web Audio analyser
                const ctx = new AudioContext()
                const analyser = ctx.createAnalyser()
                analyser.fftSize = 128
                ctx.createMediaElementSource(audioRef.current).connect(analyser)
                analyser.connect(ctx.destination)
                audioContextRef.current = ctx
                analyserRef.current = analyser
              }
              return audioRef.current
            }

            const handlePlay = () => {
              const audio = ensureAudio()
              audioContextRef.current?.resume()
              audio.play()
              setAudioPlaying(true)
              if (audioTimerRef.current) clearInterval(audioTimerRef.current)
              audioTimerRef.current = setInterval(() => setAudioCurrentTime(audioRef.current?.currentTime ?? 0), 100)
              startViz()
            }

            const handlePause = () => {
              audioRef.current?.pause()
              setAudioPlaying(false)
              if (audioTimerRef.current) { clearInterval(audioTimerRef.current); audioTimerRef.current = null }
              stopViz()
            }

            const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
              if (!audioDuration || !audioRef.current) return
              const rect = e.currentTarget.getBoundingClientRect()
              audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * audioDuration
              setAudioCurrentTime(audioRef.current.currentTime)
            }

            return (
              <>
                {/* Header */}
                <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between gap-4 shrink-0">
                  <div className="min-w-0">
                    <h1 className="text-base font-semibold truncate">{currentSong.title}</h1>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>Audio</span>
                      <span>·</span>
                      <span className="tabular-nums">{fmt(audioDuration)}</span>
                      <span>·</span>
                      <span>{ext}</span>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={() => setShowLibrary(true)}>
                    <RefreshCw className="h-3.5 w-3.5" /> Replace
                  </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-muted/30 flex flex-col items-center justify-center p-6">
                  <div className="w-full max-w-3xl flex flex-col gap-4">

                    {/* Audio thumbnail with waveform visualizer + play/pause overlay */}
                    <div className="relative rounded-xl overflow-hidden bg-card border border-border shadow-md" style={{ aspectRatio: "16/9" }}>
                      {/* Waveform bars */}
                      <div className="w-full h-full flex items-end justify-center gap-px px-6 pt-6 pb-6">
                        {waveformBars.map((v, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm bg-primary/70"
                            style={{ height: `${Math.max(3, v * 100)}%` }}
                          />
                        ))}
                      </div>
                      {/* Idle icon — shown when not playing and no data */}
                      {!audioPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <Volume2 className="h-16 w-16 text-muted-foreground/40" />
                        </div>
                      )}
                      <button
                        onClick={audioPlaying ? handlePause : handlePlay}
                        className="absolute inset-0 flex items-center justify-center group"
                      >
                        {!audioPlaying && (
                          <div className="w-16 h-16 rounded-full bg-black/60 border-2 border-white/80 flex items-center justify-center transition-transform group-hover:scale-110">
                            <Play className="h-8 w-8 text-white fill-white ml-1" />
                          </div>
                        )}
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right shrink-0">{fmt(audioCurrentTime)}</span>
                      <div
                        className="flex-1 relative flex items-center cursor-pointer py-2"
                        onClick={handleSeek}
                      >
                        <div className="w-full h-1.5 bg-secondary rounded-full relative">
                          <div
                            className="absolute left-0 top-0 h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-background border-2 border-primary rounded-full shadow-sm -translate-x-1/2"
                            style={{ left: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-10 shrink-0">{fmt(audioDuration)}</span>
                    </div>

                    <p className="text-center text-[11px] text-muted-foreground">
                      Audio plays through this computer only. Nothing is shown on the projection screen.
                    </p>
                  </div>
                </div>
              </>
            )
          })()
        ) : currentSong?.artist === "Media" ? (
          /* ── Image media — centered layout ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            {(() => {
              const bg = resolveBg(currentSong);

              // Image
              return (
                <>
                  <div className="rounded-2xl border border-border overflow-hidden mb-6 w-full max-w-lg" style={{ aspectRatio: "16/9" }}>
                    {bg ? (
                      <img src={`file://${bg}`} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-black flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <h2 className="text-lg font-bold mb-1">{currentSong.title}</h2>
                  <p className="text-sm text-muted-foreground mb-6">Image · Click Show to project</p>
                  <Button size="lg" className="gap-2" onClick={() => sendSlide(selectedSongIdx, 0)}>
                    <Cast className="h-5 w-5" /> Show on Screen
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-6 max-w-sm">The image will be shown full-screen on the projection display.</p>
                </>
              );
            })()}
          </div>
        ) : currentSong ? (
          <>
            {/* Song header */}
            <div className="px-5 py-3 border-b border-border bg-card flex justify-between items-center gap-4">
              <div className="min-w-0">
                <h1 className="text-base font-semibold truncate">
                  {currentSong.title}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {currentSong.artist || "Unknown artist"}
                  {currentSong.ccliNumber &&
                    ` · CCLI #${currentSong.ccliNumber}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                >
                  <ImageIcon className="h-3 w-3" /> Background
                </Button>
                {currentSong.artist !== "Scripture" && (
                  <Button size="sm" className="gap-1.5 h-7 text-xs">
                    <Pencil className="h-3 w-3" /> Edit Lyrics
                  </Button>
                )}
              </div>
            </div>

            {/* Slide grid */}
            <div ref={slideGridRef} className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-4">
                {currentSong.slides.map((slide, i) => {
                  const isActive = activeSlideIdx === i;
                  const bg = resolveBg(currentSong);
                  const abbrev =
                    SECTION_ABBREVS[slide.sectionType] ?? slide.sectionLabel[0];
                  return (
                    <div key={i} data-slide-idx={i} className="flex flex-col gap-1.5">
                      {/* Section label row */}
                      <div className="flex items-center justify-between gap-2 px-0.5 h-5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded leading-none ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted-foreground text-background"
                            }`}
                          >
                            {abbrev}
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              isActive
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            {slide.sectionLabel}
                          </span>
                        </div>
                        {isActive && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/[0.18] text-primary leading-none">
                            LIVE
                          </span>
                        )}
                      </div>

                      {/* Slide thumbnail — fixed aspect ratio via padding hack */}
                      <button
                        onClick={(e) => {
                          e.currentTarget.blur();
                          sendSlide(selectedSongIdx, i);
                        }}
                        className={`relative w-full overflow-hidden rounded-lg focus:outline-none border-2 transition-colors ${
                          isActive ? "border-primary" : "border-transparent"
                        }`}
                        style={{
                          outline: isActive
                            ? "none"
                            : "1px solid hsl(var(--border))",
                        }}
                      >
                        <div
                          className="w-full"
                          style={{ paddingBottom: "56.25%" }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          {bg && slide.sectionType !== "blank" ? (
                            bg.startsWith("color:") ? (
                              <div
                                className="absolute inset-0"
                                style={{ background: bg.replace("color:", "") }}
                              />
                            ) : /\.(mp4|webm|mov)$/i.test(bg) ? (
                              <video
                                src={`file://${encodeURI(bg)}`}
                                className="absolute inset-0 w-full h-full object-cover"
                                muted
                                preload="metadata"
                              />
                            ) : (
                              <>
                                <img
                                  src={`file://${bg}`}
                                  className="absolute inset-0 w-full h-full object-cover"
                                  alt=""
                                />
                                <div
                                  className="absolute inset-0"
                                  style={{
                                    background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})`,
                                  }}
                                />
                              </>
                            )
                          ) : (
                            <div className="absolute inset-0 bg-black" />
                          )}

                          <p
                            className="relative z-10 text-center font-bold text-[13px] leading-snug whitespace-pre-wrap px-3"
                            style={{
                              color: effectiveTheme.textColor,
                              fontFamily: effectiveTheme.fontFamily,
                              textShadow:
                                effectiveTheme.textShadowOpacity > 0
                                  ? `0 1px 3px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})`
                                  : "none",
                            }}
                          >
                            {slide.sectionType === "blank"
                              ? ""
                              : slide.lines.join("\n")}
                          </p>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              Select a song from the lineup
            </p>
          </div>
        )}

        {/* Notes strip — pinned at the bottom of the slide area */}
        {currentSong?.notes ? (
          <div className="shrink-0 border-t border-border px-5 py-3 bg-card">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
            <p className="text-[11px] text-amber-400/90 leading-relaxed whitespace-pre-wrap break-words">
              {currentSong.notes}
            </p>
          </div>
        ) : null}
      </div>

      {/* ═════ RIGHT: Live Output Panel (300px) ═════ */}
      <div className="w-[300px] shrink-0 border-l border-border flex flex-col bg-card overflow-hidden">
        {/* Header + ON AIR */}
        <div className="px-4 pt-3 pb-3 border-b border-border">
          <div className="flex justify-between items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold">Live Output</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelp(true)}
                title="Keyboard shortcuts (?)"
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                <Keyboard className="h-3.5 w-3.5" />
              </button>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded bg-[hsl(var(--success)/0.16)] text-[hsl(var(--success))]">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
                ON AIR
              </span>
            </div>
          </div>

          {/* Projection display */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">
              Projection
            </p>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
              <Cast className="h-4 w-4 text-primary shrink-0" />
              <select
                className="flex-1 bg-transparent text-xs text-foreground font-medium border-none outline-none cursor-pointer min-w-0"
                value={selectedDisplayId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value)
                  setSelectedDisplayId(id)
                  if (projectionOpen) window.worshipsync.window.moveProjection(id)
                }}
              >
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                    {d.isPrimary ? " (Primary)" : ""} — {d.width}x{d.height}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-bold text-primary shrink-0">ACTIVE</span>
            </div>
          </div>

          {/* Confidence monitor */}
          <div className="mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">
              Confidence Monitor
            </p>
            <div className="flex items-center gap-2 rounded-md px-3 py-2 border border-border bg-background/40">
              <Tv className="h-4 w-4 text-muted-foreground shrink-0" />
              <select
                className="flex-1 bg-transparent text-xs text-foreground font-medium border-none outline-none cursor-pointer min-w-0"
                value={selectedConfidenceDisplayId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || undefined
                  setSelectedConfidenceDisplayId(id)
                  if (confidenceOpen && id !== undefined) window.worshipsync.confidence.move(id)
                }}
              >
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                    {d.isPrimary ? " (Primary)" : ""} — {d.width}x{d.height}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (confidenceOpen) {
                    window.worshipsync.confidence.close()
                    setConfidenceOpen(false)
                  } else {
                    window.worshipsync.confidence.open(selectedConfidenceDisplayId)
                    setConfidenceOpen(true)
                  }
                }}
                className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded transition-colors ${
                  confidenceOpen
                    ? "text-[hsl(var(--success))] hover:text-red-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={confidenceOpen ? "Close confidence monitor" : "Open confidence monitor"}
              >
                {confidenceOpen ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Preview — conditional by item type */}
          {currentSong?.itemType === "countdown" ? (
            /* ── Countdown mini-preview ── */
            <div className="p-4 border-b border-border">
              {(() => {
                const previewTarget = new Date(getTargetTime()).getTime()
                const previewDiff = Math.max(0, previewTarget - Date.now())
                const pd = Math.floor(previewDiff / 86400000)
                const ph = Math.floor((previewDiff % 86400000) / 3600000)
                const pm = Math.floor((previewDiff % 3600000) / 60000)
                const ps = Math.floor((previewDiff % 60000) / 1000)
                const pad = (n: number) => String(n).padStart(2, "0")
                const showHours = pd > 0 || ph > 0

                const Seg = ({ value, label }: { value: number; label: string }) => (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 160, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: "0.03em" }}>{pad(value)}</div>
                    <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.25em", textTransform: "uppercase" as const, marginTop: 8 }}>{label}</div>
                  </div>
                )
                const Col = () => (
                  <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 120, fontWeight: 800, color: "rgba(255,255,255,0.4)", lineHeight: 1, paddingBottom: 32, alignSelf: "flex-end" as const, margin: "0 8px" }}>:</div>
                )

                return (
                  <div style={{ position: "relative", overflow: "hidden", borderRadius: "6px", aspectRatio: "16/9", border: "1px solid hsl(var(--border))" }}>
                    <div style={{
                      position: "absolute", top: 0, left: 0,
                      width: "1920px", height: "1080px",
                      transform: "scale(0.14)", transformOrigin: "top left",
                      background: "linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.62) 100%), linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 52, fontWeight: 800, color: "#fff", letterSpacing: "0.38em", textTransform: "uppercase" as const, marginBottom: 14 }}>Welcome</div>
                      <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 24, fontWeight: 400, color: "rgba(255,255,255,0.82)", marginBottom: 36 }}>Our Sunday Service will begin in</div>
                      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 36 }}>
                        {pd > 0 && <><Seg value={pd} label="Days" /><Col /></>}
                        {showHours && <><Seg value={ph} label="Hours" /><Col /></>}
                        <Seg value={pm} label="Minutes" /><Col />
                        <Seg value={ps} label="Seconds" />
                      </div>
                      <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 20, fontWeight: 400, color: "rgba(255,255,255,0.65)" }}>Please find your seats and silence your devices</div>
                      {churchName && (
                        <div style={{ position: "absolute", bottom: 36, display: "flex", alignItems: "center", gap: 10 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                          <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.2em", textTransform: "uppercase" as const }}>{churchName}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
              <p className="text-[11px] text-muted-foreground mt-2 text-center">Countdown preview</p>
            </div>
          ) : !(currentSong?.artist === "Media" && /\.(mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i.test(resolveBg(currentSong) ?? "")) && (
            /* ── Standard slide preview ── */
            <div className="p-4 border-b border-border">
              <div
                className="relative overflow-hidden rounded-md border border-border bg-black flex items-center justify-center"
                style={{ aspectRatio: "16/9", padding: "16px" }}
              >
                {effectiveBg && currentSlide && !isBlank && (
                  <img
                    src={`file://${effectiveBg}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    alt=""
                  />
                )}
                {effectiveBg && currentSlide && !isBlank && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `rgba(0,0,0,${effectiveTheme.overlayOpacity / 100})`,
                    }}
                  />
                )}
                {currentSlide && !isBlank ? (
                  <span
                    className="relative z-10 text-center font-bold text-xs leading-relaxed whitespace-pre-wrap"
                    style={{
                      color: effectiveTheme.textColor,
                      fontFamily: effectiveTheme.fontFamily,
                      textAlign: effectiveTheme.textAlign,
                      textShadow: `0 1px 4px rgba(0,0,0,${effectiveTheme.textShadowOpacity / 100})`,
                      width: "100%",
                    }}
                  >
                    {currentSlide.lines.join("\n")}
                  </span>
                ) : (
                  <div className="relative z-10 flex items-center justify-center h-full">
                    {isBlank ? (
                      <MonitorOff className="h-5 w-5 text-gray-700" />
                    ) : (
                      <p className="text-xs text-gray-600">No slide active</p>
                    )}
                  </div>
                )}
              </div>

              {/* Info row */}
              <div className="flex justify-between items-center mt-2 text-[11px] text-muted-foreground font-medium">
                <span>
                  {selectedDisplay
                    ? `${selectedDisplay.width} × ${selectedDisplay.height}`
                    : "—"}
                </span>
                <span>
                  {activeSlideIdx >= 0
                    ? `Slide ${activeSlideIdx + 1} / ${totalSlides}`
                    : "—"}
                </span>
              </div>

              {/* Prev / Next */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={goPrevSlide}
                  disabled={activeSlideIdx <= 0}
                  className="flex-1 py-2 bg-background border border-border rounded-md text-xs font-semibold flex items-center justify-center gap-1 hover:bg-accent/40 transition-colors disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <button
                  onClick={goNextSlide}
                  className="flex-1 py-2 bg-background border border-border rounded-md text-xs font-semibold flex items-center justify-center gap-1 hover:bg-accent/40 transition-colors"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="p-4 border-b border-border">
            <h3 className="text-xs font-semibold mb-2.5">Quick Actions</h3>
            <div className="space-y-1.5">
              <QuickAction
                icon={X}
                label="Clear All"
                iconBg="bg-destructive/14"
                iconColor="text-destructive"
                onClick={clearAll}
              />
              <QuickAction icon={Type} label="Clear Text" onClick={clearText} />
              <QuickAction
                icon={MonitorOff}
                label="To Black"
                iconBg="bg-black border border-muted"
                onClick={toBlack}
              />
              <QuickAction
                icon={Hexagon}
                label="Logo Screen"
                onClick={showLogo}
              />
              <QuickAction
                icon={MonitorOff}
                label={confirmEndShow ? "Tap to confirm" : "End Show"}
                iconBg={confirmEndShow ? "bg-destructive" : "bg-destructive/14"}
                iconColor={confirmEndShow ? "text-white" : "text-destructive"}
                onClick={endShow}
              />
            </div>
          </div>

          {/* Next Up */}
          {nextUp && (() => {
            const nextUpSong = nextUp.songTitle ? nextSong : currentSong;
            const nextUpTheme = nextUpSong ? resolveTheme(nextUpSong) : effectiveTheme;
            const nextUpBg = nextUpSong ? resolveBg(nextUpSong) : effectiveBg;
            return (
              <div className="p-4">
                <h3 className="text-xs font-semibold mb-2">
                  Next Up:{" "}
                  <span className="text-muted-foreground font-medium">
                    {nextUp.songTitle
                      ? `${nextUp.songTitle} — ${nextUp.slide.sectionLabel}`
                      : nextUp.slide.sectionLabel}
                  </span>
                </h3>
                <div
                  className="relative overflow-hidden rounded-md border border-border bg-black flex items-center justify-center opacity-[0.86]"
                  style={{ aspectRatio: "16/9", padding: "12px" }}
                >
                  {nextUpBg && nextUp.slide.sectionType !== "blank" && (
                    <>
                      <img
                        src={`file://${nextUpBg}`}
                        className="absolute inset-0 w-full h-full object-cover"
                        alt=""
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `rgba(0,0,0,${nextUpTheme.overlayOpacity / 100})`,
                        }}
                      />
                    </>
                  )}
                  <span
                    className="relative z-10 text-center font-bold text-xs leading-relaxed whitespace-pre-wrap"
                    style={{
                      color: nextUpTheme.textColor,
                      fontFamily: nextUpTheme.fontFamily,
                      textAlign: nextUpTheme.textAlign,
                      textShadow: `0 1px 4px rgba(0,0,0,${nextUpTheme.textShadowOpacity / 100})`,
                      width: "100%",
                    }}
                  >
                    {nextUp.slide.lines.join("\n") || " "}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

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
                      { keys: ["B"], label: "Blank screen (black)" },
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
    </div>
  );
}

// ── Quick Action Button ──────────────────────────────────────────────────────

function QuickAction({
  icon: Icon,
  label,
  iconBg,
  iconColor,
  onClick,
}: {
  icon: typeof MonitorOff;
  label: string;
  iconBg?: string;
  iconColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 bg-background border border-border rounded-md hover:bg-accent/30 transition-colors text-left"
    >
      <div
        className={`w-5 h-5 flex items-center justify-center rounded ${iconBg ?? "bg-secondary"}`}
      >
        <Icon className={`h-3 w-3 ${iconColor ?? "text-foreground"}`} />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
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

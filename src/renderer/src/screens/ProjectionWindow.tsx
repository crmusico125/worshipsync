import { useState, useEffect, useRef, useCallback } from "react";
import type { SlidePayload } from "../../../../shared/types";

type DisplayState = "slide" | "blank" | "logo" | "countdown";

const DEFAULT_THEME = {
  fontFamily: "Montserrat, sans-serif",
  fontSize: 48,
  fontWeight: "600",
  textColor: "#ffffff",
  textAlign: "center" as const,
  textPosition: "middle" as const,
  overlayOpacity: 45,
  textShadowOpacity: 40,
  maxLinesPerSlide: 2,
};

export default function ProjectionWindow() {
  const [slide, setSlide] = useState<SlidePayload | null>(null);
  const [displayState, setDisplayState] = useState<DisplayState>("blank");
  const [countdownTarget, setCountdownTarget] = useState<string>("");
  const [countdownDisplay, setCountdownDisplay] = useState("00:00:00");
  const [scaledFontSize, setScaledFontSize] = useState<number>(48);
  const cleanupRef = useRef<(() => void)[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lyricsTextRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingVideoAction = useRef<"play" | "pause" | "stop" | null>(null);

  useEffect(() => {
    window.worshipsync.projection.ready();

    const cleanSlide = window.worshipsync.slide.onShow((payload) => {
      setSlide(payload);
      setDisplayState("slide");
    });

    const cleanBlank = window.worshipsync.slide.onBlank((isBlank) => {
      setDisplayState((prev) =>
        isBlank ? "blank" : prev === "countdown" ? "countdown" : "slide",
      );
    });

    const cleanLogo = window.worshipsync.slide.onLogo((show) => {
      setDisplayState((prev) =>
        show ? "logo" : prev === "countdown" ? "countdown" : "slide",
      );
    });

    const cleanCountdown = window.worshipsync.slide.onCountdown((data) => {
      if (data.running && data.targetTime) {
        setCountdownTarget(data.targetTime);
        setDisplayState("countdown");
      } else {
        setDisplayState("blank");
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }
    });

    const cleanVideo = window.worshipsync.slide.onVideoControl((action) => {
      const vid = videoRef.current;
      if (!vid) {
        // Video element not mounted yet — store for when it mounts
        pendingVideoAction.current = action;
        return;
      }
      pendingVideoAction.current = null;
      if (action === "play") vid.play();
      else if (action === "pause") vid.pause();
      else if (action === "stop") {
        vid.pause();
        vid.currentTime = 0;
        setDisplayState("blank");
      }
    });

    cleanupRef.current = [
      cleanSlide,
      cleanBlank,
      cleanLogo,
      cleanCountdown,
      cleanVideo,
    ];

    return () => {
      cleanupRef.current.forEach((fn) => fn());
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Countdown timer tick
  useEffect(() => {
    if (displayState !== "countdown" || !countdownTarget) return;

    const tick = () => {
      const target = new Date(countdownTarget).getTime();
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setCountdownDisplay("00:00:00");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdownDisplay(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [displayState, countdownTarget]);

  // Apply pending video action once the video element mounts
  useEffect(() => {
    if (
      displayState === "slide" &&
      slide?.backgroundPath &&
      pendingVideoAction.current
    ) {
      if (/\.(mp4|webm|mov)$/i.test(slide.backgroundPath)) {
        requestAnimationFrame(() => {
          const vid = videoRef.current;
          if (vid && pendingVideoAction.current) {
            const action = pendingVideoAction.current;
            pendingVideoAction.current = null;
            if (action === "play") vid.play();
            else if (action === "pause") vid.pause();
            else if (action === "stop") {
              vid.pause();
              vid.currentTime = 0;
              setDisplayState("blank");
            }
          }
        });
      }
    }
  }, [displayState, slide]);

  const theme = slide?.theme ?? DEFAULT_THEME;
  const overlayAlpha = (theme.overlayOpacity / 100).toFixed(2);
  const shadowOpacity = (theme.textShadowOpacity / 100).toFixed(2);

  // Auto-scale font size to fit the container
  const fitText = useCallback(() => {
    const container = lyricsContainerRef.current;
    const text = lyricsTextRef.current;
    if (!container || !text) return;

    const maxW = container.clientWidth;
    const maxH = container.clientHeight;
    let size = theme.fontSize;
    const minSize = Math.max(20, theme.fontSize * 0.45);

    text.style.fontSize = `${size}px`;
    while (
      size > minSize &&
      (text.scrollHeight > maxH || text.scrollWidth > maxW)
    ) {
      size -= 2;
      text.style.fontSize = `${size}px`;
    }
    setScaledFontSize(size);
  }, [theme.fontSize]);

  useEffect(() => {
    if (displayState === "slide" && slide) {
      requestAnimationFrame(fitText);
    }
  }, [slide, displayState, fitText]);

  const alignItems =
    theme.textPosition === "top"
      ? "flex-start"
      : theme.textPosition === "bottom"
        ? "flex-end"
        : "center";

  const backgroundPath = slide?.backgroundPath;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background */}
      {displayState === "slide" &&
        backgroundPath &&
        (backgroundPath.startsWith("color:") ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              background: backgroundPath.replace("color:", ""),
            }}
          />
        ) : /\.(mp4|webm|mov)$/i.test(backgroundPath) ? (
          <video
            ref={videoRef}
            key={backgroundPath}
            playsInline
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            src={`file://${encodeURI(backgroundPath)}`}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              backgroundImage: `url("file://${encodeURI(backgroundPath)}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ))}

      {/* Dark overlay */}
      {displayState === "slide" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            background: `rgba(0,0,0,${overlayAlpha})`,
          }}
        />
      )}

      {/* Blank screen */}
      {displayState === "blank" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "#000",
          }}
        />
      )}

      {/* Logo screen */}
      {displayState === "logo" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: 64,
              fontWeight: 700,
              color: "rgba(255,255,255,0.15)",
              letterSpacing: "-0.03em",
            }}
          >
            WorshipSync
          </div>
        </div>
      )}

      {/* Countdown */}
      {displayState === "countdown" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "#000",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: 18,
              fontWeight: 500,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            Service starts in
          </div>
          <div
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 120,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "0.05em",
              textShadow: "0 0 40px rgba(255,255,255,0.15)",
            }}
          >
            {countdownDisplay}
          </div>
        </div>
      )}

      {/* Lyrics */}
      {displayState === "slide" && slide && (
        <div
          ref={lyricsContainerRef}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: alignItems,
            padding: "8% 10%",
          }}
        >
          <div
            ref={lyricsTextRef}
            style={{
              fontFamily: theme.fontFamily,
              fontSize: scaledFontSize,
              fontWeight: theme.fontWeight,
              color: theme.textColor,
              textAlign: theme.textAlign,
              lineHeight: 1.4,
              textShadow: `0 2px 12px rgba(0,0,0,${shadowOpacity}), 0 1px 3px rgba(0,0,0,${shadowOpacity})`,
              width: "100%",
            }}
          >
            {slide.lines.map((line, i) => (
              <div key={i}>{line || "\u00A0"}</div>
            ))}
          </div>
        </div>
      )}

      {/* Scripture reference */}
      {displayState === "slide" && slide && slide.artist === "Scripture" && (
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 0,
            right: 0,
            zIndex: 3,
            textAlign: "center",
            fontSize: 20,
            fontFamily: theme.fontFamily,
            fontWeight: "500",
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.02em",
          }}
        >
          {slide.sectionLabel}
        </div>
      )}

      {/* Slide counter */}
      {displayState === "slide" && slide && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 20,
            zIndex: 3,
            fontSize: 11,
            color: "rgba(255,255,255,0.15)",
            fontFamily: "monospace",
          }}
        >
          {(slide.slideIndex ?? 0) + 1}/{slide.totalSlides ?? 0}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import type { SlidePayload } from "../../../../shared/types";

export default function ConfidenceMonitor() {
  const [slide, setSlide] = useState<SlidePayload | null>(null);
  const [isBlank, setIsBlank] = useState(false);
  const [time, setTime] = useState("");
  const [countdownDisplay, setCountdownDisplay] = useState("");
  const [showCountdown, setShowCountdown] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      let h = now.getHours();
      const m = now.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      setTime(`${h}:${m < 10 ? "0" : ""}${m} ${ampm}`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  // Signal ready so main process can replay last known state
  useEffect(() => {
    window.worshipsync.confidence.ready()
  }, [])

  // IPC events
  useEffect(() => {
    const cleanSlide = window.worshipsync.slide.onShow((payload) => {
      setSlide(payload);
      setIsBlank(false);
      setShowCountdown(false);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    });

    const cleanBlank = window.worshipsync.slide.onBlank((b) => {
      setIsBlank(b);
    });

    const cleanCountdown = window.worshipsync.slide.onCountdown((data) => {
      if (!data.running) {
        setShowCountdown(false);
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        return;
      }
      setShowCountdown(true);
      setIsBlank(false);

      const target = new Date(data.targetTime).getTime();
      const tick = () => {
        const diff = target - Date.now();
        if (diff <= 0) {
          setCountdownDisplay("Starting!");
          return;
        }
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setCountdownDisplay(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      };
      tick();
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(tick, 500);
    });

    return () => {
      cleanSlide();
      cleanBlank();
      cleanCountdown();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const hasLyrics = slide && slide.lines.filter(Boolean).length > 0;
  const hasNext = slide && slide.nextLines && slide.nextLines.filter(Boolean).length > 0;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#080810",
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
        position: "relative",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: "#c4c4cc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {slide
            ? `${slide.songTitle}${slide.artist ? `  —  ${slide.artist}` : ""}`
            : "WorshipSync — Confidence Monitor"}
        </div>

        {slide && slide.sectionLabel && !showCountdown && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: "rgba(139,92,246,0.18)",
              color: "#a78bfa",
              border: "1px solid rgba(139,92,246,0.3)",
              borderRadius: 5,
              padding: "3px 9px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {slide.sectionLabel}
          </div>
        )}

        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: "#fff",
            letterSpacing: "-0.01em",
            flexShrink: 0,
            minWidth: 80,
            textAlign: "right",
          }}
        >
          {time}
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 40px 20px",
          minHeight: 0,
        }}
      >
        {showCountdown ? (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "clamp(72px,18vw,160px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'SF Mono','Fira Code',monospace",
                color: "#ffffff",
              }}
            >
              {countdownDisplay}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.3)",
                marginTop: 10,
              }}
            >
              Until Service Starts
            </div>
          </div>
        ) : hasLyrics ? (
          <div
            style={{
              fontSize: "clamp(32px,6.5vw,88px)",
              fontWeight: 700,
              lineHeight: 1.35,
              textAlign: "center",
              color: "#ffffff",
              letterSpacing: "-0.015em",
              maxWidth: 1100,
            }}
          >
            {slide!.lines.map((line, i) => (
              <div key={i}>{line || "\u00A0"}</div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.18)" }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              Waiting for slides…
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              The confidence monitor will update
              <br />
              when the operator advances slides.
            </div>
          </div>
        )}
      </div>

      {/* Next slide panel */}
      {hasNext && !showCountdown && (
        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.025)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px 6px",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              Next
            </span>
            {slide?.nextSectionLabel && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(139,92,246,0.7)",
                }}
              >
                {slide.nextSectionLabel}
              </span>
            )}
          </div>
          <div
            style={{
              padding: "0 20px 14px",
              fontSize: "clamp(16px,2.5vw,32px)",
              fontWeight: 500,
              lineHeight: 1.45,
              textAlign: "center",
              color: "rgba(255,255,255,0.45)",
              maxHeight: "28vh",
              overflow: "hidden",
            }}
          >
            {slide!.nextLines!.map((line, i) => (
              <div key={i}>{line || "\u00A0"}</div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.25)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {slide && slide.slideIndex != null && slide.totalSlides != null
            ? `${slide.slideIndex + 1} / ${slide.totalSlides}`
            : ""}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.15)",
          }}
        >
          Confidence Monitor
        </div>
      </div>

      {/* Blank overlay */}
      {isBlank && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#000",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.1)",
            }}
          >
            Screen Blank
          </div>
        </div>
      )}
    </div>
  );
}

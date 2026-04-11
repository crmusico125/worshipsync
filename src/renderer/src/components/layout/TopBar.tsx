import type { AppScreen } from "../../../../../shared/types";

const TITLES: Record<AppScreen, string> = {
  planner: "Service planner",
  builder: "Service builder",
  library: "Song library",
  themes: "Themes",
  analytics: "Analytics",
  settings: "Settings",
  live: "Live operator panel",
};

interface Props {
  screen: AppScreen;
  projectionOpen: boolean;
}

export default function TopBar({ screen, projectionOpen }: Props) {
  return (
    <div
      style={{
        height: 44,
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 10,
        flexShrink: 0,
        background: "var(--surface-1)",
      }}
    >
      <span
        style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}
      >
        {TITLES[screen]}
      </span>

      <div style={{ flex: 1 }} />

      {/* Projection status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          className="status-dot"
          style={{
            background: projectionOpen
              ? "var(--accent-green)"
              : "var(--border-default)",
            animation: projectionOpen ? "pulse 2s infinite" : "none",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {projectionOpen ? "Projector connected" : "Projector off"}
        </span>
      </div>
    </div>
  );
}

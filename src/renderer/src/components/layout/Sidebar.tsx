import type { AppScreen } from "../../../../../shared/types";

interface Props {
  current: AppScreen;
  onChange: (screen: AppScreen) => void;
  projectionOpen: boolean;
  onGoLive: () => void;
}

const NAV_ITEMS: { id: AppScreen; label: string; icon: string }[] = [
  { id: "planner", label: "Planner", icon: "📅" },
  { id: "builder", label: "Builder", icon: "🎵" },
  { id: "library", label: "Library", icon: "📖" },
  { id: "themes", label: "Themes", icon: "🎨" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar({
  current,
  onChange,
  projectionOpen,
  onGoLive,
}: Props) {
  return (
    <nav className="sidebar">
      {/* App logo */}
      <div
        style={{
          padding: "8px 10px 14px",
          borderBottom: "1px solid var(--border-subtle)",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          WorshipSync
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
          v0.1.0
        </div>
      </div>

      {/* Nav links */}
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${current === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
          style={{
            width: "100%",
            background: "none",
            border: current === item.id ? undefined : "1px solid transparent",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 13 }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Go Live button */}
      <button
        className={projectionOpen ? "btn btn-danger" : "btn btn-success"}
        style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
        onClick={onGoLive}
      >
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: projectionOpen
              ? "var(--accent-red)"
              : "var(--accent-green)",
            animation: projectionOpen ? "pulse 2s infinite" : "none",
          }}
        />
        {projectionOpen ? "Live — click to manage" : "Go Live"}
      </button>

      {/* Live indicator */}
      {projectionOpen && (
        <button
          className="nav-item active"
          onClick={() => onChange("live")}
          style={{
            marginTop: 4,
            width: "100%",
            background: "none",
            border: "1px solid transparent",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 13 }}>🖥️</span>
          <span>Operator panel</span>
        </button>
      )}
    </nav>
  );
}

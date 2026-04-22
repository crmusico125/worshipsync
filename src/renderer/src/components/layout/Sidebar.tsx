import React from "react";
import type { AppScreen } from "../../../../../shared/types";
import {
  Calendar,
  Wrench,
  Palette,
  MonitorPlay,
  BarChart3,
  Settings,
  Church,
  Music,
  Image,
} from "lucide-react";

interface Props {
  current: AppScreen;
  onChange: (screen: AppScreen) => void;
  projectionOpen: boolean;
  onGoLive: () => void;
  canGoLive: boolean;
}

interface NavItem {
  id: AppScreen;
  icon: typeof Calendar;
  label: string;
}

const NAV_TOP: NavItem[] = [
  { id: "presenter", icon: MonitorPlay, label: "Presenter" },
  { id: "planner", icon: Calendar, label: "Planner" },
  { id: "builder", icon: Wrench, label: "Builder" },
  { id: "library", icon: Music, label: "Library" },
  { id: "media", icon: Image, label: "Media" },
  { id: "themes", icon: Palette, label: "Themes" },
  { id: "analytics", icon: BarChart3, label: "Analytics" },
];

export default function Sidebar({ current, onChange, projectionOpen }: Props) {
  return (
    <nav className="w-[64px] shrink-0 bg-sidebar border-r border-border flex flex-col items-center">
      {/* Draggable logo area */}
      <div
        className="w-full flex items-center justify-center pt-12 pb-4 text-sidebar-foreground"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <Church className="h-6 w-6" />
      </div>

      {/* Nav icons */}
      <div
        className="flex flex-col gap-1 items-center px-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {NAV_TOP.map((item) => {
          const isActive = current === item.id;
          const isPresenter = item.id === "presenter";
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              title={item.label}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
                isActive
                  ? isPresenter && projectionOpen
                    ? "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]"
                    : "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-primary/50"
              }`}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>

      {/* Bottom: Settings */}
      <div className="mt-auto pb-3 flex flex-col items-center">
        <button
          onClick={() => onChange("settings")}
          title="Settings"
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
            current === "settings"
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-primary/50"
          }`}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </nav>
  );
}

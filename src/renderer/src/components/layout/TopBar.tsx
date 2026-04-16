import React from "react"
import type { AppScreen } from "../../../../../shared/types"

const TITLES: Record<AppScreen, string> = {
  planner: "Planner",
  builder: "Service Builder",
  library: "Song Library",
  themes: "Themes",
  analytics: "Analytics",
  settings: "Settings",
  presenter: "Presenter",
}

interface Props {
  screen: AppScreen
  projectionOpen: boolean
}

export default function TopBar({ screen, projectionOpen }: Props) {
  return (
    <div
      className="h-11 border-b border-border flex items-center px-4 gap-2.5 shrink-0 bg-card"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <span className="text-xs font-semibold text-foreground">
        {TITLES[screen]}
      </span>

      <div className="flex-1" />

      {/* Projection status */}
      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div
          className={`h-1.5 w-1.5 rounded-full ${
            projectionOpen ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
          }`}
        />
        <span className="text-[10px] text-muted-foreground">
          {projectionOpen ? "Projector connected" : "Projector off"}
        </span>
      </div>
    </div>
  )
}

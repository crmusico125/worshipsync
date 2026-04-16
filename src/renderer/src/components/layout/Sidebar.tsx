import type { AppScreen } from "../../../../../shared/types"
import {
  Calendar, Wrench, BookOpen, Palette, Radio, BarChart3, Settings,
} from "lucide-react"

interface Props {
  current: AppScreen
  onChange: (screen: AppScreen) => void
  projectionOpen: boolean
  onGoLive: () => void
  canGoLive: boolean
}

interface NavItem {
  id: AppScreen
  label: string
  icon: typeof Calendar
}

const NAV_ITEMS: NavItem[] = [
  { id: "planner", label: "Planner", icon: Calendar },
  { id: "builder", label: "Builder", icon: Wrench },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
]

export default function Sidebar({
  current, onChange, projectionOpen, onGoLive, canGoLive,
}: Props) {
  return (
    <nav className="w-[200px] shrink-0 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-4 pt-9 pb-3 border-b border-border">
        <div className="text-sm font-bold text-foreground tracking-tight">WorshipSync</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">v0.1.0</div>
      </div>

      {/* Nav */}
      <div className="flex-1 flex flex-col py-2 px-2 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = current === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          )
        })}

        {/* Presenter nav (highlighted when live) */}
        <button
          onClick={() => onChange("presenter")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left ${
            current === "presenter"
              ? "bg-red-500/10 text-red-400"
              : projectionOpen
                ? "bg-red-500/5 text-red-400/80 hover:bg-red-500/10"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          }`}
        >
          <Radio className={`h-3.5 w-3.5 shrink-0 ${projectionOpen ? "animate-pulse" : ""}`} />
          <span>Presenter</span>
          {projectionOpen && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Go Live footer button */}
      <div className="p-2 border-t border-border">
        <button
          onClick={onGoLive}
          disabled={!canGoLive && !projectionOpen}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
            projectionOpen
              ? "bg-red-600 hover:bg-red-700 text-white"
              : canGoLive
                ? "bg-red-600/90 hover:bg-red-600 text-white"
                : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              projectionOpen ? "bg-white animate-pulse" : "bg-white/80"
            }`}
          />
          {projectionOpen ? "Live — manage" : "Go Live"}
        </button>
      </div>
    </nav>
  )
}

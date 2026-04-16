import { useEffect, useState, useCallback } from "react"
import type { AppScreen } from "../../../shared/types"
import Sidebar from "./components/layout/Sidebar"
import TopBar from "./components/layout/TopBar"
import PlannerScreen from "./screens/PlannerScreen"
import BuilderScreen from "./screens/BuilderScreen"
import LibraryScreen from "./screens/LibraryScreen"
import ThemesScreen from "./screens/ThemesScreen"
import AnalyticsScreen from "./screens/AnalyticsScreen"
import SettingsScreen from "./screens/SettingsScreen"
import PresenterDashboard from "./screens/PresenterDashboard"
import { useServiceStore } from "./store/useServiceStore"

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>("planner")
  const [projectionOpen, setProjectionOpen] = useState(false)
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)

  const lineupLength = useServiceStore((s) => s.lineup.length)
  const selectedService = useServiceStore((s) => s.selectedService)
  const canGoLive = lineupLength > 0 && !!selectedService

  const handleGoLive = useCallback(() => {
    // Explicit Go Live: open projection window + navigate to presenter
    if (!projectionOpen) {
      window.worshipsync.window.openProjection()
      setProjectionOpen(true)
    }
    setCurrentScreen("presenter")
  }, [projectionOpen])

  const handleExitLive = useCallback(() => {
    setCurrentScreen("builder")
  }, [])

  useEffect(() => {
    // On startup, restore last active service
    window.worshipsync.appState.get()
      .then(async (state: Record<string, any>) => {
        if (state.lastServiceId) {
          const { loadServices, selectService } = useServiceStore.getState()
          await loadServices()
          const lastService = useServiceStore.getState().services.find(
            (s) => s.id === state.lastServiceId,
          )
          if (lastService) {
            await selectService(lastService)
            setActiveServiceId(lastService.id)
          }
        }
      })
      .catch(() => {})
  }, [])

  const handleOpenBuilder = useCallback((serviceId: number) => {
    setActiveServiceId(serviceId)
    setCurrentScreen("builder")
  }, [])

  return (
    <div className="h-screen flex bg-background text-foreground">
      <Sidebar
        current={currentScreen}
        onChange={setCurrentScreen}
        projectionOpen={projectionOpen}
        onGoLive={handleGoLive}
        canGoLive={canGoLive}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar screen={currentScreen} projectionOpen={projectionOpen} />
        <div className="flex-1 overflow-hidden">
          {currentScreen === "planner" && (
            <PlannerScreen
              onOpenBuilder={handleOpenBuilder}
              onGoLive={handleGoLive}
            />
          )}
          {currentScreen === "builder" && (
            <BuilderScreen
              serviceId={activeServiceId}
              onGoLive={handleGoLive}
            />
          )}
          {currentScreen === "library" && <LibraryScreen />}
          {currentScreen === "themes" && <ThemesScreen />}
          {currentScreen === "analytics" && <AnalyticsScreen />}
          {currentScreen === "settings" && <SettingsScreen />}
          {currentScreen === "presenter" && (
            <PresenterDashboard
              projectionOpen={projectionOpen}
              onProjectionChange={setProjectionOpen}
              onExitLive={handleExitLive}
            />
          )}
        </div>
      </div>
    </div>
  )
}

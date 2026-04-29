import React, { useEffect, useState, useCallback } from "react"
import type { AppScreen } from "../../../shared/types"
import type { ServiceMode } from "./screens/ServiceScreen"
import Sidebar from "./components/layout/Sidebar"
import PlannerScreen from "./screens/PlannerScreen"
import ServiceScreen from "./screens/ServiceScreen"
import LibraryScreen from "./screens/LibraryScreen"
import MediaLibraryScreen from "./screens/MediaLibraryScreen"
import ThemesScreen from "./screens/ThemesScreen"
import AnalyticsScreen from "./screens/AnalyticsScreen"
import SettingsScreen from "./screens/SettingsScreen"
import OverviewScreen from "./screens/OverviewScreen"
import { useServiceStore } from "./store/useServiceStore"

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>("overview")
  const [projectionOpen, setProjectionOpen] = useState(false)
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)
  const [serviceLaunchMode, setServiceLaunchMode] = useState<ServiceMode>("prepare")

  // Reset projectionOpen when the user closes the projection window from the OS
  useEffect(() => {
    const cleanup = window.worshipsync.window.onProjectionClosed(() => {
      setProjectionOpen(false)
    })
    return cleanup
  }, [])

  // On startup, restore last active service
  useEffect(() => {
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

  // Open a service in prepare (builder) mode
  const handleOpenService = useCallback(async (serviceId: number) => {
    setServiceLaunchMode("prepare")
    // Select the service in the store BEFORE updating activeServiceId so
    // BuilderScreen always renders with the correct selectedService already set.
    const { loadServices, selectService, services } = useServiceStore.getState()
    let list = services
    if (list.length === 0) {
      await loadServices()
      list = useServiceStore.getState().services
    }
    const svc = list.find((s) => s.id === serviceId)
    if (svc) await selectService(svc)
    setActiveServiceId(serviceId)
    setCurrentScreen("service")
    window.worshipsync.appState.set({ lastServiceId: serviceId })
  }, [])

  // Open a service directly in live (presenter) mode
  const handleOpenServiceLive = useCallback(async (serviceId: number) => {
    setActiveServiceId(serviceId)
    // Pre-select the service so PresenterDashboard never sees a null selectedService
    const { loadServices, selectService, services } = useServiceStore.getState()
    let list = services
    if (list.length === 0) {
      await loadServices()
      list = useServiceStore.getState().services
    }
    const svc = list.find((s) => s.id === serviceId)
    if (svc) await selectService(svc)
    window.worshipsync.window.openProjection()
    setProjectionOpen(true)
    setServiceLaunchMode("live")
    setCurrentScreen("service")
    window.worshipsync.appState.set({ lastServiceId: serviceId })
  }, [])

  return (
    <div className="h-screen flex bg-background text-foreground">
      <Sidebar
        current={currentScreen}
        onChange={setCurrentScreen}
        projectionOpen={projectionOpen}
        isLive={projectionOpen && activeServiceId !== null}
        onReturnToLive={() => setCurrentScreen("service")}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Draggable title bar region */}
        <div
          className="h-8 shrink-0 bg-card border-b border-border flex items-center px-4"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <span className="text-[11px] font-medium text-muted-foreground">
            {currentScreen === "service" ? "" : currentScreen.charAt(0).toUpperCase() + currentScreen.slice(1)}
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          {currentScreen === "overview" && (
            <OverviewScreen
              onGoLive={handleOpenServiceLive}
              onOpenBuilder={handleOpenService}
              onNavigate={setCurrentScreen}
              projectionOpen={projectionOpen}
              activeServiceId={activeServiceId}
            />
          )}
          {currentScreen === "planner" && (
            <PlannerScreen
              onOpenService={handleOpenService}
              onGoLive={handleOpenServiceLive}
            />
          )}
          {/* ServiceScreen stays mounted once a service is active so mode/state survive navigation */}
          {activeServiceId !== null && (
            <div className={currentScreen === "service" ? "h-full" : "hidden"}>
              <ServiceScreen
                serviceId={activeServiceId}
                initialMode={serviceLaunchMode}
                projectionOpen={projectionOpen}
                onProjectionChange={setProjectionOpen}
              />
            </div>
          )}
          {currentScreen === "library"   && <LibraryScreen />}
          {currentScreen === "media"     && <MediaLibraryScreen />}
          {currentScreen === "themes"    && <ThemesScreen />}
          {currentScreen === "analytics" && <AnalyticsScreen />}
          {currentScreen === "settings"  && <SettingsScreen />}
        </div>
      </div>
    </div>
  )
}

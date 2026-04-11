import { useEffect, useState, useCallback } from "react";
import type { AppScreen } from "../../../../shared/types";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import PlannerScreen from "./screens/PlannerScreen";
import BuilderScreen from "./screens/BuilderScreen";
import LibraryScreen from "./screens/LibraryScreen";
import ThemesScreen from "./screens/ThemesScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import LiveScreen from "./screens/LiveScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { useServiceStore } from "./store/useServiceStore";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>("planner");
  const [projectionOpen, setProjectionOpen] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null);

  const handleGoLive = useCallback(async () => {
    const { selectedService, loadLineup } = useServiceStore.getState();
    if (selectedService) {
      await loadLineup(selectedService.id);
      // Remember this service for next app open
      await window.worshipsync.appState.set({
        lastServiceId: selectedService.id,
      });
    }
    if (!projectionOpen) {
      window.worshipsync.window.openProjection();
      setProjectionOpen(true);
    }
    setCurrentScreen("live");
  }, [projectionOpen]);

  useEffect(() => {
    // On startup, restore last active service
    window.worshipsync.appState
      .get()
      .then(async (state: Record<string, any>) => {
        if (state.lastServiceId) {
          const { loadServices, selectService } = useServiceStore.getState();
          await loadServices();
          const lastService = useServiceStore
            .getState()
            .services.find((s) => s.id === state.lastServiceId);
          if (lastService) {
            await selectService(lastService);
            setActiveServiceId(lastService.id);
          }
        }
      })
      .catch(() => {
        // appState not available yet or file doesn't exist — fine on first launch
      });
  }, []);

  // Also reload when navigating to live via sidebar
  useEffect(() => {
    if (currentScreen === "live") {
      const { selectedService, loadLineup } = useServiceStore.getState();
      if (selectedService) {
        loadLineup(selectedService.id);
      }
    }
  }, [currentScreen]);

  const handleCloseProjection = useCallback(() => {
    window.worshipsync.window.closeProjection();
    setProjectionOpen(false);
    setCurrentScreen("builder");
  }, []);

  const handleOpenBuilder = useCallback((serviceId: number) => {
    setActiveServiceId(serviceId);
    setCurrentScreen("builder");
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        current={currentScreen}
        onChange={setCurrentScreen}
        projectionOpen={projectionOpen}
        onGoLive={handleGoLive}
      />
      <div className="main-content">
        <TopBar screen={currentScreen} projectionOpen={projectionOpen} />
        <div style={{ flex: 1, overflow: "hidden" }}>
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
          {currentScreen === "live" && (
            <LiveScreen
              onClose={handleCloseProjection}
              projectionOpen={projectionOpen}
            />
          )}
        </div>
      </div>
    </div>
  );
}

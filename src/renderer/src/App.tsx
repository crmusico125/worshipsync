import { useEffect, useState, useCallback } from "react";
import type { AppScreen } from "../../../shared/types";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import PlannerScreen from "./screens/PlannerScreen";
import BuilderScreen from "./screens/BuilderScreen";
import LibraryScreen from "./screens/LibraryScreen";
import ThemesScreen from "./screens/ThemesScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ManageLineupsScreen from "./screens/ManageLineupsScreen";
import PresenterDashboard from "./screens/PresenterDashboard";
import { useServiceStore } from "./store/useServiceStore";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>("planner");
  const [projectionOpen, setProjectionOpen] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null);

  const handleGoLive = useCallback(() => {
    setCurrentScreen("presenter");
  }, []);

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
          {currentScreen === "lineups" && (
            <ManageLineupsScreen
              onOpenBuilder={handleOpenBuilder}
              onGoLive={handleGoLive}
            />
          )}
          {currentScreen === "presenter" && (
            <PresenterDashboard
              projectionOpen={projectionOpen}
              onProjectionChange={setProjectionOpen}
            />
          )}
        </div>
      </div>
    </div>
  );
}

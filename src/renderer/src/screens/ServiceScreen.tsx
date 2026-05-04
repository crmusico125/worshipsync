import { useCallback, useState, useEffect } from "react"
import BuilderScreen from "./BuilderScreen"
import PresenterDashboard from "./PresenterDashboard"

export type ServiceMode = "prepare" | "live"

interface Props {
  serviceId: number
  initialMode: ServiceMode
  projectionOpen: boolean
  onProjectionChange: (open: boolean) => void
}

export default function ServiceScreen({
  serviceId,
  initialMode,
  projectionOpen,
  onProjectionChange,
}: Props) {
  const [mode, setMode] = useState<ServiceMode>(initialMode)

  // When projection opens, always switch to live view
  useEffect(() => {
    if (projectionOpen) setMode("live")
  }, [projectionOpen])

  // When projection closes (end show), go back to builder
  useEffect(() => {
    if (!projectionOpen) setMode("prepare")
  }, [projectionOpen])

  const handleGoLive = useCallback(() => {
    window.worshipsync.window.openProjection()
    onProjectionChange(true)
    setMode("live")
  }, [onProjectionChange])

  const handleSwitchToBuilder = useCallback(() => {
    setMode("prepare")
  }, [])

  const handleReturnToPresenter = useCallback(() => {
    setMode("live")
  }, [])

  if (mode === "live") {
    return (
      <PresenterDashboard
        projectionOpen={projectionOpen}
        onProjectionChange={onProjectionChange}
        onExitLive={() => setMode("prepare")}
        onSwitchToBuilder={handleSwitchToBuilder}
      />
    )
  }

  return (
    <BuilderScreen
      serviceId={serviceId}
      onGoLive={handleGoLive}
      projectionOpen={projectionOpen}
      onReturnToPresenter={projectionOpen ? handleReturnToPresenter : undefined}
    />
  )
}

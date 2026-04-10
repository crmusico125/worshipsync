import { useState, useEffect } from 'react'
import { useServiceStore } from './useServiceStore'

interface QuickLaunchState {
  todayResult: { service: any; daysAway: number } | null
  lastServiceId: number | null
  loading: boolean
}

export function useQuickLaunch() {
  const [state, setState] = useState<QuickLaunchState>({
    todayResult: null,
    lastServiceId: null,
    loading: true
  })

  useEffect(() => {
    Promise.all([
      window.worshipsync.appState.getTodayService(),
      window.worshipsync.appState.get()
    ]).then(([todayResult, appState]) => {
      setState({
        todayResult,
        lastServiceId: appState.lastServiceId ?? null,
        loading: false
      })
    })
  }, [])

  const launch = async (
    service: any,
    onReady: (serviceId: number) => void
  ) => {
    const { loadServices, selectService, loadLineup } = useServiceStore.getState()
    await loadServices()
    await selectService(service)
    await loadLineup(service.id)
    await window.worshipsync.appState.set({ lastServiceId: service.id })
    onReady(service.id)
  }

  return { ...state, launch }
}
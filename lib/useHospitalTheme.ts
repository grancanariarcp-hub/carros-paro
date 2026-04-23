'use client'
import { useEffect } from 'react'

export function useHospitalTheme(colorPrimario?: string | null) {
  useEffect(() => {
    if (!colorPrimario) return

    const hex = colorPrimario.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)

    document.documentElement.style.setProperty('--hospital-color', colorPrimario)

    document.body.style.background = `linear-gradient(160deg, rgba(${r},${g},${b},0.35) 0%, rgba(${r},${g},${b},0.20) 40%, #d8e2f0 100%)`

    return () => {
      document.body.style.background = ''
      document.documentElement.style.removeProperty('--hospital-color')
    }
  }, [colorPrimario])
}

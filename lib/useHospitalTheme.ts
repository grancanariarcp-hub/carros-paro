'use client'
import { useEffect } from 'react'

export function useHospitalTheme(colorPrimario?: string | null) {
  useEffect(() => {
    if (!colorPrimario) return

    // Convertir hex a RGB para poder usar con opacidad
    const hex = colorPrimario.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)

    // Aplicar variables CSS al root
    document.documentElement.style.setProperty('--hospital-color', colorPrimario)
    document.documentElement.style.setProperty('--hospital-color-r', String(r))
    document.documentElement.style.setProperty('--hospital-color-g', String(g))
    document.documentElement.style.setProperty('--hospital-color-b', String(b))
    document.documentElement.style.setProperty(
      '--hospital-bg',
      `rgba(${r}, ${g}, ${b}, 0.04)`
    )

    // Aplicar fondo al body
    document.body.style.background = `linear-gradient(135deg, rgba(${r},${g},${b},0.06) 0%, rgba(${r},${g},${b},0.02) 50%, #f8fafc 100%)`

    return () => {
      document.body.style.background = ''
      document.documentElement.style.removeProperty('--hospital-color')
      document.documentElement.style.removeProperty('--hospital-bg')
    }
  }, [colorPrimario])
}

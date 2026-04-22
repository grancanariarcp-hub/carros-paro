import { useEffect, useState } from 'react'
import { createClient } from './supabase'

export interface Hospital {
  id: string
  nombre: string
  slug: string
  logo_url: string | null
  color_primario: string
  plan: string
  max_carros: number
  max_usuarios: number
}

export function useHospital(hospitalId: string | null | undefined) {
  const [hospital, setHospital] = useState<Hospital | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!hospitalId) { setLoading(false); return }
    supabase.from('hospitales')
      .select('*')
      .eq('id', hospitalId)
      .single()
      .then(({ data }) => {
        setHospital(data)
        setLoading(false)
      })
  }, [hospitalId])

  return { hospital, loading }
}

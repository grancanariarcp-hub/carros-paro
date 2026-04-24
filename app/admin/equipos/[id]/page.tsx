'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useHospitalTheme } from '@/lib/useHospitalTheme'
import FichaEquipo from '@/components/FichaEquipo'

// Todos los roles autenticados pueden ver la ficha de un equipo.
// Los roles con edición (admin, supervisor, superadmin) ven el botón Editar.
// Los demás (auditor, tecnico, readonly) ven solo lectura.

export default function EquipoDetallePage() {
  const [rol, setRol] = useState<string | null>(null)
  const [hospitalColor, setHospitalColor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const params = useParams()
  const router = useRouter()
  const equipoId = params.id as string
  const supabase = createClient()

  useHospitalTheme(hospitalColor)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('rol, hospital_id, activo')
        .eq('id', user.id)
        .single()

      if (!perfil || !perfil.activo) { router.push('/'); return }

      // Todos los roles activos pueden ver fichas de equipos
      setRol(perfil.rol)

      if (perfil.hospital_id) {
        const { data: hospital } = await supabase
          .from('hospitales')
          .select('color_primario')
          .eq('id', perfil.hospital_id)
          .single()
        setHospitalColor(hospital?.color_primario)
      }

      setLoading(false)
    }
    init()
  }, [equipoId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  if (!rol) return null

  return <FichaEquipo equipoId={equipoId} rol={rol} />
}

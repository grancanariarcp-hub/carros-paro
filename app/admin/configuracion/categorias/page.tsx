'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import CategoriasManager from '@/components/CategoriasManager'
import { rutaPadre } from '@/lib/navigation'

export default function CategoriasConfigPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'calidad', 'superadmin'].includes(p.rol)) {
      toast.error('No tienes permisos para gestionar categorías')
      router.push(rutaPadre(pathname))
      return
    }
    setPerfil(p)
    if (p.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }
    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  const colorPrimario = hospital?.color_primario || '#1d4ed8'
  // El componente CategoriasManager espera rol superadmin/administrador/calidad.
  // Si es superadmin, hospital_id null = gestiona globales; si admin/calidad,
  // hospital_id concreto.
  const rolParaManager = perfil.rol === 'superadmin' ? 'superadmin' : (perfil.rol === 'calidad' ? 'calidad' : 'administrador')
  const hospitalIdParaManager = perfil.rol === 'superadmin' ? null : perfil.hospital_id

  return (
    <div className="page">
      <div className="topbar" style={{ borderBottom: `2px solid ${colorPrimario}20` }}>
        <button onClick={() => router.push(rutaPadre(pathname))}
          className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{hospital?.nombre}</div>
          <div className="font-semibold text-sm">Categorías de equipos</div>
        </div>
        <div className="w-12 flex-shrink-0" />
      </div>

      <div className="content">
        <div className="card bg-blue-50 border-blue-100 text-xs text-blue-800">
          Las categorías marcadas como <strong>favoritas</strong> aparecerán primero en
          los desplegables al crear o editar equipos. Las categorías globales (verde)
          son comunes a todos los hospitales — solo el superadmin puede crearlas.
        </div>

        <CategoriasManager
          hospitalId={hospitalIdParaManager}
          rol={rolParaManager as 'superadmin' | 'administrador' | 'calidad'}
        />
      </div>
    </div>
  )
}

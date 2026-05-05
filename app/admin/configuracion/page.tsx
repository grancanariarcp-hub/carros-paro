'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'

/**
 * Hub central de configuración del hospital. Solo accesible para administrador,
 * calidad y superadmin. Reúne accesos a:
 *   - Servicios y unidades
 *   - Categorías de equipos
 *   - Plantillas de carros
 *   - Ajustes del hospital (hospital_config)
 */
export default function ConfiguracionPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ servicios: 0, plantillas: 0, categorias: 0 })
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'calidad', 'superadmin'].includes(p.rol)) {
      toast.error('Solo administradores pueden acceder a configuración')
      router.push(rutaPadre(pathname))
      return
    }
    setPerfil(p)

    if (p.hospital_id) {
      const [{ data: h }, { data: c }, { data: servs }, { data: plants }, { data: cats }] = await Promise.all([
        supabase.from('hospitales').select('*').eq('id', p.hospital_id).single(),
        supabase.from('hospital_config').select('*').eq('hospital_id', p.hospital_id).maybeSingle(),
        supabase.from('servicios').select('id', { count: 'exact' }).eq('hospital_id', p.hospital_id).eq('activo', true),
        supabase.from('plantillas').select('id', { count: 'exact' }).eq('hospital_id', p.hospital_id).eq('activo', true),
        supabase.from('categorias_equipo').select('id', { count: 'exact' })
          .or(`hospital_id.eq.${p.hospital_id},es_global.eq.true`).eq('activo', true),
      ])
      setHospital(h)
      setConfig(c)
      setCounts({
        servicios: (servs || []).length,
        plantillas: (plants || []).length,
        categorias: (cats || []).length,
      })
    }

    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando configuración...</div>
    </div>
  )

  const colorPrimario = hospital?.color_primario || '#1d4ed8'
  const esCalidad = perfil?.rol === 'calidad'
  const esSuperadmin = perfil?.rol === 'superadmin'

  return (
    <div className="page">
      <div className="topbar" style={{ borderBottom: `2px solid ${colorPrimario}20` }}>
        <button onClick={() => router.push(rutaPadre(pathname))}
          className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{hospital?.nombre}</div>
          <div className="font-semibold text-sm">Configuración</div>
        </div>
        <div className="w-12 flex-shrink-0" />
      </div>

      <div className="content">
        {/* Aviso de permisos para 'calidad' */}
        {esCalidad && (
          <div className="card bg-blue-50 border-blue-200 text-xs text-blue-800">
            Como <strong>Calidad</strong> puedes gestionar plantillas y categorías,
            pero NO usuarios ni datos del hospital. Para esos contacta con el administrador.
          </div>
        )}

        {/* SECCIÓN: Catálogos del hospital */}
        <div className="section-title">Catálogos</div>

        <Card
          icon="🏥"
          title="Servicios y unidades"
          subtitle={`${counts.servicios} servicio${counts.servicios !== 1 ? 's' : ''} activo${counts.servicios !== 1 ? 's' : ''}`}
          description="Servicios donde se asignan carros, equipos y supervisores."
          onClick={() => router.push('/admin/servicios')}
        />

        <Card
          icon="📋"
          title="Categorías de equipos"
          subtitle={`${counts.categorias} categoría${counts.categorias !== 1 ? 's' : ''} disponible${counts.categorias !== 1 ? 's' : ''}`}
          description="Etiquetas para clasificar equipos: Monitor, Desfibrilador, Bomba, etc."
          onClick={() => router.push('/admin/configuracion/categorias')}
        />

        <Card
          icon="🚑"
          title="Plantillas de carros"
          subtitle={`${counts.plantillas} plantilla${counts.plantillas !== 1 ? 's' : ''}`}
          description="Define una vez los cajones e items de cada tipo de carro y reutilízalos."
          onClick={() => router.push('/admin/plantillas')}
        />

        {/* SECCIÓN: Ajustes del hospital */}
        {!esCalidad && (
          <>
            <div className="section-title mt-2">Ajustes del hospital</div>

            <Card
              icon="📝"
              title="Informes y firma"
              subtitle="Membrete, pie, requiere firma"
              description="Personaliza qué aparece en los PDFs de inspección y si requieren firma."
              onClick={() => router.push('/admin/configuracion/hospital')}
            />

            {esSuperadmin && (
              <Card
                icon="🏢"
                title="Datos del hospital"
                subtitle={hospital?.slug}
                description="Nombre, logo, color, plan. Solo superadmin."
                onClick={() => router.push('/admin/configuracion/hospital')}
              />
            )}
          </>
        )}

        {/* SECCIÓN: Gestión de personas (solo admin) */}
        {!esCalidad && (
          <>
            <div className="section-title mt-2">Personas</div>

            <Card
              icon="👤"
              title="Usuarios del hospital"
              subtitle="Administradores, supervisores, auditores"
              description="Crear, editar roles y asignar a servicios."
              onClick={() => router.push('/admin/usuarios')}
            />
          </>
        )}

        <div className="text-xs text-gray-400 mt-4 text-center">
          Más opciones de configuración llegarán según el plan de tu hospital.
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Sub-componentes
// ──────────────────────────────────────────────────────────────────────

function Card({ icon, title, subtitle, description, onClick }: {
  icon: string; title: string; subtitle: string; description: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="card text-left active:opacity-80 hover:bg-gray-50 transition-colors w-full">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 text-xl">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-gray-500">{subtitle}</div>
          <div className="text-xs text-gray-400 mt-1">{description}</div>
        </div>
        <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

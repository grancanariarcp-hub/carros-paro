'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'

interface Plantilla {
  id: string
  nombre: string
  descripcion: string | null
  tipo_carro: string | null
  es_base: boolean
  activo: boolean
  creado_en: string
  _secciones?: number
}

const TIPOS_CARRO = [
  { value: '', label: 'Todos los tipos de carro' },
  { value: 'parada', label: 'Carro de parada' },
  { value: 'trauma', label: 'Carro de trauma' },
  { value: 'quemados', label: 'Carro de quemados' },
  { value: 'neonatos', label: 'Carro de neonatos' },
  { value: 'pediatrico', label: 'Carro pediátrico' },
  { value: 'otro', label: 'Otro' },
]

export default function PlantillasPage() {
  const [plantillas, setPlantillas]   = useState<Plantilla[]>([])
  const [hospital, setHospital]       = useState<any>(null)
  const [perfil, setPerfil]           = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [creando, setCreando]         = useState(false)
  const [guardando, setGuardando]     = useState(false)
  const [form, setForm]               = useState({
    nombre: '', descripcion: '', tipo_carro: '', es_base: false,
  })
  const router = useRouter()
  const supabase = createClient()
  useHospitalTheme(hospital?.color_primario)

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles')
      .select('*, hospitales(*)').eq('id', user.id).single()
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) { router.push('/'); return }
    setPerfil(p)
    setHospital((p as any).hospitales)

    const { data: pl } = await supabase.from('plantillas')
      .select('*, plantilla_secciones(count)')
      .eq('hospital_id', p.hospital_id)
      .order('es_base', { ascending: false })
      .order('creado_en', { ascending: false })

    const plantillasConCount = (pl || []).map((p: any) => ({
      ...p,
      _secciones: p.plantilla_secciones?.[0]?.count || 0,
    }))
    setPlantillas(plantillasConCount)
    setLoading(false)
  }

  async function crearPlantilla() {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    try {
      const { data: nueva, error } = await supabase.from('plantillas').insert({
        hospital_id: perfil.hospital_id,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        tipo_carro: form.tipo_carro || null,
        es_base: form.es_base,
        activo: true,
        creado_por: perfil.id,
      }).select().single()

      if (error) throw error

      // Crear secciones predefinidas por defecto
      const seccionesDefault = [
        { nombre: 'Materiales y medicamentos', tipo: 'materiales', icono: '📦', orden: 1, obligatoria: true },
        { nombre: 'Desfibrilador', tipo: 'desfibrilador', icono: '⚡', orden: 2, obligatoria: true },
        { nombre: 'Precintos', tipo: 'precintos', icono: '🔒', orden: 3, obligatoria: true },
        { nombre: 'Observaciones', tipo: 'observaciones', icono: '📝', orden: 4, obligatoria: false },
      ]

      await supabase.from('plantilla_secciones').insert(
        seccionesDefault.map(s => ({ ...s, plantilla_id: nueva.id }))
      )

      // Crear configuración de informe por defecto
      await supabase.from('plantilla_informes').insert({
        plantilla_id: nueva.id,
        mostrar_logo: true,
        mostrar_firma: true,
        mostrar_fotos_fallos: true,
        mostrar_precintos: true,
        mostrar_vencimientos: true,
        mostrar_resumen_fallos: true,
        destinatarios: [{ tipo: 'rol', valor: 'administrador' }],
        envio_automatico: false,
        cuando_enviar: 'no_operativo',
      })

      toast.success(`Plantilla "${form.nombre}" creada`)
      setCreando(false)
      setForm({ nombre: '', descripcion: '', tipo_carro: '', es_base: false })
      router.push(`/admin/plantillas/${nueva.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Error al crear plantilla')
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(p: Plantilla) {
    if (p.es_base && p.activo) {
      toast.error('No puedes desactivar la plantilla base')
      return
    }
    await supabase.from('plantillas').update({ activo: !p.activo }).eq('id', p.id)
    toast.success(p.activo ? 'Plantilla desactivada' : 'Plantilla activada')
    await cargarDatos()
  }

  async function duplicarPlantilla(p: Plantilla) {
    setGuardando(true)
    try {
      // Crear copia de la plantilla
      const { data: copia, error } = await supabase.from('plantillas').insert({
        hospital_id: perfil.hospital_id,
        nombre: `${p.nombre} (copia)`,
        descripcion: p.descripcion,
        tipo_carro: p.tipo_carro,
        es_base: false,
        activo: true,
        creado_por: perfil.id,
      }).select().single()
      if (error) throw error

      // Copiar secciones
      const { data: secciones } = await supabase.from('plantilla_secciones')
        .select('*').eq('plantilla_id', p.id).order('orden')

      for (const s of (secciones || [])) {
        const { data: nuevaSeccion } = await supabase.from('plantilla_secciones').insert({
          plantilla_id: copia.id,
          nombre: s.nombre,
          descripcion_ayuda: s.descripcion_ayuda,
          tipo: s.tipo,
          icono: s.icono,
          orden: s.orden,
          obligatoria: s.obligatoria,
        }).select().single()

        // Copiar ítems de cada sección
        if (nuevaSeccion) {
          const { data: items } = await supabase.from('plantilla_items')
            .select('*').eq('seccion_id', s.id).order('orden')
          if (items && items.length > 0) {
            await supabase.from('plantilla_items').insert(
              items.map(i => ({
                seccion_id: nuevaSeccion.id,
                nombre: i.nombre,
                descripcion: i.descripcion,
                orden: i.orden,
                tipo_campo: i.tipo_campo,
                requerido: i.requerido,
                cantidad_esperada: i.cantidad_esperada,
                tiene_vencimiento: i.tiene_vencimiento,
                unidad: i.unidad,
                tipos_incidencia: i.tipos_incidencia,
              }))
            )
          }
        }
      }

      // Copiar configuración de informe
      const { data: informe } = await supabase.from('plantilla_informes')
        .select('*').eq('plantilla_id', p.id).single()
      if (informe) {
        await supabase.from('plantilla_informes').insert({
          plantilla_id: copia.id,
          mostrar_logo: informe.mostrar_logo,
          mostrar_firma: informe.mostrar_firma,
          mostrar_fotos_fallos: informe.mostrar_fotos_fallos,
          mostrar_precintos: informe.mostrar_precintos,
          mostrar_vencimientos: informe.mostrar_vencimientos,
          mostrar_resumen_fallos: informe.mostrar_resumen_fallos,
          destinatarios: informe.destinatarios,
          envio_automatico: informe.envio_automatico,
          cuando_enviar: informe.cuando_enviar,
          asunto_email: informe.asunto_email,
          mensaje_email: informe.mensaje_email,
        })
      }

      toast.success('Plantilla duplicada correctamente')
      await cargarDatos()
    } catch (err: any) {
      toast.error('Error al duplicar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando plantillas...</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Plantillas de control</span>
        <button onClick={() => setCreando(true)}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">
          + Nueva
        </button>
      </div>

      <div className="content">

        <div className="card bg-blue-50 border-blue-100">
          <div className="text-xs text-blue-700 font-semibold">{hospital?.nombre}</div>
          <div className="text-xs text-blue-500 mt-0.5">
            Las plantillas definen qué se comprueba en cada control y cómo se genera el informe PDF.
            La plantilla base se aplica a todos los carros salvo que tengan una asignada específicamente.
          </div>
        </div>

        {/* Lista de plantillas */}
        {plantillas.length === 0 && !creando && (
          <div className="card text-center py-10">
            <div className="text-3xl mb-3">📋</div>
            <div className="font-semibold text-gray-700 mb-1">Sin plantillas</div>
            <div className="text-xs text-gray-400 mb-4">Crea tu primera plantilla para configurar los controles</div>
            <button onClick={() => setCreando(true)} className="btn-primary">
              + Crear plantilla
            </button>
          </div>
        )}

        {plantillas.map(p => (
          <div key={p.id} className={`card border-l-4 ${p.es_base ? 'border-l-blue-500' : 'border-l-gray-200'}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm text-gray-900">{p.nombre}</span>
                  {p.es_base && (
                    <span className="badge bg-blue-100 text-blue-700 text-xs border border-blue-200">
                      ⭐ Base
                    </span>
                  )}
                  <span className={`badge text-xs ${p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.activo ? 'Activa' : 'Inactiva'}
                  </span>
                  {p.tipo_carro && (
                    <span className="badge bg-gray-100 text-gray-600 text-xs">
                      {TIPOS_CARRO.find(t => t.value === p.tipo_carro)?.label || p.tipo_carro}
                    </span>
                  )}
                </div>
                {p.descripcion && (
                  <div className="text-xs text-gray-400 mb-2">{p.descripcion}</div>
                )}
                <div className="text-xs text-gray-400">
                  {p._secciones} sección{p._secciones !== 1 ? 'es' : ''}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button onClick={() => router.push(`/admin/plantillas/${p.id}`)}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">
                  Editar
                </button>
                <button onClick={() => router.push(`/admin/plantillas/${p.id}/informe`)}
                  className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold">
                  PDF
                </button>
                <button onClick={() => duplicarPlantilla(p)} disabled={guardando}
                  className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg font-semibold bg-white">
                  Duplicar
                </button>
                {!p.es_base && (
                  <button onClick={() => toggleActivo(p)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold border ${p.activo ? 'border-red-200 text-red-600 bg-red-50' : 'border-green-200 text-green-600 bg-green-50'}`}>
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Formulario nueva plantilla */}
        {creando && (
          <div className="card border-blue-200 bg-blue-50">
            <div className="section-title mb-4">Nueva plantilla</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" placeholder="Ej: Carro de parada UCI"
                  value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descripción <span className="text-gray-400">(opcional)</span></label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Para qué tipo de carro o servicio es esta plantilla..."
                  value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tipo de carro</label>
                <select className="input" value={form.tipo_carro}
                  onChange={e => setForm(f => ({ ...f, tipo_carro: e.target.value }))}>
                  {TIPOS_CARRO.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 p-3 bg-white rounded-xl border border-blue-200 cursor-pointer">
                <input type="checkbox" checked={form.es_base} className="w-4 h-4"
                  onChange={e => setForm(f => ({ ...f, es_base: e.target.checked }))} />
                <div>
                  <div className="text-xs font-semibold text-gray-800">Plantilla base del hospital</div>
                  <div className="text-xs text-gray-400">Se aplicará a todos los carros que no tengan una plantilla específica</div>
                </div>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={crearPlantilla} disabled={guardando} className="btn-primary flex-1">
                {guardando ? 'Creando...' : 'Crear y editar plantilla'}
              </button>
              <button onClick={() => setCreando(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

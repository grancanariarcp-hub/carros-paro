'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'

interface Seccion {
  id: string
  servicio_id: string
  nombre: string
  descripcion: string | null
  color: string
  activo: boolean
  creado_en: string
  _count_equipos?: number
  _count_carros?: number
}

const COLORES_PRESET = [
  '#1d4ed8', '#0891b2', '#059669', '#65a30d',
  '#ca8a04', '#dc2626', '#9333ea', '#db2777',
  '#374151', '#0f172a',
]

export default function SeccionesSupervisorPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [servicio, setServicio] = useState<any>(null)
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Seccion | null>(null)
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', color: '#1d4ed8' })
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['supervisor', 'administrador', 'calidad', 'superadmin'].includes(p.rol)) {
      toast.error('No tienes permisos')
      router.push(rutaPadre(pathname))
      return
    }
    setPerfil(p)

    if (p.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }

    // Servicio del supervisor (o no aplica para admin/calidad — los redirigimos a configuracion).
    if (p.rol === 'supervisor') {
      if (!p.servicio_id) {
        toast.error('No tienes un servicio asignado. Contacta con el administrador.')
        router.push(rutaPadre(pathname))
        return
      }
      const { data: sv } = await supabase.from('servicios').select('*').eq('id', p.servicio_id).single()
      setServicio(sv)
      await cargarSecciones(p.servicio_id)
    } else {
      // admin/calidad: gestionan desde /admin/configuracion
      router.push('/admin/configuracion')
      return
    }

    setLoading(false)
  }

  async function cargarSecciones(servicioId: string) {
    const { data: secs } = await supabase.from('secciones')
      .select('*')
      .eq('servicio_id', servicioId)
      .is('deleted_at', null)
      .order('nombre')

    // Conteos: cuántos equipos / carros tiene cada sección
    const ids = (secs || []).map(s => s.id)
    const counts: Record<string, { equipos: number; carros: number }> = {}
    if (ids.length > 0) {
      const [eqRes, caRes] = await Promise.all([
        supabase.from('equipos').select('seccion_id', { count: 'exact', head: false })
          .in('seccion_id', ids).eq('activo', true).is('deleted_at', null),
        supabase.from('carros').select('seccion_id', { count: 'exact', head: false })
          .in('seccion_id', ids).eq('activo', true).is('deleted_at', null),
      ])
      for (const e of (eqRes.data || []) as any[]) {
        counts[e.seccion_id] = counts[e.seccion_id] || { equipos: 0, carros: 0 }
        counts[e.seccion_id].equipos++
      }
      for (const c of (caRes.data || []) as any[]) {
        counts[c.seccion_id] = counts[c.seccion_id] || { equipos: 0, carros: 0 }
        counts[c.seccion_id].carros++
      }
    }

    setSecciones((secs || []).map(s => ({
      ...s,
      _count_equipos: counts[s.id]?.equipos || 0,
      _count_carros: counts[s.id]?.carros || 0,
    })))
  }

  function abrirNueva() {
    setEditando(null)
    setForm({ nombre: '', descripcion: '', color: '#1d4ed8' })
    setCreando(true)
  }

  function abrirEditar(s: Seccion) {
    setEditando(s)
    setForm({ nombre: s.nombre, descripcion: s.descripcion || '', color: s.color || '#1d4ed8' })
    setCreando(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return }
    if (!servicio) return
    setGuardando(true)
    try {
      if (editando) {
        const { error } = await supabase.from('secciones').update({
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          color: form.color,
        }).eq('id', editando.id)
        if (error) throw error
        toast.success('Sección actualizada')
      } else {
        const { error } = await supabase.from('secciones').insert({
          servicio_id: servicio.id,
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          color: form.color,
          creado_por: perfil?.id,
        })
        if (error) throw error
        toast.success('Sección creada')
      }
      setCreando(false)
      setEditando(null)
      await cargarSecciones(servicio.id)
    } catch (err: any) {
      if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
        toast.error('Ya existe una sección con ese nombre')
      } else {
        toast.error('Error: ' + err.message)
      }
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(s: Seccion) {
    if (s._count_equipos! > 0 || s._count_carros! > 0) {
      if (!confirm(`Esta sección tiene ${s._count_equipos} equipos y ${s._count_carros} carros asignados. Si la eliminas, quedarán SIN sección. ¿Continuar?`)) return
    } else {
      if (!confirm(`¿Eliminar la sección "${s.nombre}"?`)) return
    }
    const { error } = await supabase.from('secciones')
      .update({ deleted_at: new Date().toISOString(), deleted_by: perfil?.id, activo: false })
      .eq('id', s.id)
    if (error) { toast.error(error.message); return }
    toast.success('Sección eliminada')
    await cargarSecciones(servicio.id)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando…</div>
    </div>
  )

  const colorPrimario = hospital?.color_primario || '#1d4ed8'

  return (
    <div className="page">
      <div className="topbar" style={{ borderBottom: `2px solid ${colorPrimario}20` }}>
        <button onClick={() => router.push(rutaPadre(pathname))}
          className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{servicio?.nombre}</div>
          <div className="font-semibold text-sm">Secciones del servicio</div>
        </div>
        <button onClick={abrirNueva}
          style={{ background: colorPrimario }}
          className="text-xs text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0">
          + Nueva
        </button>
      </div>

      <div className="content">
        <div className="card bg-blue-50 border-blue-100 text-xs text-blue-800">
          Las secciones permiten agrupar equipos y carros DENTRO de tu servicio.
          Por ejemplo: Respiratorio, Hemodinamia, Vía aérea. Al crear o editar
          un equipo o carro podrás asignarle una sección.
        </div>

        {creando && (
          <form onSubmit={guardar} className="card border-blue-300">
            <div className="section-title mb-3">
              {editando ? 'Editar sección' : 'Nueva sección'}
            </div>
            <div className="mb-3">
              <label className="label">Nombre *</label>
              <input className="input" value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Respiratorio" required autoFocus />
            </div>
            <div className="mb-3">
              <label className="label">Descripción</label>
              <input className="input" value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Opcional" />
            </div>
            <div className="mb-3">
              <label className="label">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORES_PRESET.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{ background: c }}
                    className={`w-8 h-8 rounded-full ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-800' : ''}`} />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={guardando}
                style={{ background: colorPrimario }}
                className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50">
                {guardando ? 'Guardando…' : (editando ? 'Actualizar' : 'Crear')}
              </button>
              <button type="button" onClick={() => { setCreando(false); setEditando(null) }}
                className="px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {secciones.length === 0 && !creando ? (
          <div className="card text-center py-8">
            <div className="text-3xl mb-2">📁</div>
            <div className="text-sm font-semibold text-gray-700 mb-1">Sin secciones</div>
            <div className="text-xs text-gray-400 mb-4">
              Crea tu primera sección para empezar a agrupar equipos y carros.
            </div>
            <button onClick={abrirNueva}
              style={{ background: colorPrimario }}
              className="px-4 py-2 text-white text-sm font-semibold rounded-xl">
              + Crear sección
            </button>
          </div>
        ) : (
          secciones.map(s => (
            <div key={s.id} className="card">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-3 h-12 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{s.nombre}</div>
                  {s.descripcion && <div className="text-xs text-gray-500 mt-0.5">{s.descripcion}</div>}
                  <div className="text-xs text-gray-400 mt-1">
                    {s._count_equipos} equipo{s._count_equipos !== 1 ? 's' : ''} ·
                    {' '}{s._count_carros} carro{s._count_carros !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => abrirEditar(s)}
                  className="flex-1 text-xs font-semibold text-blue-700 border border-blue-200 rounded-lg py-1.5">
                  Editar
                </button>
                <button onClick={() => eliminar(s)}
                  className="flex-1 text-xs font-semibold text-red-700 border border-red-200 rounded-lg py-1.5">
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

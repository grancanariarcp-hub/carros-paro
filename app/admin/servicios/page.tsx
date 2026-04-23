'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'

interface Servicio {
  id: string
  nombre: string
  descripcion?: string
  color?: string
  activo: boolean
  hospital_id: string
  _carros?: number
  _equipos?: number
}

const COLORES_PRESET = [
  '#1d4ed8', '#0891b2', '#059669', '#65a30d',
  '#ca8a04', '#dc2626', '#9333ea', '#db2777',
  '#374151', '#0f172a',
]

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mostrando, setMostrando] = useState<'lista'|'nuevo'|'editar'>('lista')
  const [editando, setEditando] = useState<Servicio|null>(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    nombre: '', descripcion: '', color: '#1d4ed8'
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'supervisor', 'superadmin'].includes(p.rol)) {
      router.push('/'); return
    }
    setPerfil(p)

    if (p.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }

    await cargarServicios(p.hospital_id)
    setLoading(false)
  }

  async function cargarServicios(hospitalId: string) {
    const { data: svcs } = await supabase
      .from('servicios')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('nombre')

    if (!svcs) return

    // Contar carros y equipos por servicio
    const enriquecidos = await Promise.all(svcs.map(async s => {
      const [{ count: carros }, { count: equipos }] = await Promise.all([
        supabase.from('carros').select('*', { count: 'exact', head: true }).eq('servicio_id', s.id).eq('activo', true),
        supabase.from('equipos').select('*', { count: 'exact', head: true }).eq('servicio_id', s.id).eq('activo', true),
      ])
      return { ...s, _carros: carros || 0, _equipos: equipos || 0 }
    }))

    setServicios(enriquecidos)
  }

  async function guardarNuevo() {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const { error } = await supabase.from('servicios').insert({
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      color: form.color,
      hospital_id: perfil?.hospital_id,
      activo: true,
    })
    if (error) { toast.error('Error al crear el servicio'); setGuardando(false); return }
    toast.success(`Servicio "${form.nombre}" creado`)
    setForm({ nombre: '', descripcion: '', color: '#1d4ed8' })
    setMostrando('lista')
    await cargarServicios(perfil?.hospital_id)
    setGuardando(false)
  }

  async function guardarEdicion() {
    if (!editando || !editando.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const { error } = await supabase.from('servicios').update({
      nombre: editando.nombre.trim(),
      descripcion: editando.descripcion?.trim() || null,
      color: editando.color,
    }).eq('id', editando.id)
    if (error) { toast.error('Error al guardar'); setGuardando(false); return }
    toast.success('Servicio actualizado')
    setEditando(null)
    setMostrando('lista')
    await cargarServicios(perfil?.hospital_id)
    setGuardando(false)
  }

  async function toggleActivo(s: Servicio) {
    if (!s.activo === false && (s._carros || 0) > 0) {
      toast.error(`No se puede desactivar — tiene ${s._carros} carros asignados`)
      return
    }
    const { error } = await supabase.from('servicios').update({ activo: !s.activo }).eq('id', s.id)
    if (error) { toast.error('Error'); return }
    toast.success(s.activo ? 'Servicio desactivado' : 'Servicio activado')
    await cargarServicios(perfil?.hospital_id)
  }

  const colorPrimario = hospital?.color_primario || '#1d4ed8'
  useHospitalTheme(hospital?.color_primario)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      {/* TOPBAR */}
      <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{hospital?.nombre}</div>
          <div className="font-semibold text-sm">Servicios y Unidades</div>
        </div>
        {mostrando === 'lista' ? (
          <button
            onClick={() => { setMostrando('nuevo'); setForm({ nombre: '', descripcion: '', color: '#1d4ed8' }) }}
            style={{background: colorPrimario}}
            className="text-xs text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 active:opacity-80">
            + Nuevo
          </button>
        ) : (
          <div className="w-16 flex-shrink-0" />
        )}
      </div>

      <div className="content">

        {/* ============ FORMULARIO NUEVO ============ */}
        {mostrando === 'nuevo' && (
          <div className="card">
            <div className="section-title mb-4">Nuevo servicio</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre del servicio *</label>
                <input className="input" placeholder="Ej: UCI Médica, Urgencias, Cardiología..."
                  value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div>
                <label className="label">Descripción <span className="text-gray-400">(opcional)</span></label>
                <input className="input" placeholder="Ej: Unidad de Cuidados Intensivos Médica"
                  value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} />
              </div>
              <div>
                <label className="label">Color identificativo</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {COLORES_PRESET.map(c => (
                    <button key={c}
                      onClick={() => setForm({...form, color: c})}
                      style={{
                        width:'28px', height:'28px', borderRadius:'50%', background:c,
                        border: form.color === c ? '3px solid #111' : '2px solid transparent',
                        outline: form.color === c ? '2px solid white' : 'none',
                        outlineOffset: '-4px',
                        flexShrink:0,
                      }}
                    />
                  ))}
                  <input type="color" value={form.color}
                    onChange={e => setForm({...form, color: e.target.value})}
                    className="w-8 h-8 rounded-full border border-gray-200 cursor-pointer"
                    title="Color personalizado" />
                </div>
              </div>
              {/* Preview */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div style={{width:'4px', height:'40px', borderRadius:'2px', background:form.color, flexShrink:0}}></div>
                <div>
                  <div className="text-sm font-semibold">{form.nombre || 'Nombre del servicio'}</div>
                  <div className="text-xs text-gray-400">{form.descripcion || 'Descripción del servicio'}</div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn-primary flex-1" onClick={guardarNuevo} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Crear servicio'}
                </button>
                <button className="btn-secondary flex-1" onClick={() => setMostrando('lista')}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ FORMULARIO EDICIÓN ============ */}
        {mostrando === 'editar' && editando && (
          <div className="card">
            <div className="section-title mb-4">Editar servicio</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre del servicio *</label>
                <input className="input"
                  value={editando.nombre}
                  onChange={e => setEditando({...editando, nombre: e.target.value})} />
              </div>
              <div>
                <label className="label">Descripción <span className="text-gray-400">(opcional)</span></label>
                <input className="input"
                  value={editando.descripcion || ''}
                  onChange={e => setEditando({...editando, descripcion: e.target.value})} />
              </div>
              <div>
                <label className="label">Color identificativo</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {COLORES_PRESET.map(c => (
                    <button key={c}
                      onClick={() => setEditando({...editando, color: c})}
                      style={{
                        width:'28px', height:'28px', borderRadius:'50%', background:c,
                        border: editando.color === c ? '3px solid #111' : '2px solid transparent',
                        outline: editando.color === c ? '2px solid white' : 'none',
                        outlineOffset: '-4px',
                        flexShrink:0,
                      }}
                    />
                  ))}
                  <input type="color" value={editando.color || '#1d4ed8'}
                    onChange={e => setEditando({...editando, color: e.target.value})}
                    className="w-8 h-8 rounded-full border border-gray-200 cursor-pointer" />
                </div>
              </div>
              {/* Preview */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div style={{width:'4px', height:'40px', borderRadius:'2px', background:editando.color || colorPrimario, flexShrink:0}}></div>
                <div>
                  <div className="text-sm font-semibold">{editando.nombre}</div>
                  <div className="text-xs text-gray-400">{editando.descripcion || 'Sin descripción'}</div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn-primary flex-1" onClick={guardarEdicion} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button className="btn-secondary flex-1" onClick={() => { setEditando(null); setMostrando('lista') }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ LISTA DE SERVICIOS ============ */}
        {mostrando === 'lista' && <>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-2">
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-blue-700">{servicios.length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Total</div>
            </div>
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-green-700">{servicios.filter(s => s.activo).length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Activos</div>
            </div>
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-gray-500">{servicios.reduce((a, s) => a + (s._carros || 0), 0)}</div>
              <div className="text-xs text-gray-500 mt-0.5">Carros</div>
            </div>
          </div>

          {servicios.length === 0 && (
            <div className="card text-center py-10">
              <div className="text-3xl mb-3">🏥</div>
              <div className="text-sm font-semibold text-gray-600">Sin servicios creados</div>
              <div className="text-xs text-gray-400 mt-1 mb-4">Crea el primer servicio o unidad del hospital</div>
              <button className="btn-primary"
                onClick={() => setMostrando('nuevo')}>
                + Crear primer servicio
              </button>
            </div>
          )}

          {servicios.map(s => (
            <div key={s.id} className={`card ${!s.activo ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                {/* Indicador de color */}
                <div style={{
                  width:'4px', height:'48px', borderRadius:'2px',
                  background: s.color || colorPrimario, flexShrink:0
                }}></div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{s.nombre}</span>
                    {!s.activo && (
                      <span className="badge bg-gray-100 text-gray-500 text-xs">Inactivo</span>
                    )}
                  </div>
                  {s.descripcion && (
                    <div className="text-xs text-gray-400 mb-2">{s.descripcion}</div>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-gray-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="2" y="7" width="20" height="14" rx="2" strokeWidth={2}/>
                        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" strokeWidth={2}/>
                      </svg>
                      {s._carros} carro{s._carros !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 text-gray-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {s._equipos} equipo{s._equipos !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => { setEditando({...s}); setMostrando('editar') }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 bg-gray-50 font-semibold">
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActivo(s)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
                      s.activo
                        ? 'border-red-200 text-red-600 bg-red-50'
                        : 'border-green-200 text-green-600 bg-green-50'
                    }`}>
                    {s.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>}

      </div>
    </div>
  )
}

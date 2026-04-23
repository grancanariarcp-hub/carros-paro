'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Equipo {
  id: string
  nombre: string
  marca?: string
  modelo?: string
  numero_serie?: string
  numero_censo?: string
  codigo_barras?: string
  categoria: string
  estado: string
  foto_url?: string
  servicio_id?: string
  carro_id?: string
  fecha_adquisicion?: string
  fecha_fabricacion?: string
  fecha_ultimo_mantenimiento?: string
  fecha_proximo_mantenimiento?: string
  fecha_ultima_calibracion?: string
  fecha_proxima_calibracion?: string
  fecha_garantia_hasta?: string
  empresa_mantenimiento?: string
  contacto_mantenimiento?: string
  numero_contrato?: string
  frecuencia_mantenimiento: string
  observaciones?: string
  activo: boolean
  servicios?: { nombre: string }
  carros?: { codigo: string; nombre: string }
}

interface Mantenimiento {
  id: string
  tipo: string
  fecha: string
  descripcion?: string
  empresa?: string
  tecnico?: string
  coste?: number
  resultado: string
  creado_en: string
}

const CATEGORIAS = [
  { value: 'desfibrilador', label: 'Desfibrilador' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'videolaringoscopio', label: 'Videolaringoscopio' },
  { value: 'respirador', label: 'Respirador' },
  { value: 'bomba_infusion', label: 'Bomba de infusión' },
  { value: 'ecografo', label: 'Ecógrafo' },
  { value: 'aspirador', label: 'Aspirador' },
  { value: 'otro', label: 'Otro' },
  { value: 'general', label: 'General' },
]

const ESTADOS = [
  { value: 'operativo', label: 'Operativo', color: 'bg-green-100 text-green-700' },
  { value: 'en_mantenimiento', label: 'En mantenimiento', color: 'bg-amber-100 text-amber-700' },
  { value: 'fuera_de_servicio', label: 'Fuera de servicio', color: 'bg-red-100 text-red-700' },
  { value: 'baja', label: 'Baja', color: 'bg-gray-100 text-gray-500' },
]

const FRECUENCIAS = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'bienal', label: 'Bienal' },
]

const TIPOS_MANTENIMIENTO = [
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'calibracion', label: 'Calibración' },
  { value: 'revision', label: 'Revisión' },
  { value: 'baja', label: 'Baja del equipo' },
]

function estadoBadge(estado: string) {
  return ESTADOS.find(e => e.value === estado)?.color || 'bg-gray-100 text-gray-500'
}

function estadoLabel(estado: string) {
  return ESTADOS.find(e => e.value === estado)?.label || estado
}

function diasHasta(fecha?: string): number | null {
  if (!fecha) return null
  return Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
}

function colorDias(dias: number | null): string {
  if (dias === null) return 'text-gray-400'
  if (dias < 0) return 'text-red-600 font-semibold'
  if (dias <= 30) return 'text-amber-600 font-semibold'
  return 'text-green-600'
}

export default function EquiposPage() {
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [servicios, setServicios] = useState<any[]>([])
  const [carros, setCarros] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista'|'nuevo'|'detalle'|'mantenimiento'>('lista')
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<Equipo|null>(null)
  const [historial, setHistorial] = useState<Mantenimiento[]>([])
  const [guardando, setGuardando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const fotoRef = useRef<HTMLInputElement>(null)

  const formInicial = {
    nombre: '', marca: '', modelo: '', numero_serie: '', numero_censo: '',
    codigo_barras: '', categoria: 'general', estado: 'operativo',
    servicio_id: '', carro_id: '', fecha_adquisicion: '', fecha_fabricacion: '',
    fecha_ultimo_mantenimiento: '', fecha_proximo_mantenimiento: '',
    fecha_ultima_calibracion: '', fecha_proxima_calibracion: '',
    fecha_garantia_hasta: '', empresa_mantenimiento: '', contacto_mantenimiento: '',
    numero_contrato: '', frecuencia_mantenimiento: 'anual', observaciones: '', foto_url: '',
  }
  const [form, setForm] = useState(formInicial)

  const formMant = {
    tipo: 'preventivo', fecha: new Date().toISOString().split('T')[0],
    descripcion: '', empresa: '', tecnico: '', coste: '', resultado: 'correcto',
  }
  const [mant, setMant] = useState(formMant)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'supervisor', 'tecnico', 'superadmin'].includes(p.rol)) {
      router.push('/'); return
    }
    setPerfil(p)
    if (p.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }
    await Promise.all([
      cargarEquipos(p.hospital_id),
      cargarServicios(p.hospital_id),
      cargarCarros(p.hospital_id),
    ])
    setLoading(false)
  }

  async function cargarEquipos(hospitalId: string) {
    const { data } = await supabase.from('equipos')
      .select('*, servicios(nombre), carros(codigo, nombre)')
      .eq('hospital_id', hospitalId)
      .eq('activo', true)
      .order('nombre')
    setEquipos(data || [])
  }

  async function cargarServicios(hospitalId: string) {
    const { data } = await supabase.from('servicios').select('id,nombre').eq('hospital_id', hospitalId).eq('activo', true).order('nombre')
    setServicios(data || [])
  }

  async function cargarCarros(hospitalId: string) {
    const { data } = await supabase.from('carros').select('id,codigo,nombre').eq('hospital_id', hospitalId).eq('activo', true).order('codigo')
    setCarros(data || [])
  }

  async function cargarHistorial(equipoId: string) {
    const { data } = await supabase.from('historial_mantenimientos')
      .select('*').eq('equipo_id', equipoId).order('fecha', { ascending: false })
    setHistorial(data || [])
  }

  async function guardarEquipo() {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const payload: any = {
      ...form,
      hospital_id: perfil?.hospital_id,
      creado_por: perfil?.id,
      servicio_id: form.servicio_id || null,
      carro_id: form.carro_id || null,
    }
    // Limpiar fechas vacías
    const fechas = ['fecha_adquisicion','fecha_fabricacion','fecha_ultimo_mantenimiento','fecha_proximo_mantenimiento','fecha_ultima_calibracion','fecha_proxima_calibracion','fecha_garantia_hasta']
    fechas.forEach(f => { if (!payload[f]) payload[f] = null })

    const { error } = await supabase.from('equipos').insert(payload)
    if (error) { toast.error('Error al guardar: ' + error.message); setGuardando(false); return }
    toast.success(`Equipo "${form.nombre}" registrado correctamente`)
    setForm(formInicial)
    setVista('lista')
    await cargarEquipos(perfil?.hospital_id)
    setGuardando(false)
  }

  async function guardarEdicion() {
    if (!equipoSeleccionado) return
    setGuardando(true)
    const payload: any = { ...equipoSeleccionado }
    delete payload.servicios
    delete payload.carros
    delete payload._carros
    const fechas = ['fecha_adquisicion','fecha_fabricacion','fecha_ultimo_mantenimiento','fecha_proximo_mantenimiento','fecha_ultima_calibracion','fecha_proxima_calibracion','fecha_garantia_hasta']
    fechas.forEach(f => { if (!payload[f]) payload[f] = null })
    payload.servicio_id = payload.servicio_id || null
    payload.carro_id = payload.carro_id || null

    const { error } = await supabase.from('equipos').update(payload).eq('id', equipoSeleccionado.id)
    if (error) { toast.error('Error al guardar'); setGuardando(false); return }
    toast.success('Equipo actualizado')
    setVista('lista')
    await cargarEquipos(perfil?.hospital_id)
    setGuardando(false)
  }

  async function guardarMantenimiento() {
    if (!equipoSeleccionado || !mant.fecha) { toast.error('La fecha es obligatoria'); return }
    setGuardando(true)
    const { error } = await supabase.from('historial_mantenimientos').insert({
      equipo_id: equipoSeleccionado.id,
      tipo: mant.tipo,
      fecha: mant.fecha,
      descripcion: mant.descripcion || null,
      empresa: mant.empresa || null,
      tecnico: mant.tecnico || null,
      coste: mant.coste ? parseFloat(mant.coste) : null,
      resultado: mant.resultado,
      creado_por: perfil?.id,
    })
    if (error) { toast.error('Error al registrar'); setGuardando(false); return }

    // Actualizar fecha último mantenimiento en el equipo
    await supabase.from('equipos').update({ fecha_ultimo_mantenimiento: mant.fecha }).eq('id', equipoSeleccionado.id)

    toast.success('Mantenimiento registrado')
    setMant(formMant)
    await cargarHistorial(equipoSeleccionado.id)
    await cargarEquipos(perfil?.hospital_id)
    setVista('detalle')
    setGuardando(false)
  }

  async function subirFoto(file: File, equipoId?: string) {
    setSubiendoFoto(true)
    const ext = file.name.split('.').pop()
    const path = `equipos/${equipoId || 'nuevo'}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('evidencias').upload(path, file, { upsert: true })
    if (error) { toast.error('Error al subir la foto'); setSubiendoFoto(false); return }
    const { data: url } = supabase.storage.from('evidencias').getPublicUrl(path)
    if (equipoId) {
      await supabase.from('equipos').update({ foto_url: url.publicUrl }).eq('id', equipoId)
      setEquipoSeleccionado(prev => prev ? { ...prev, foto_url: url.publicUrl } : prev)
      await cargarEquipos(perfil?.hospital_id)
    } else {
      setForm(prev => ({ ...prev, foto_url: url.publicUrl }))
    }
    toast.success('Foto subida correctamente')
    setSubiendoFoto(false)
  }

  const equiposFiltrados = equipos.filter(e => {
    const matchEstado = filtroEstado === 'todos' || e.estado === filtroEstado
    const matchCategoria = filtroCategoria === 'todos' || e.categoria === filtroCategoria
    const matchBusqueda = !busqueda ||
      e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (e.numero_censo || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (e.numero_serie || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (e.marca || '').toLowerCase().includes(busqueda.toLowerCase())
    return matchEstado && matchCategoria && matchBusqueda
  })

  const stats = {
    total: equipos.length,
    operativos: equipos.filter(e => e.estado === 'operativo').length,
    mantenimiento: equipos.filter(e => e.estado === 'en_mantenimiento').length,
    vencidos: equipos.filter(e => {
      const d = diasHasta(e.fecha_proximo_mantenimiento)
      return d !== null && d < 0
    }).length,
  }

  const colorPrimario = hospital?.color_primario || '#1d4ed8'

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  // ============================================================
  // VISTA DETALLE
  // ============================================================
  if (vista === 'detalle' && equipoSeleccionado) {
    const diasMant = diasHasta(equipoSeleccionado.fecha_proximo_mantenimiento)
    const diasCal = diasHasta(equipoSeleccionado.fecha_proxima_calibracion)
    return (
      <div className="page">
        <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
          <button onClick={() => setVista('lista')} className="text-blue-700 text-sm font-medium">← Volver</button>
          <span className="font-semibold text-sm flex-1 text-center truncate">{equipoSeleccionado.nombre}</span>
          <button onClick={() => setVista('mantenimiento')}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0">
            + Mantenimiento
          </button>
        </div>
        <div className="content">
          {/* Foto y estado */}
          <div className="card">
            <div className="flex gap-3 mb-3">
              <div className="w-20 h-20 rounded-xl border border-gray-100 overflow-hidden flex-shrink-0 bg-gray-50 flex items-center justify-center">
                {equipoSeleccionado.foto_url ? (
                  <img src={equipoSeleccionado.foto_url} alt={equipoSeleccionado.nombre} className="w-full h-full object-cover"/>
                ) : (
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeWidth={2}/></svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base">{equipoSeleccionado.nombre}</div>
                <div className="text-xs text-gray-400">{equipoSeleccionado.marca} {equipoSeleccionado.modelo}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className={`badge text-xs ${estadoBadge(equipoSeleccionado.estado)}`}>{estadoLabel(equipoSeleccionado.estado)}</span>
                  <span className="badge bg-gray-100 text-gray-600 text-xs">{CATEGORIAS.find(c => c.value === equipoSeleccionado.categoria)?.label}</span>
                </div>
              </div>
            </div>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f, equipoSeleccionado.id) }} />
            <button onClick={() => fotoRef.current?.click()} disabled={subiendoFoto}
              className="btn-secondary text-xs w-full">
              {subiendoFoto ? 'Subiendo...' : equipoSeleccionado.foto_url ? '📷 Cambiar foto' : '📷 Añadir foto'}
            </button>
          </div>

          {/* Identificación */}
          <div className="card">
            <div className="section-title mb-3">Identificación</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400">N° censo: </span><span className="font-semibold">{equipoSeleccionado.numero_censo || '—'}</span></div>
              <div><span className="text-gray-400">N° serie: </span><span className="font-semibold">{equipoSeleccionado.numero_serie || '—'}</span></div>
              <div><span className="text-gray-400">Código barras: </span><span className="font-semibold">{equipoSeleccionado.codigo_barras || '—'}</span></div>
              <div><span className="text-gray-400">Servicio: </span><span className="font-semibold">{(equipoSeleccionado.servicios as any)?.nombre || '—'}</span></div>
              <div><span className="text-gray-400">Carro: </span><span className="font-semibold">{(equipoSeleccionado.carros as any)?.codigo || '—'}</span></div>
              <div><span className="text-gray-400">Adquisición: </span><span className="font-semibold">{equipoSeleccionado.fecha_adquisicion || '—'}</span></div>
              <div><span className="text-gray-400">Garantía hasta: </span><span className="font-semibold">{equipoSeleccionado.fecha_garantia_hasta || '—'}</span></div>
            </div>
          </div>

          {/* Mantenimiento */}
          <div className="card">
            <div className="section-title mb-3">Mantenimiento preventivo</div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div><span className="text-gray-400">Empresa: </span><span className="font-semibold">{equipoSeleccionado.empresa_mantenimiento || '—'}</span></div>
              <div><span className="text-gray-400">Frecuencia: </span><span className="font-semibold">{FRECUENCIAS.find(f => f.value === equipoSeleccionado.frecuencia_mantenimiento)?.label || '—'}</span></div>
              <div><span className="text-gray-400">Contrato: </span><span className="font-semibold">{equipoSeleccionado.numero_contrato || '—'}</span></div>
              <div><span className="text-gray-400">Contacto: </span><span className="font-semibold">{equipoSeleccionado.contacto_mantenimiento || '—'}</span></div>
              <div><span className="text-gray-400">Último: </span><span className="font-semibold">{equipoSeleccionado.fecha_ultimo_mantenimiento || '—'}</span></div>
              <div>
                <span className="text-gray-400">Próximo: </span>
                <span className={`font-semibold ${colorDias(diasMant)}`}>
                  {equipoSeleccionado.fecha_proximo_mantenimiento
                    ? `${equipoSeleccionado.fecha_proximo_mantenimiento} ${diasMant !== null ? `(${diasMant < 0 ? `vencido hace ${Math.abs(diasMant)}d` : `en ${diasMant}d`})` : ''}`
                    : '—'}
                </span>
              </div>
            </div>
            {diasMant !== null && diasMant < 0 && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold">
                ⚠️ Mantenimiento preventivo vencido — requiere atención inmediata
              </div>
            )}
            {diasMant !== null && diasMant >= 0 && diasMant <= 30 && (
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-semibold">
                ⏰ Mantenimiento preventivo en {diasMant} días
              </div>
            )}
          </div>

          {/* Calibración */}
          {(equipoSeleccionado.fecha_ultima_calibracion || equipoSeleccionado.fecha_proxima_calibracion) && (
            <div className="card">
              <div className="section-title mb-3">Calibración</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Última: </span><span className="font-semibold">{equipoSeleccionado.fecha_ultima_calibracion || '—'}</span></div>
                <div>
                  <span className="text-gray-400">Próxima: </span>
                  <span className={`font-semibold ${colorDias(diasCal)}`}>
                    {equipoSeleccionado.fecha_proxima_calibracion
                      ? `${equipoSeleccionado.fecha_proxima_calibracion} ${diasCal !== null ? `(${diasCal < 0 ? 'vencida' : `en ${diasCal}d`})` : ''}`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Observaciones */}
          {equipoSeleccionado.observaciones && (
            <div className="card">
              <div className="section-title mb-2">Observaciones</div>
              <div className="text-xs text-gray-600">{equipoSeleccionado.observaciones}</div>
            </div>
          )}

          {/* Historial */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="section-title">Historial de mantenimientos</div>
              <span className="badge bg-gray-100 text-gray-600">{historial.length}</span>
            </div>
            {historial.length === 0 && (
              <div className="text-xs text-gray-400 text-center py-4">Sin registros de mantenimiento aún</div>
            )}
            {historial.map(h => (
              <div key={h.id} className="py-3 border-b border-gray-50 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold">{new Date(h.fecha).toLocaleDateString('es-ES')} — {TIPOS_MANTENIMIENTO.find(t => t.value === h.tipo)?.label}</div>
                    {h.descripcion && <div className="text-xs text-gray-500 mt-0.5">{h.descripcion}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {h.empresa && <span>{h.empresa}</span>}
                      {h.tecnico && <span> · {h.tecnico}</span>}
                      {h.coste && <span> · {h.coste}€</span>}
                    </div>
                  </div>
                  <span className={`badge text-xs flex-shrink-0 ${h.resultado === 'correcto' ? 'bg-green-100 text-green-700' : h.resultado === 'con_incidencias' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {h.resultado === 'correcto' ? 'Correcto' : h.resultado === 'con_incidencias' ? 'Con incidencias' : 'Retirado'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button className="btn-secondary"
            onClick={() => { setEquipoSeleccionado(prev => ({...prev!})); setVista('nuevo') }}>
            ✏️ Editar equipo
          </button>
        </div>
      </div>
    )
  }

  // ============================================================
  // VISTA REGISTRAR MANTENIMIENTO
  // ============================================================
  if (vista === 'mantenimiento' && equipoSeleccionado) {
    return (
      <div className="page">
        <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
          <button onClick={() => setVista('detalle')} className="text-blue-700 text-sm font-medium">← Volver</button>
          <span className="font-semibold text-sm flex-1 text-center">Registrar mantenimiento</span>
        </div>
        <div className="content">
          <div className="card bg-blue-50 border-blue-100">
            <div className="text-xs font-semibold text-blue-800">{equipoSeleccionado.nombre}</div>
            <div className="text-xs text-blue-600">{equipoSeleccionado.marca} {equipoSeleccionado.modelo} · {equipoSeleccionado.numero_censo || equipoSeleccionado.numero_serie || ''}</div>
          </div>

          <div className="card">
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Tipo de mantenimiento *</label>
                <select className="input" value={mant.tipo} onChange={e => setMant({...mant, tipo: e.target.value})}>
                  {TIPOS_MANTENIMIENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fecha *</label>
                <input className="input" type="date" value={mant.fecha} onChange={e => setMant({...mant, fecha: e.target.value})} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input resize-none" rows={3} placeholder="Describe las tareas realizadas..."
                  value={mant.descripcion} onChange={e => setMant({...mant, descripcion: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Empresa</label>
                  <input className="input" placeholder="Empresa de mantenimiento"
                    value={mant.empresa} onChange={e => setMant({...mant, empresa: e.target.value})} />
                </div>
                <div>
                  <label className="label">Técnico</label>
                  <input className="input" placeholder="Nombre del técnico"
                    value={mant.tecnico} onChange={e => setMant({...mant, tecnico: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Coste (€)</label>
                  <input className="input" type="number" placeholder="0.00"
                    value={mant.coste} onChange={e => setMant({...mant, coste: e.target.value})} />
                </div>
                <div>
                  <label className="label">Resultado *</label>
                  <select className="input" value={mant.resultado} onChange={e => setMant({...mant, resultado: e.target.value})}>
                    <option value="correcto">Correcto</option>
                    <option value="con_incidencias">Con incidencias</option>
                    <option value="equipo_retirado">Equipo retirado</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn-primary flex-1" onClick={guardarMantenimiento} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Registrar mantenimiento'}
                </button>
                <button className="btn-secondary" onClick={() => setVista('detalle')}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // VISTA NUEVO / EDITAR EQUIPO
  // ============================================================
  if (vista === 'nuevo') {
    const isEditing = !!equipoSeleccionado && vista === 'nuevo'
    const f = isEditing ? equipoSeleccionado : form
    const setF = isEditing
      ? (v: any) => setEquipoSeleccionado(v)
      : (v: any) => setForm(v)

    return (
      <div className="page">
        <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
          <button onClick={() => { setVista(isEditing ? 'detalle' : 'lista'); if (!isEditing) setForm(formInicial) }}
            className="text-blue-700 text-sm font-medium">← Volver</button>
          <span className="font-semibold text-sm flex-1 text-center">
            {isEditing ? 'Editar equipo' : 'Nuevo equipo'}
          </span>
        </div>
        <div className="content">

          {/* IDENTIFICACIÓN */}
          <div className="card">
            <div className="section-title mb-3">Identificación</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre del equipo *</label>
                <input className="input" placeholder="Ej: Monitor/Desfibrilador UCI-01"
                  value={f.nombre} onChange={e => setF({...f, nombre: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Marca</label>
                  <input className="input" placeholder="Ej: Zoll, Philips..."
                    value={f.marca || ''} onChange={e => setF({...f, marca: e.target.value})} />
                </div>
                <div>
                  <label className="label">Modelo</label>
                  <input className="input" placeholder="Ej: X Series"
                    value={f.modelo || ''} onChange={e => setF({...f, modelo: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">N° de censo</label>
                  <input className="input" placeholder="CEN-2024-0001"
                    value={f.numero_censo || ''} onChange={e => setF({...f, numero_censo: e.target.value})} />
                </div>
                <div>
                  <label className="label">N° de serie</label>
                  <input className="input" placeholder="SN-00000"
                    value={f.numero_serie || ''} onChange={e => setF({...f, numero_serie: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Código de barras</label>
                <input className="input" placeholder="Escanea o escribe el código"
                  value={f.codigo_barras || ''} onChange={e => setF({...f, codigo_barras: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoría</label>
                  <select className="input" value={f.categoria} onChange={e => setF({...f, categoria: e.target.value})}>
                    {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input" value={f.estado} onChange={e => setF({...f, estado: e.target.value})}>
                    {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* UBICACIÓN */}
          <div className="card">
            <div className="section-title mb-3">Ubicación</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Servicio / Unidad</label>
                <select className="input" value={f.servicio_id || ''} onChange={e => setF({...f, servicio_id: e.target.value})}>
                  <option value="">Sin servicio asignado</option>
                  {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Carro asociado <span className="text-gray-400">(opcional)</span></label>
                <select className="input" value={f.carro_id || ''} onChange={e => setF({...f, carro_id: e.target.value})}>
                  <option value="">Sin carro asignado</option>
                  {carros.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* FECHAS */}
          <div className="card">
            <div className="section-title mb-3">Fechas</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Fecha adquisición</label>
                <input className="input" type="date" value={f.fecha_adquisicion || ''} onChange={e => setF({...f, fecha_adquisicion: e.target.value})} />
              </div>
              <div>
                <label className="label">Fecha fabricación</label>
                <input className="input" type="date" value={f.fecha_fabricacion || ''} onChange={e => setF({...f, fecha_fabricacion: e.target.value})} />
              </div>
              <div>
                <label className="label">Garantía hasta</label>
                <input className="input" type="date" value={f.fecha_garantia_hasta || ''} onChange={e => setF({...f, fecha_garantia_hasta: e.target.value})} />
              </div>
            </div>
          </div>

          {/* MANTENIMIENTO */}
          <div className="card">
            <div className="section-title mb-3">Mantenimiento preventivo</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Empresa de mantenimiento</label>
                <input className="input" placeholder="Ej: Zoll Medical Iberia"
                  value={f.empresa_mantenimiento || ''} onChange={e => setF({...f, empresa_mantenimiento: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Contacto</label>
                  <input className="input" placeholder="Teléfono o email"
                    value={f.contacto_mantenimiento || ''} onChange={e => setF({...f, contacto_mantenimiento: e.target.value})} />
                </div>
                <div>
                  <label className="label">N° contrato</label>
                  <input className="input" placeholder="CONT-2024-001"
                    value={f.numero_contrato || ''} onChange={e => setF({...f, numero_contrato: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Frecuencia de mantenimiento</label>
                <select className="input" value={f.frecuencia_mantenimiento} onChange={e => setF({...f, frecuencia_mantenimiento: e.target.value})}>
                  {FRECUENCIAS.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Último mantenimiento</label>
                  <input className="input" type="date" value={f.fecha_ultimo_mantenimiento || ''} onChange={e => setF({...f, fecha_ultimo_mantenimiento: e.target.value})} />
                </div>
                <div>
                  <label className="label">Próximo mantenimiento</label>
                  <input className="input" type="date" value={f.fecha_proximo_mantenimiento || ''} onChange={e => setF({...f, fecha_proximo_mantenimiento: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          {/* CALIBRACIÓN */}
          <div className="card">
            <div className="section-title mb-3">Calibración <span className="text-gray-400 text-xs font-normal">(si aplica)</span></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Última calibración</label>
                <input className="input" type="date" value={f.fecha_ultima_calibracion || ''} onChange={e => setF({...f, fecha_ultima_calibracion: e.target.value})} />
              </div>
              <div>
                <label className="label">Próxima calibración</label>
                <input className="input" type="date" value={f.fecha_proxima_calibracion || ''} onChange={e => setF({...f, fecha_proxima_calibracion: e.target.value})} />
              </div>
            </div>
          </div>

          {/* OBSERVACIONES */}
          <div className="card">
            <div className="section-title mb-3">Observaciones</div>
            <textarea className="input resize-none" rows={3}
              placeholder="Notas adicionales sobre el equipo..."
              value={f.observaciones || ''} onChange={e => setF({...f, observaciones: e.target.value})} />
          </div>

          <div className="flex gap-2">
            <button className="btn-primary flex-1"
              onClick={isEditing ? guardarEdicion : guardarEquipo}
              disabled={guardando}>
              {guardando ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Registrar equipo'}
            </button>
            <button className="btn-secondary"
              onClick={() => { setVista(isEditing ? 'detalle' : 'lista'); if (!isEditing) setForm(formInicial) }}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // VISTA LISTA
  // ============================================================
  return (
    <div className="page">
      <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
          <div className="min-w-0">
            <div className="text-xs text-gray-400 leading-none truncate">{hospital?.nombre}</div>
            <div className="font-semibold text-sm">Inventario de Equipos</div>
          </div>
        </div>
        <button onClick={() => { setEquipoSeleccionado(null); setForm(formInicial); setVista('nuevo') }}
          className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">
          + Nuevo equipo
        </button>
      </div>

      <div className="content">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-2">
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-blue-700">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-green-700">{stats.operativos}</div>
            <div className="text-xs text-gray-500 mt-0.5">Operativos</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-amber-600">{stats.mantenimiento}</div>
            <div className="text-xs text-gray-500 mt-0.5">En mant.</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-red-600">{stats.vencidos}</div>
            <div className="text-xs text-gray-500 mt-0.5">Mant. vencido</div>
          </div>
        </div>

        {/* Buscador */}
        <input className="input" placeholder="Buscar por nombre, censo, serie o marca..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />

        {/* Filtros estado */}
        <div className="flex gap-1.5 flex-wrap">
          {[['todos','Todos'], ...ESTADOS.map(e => [e.value, e.label])].map(([val, label]) => (
            <button key={val} onClick={() => setFiltroEstado(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroEstado === val ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Filtros categoría */}
        <div className="flex gap-1.5 flex-wrap">
          {[['todos','Todas'], ...CATEGORIAS.map(c => [c.value, c.label])].map(([val, label]) => (
            <button key={val} onClick={() => setFiltroCategoria(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroCategoria === val ? 'bg-gray-200 text-gray-700 border-gray-300' : 'bg-white text-gray-400 border-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="card">
          <div className="section-title mb-3">
            {equiposFiltrados.length} equipo{equiposFiltrados.length !== 1 ? 's' : ''}
            {equiposFiltrados.length !== equipos.length ? ` de ${equipos.length}` : ''}
          </div>
          {equiposFiltrados.length === 0 && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🔧</div>
              <div className="text-sm font-semibold text-gray-600">
                {equipos.length === 0 ? 'Sin equipos registrados' : 'Sin resultados'}
              </div>
              {equipos.length === 0 && (
                <button className="btn-primary mt-3" onClick={() => setVista('nuevo')}>
                  + Registrar primer equipo
                </button>
              )}
            </div>
          )}
          {equiposFiltrados.map(e => {
            const diasMant = diasHasta(e.fecha_proximo_mantenimiento)
            const mantVencido = diasMant !== null && diasMant < 0
            const mantProximo = diasMant !== null && diasMant >= 0 && diasMant <= 30
            return (
              <div key={e.id} className="row-item cursor-pointer"
                onClick={async () => {
                  setEquipoSeleccionado(e)
                  await cargarHistorial(e.id)
                  setVista('detalle')
                }}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  e.estado === 'operativo' ? 'bg-green-500'
                  : e.estado === 'en_mantenimiento' ? 'bg-amber-500'
                  : e.estado === 'fuera_de_servicio' ? 'bg-red-500'
                  : 'bg-gray-300'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{e.nombre}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                    <span>{e.marca} {e.modelo}</span>
                    {e.numero_censo && <span>· {e.numero_censo}</span>}
                    {(e.servicios as any)?.nombre && <span>· {(e.servicios as any).nombre}</span>}
                    {mantVencido && <span className="text-red-600 font-semibold">· Mant. vencido</span>}
                    {!mantVencido && mantProximo && <span className="text-amber-600 font-semibold">· Mant. en {diasMant}d</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`badge text-xs ${estadoBadge(e.estado)}`}>{estadoLabel(e.estado)}</span>
                  <span className="badge bg-gray-100 text-gray-500 text-xs">{CATEGORIAS.find(c => c.value === e.categoria)?.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

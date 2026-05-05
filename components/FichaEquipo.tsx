'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'

// =====================================================================
// Tipos
// =====================================================================

export interface EquipoCompleto {
  id: string
  hospital_id: string
  servicio_id: string | null
  carro_id: string | null
  cajon_id: string | null
  nombre: string
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  numero_censo: string | null
  codigo_barras: string | null
  categoria: string | null
  categoria_id: string | null
  estado: string
  foto_url: string | null
  indispensable: boolean
  fecha_adquisicion: string | null
  fecha_fabricacion: string | null
  fecha_ultimo_mantenimiento: string | null
  fecha_proximo_mantenimiento: string | null
  fecha_ultima_calibracion: string | null
  fecha_proxima_calibracion: string | null
  fecha_garantia_hasta: string | null
  empresa_mantenimiento: string | null
  contacto_mantenimiento: string | null
  numero_contrato: string | null
  frecuencia_mantenimiento: string | null
  observaciones: string | null
  activo: boolean
  creado_en: string | null
  servicios?: { nombre: string } | null
  carros?: { codigo: string; nombre: string } | null
  cajones?: { nombre: string } | null
}

interface Mantenimiento {
  id: string
  tipo: string
  fecha: string
  descripcion: string | null
  empresa: string | null
  tecnico: string | null
  coste: number | null
  resultado: string
  creado_en: string
}

interface CategoriaEquipo {
  id: string
  nombre: string
  hospital_id: string | null
  favorita: boolean
  orden_grupo: number
}

// =====================================================================
// Constantes
// =====================================================================

export const ROLES_EDICION = ['administrador', 'supervisor', 'superadmin']

const ESTADOS = [
  { value: 'operativo',         label: 'Operativo',         color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'en_mantenimiento',  label: 'En mantenimiento',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'fuera_de_servicio', label: 'Fuera de servicio', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'baja',              label: 'Baja',              color: 'bg-gray-100 text-gray-500 border-gray-200' },
]

const TIPOS_MANTENIMIENTO = [
  { value: 'preventivo',   label: 'Preventivo' },
  { value: 'correctivo',   label: 'Correctivo' },
  { value: 'calibracion',  label: 'Calibración' },
  { value: 'revision',     label: 'Revisión' },
  { value: 'reasignacion', label: 'Reasignación' },
  { value: 'baja',         label: 'Baja del equipo' },
]

const SUGERENCIAS_FRECUENCIA = [
  'Mensual', 'Bimestral', 'Trimestral', 'Semestral',
  'Anual', 'Bienal', 'Cada 2 años', 'Según fabricante',
]

// =====================================================================
// Utilidades
// =====================================================================

function diasHasta(fecha?: string | null): number | null {
  if (!fecha) return null
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000)
}

function colorDias(dias: number | null): string {
  if (dias === null) return 'text-gray-400'
  if (dias < 0) return 'text-red-600 font-semibold'
  if (dias <= 30) return 'text-amber-600 font-semibold'
  return 'text-green-600'
}

function labelDias(dias: number | null, fecha: string): string {
  if (dias === null) return fecha
  if (dias < 0) return `${fecha} (vencido hace ${Math.abs(dias)}d)`
  if (dias === 0) return `${fecha} (hoy)`
  return `${fecha} (en ${dias}d)`
}

function estadoBadgeColor(estado: string): string {
  return ESTADOS.find(e => e.value === estado)?.color || 'bg-gray-100 text-gray-500 border-gray-200'
}

function estadoLabel(estado: string): string {
  return ESTADOS.find(e => e.value === estado)?.label || estado
}

// =====================================================================
// Hook: categorías del hospital
// =====================================================================

function useCategorias(hospitalId: string | null) {
  const [categorias, setCategorias] = useState<CategoriaEquipo[]>([])
  const supabase = createClient()

  const cargar = useCallback(async () => {
    if (!hospitalId) return
    const { data } = await supabase
      .from('v_categorias_por_hospital')
      .select('*')
      .or(`hospital_id.is.null,hospital_id.eq.${hospitalId}`)
      .eq('visible', true)
      .order('orden_grupo')
      .order('nombre')
    setCategorias(data || [])
  }, [hospitalId, supabase])

  useEffect(() => { cargar() }, [cargar])
  return { categorias, recargar: cargar }
}

// =====================================================================
// Props del componente
// =====================================================================

interface Props {
  equipoId: string
  rol: string
  onVolver?: () => void   // si se usa embebido en lugar de como página
}

// =====================================================================
// Componente FichaEquipo
// =====================================================================

export default function FichaEquipo({ equipoId, rol, onVolver }: Props) {
  const [equipo, setEquipo] = useState<EquipoCompleto | null>(null)
  const [historial, setHistorial] = useState<Mantenimiento[]>([])
  const [servicios, setServicios] = useState<any[]>([])
  const [carros, setCarros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [escaneando, setEscaneando] = useState(false)
  const [campoEscaneo, setCampoEscaneo] = useState<'censo' | 'barras' | 'serie'>('barras')
  const [mostrarFormMant, setMostrarFormMant] = useState(false)
  const [formEdit, setFormEdit] = useState<EquipoCompleto | null>(null)
  const [perfil, setPerfil] = useState<any>(null)

  const fotoRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const puedeEditar = ROLES_EDICION.includes(rol)
  const { categorias } = useCategorias(equipo?.hospital_id || null)

  const formMantInicial = {
    tipo: 'preventivo',
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '', empresa: '', tecnico: '', coste: '', resultado: 'correcto',
  }
  const [formMant, setFormMant] = useState(formMantInicial)

  useEffect(() => { cargarTodo() }, [equipoId])

  async function cargarTodo() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(p)
      if (p?.hospital_id) {
        const [sv, cr] = await Promise.all([
          supabase.from('servicios').select('id,nombre').eq('hospital_id', p.hospital_id).eq('activo', true).order('nombre'),
          supabase.from('carros').select('id,codigo,nombre').eq('hospital_id', p.hospital_id).eq('activo', true).order('codigo'),
        ])
        setServicios(sv.data || [])
        setCarros(cr.data || [])
      }
    }

    const { data: eq } = await supabase
      .from('equipos')
      .select('*, servicios(nombre), carros(codigo, nombre), cajones(nombre)')
      .eq('id', equipoId)
      .single()

    const { data: hist } = await supabase
      .from('historial_mantenimientos')
      .select('*')
      .eq('equipo_id', equipoId)
      .order('fecha', { ascending: false })

    setEquipo(eq || null)
    setFormEdit(eq || null)
    setHistorial(hist || [])
    setLoading(false)
  }

  async function guardarEdicion() {
    if (!formEdit || !equipo) return
    setGuardando(true)
    const catNombre = formEdit.categoria_id
      ? (categorias.find(c => c.id === formEdit.categoria_id)?.nombre || formEdit.categoria)
      : formEdit.categoria

    const payload: any = {
      nombre: formEdit.nombre,
      marca: formEdit.marca || null,
      modelo: formEdit.modelo || null,
      numero_serie: formEdit.numero_serie || null,
      numero_censo: formEdit.numero_censo || null,
      codigo_barras: formEdit.codigo_barras || null,
      categoria_id: formEdit.categoria_id || null,
      categoria: catNombre || null,
      estado: formEdit.estado,
      indispensable: formEdit.indispensable,
      servicio_id: formEdit.servicio_id || null,
      carro_id: formEdit.carro_id || null,
      empresa_mantenimiento: formEdit.empresa_mantenimiento || null,
      contacto_mantenimiento: formEdit.contacto_mantenimiento || null,
      numero_contrato: formEdit.numero_contrato || null,
      frecuencia_mantenimiento: formEdit.frecuencia_mantenimiento || null,
      observaciones: formEdit.observaciones || null,
    }

    const fechas = [
      'fecha_adquisicion', 'fecha_fabricacion',
      'fecha_ultimo_mantenimiento', 'fecha_proximo_mantenimiento',
      'fecha_ultima_calibracion', 'fecha_proxima_calibracion',
      'fecha_garantia_hasta',
    ] as const
    fechas.forEach(f => { payload[f] = (formEdit as any)[f] || null })

    const { error } = await supabase.from('equipos').update(payload).eq('id', equipo.id)
    if (error) { toast.error('Error al guardar: ' + error.message); setGuardando(false); return }
    toast.success('Equipo actualizado')
    setEditando(false)
    await cargarTodo()
    setGuardando(false)
  }

  async function guardarMantenimiento() {
    if (!equipo || !formMant.fecha) { toast.error('La fecha es obligatoria'); return }
    setGuardando(true)
    const { error } = await supabase.from('historial_mantenimientos').insert({
      equipo_id: equipo.id,
      tipo: formMant.tipo,
      fecha: formMant.fecha,
      descripcion: formMant.descripcion || null,
      empresa: formMant.empresa || null,
      tecnico: formMant.tecnico || null,
      coste: formMant.coste ? parseFloat(formMant.coste) : null,
      resultado: formMant.resultado,
      creado_por: perfil?.id || null,
    })
    if (error) { toast.error('Error al registrar mantenimiento'); setGuardando(false); return }

    await supabase.from('equipos')
      .update({ fecha_ultimo_mantenimiento: formMant.fecha })
      .eq('id', equipo.id)

    toast.success('Mantenimiento registrado')
    setFormMant(formMantInicial)
    setMostrarFormMant(false)
    await cargarTodo()
    setGuardando(false)
  }

  async function subirFoto(file: File) {
    if (!equipo) return
    setSubiendoFoto(true)
    const ext = file.name.split('.').pop()
    const path = `equipos/${equipo.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('evidencias').upload(path, file, { upsert: true })
    if (error) { toast.error('Error al subir foto'); setSubiendoFoto(false); return }
    const { data: url } = supabase.storage.from('evidencias').getPublicUrl(path)
    await supabase.from('equipos').update({ foto_url: url.publicUrl }).eq('id', equipo.id)
    toast.success('Foto actualizada')
    await cargarTodo()
    setSubiendoFoto(false)
  }

  function handleEscaneo(codigo: string) {
    setEscaneando(false)
    if (!formEdit) return
    if (campoEscaneo === 'barras') {
      setFormEdit(f => f ? { ...f, codigo_barras: codigo } : f)
    } else if (campoEscaneo === 'serie') {
      setFormEdit(f => f ? { ...f, numero_serie: codigo } : f)
    } else {
      setFormEdit(f => f ? { ...f, numero_censo: codigo } : f)
    }
    toast.success('Código leído: ' + codigo)
  }

  function volver() {
    if (onVolver) { onVolver(); return }
    router.back()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando ficha...</div>
    </div>
  )

  if (!equipo) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl mb-2">⚠️</div>
        <div className="text-sm text-gray-600 font-semibold">Equipo no encontrado</div>
        <button onClick={volver} className="btn-secondary mt-3">← Volver</button>
      </div>
    </div>
  )

  const diasMant = diasHasta(equipo.fecha_proximo_mantenimiento)
  const diasCal  = diasHasta(equipo.fecha_proxima_calibracion)
  const diasGar  = diasHasta(equipo.fecha_garantia_hasta)

  const catsFav      = categorias.filter(c => c.favorita)
  const catsPropias  = categorias.filter(c => !c.favorita && c.hospital_id !== null)
  const catsGlobales = categorias.filter(c => !c.favorita && c.hospital_id === null)

  // ================================================================
  // MODO EDICIÓN
  // ================================================================
  if (editando && formEdit && puedeEditar) {
    return (
      <div className="page">
        {escaneando && (
          <EscanerCodigoBarras
            onResult={handleEscaneo}
            onClose={() => setEscaneando(false)}
          />
        )}

        <div className="topbar">
          <button onClick={() => { setEditando(false); setFormEdit(equipo) }}
            className="text-blue-700 text-sm font-medium">← Cancelar</button>
          <span className="font-semibold text-sm flex-1 text-center">Editar equipo</span>
          <button onClick={guardarEdicion} disabled={guardando}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
            {guardando ? '...' : 'Guardar'}
          </button>
        </div>

        <div className="content">
          {/* Identificación */}
          <div className="card">
            <div className="section-title mb-3">Identificación</div>
            <div className="flex flex-col gap-3">
              <Campo label="Nombre *" value={formEdit.nombre}
                onChange={v => setFormEdit(f => f ? { ...f, nombre: v } : f)} />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Marca" value={formEdit.marca || ''}
                  onChange={v => setFormEdit(f => f ? { ...f, marca: v } : f)} />
                <Campo label="Modelo" value={formEdit.modelo || ''}
                  onChange={v => setFormEdit(f => f ? { ...f, modelo: v } : f)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">N° de censo</label>
                  <div className="flex gap-1.5">
                    <input className="input flex-1" value={formEdit.numero_censo || ''}
                      onChange={e => setFormEdit(f => f ? { ...f, numero_censo: e.target.value } : f)} />
                    <button onClick={() => { setCampoEscaneo('censo'); setEscaneando(true) }}
                      className="px-2 py-2 bg-gray-900 text-white rounded-xl text-xs">📷</button>
                  </div>
                </div>
                <div>
                  <label className="label">N° de serie</label>
                  <div className="flex gap-1.5">
                    <input className="input flex-1" value={formEdit.numero_serie || ''}
                      onChange={e => setFormEdit(f => f ? { ...f, numero_serie: e.target.value } : f)} />
                    <button type="button" onClick={() => { setCampoEscaneo('serie'); setEscaneando(true) }}
                      className="px-2 py-2 bg-gray-900 text-white rounded-xl text-xs" title="Escanear">📷</button>
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Código de barras</label>
                <div className="flex gap-2">
                  <input className="input flex-1" value={formEdit.codigo_barras || ''}
                    onChange={e => setFormEdit(f => f ? { ...f, codigo_barras: e.target.value } : f)} />
                  <button onClick={() => { setCampoEscaneo('barras'); setEscaneando(true) }}
                    className="px-3 py-2 bg-gray-900 text-white rounded-xl text-xs">📷</button>
                </div>
              </div>

              {/* Categoría dinámica */}
              <div>
                <label className="label">Categoría</label>
                <select className="input"
                  value={formEdit.categoria_id || ''}
                  onChange={e => {
                    const cat = categorias.find(c => c.id === e.target.value)
                    setFormEdit(f => f ? { ...f, categoria_id: e.target.value, categoria: cat?.nombre || '' } : f)
                  }}>
                  <option value="">Sin categoría</option>
                  {catsFav.length > 0 && (
                    <optgroup label="⭐ Favoritas">
                      {catsFav.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </optgroup>
                  )}
                  {catsPropias.length > 0 && (
                    <optgroup label="🏥 De este hospital">
                      {catsPropias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </optgroup>
                  )}
                  {catsGlobales.length > 0 && (
                    <optgroup label="🌐 Globales del sistema">
                      {catsGlobales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="label">Estado</label>
                <select className="input" value={formEdit.estado}
                  onChange={e => setFormEdit(f => f ? { ...f, estado: e.target.value } : f)}>
                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={formEdit.indispensable} className="w-4 h-4"
                  onChange={e => setFormEdit(f => f ? { ...f, indispensable: e.target.checked } : f)} />
                <div>
                  <div className="text-xs font-semibold text-red-700">Equipo indispensable en su ubicación</div>
                  <div className="text-xs text-red-600">Al moverlo se genera alerta crítica automática.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Ubicación */}
          <div className="card">
            <div className="section-title mb-3">Ubicación</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Servicio / Unidad</label>
                <select className="input" value={formEdit.servicio_id || ''}
                  onChange={e => setFormEdit(f => f ? { ...f, servicio_id: e.target.value || null } : f)}>
                  <option value="">Sin servicio</option>
                  {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Carro asociado</label>
                <select className="input" value={formEdit.carro_id || ''}
                  onChange={e => setFormEdit(f => f ? { ...f, carro_id: e.target.value || null } : f)}>
                  <option value="">Sin carro</option>
                  {carros.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Fechas */}
          <div className="card">
            <div className="section-title mb-3">Fechas</div>
            <div className="grid grid-cols-2 gap-3">
              <CampoFecha label="Adquisición" value={formEdit.fecha_adquisicion || ''}
                onChange={v => setFormEdit(f => f ? { ...f, fecha_adquisicion: v || null } : f)} />
              <CampoFecha label="Fabricación" value={formEdit.fecha_fabricacion || ''}
                onChange={v => setFormEdit(f => f ? { ...f, fecha_fabricacion: v || null } : f)} />
              <CampoFecha label="Garantía hasta" value={formEdit.fecha_garantia_hasta || ''}
                onChange={v => setFormEdit(f => f ? { ...f, fecha_garantia_hasta: v || null } : f)} />
            </div>
          </div>

          {/* Mantenimiento */}
          <div className="card">
            <div className="section-title mb-3">Mantenimiento preventivo</div>
            <div className="flex flex-col gap-3">
              <Campo label="Empresa" value={formEdit.empresa_mantenimiento || ''}
                onChange={v => setFormEdit(f => f ? { ...f, empresa_mantenimiento: v } : f)} />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Contacto" value={formEdit.contacto_mantenimiento || ''}
                  onChange={v => setFormEdit(f => f ? { ...f, contacto_mantenimiento: v } : f)} />
                <Campo label="N° contrato" value={formEdit.numero_contrato || ''}
                  onChange={v => setFormEdit(f => f ? { ...f, numero_contrato: v } : f)} />
              </div>
              <div>
                <label className="label">Frecuencia</label>
                <input className="input" list="frecuencias-ficha"
                  value={formEdit.frecuencia_mantenimiento || ''}
                  placeholder="Ej: Anual, Semestral..."
                  onChange={e => setFormEdit(f => f ? { ...f, frecuencia_mantenimiento: e.target.value } : f)} />
                <datalist id="frecuencias-ficha">
                  {SUGERENCIAS_FRECUENCIA.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CampoFecha label="Último mantenimiento" value={formEdit.fecha_ultimo_mantenimiento || ''}
                  onChange={v => setFormEdit(f => f ? { ...f, fecha_ultimo_mantenimiento: v || null } : f)} />
                <CampoFecha label="Próximo mantenimiento" value={formEdit.fecha_proximo_mantenimiento || ''}
                  onChange={v => setFormEdit(f => f ? { ...f, fecha_proximo_mantenimiento: v || null } : f)} />
              </div>
            </div>
          </div>

          {/* Calibración */}
          <div className="card">
            <div className="section-title mb-3">Calibración</div>
            <div className="grid grid-cols-2 gap-3">
              <CampoFecha label="Última calibración" value={formEdit.fecha_ultima_calibracion || ''}
                onChange={v => setFormEdit(f => f ? { ...f, fecha_ultima_calibracion: v || null } : f)} />
              <CampoFecha label="Próxima calibración" value={formEdit.fecha_proxima_calibracion || ''}
                onChange={v => setFormEdit(f => f ? { ...f, fecha_proxima_calibracion: v || null } : f)} />
            </div>
          </div>

          {/* Observaciones */}
          <div className="card">
            <div className="section-title mb-3">Observaciones</div>
            <textarea className="input resize-none" rows={3}
              value={formEdit.observaciones || ''}
              onChange={e => setFormEdit(f => f ? { ...f, observaciones: e.target.value } : f)} />
          </div>

          <div className="flex gap-2">
            <button onClick={guardarEdicion} disabled={guardando} className="btn-primary flex-1">
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button onClick={() => { setEditando(false); setFormEdit(equipo) }} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ================================================================
  // MODO LECTURA (todas las vistas)
  // ================================================================
  return (
    <div className="page">
      <div className="topbar">
        <button onClick={volver} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center truncate">{equipo.nombre}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => router.push(`/admin/equipos/${equipoId}/pdf`)}
            className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg font-semibold border border-gray-200 active:bg-gray-200">
            🖨️ PDF
          </button>
          {puedeEditar && (
            <button onClick={() => setEditando(true)}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">
              ✏️ Editar
            </button>
          )}
        </div>
      </div>

      <div className="content">
        {/* Cabecera */}
        <div className="card">
          <div className="flex gap-3 mb-3">
            <div className="w-20 h-20 rounded-xl border border-gray-100 overflow-hidden flex-shrink-0 bg-gray-50 flex items-center justify-center">
              {equipo.foto_url
                ? <img src={equipo.foto_url} alt={equipo.nombre} className="w-full h-full object-cover" />
                : <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeWidth={2} />
                  </svg>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base leading-tight">{equipo.nombre}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {[equipo.marca, equipo.modelo].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`badge text-xs border ${estadoBadgeColor(equipo.estado)}`}>
                  {estadoLabel(equipo.estado)}
                </span>
                {equipo.categoria && (
                  <span className="badge bg-gray-100 text-gray-600 text-xs border border-gray-200">
                    {equipo.categoria}
                  </span>
                )}
                {equipo.indispensable && (
                  <span className="badge bg-red-100 text-red-700 text-xs border border-red-200 font-semibold">
                    ★ Indispensable
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Foto — solo admins/supervisors pueden cambiarla */}
          {puedeEditar && (
            <>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f) }} />
              <button onClick={() => fotoRef.current?.click()} disabled={subiendoFoto}
                className="btn-secondary text-xs w-full">
                {subiendoFoto ? 'Subiendo...' : equipo.foto_url ? '📷 Cambiar foto' : '📷 Añadir foto'}
              </button>
            </>
          )}
        </div>

        {/* Alertas de mantenimiento */}
        {diasMant !== null && diasMant < 0 && (
          <div className="card bg-red-50 border-red-200">
            <div className="text-xs text-red-700 font-semibold">
              ⚠️ Mantenimiento vencido hace {Math.abs(diasMant)} días — requiere atención inmediata
            </div>
          </div>
        )}
        {diasMant !== null && diasMant >= 0 && diasMant <= 30 && (
          <div className="card bg-amber-50 border-amber-200">
            <div className="text-xs text-amber-700 font-semibold">
              ⏰ Mantenimiento preventivo en {diasMant} días
            </div>
          </div>
        )}

        {/* Identificación */}
        <div className="card">
          <div className="section-title mb-3">Identificación</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
            <FilaCampo label="N° censo" valor={equipo.numero_censo} />
            <FilaCampo label="N° serie" valor={equipo.numero_serie} />
            <FilaCampo label="Código barras" valor={equipo.codigo_barras} />
            <FilaCampo label="Servicio" valor={(equipo.servicios as any)?.nombre} />
            <FilaCampo label="Carro" valor={(equipo.carros as any)?.codigo} />
            <FilaCampo label="Cajón" valor={(equipo.cajones as any)?.nombre} />
            <FilaCampo label="Adquisición" valor={equipo.fecha_adquisicion} />
            <FilaCampo label="Fabricación" valor={equipo.fecha_fabricacion} />
            <div className="col-span-2">
              <span className="text-gray-400">Garantía hasta: </span>
              <span className={`font-semibold ${colorDias(diasGar)}`}>
                {equipo.fecha_garantia_hasta
                  ? labelDias(diasGar, equipo.fecha_garantia_hasta)
                  : '—'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-400">Indispensable: </span>
              <span className={`font-semibold ${equipo.indispensable ? 'text-red-700' : 'text-gray-500'}`}>
                {equipo.indispensable ? '★ Sí — alerta al mover' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* Mantenimiento */}
        <div className="card">
          <div className="section-title mb-3">Mantenimiento preventivo</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
            <FilaCampo label="Empresa" valor={equipo.empresa_mantenimiento} />
            <FilaCampo label="Frecuencia" valor={equipo.frecuencia_mantenimiento} />
            <FilaCampo label="Contrato" valor={equipo.numero_contrato} />
            <FilaCampo label="Contacto" valor={equipo.contacto_mantenimiento} />
            <FilaCampo label="Último" valor={equipo.fecha_ultimo_mantenimiento} />
            <div>
              <span className="text-gray-400">Próximo: </span>
              <span className={`font-semibold ${colorDias(diasMant)}`}>
                {equipo.fecha_proximo_mantenimiento
                  ? labelDias(diasMant, equipo.fecha_proximo_mantenimiento)
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Calibración */}
        {(equipo.fecha_ultima_calibracion || equipo.fecha_proxima_calibracion) && (
          <div className="card">
            <div className="section-title mb-3">Calibración</div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
              <FilaCampo label="Última" valor={equipo.fecha_ultima_calibracion} />
              <div>
                <span className="text-gray-400">Próxima: </span>
                <span className={`font-semibold ${colorDias(diasCal)}`}>
                  {equipo.fecha_proxima_calibracion
                    ? labelDias(diasCal, equipo.fecha_proxima_calibracion)
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Observaciones */}
        {equipo.observaciones && (
          <div className="card">
            <div className="section-title mb-2">Observaciones</div>
            <div className="text-xs text-gray-600 leading-relaxed">{equipo.observaciones}</div>
          </div>
        )}

        {/* Historial de mantenimientos */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="section-title">Historial de mantenimientos</div>
            <span className="badge bg-gray-100 text-gray-600">{historial.length}</span>
          </div>
          {historial.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-4">Sin registros aún</div>
          )}
          {historial.map(h => (
            <div key={h.id} className="py-3 border-b border-gray-50 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold">
                    {new Date(h.fecha).toLocaleDateString('es-ES')} —{' '}
                    {TIPOS_MANTENIMIENTO.find(t => t.value === h.tipo)?.label || h.tipo}
                  </div>
                  {h.descripcion && (
                    <div className="text-xs text-gray-500 mt-0.5 leading-tight">{h.descripcion}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-1">
                    {h.empresa && <span>{h.empresa}</span>}
                    {h.tecnico && <span>· {h.tecnico}</span>}
                    {h.coste && <span>· {h.coste}€</span>}
                  </div>
                </div>
                <span className={`badge text-xs flex-shrink-0 border ${
                  h.resultado === 'correcto'
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : h.resultado === 'con_incidencias'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {h.resultado === 'correcto' ? 'Correcto'
                    : h.resultado === 'con_incidencias' ? 'Con incidencias'
                    : 'Retirado'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Formulario de mantenimiento — solo roles con edición */}
        {puedeEditar && (
          <div className="card">
            <button
              onClick={() => setMostrarFormMant(v => !v)}
              className="w-full flex items-center justify-between text-sm font-semibold text-blue-700">
              <span>+ Registrar mantenimiento</span>
              <span className="text-gray-400">{mostrarFormMant ? '▲' : '▼'}</span>
            </button>

            {mostrarFormMant && (
              <div className="mt-3 flex flex-col gap-3 pt-3 border-t border-gray-100">
                <div>
                  <label className="label">Tipo *</label>
                  <select className="input" value={formMant.tipo}
                    onChange={e => setFormMant(f => ({ ...f, tipo: e.target.value }))}>
                    {TIPOS_MANTENIMIENTO.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Fecha *</label>
                  <input className="input" type="date" value={formMant.fecha}
                    onChange={e => setFormMant(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Descripción</label>
                  <textarea className="input resize-none" rows={2} value={formMant.descripcion}
                    onChange={e => setFormMant(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Empresa</label>
                    <input className="input" value={formMant.empresa}
                      onChange={e => setFormMant(f => ({ ...f, empresa: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Técnico</label>
                    <input className="input" value={formMant.tecnico}
                      onChange={e => setFormMant(f => ({ ...f, tecnico: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Coste (€)</label>
                    <input className="input" type="number" value={formMant.coste}
                      onChange={e => setFormMant(f => ({ ...f, coste: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Resultado *</label>
                    <select className="input" value={formMant.resultado}
                      onChange={e => setFormMant(f => ({ ...f, resultado: e.target.value }))}>
                      <option value="correcto">Correcto</option>
                      <option value="con_incidencias">Con incidencias</option>
                      <option value="equipo_retirado">Equipo retirado</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={guardarMantenimiento} disabled={guardando}
                    className="btn-primary flex-1">
                    {guardando ? 'Guardando...' : 'Registrar'}
                  </button>
                  <button onClick={() => { setMostrarFormMant(false); setFormMant(formMantInicial) }}
                    className="btn-secondary">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================================
// Subcomponentes auxiliares
// =====================================================================

function FilaCampo({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <span className="text-gray-400">{label}: </span>
      <span className="font-semibold text-gray-800">{valor || '—'}</span>
    </div>
  )
}

function Campo({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="text" className="input" value={value} autoComplete="off"
        onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function CampoFecha({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="date" className="input" value={value}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}

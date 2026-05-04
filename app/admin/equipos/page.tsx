'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'
import { rutaPadre } from '@/lib/navigation'

// =====================================================================
// Tipos
// =====================================================================

interface CategoriaEquipo {
  id: string
  nombre: string
  hospital_id: string | null
  favorita: boolean
  orden_grupo: number
}

interface Equipo {
  id: string
  nombre: string
  marca?: string
  modelo?: string
  numero_serie?: string
  numero_censo?: string
  codigo_barras?: string
  categoria: string
  categoria_id?: string
  estado: string
  foto_url?: string
  servicio_id?: string
  carro_id?: string
  cajon_id?: string
  indispensable: boolean
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
  frecuencia_mantenimiento?: string
  observaciones?: string
  activo: boolean
  servicios?: { nombre: string }
  carros?: { codigo: string; nombre: string }
}

// =====================================================================
// Constantes
// =====================================================================

const ESTADOS = [
  { value: 'operativo',         label: 'Operativo',         color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'en_mantenimiento',  label: 'En mantenimiento',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'fuera_de_servicio', label: 'Fuera de servicio', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'baja',              label: 'Baja',              color: 'bg-gray-100 text-gray-500 border-gray-200' },
]

const SUGERENCIAS_FRECUENCIA = [
  'Mensual', 'Bimestral', 'Trimestral', 'Semestral',
  'Anual', 'Bienal', 'Cada 2 años', 'Según fabricante',
]

// =====================================================================
// Utilidades
// =====================================================================

function estadoBadge(estado: string): string {
  return ESTADOS.find(e => e.value === estado)?.color || 'bg-gray-100 text-gray-500 border-gray-200'
}
function estadoLabel(estado: string): string {
  return ESTADOS.find(e => e.value === estado)?.label || estado
}
function diasHasta(fecha?: string): number | null {
  if (!fecha) return null
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000)
}

// =====================================================================
// Hook categorías
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
  return { categorias }
}

// =====================================================================
// Componente principal — SOLO LISTA + FORMULARIO NUEVO
// La vista detalle/edición está en /admin/equipos/[id]
// =====================================================================

export default function EquiposPage() {
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [servicios, setServicios] = useState<any[]>([])
  const [carros, setCarros] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [escaneando, setEscaneando] = useState(false)
  const [campoEscaneo, setCampoEscaneo] = useState<'censo' | 'barras'>('barras')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroCategoriaId, setFiltroCategoriaId] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const formInicial = {
    nombre: '', marca: '', modelo: '', numero_serie: '', numero_censo: '',
    codigo_barras: '', categoria: '', categoria_id: '', estado: 'operativo',
    indispensable: false, servicio_id: '', carro_id: '',
    fecha_adquisicion: '', fecha_fabricacion: '', fecha_garantia_hasta: '',
    fecha_ultimo_mantenimiento: '', fecha_proximo_mantenimiento: '',
    fecha_ultima_calibracion: '', fecha_proxima_calibracion: '',
    empresa_mantenimiento: '', contacto_mantenimiento: '',
    numero_contrato: '', frecuencia_mantenimiento: '', observaciones: '',
  }
  const [form, setForm] = useState(formInicial)

  const { categorias } = useCategorias(perfil?.hospital_id || null)

  useHospitalTheme(hospital?.color_primario)
  const colorPrimario = hospital?.color_primario || '#1d4ed8'

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
    const { data } = await supabase.from('servicios')
      .select('id,nombre').eq('hospital_id', hospitalId).eq('activo', true).order('nombre')
    setServicios(data || [])
  }

  async function cargarCarros(hospitalId: string) {
    const { data } = await supabase.from('carros')
      .select('id,codigo,nombre').eq('hospital_id', hospitalId).eq('activo', true).order('codigo')
    setCarros(data || [])
  }

  async function guardarEquipo() {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    if (!form.categoria_id) { toast.error('La categoría es obligatoria'); return }
    setGuardando(true)
    const catNombre = categorias.find(c => c.id === form.categoria_id)?.nombre || ''
    const payload: any = {
      ...form,
      hospital_id: perfil?.hospital_id,
      creado_por: perfil?.id,
      servicio_id: form.servicio_id || null,
      carro_id: form.carro_id || null,
      categoria_id: form.categoria_id,
      categoria: catNombre,
      indispensable: form.indispensable,
    }
    const fechas = [
      'fecha_adquisicion', 'fecha_fabricacion', 'fecha_garantia_hasta',
      'fecha_ultimo_mantenimiento', 'fecha_proximo_mantenimiento',
      'fecha_ultima_calibracion', 'fecha_proxima_calibracion',
    ]
    fechas.forEach(f => { if (!payload[f]) payload[f] = null })
    delete payload.categoria_id_local

    const { data: nuevo, error } = await supabase.from('equipos').insert(payload).select('id').single()
    if (error) { toast.error('Error al guardar: ' + error.message); setGuardando(false); return }
    toast.success(`Equipo "${form.nombre}" registrado`)
    setForm(formInicial)
    setMostrarFormNuevo(false)
    await cargarEquipos(perfil?.hospital_id)
    setGuardando(false)
    // Navegar directamente a la ficha del equipo recién creado
    if (nuevo?.id) router.push(`/admin/equipos/${nuevo.id}`)
  }

  function handleEscaneo(codigo: string) {
    setEscaneando(false)
    if (campoEscaneo === 'barras') {
      setForm(prev => ({ ...prev, codigo_barras: codigo }))
    } else {
      setForm(prev => ({ ...prev, numero_censo: codigo }))
    }
    toast.success('Código leído: ' + codigo)
  }

  const equiposFiltrados = equipos.filter(e => {
    const matchEstado = filtroEstado === 'todos' || e.estado === filtroEstado
    const matchCat = filtroCategoriaId === 'todos' || e.categoria_id === filtroCategoriaId
    const matchBusqueda = !busqueda ||
      e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (e.numero_censo || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (e.numero_serie || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (e.marca || '').toLowerCase().includes(busqueda.toLowerCase())
    return matchEstado && matchCat && matchBusqueda
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

  const catsFav      = categorias.filter(c => c.favorita)
  const catsPropias  = categorias.filter(c => !c.favorita && c.hospital_id !== null)
  const catsGlobales = categorias.filter(c => !c.favorita && c.hospital_id === null)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      {escaneando && (
        <EscanerCodigoBarras onResult={handleEscaneo} onClose={() => setEscaneando(false)} />
      )}

      <div className="topbar" style={{ borderBottom: `2px solid ${colorPrimario}20` }}>
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{hospital?.nombre}</div>
          <div className="font-semibold text-sm">Inventario de Equipos</div>
        </div>
        <button
          onClick={() => setMostrarFormNuevo(v => !v)}
          style={{ background: mostrarFormNuevo ? '#6b7280' : colorPrimario }}
          className="text-xs text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0">
          {mostrarFormNuevo ? '✕ Cancelar' : '+ Nuevo'}
        </button>
      </div>

      <div className="content">
        {/* Formulario nuevo equipo (colapsable) */}
        {mostrarFormNuevo && (
          <div className="card border-blue-100 bg-blue-50">
            <div className="section-title mb-3 text-blue-800">Registrar nuevo equipo</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" placeholder="Ej: Monitor/Desfibrilador UCI-01"
                  value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Marca</label>
                  <input className="input" value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Modelo</label>
                  <input className="input" value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">N° censo</label>
                  <div className="flex gap-1.5">
                    <input className="input flex-1" value={form.numero_censo}
                      onChange={e => setForm(f => ({ ...f, numero_censo: e.target.value }))} />
                    <button onClick={() => { setCampoEscaneo('censo'); setEscaneando(true) }}
                      className="px-2 bg-gray-900 text-white rounded-xl text-xs">📷</button>
                  </div>
                </div>
                <div>
                  <label className="label">N° serie</label>
                  <input className="input" value={form.numero_serie}
                    onChange={e => setForm(f => ({ ...f, numero_serie: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Código de barras</label>
                <div className="flex gap-2">
                  <input className="input flex-1" value={form.codigo_barras}
                    onChange={e => setForm(f => ({ ...f, codigo_barras: e.target.value }))} />
                  <button onClick={() => { setCampoEscaneo('barras'); setEscaneando(true) }}
                    className="px-3 py-2 bg-gray-900 text-white rounded-xl text-xs">📷</button>
                </div>
              </div>
              <div>
                <label className="label">Categoría *</label>
                <select className="input" value={form.categoria_id}
                  onChange={e => {
                    const cat = categorias.find(c => c.id === e.target.value)
                    setForm(f => ({ ...f, categoria_id: e.target.value, categoria: cat?.nombre || '' }))
                  }}>
                  <option value="">Seleccionar…</option>
                  {catsFav.length > 0 && <optgroup label="⭐ Favoritas">{catsFav.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</optgroup>}
                  {catsPropias.length > 0 && <optgroup label="🏥 De este hospital">{catsPropias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</optgroup>}
                  {catsGlobales.length > 0 && <optgroup label="🌐 Globales del sistema">{catsGlobales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</optgroup>}
                </select>
              </div>
              <div>
                <label className="label">Estado</label>
                <select className="input" value={form.estado}
                  onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={form.indispensable} className="w-4 h-4"
                  onChange={e => setForm(f => ({ ...f, indispensable: e.target.checked }))} />
                <div>
                  <div className="text-xs font-semibold text-red-700">Equipo indispensable</div>
                  <div className="text-xs text-red-600">Al moverlo se genera alerta crítica.</div>
                </div>
              </label>
              <div>
                <label className="label">Servicio / Unidad</label>
                <select className="input" value={form.servicio_id}
                  onChange={e => setForm(f => ({ ...f, servicio_id: e.target.value }))}>
                  <option value="">Sin servicio</option>
                  {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Frecuencia mantenimiento</label>
                <input className="input" list="frec-nuevo"
                  placeholder="Ej: Anual, Semestral..."
                  value={form.frecuencia_mantenimiento}
                  onChange={e => setForm(f => ({ ...f, frecuencia_mantenimiento: e.target.value }))} />
                <datalist id="frec-nuevo">
                  {SUGERENCIAS_FRECUENCIA.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="flex gap-2">
                <button onClick={guardarEquipo} disabled={guardando} className="btn-primary flex-1">
                  {guardando ? 'Guardando...' : 'Registrar y ver ficha'}
                </button>
                <button onClick={() => { setMostrarFormNuevo(false); setForm(formInicial) }}
                  className="btn-secondary">Cancelar</button>
              </div>
            </div>
          </div>
        )}

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
          {[['todos', 'Todos'], ...ESTADOS.map(e => [e.value, e.label])].map(([val, label]) => (
            <button key={val} onClick={() => setFiltroEstado(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroEstado === val ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Filtros categoría — dinámicos */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFiltroCategoriaId('todos')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroCategoriaId === 'todos' ? 'bg-gray-200 text-gray-700 border-gray-300' : 'bg-white text-gray-400 border-gray-200'}`}>
            Todas
          </button>
          {categorias.map(c => (
            <button key={c.id} onClick={() => setFiltroCategoriaId(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroCategoriaId === c.id ? 'bg-gray-200 text-gray-700 border-gray-300' : 'bg-white text-gray-400 border-gray-200'}`}>
              {c.nombre}
            </button>
          ))}
        </div>

        {/* Lista — click navega a /admin/equipos/[id] */}
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
                <button className="btn-primary mt-3" onClick={() => setMostrarFormNuevo(true)}>
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
              <button key={e.id}
                onClick={() => router.push(`/admin/equipos/${e.id}`)}
                className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 text-left active:bg-gray-50 transition-colors">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  e.estado === 'operativo' ? 'bg-green-500' :
                  e.estado === 'en_mantenimiento' ? 'bg-amber-500' :
                  e.estado === 'fuera_de_servicio' ? 'bg-red-500' : 'bg-gray-300'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{e.nombre}</span>
                    {e.indispensable && <span className="text-red-500 text-xs flex-shrink-0">★</span>}
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                    <span>{e.marca} {e.modelo}</span>
                    {e.numero_censo && <span>· {e.numero_censo}</span>}
                    {(e.servicios as any)?.nombre && <span>· {(e.servicios as any).nombre}</span>}
                    {mantVencido && <span className="text-red-600 font-semibold">· Mant. vencido</span>}
                    {!mantVencido && mantProximo && <span className="text-amber-600 font-semibold">· Mant. en {diasMant}d</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`badge text-xs border ${estadoBadge(e.estado)}`}>{estadoLabel(e.estado)}</span>
                  <span className="badge bg-gray-100 text-gray-500 text-xs border border-gray-200">{e.categoria}</span>
                </div>
                <span className="text-gray-300 text-sm flex-shrink-0">›</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

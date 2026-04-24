'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'

// =====================================================================
// Tipos
// =====================================================================

interface Material {
  id: string
  nombre: string
  cantidad_requerida: number
  tipo_falla: 'menor' | 'grave' | 'ninguno'
  activo: boolean
  tiene_vencimiento: boolean
  fecha_vencimiento: string | null
  orden: number
}

interface Cajon {
  id: string
  nombre: string
  orden: number
  activo: boolean
  materiales: Material[]
  expandido: boolean
}

interface Equipo {
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
  estado: string | null
  foto_url: string | null
  fecha_ultimo_mantenimiento: string | null
  fecha_proximo_mantenimiento: string | null
  fecha_ultima_calibracion: string | null
  fecha_proxima_calibracion: string | null
  fecha_fin_garantia: string | null
  empresa_mantenimiento: string | null
  contacto: string | null
  numero_contrato: string | null
  frecuencia_mantenimiento: number | null
  observaciones: string | null
  activo: boolean
  indispensable: boolean
}

// Formulario de nuevo equipo (estado local del modal)
interface FormEquipo {
  nombre: string
  categoria: string
  marca: string
  modelo: string
  numero_censo: string
  numero_serie: string
  codigo_barras: string
  cajon_id: string            // '' = sobre el carro, uuid = dentro de ese cajón
  indispensable: boolean
  fecha_ultimo_mantenimiento: string
  fecha_proximo_mantenimiento: string
  fecha_ultima_calibracion: string
  fecha_proxima_calibracion: string
  fecha_fin_garantia: string
  empresa_mantenimiento: string
  contacto: string
  numero_contrato: string
  frecuencia_mantenimiento: string
  observaciones: string
}

const formVacio: FormEquipo = {
  nombre: '', categoria: '', marca: '', modelo: '',
  numero_censo: '', numero_serie: '', codigo_barras: '',
  cajon_id: '', indispensable: false,
  fecha_ultimo_mantenimiento: '', fecha_proximo_mantenimiento: '',
  fecha_ultima_calibracion: '', fecha_proxima_calibracion: '',
  fecha_fin_garantia: '', empresa_mantenimiento: '',
  contacto: '', numero_contrato: '', frecuencia_mantenimiento: '',
  observaciones: '',
}

// Duplicado detectado al escribir censo/serie
interface Duplicado {
  equipo: Equipo
  ubicacionDesc: string   // "Carro X3 — Servicio Urgencias"
  campoColisionado: 'numero_censo' | 'numero_serie' | 'codigo_barras'
  valor: string
}

// Categorías más habituales (el usuario puede teclear libre)
const CATEGORIAS_EQUIPO = [
  'Desfibrilador',
  'Monitor',
  'Laringoscopio',
  'Bomba de infusión',
  'Aspirador',
  'Ventilador',
  'Glucómetro',
  'Pulsioxímetro',
  'Tensiómetro',
  'Electrocardiógrafo',
  'Ecógrafo',
  'Otro',
]

// =====================================================================
// Utilidades
// =====================================================================

function colorVto(fecha: string | null): string {
  if (!fecha) return ''
  const dias = Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return 'bg-red-100 border-red-300 text-red-700'
  if (dias <= 7) return 'bg-red-100 border-red-300 text-red-700'
  if (dias <= 30) return 'bg-amber-100 border-amber-300 text-amber-700'
  return 'bg-green-100 border-green-300 text-green-700'
}

function labelVto(fecha: string | null): string {
  if (!fecha) return 'Sin fecha'
  const dias = Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return `Vencido`
  if (dias === 0) return 'Vence hoy'
  if (dias <= 7) return `${dias}d ⚠️`
  return new Date(fecha).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

// Debounce para búsqueda de duplicados
function useDebounce<T>(value: T, delay = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

// =====================================================================
// Componente principal
// =====================================================================

export default function GestionMaterialesPage() {
  const [carro, setCarro] = useState<any>(null)
  const [cajones, setCajones] = useState<Cajon[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [modalEquipoAbierto, setModalEquipoAbierto] = useState(false)
  const [cajonPreseleccionado, setCajonPreseleccionado] = useState<string>('')

  const router = useRouter()
  const params = useParams()
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [carroId])

  async function cargarDatos() {
    const { data: c } = await supabase.from('carros')
      .select('*, servicios(id, nombre), hospitales(id, nombre)')
      .eq('id', carroId).single()
    setCarro(c)

    const { data: cajs } = await supabase.from('cajones')
      .select('*, materiales(*)')
      .eq('carro_id', carroId)
      .order('orden')

    setCajones((cajs || []).map((caj: any) => ({
      ...caj,
      expandido: true,
      materiales: (caj.materiales || [])
        .sort((a: any, b: any) => a.orden - b.orden)
        .map((m: any) => ({
          ...m,
          tiene_vencimiento: m.tiene_vencimiento ?? true,
          fecha_vencimiento: m.fecha_vencimiento ?? null,
        }))
    })))

    const { data: eqs } = await supabase.from('equipos')
      .select('*')
      .eq('carro_id', carroId)
      .eq('activo', true)
      .order('nombre')
    setEquipos(eqs || [])

    setLoading(false)
  }

  // ----- Cajones (sin cambios respecto a v original) ------------------
  async function agregarCajon() {
    const nombre = prompt('Nombre del nuevo cajón:')
    if (!nombre?.trim()) return
    const orden = cajones.length
    const { data, error } = await supabase.from('cajones')
      .insert({ carro_id: carroId, nombre: nombre.trim(), orden, activo: true })
      .select().single()
    if (error) { toast.error('Error al agregar cajón'); return }
    setCajones(prev => [...prev, { ...data, materiales: [], expandido: true }])
    toast.success('Cajón agregado')
  }

  async function renombrarCajon(cajonId: string, nombreActual: string) {
    const nuevo = prompt('Nuevo nombre del cajón:', nombreActual)
    if (!nuevo?.trim() || nuevo === nombreActual) return
    const { error } = await supabase.from('cajones').update({ nombre: nuevo.trim() }).eq('id', cajonId)
    if (error) { toast.error('Error al renombrar'); return }
    setCajones(prev => prev.map(c => c.id === cajonId ? { ...c, nombre: nuevo.trim() } : c))
    toast.success('Cajón renombrado')
  }

  async function toggleCajon(cajonId: string, activo: boolean) {
    const { error } = await supabase.from('cajones').update({ activo: !activo }).eq('id', cajonId)
    if (error) { toast.error('Error'); return }
    setCajones(prev => prev.map(c => c.id === cajonId ? { ...c, activo: !activo } : c))
    toast.success(!activo ? 'Cajón activado' : 'Cajón desactivado')
  }

  function toggleExpandido(cajonId: string) {
    setCajones(prev => prev.map(c => c.id === cajonId ? { ...c, expandido: !c.expandido } : c))
  }

  // ----- Materiales (sin cambios respecto a v original) ---------------
  async function agregarMaterial(cajonId: string) {
    const nombre = prompt('Nombre del material:')
    if (!nombre?.trim()) return
    const orden = cajones.find(c => c.id === cajonId)?.materiales.length || 0
    const { data, error } = await supabase.from('materiales').insert({
      cajon_id: cajonId, nombre: nombre.trim(),
      cantidad_requerida: 1, tipo_falla: 'menor',
      activo: true, tiene_vencimiento: true,
      fecha_vencimiento: null, orden,
    }).select().single()
    if (error) { toast.error('Error al agregar material'); return }
    setCajones(prev => prev.map(c =>
      c.id === cajonId ? { ...c, materiales: [...c.materiales, { ...data, tiene_vencimiento: true, fecha_vencimiento: null }] } : c
    ))
    toast.success('Material agregado')
  }

  async function updateMaterial(matId: string, cajonId: string, field: string, value: any) {
    setGuardando(matId)
    const { error } = await supabase.from('materiales').update({ [field]: value }).eq('id', matId)
    if (error) { toast.error('Error al guardar'); setGuardando(null); return }
    setCajones(prev => prev.map(c =>
      c.id === cajonId
        ? { ...c, materiales: c.materiales.map(m => m.id === matId ? { ...m, [field]: value } : m) }
        : c
    ))
    setGuardando(null)
  }

  async function editarNombre(matId: string, cajonId: string, nombreActual: string) {
    const nuevo = prompt('Nuevo nombre:', nombreActual)
    if (!nuevo?.trim() || nuevo === nombreActual) return
    await updateMaterial(matId, cajonId, 'nombre', nuevo.trim())
    toast.success('Nombre actualizado')
  }

  // ----- Equipos ------------------------------------------------------
  function abrirModalEquipo(cajonId: string = '') {
    setCajonPreseleccionado(cajonId)
    setModalEquipoAbierto(true)
  }

  async function onEquipoCreado() {
    setModalEquipoAbierto(false)
    await cargarDatos()
  }

  async function desactivarEquipo(equipoId: string) {
    if (!confirm('¿Quitar este equipo del carro? (Se desactiva, no se borra)')) return
    const { error } = await supabase.from('equipos')
      .update({ activo: false })
      .eq('id', equipoId)
    if (error) { toast.error('Error'); return }
    setEquipos(prev => prev.filter(e => e.id !== equipoId))
    toast.success('Equipo desvinculado')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  const cajonesActivos = cajones.filter(c => c.activo)
  const cajonesInactivos = cajones.filter(c => !c.activo)
  const equiposSobreCarro = equipos.filter(e => !e.cajon_id)
  const equiposPorCajon = (cajonId: string) => equipos.filter(e => e.cajon_id === cajonId)

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Gestión de materiales y equipos</span>
      </div>

      <div className="content">
        {/* Info carro */}
        <div className="card bg-blue-50 border-blue-100">
          <div className="text-sm font-semibold text-blue-800">{carro?.codigo} — {carro?.nombre}</div>
          <div className="text-xs text-blue-600 mt-1">{(carro?.servicios as any)?.nombre || carro?.ubicacion}</div>
          <div className="flex gap-3 mt-2 text-xs text-blue-500">
            <span>{cajonesActivos.length} cajones</span>
            <span>{cajonesActivos.reduce((acc, c) => acc + c.materiales.filter(m => m.activo).length, 0)} materiales</span>
            <span>{equipos.length} equipos</span>
          </div>
        </div>

        {/* Acciones globales */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => abrirModalEquipo('')}
            className="py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold active:bg-purple-700">
            + Agregar equipo
          </button>
          <button onClick={agregarCajon}
            className="py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-600 font-medium bg-white active:bg-gray-50">
            + Agregar cajón
          </button>
        </div>

        {/* Equipos sobre el carro */}
        {equiposSobreCarro.length > 0 && (
          <div className="card border-purple-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-purple-800">🩺 Equipos sobre el carro</span>
              <span className="text-xs text-gray-400">{equiposSobreCarro.length}</span>
            </div>
            {equiposSobreCarro.map(eq => (
              <FilaEquipo key={eq.id} equipo={eq} onDesactivar={() => desactivarEquipo(eq.id)} />
            ))}
          </div>
        )}

        {/* Leyenda semáforo */}
        <div className="card py-2.5 px-3">
          <div className="section-title mb-2">Semáforo vencimientos</div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div><span>+30 días</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></div><span>7–30 días</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div><span>&lt;7 días o vencido</span></div>
          </div>
        </div>

        {/* Cajones activos */}
        {cajonesActivos.map(cajon => {
          const equiposDeEsteCajon = equiposPorCajon(cajon.id)
          return (
            <div key={cajon.id} className="card">
              {/* Header cajón */}
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => toggleExpandido(cajon.id)} className="flex-1 flex items-center gap-2 text-left">
                  <span className="text-sm font-semibold flex-1">{cajon.nombre}</span>
                  <span className="text-xs text-gray-400">
                    {cajon.materiales.filter(m => m.activo).length} mat · {equiposDeEsteCajon.length} eq
                  </span>
                  <span className="text-gray-400 text-xs">{cajon.expandido ? '▲' : '▼'}</span>
                </button>
                <button onClick={() => renombrarCajon(cajon.id, cajon.nombre)}
                  className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-gray-50">✏️</button>
                <button onClick={() => toggleCajon(cajon.id, cajon.activo)}
                  className="text-xs px-2 py-1 rounded-lg border border-amber-200 text-amber-600 bg-amber-50">Desactivar</button>
              </div>

              {cajon.expandido && (
                <>
                  {/* Equipos dentro del cajón */}
                  {equiposDeEsteCajon.length > 0 && (
                    <div className="mb-3 pb-3 border-b border-gray-100">
                      <div className="text-xs text-purple-600 font-semibold mb-1">Equipos en este cajón</div>
                      {equiposDeEsteCajon.map(eq => (
                        <FilaEquipo key={eq.id} equipo={eq} compacta onDesactivar={() => desactivarEquipo(eq.id)} />
                      ))}
                    </div>
                  )}

                  {/* Headers materiales */}
                  <div className="grid grid-cols-[1fr_40px_68px_72px_28px_28px] gap-1 px-1 mb-1">
                    <div className="text-xs text-gray-400 font-semibold">Material</div>
                    <div className="text-xs text-gray-400 text-center">Cant</div>
                    <div className="text-xs text-gray-400 text-center">Fallo</div>
                    <div className="text-xs text-gray-400 text-center">Vencimiento</div>
                    <div className="text-xs text-gray-400 text-center">Vto</div>
                    <div className="text-xs text-gray-400 text-center">Act</div>
                  </div>

                  {/* Materiales */}
                  {cajon.materiales.map(mat => (
                    <div key={mat.id}
                      className={`grid grid-cols-[1fr_40px_68px_72px_28px_28px] gap-1 items-center py-1.5 border-b border-gray-50 last:border-0 ${!mat.activo ? 'opacity-40' : ''}`}
                    >
                      <button className="text-xs text-left font-medium leading-tight"
                        onClick={() => editarNombre(mat.id, cajon.id, mat.nombre)}>
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            mat.tipo_falla === 'grave' ? 'bg-red-500' :
                            mat.tipo_falla === 'menor' ? 'bg-amber-400' : 'bg-gray-300'}`}></div>
                          <span className="truncate">{mat.nombre}</span>
                          {guardando === mat.id && <span className="text-blue-400 text-xs">...</span>}
                        </div>
                      </button>

                      <input type="number" min={1} value={mat.cantidad_requerida}
                        onChange={e => updateMaterial(mat.id, cajon.id, 'cantidad_requerida', parseInt(e.target.value) || 1)}
                        className="input text-xs py-1 text-center px-1" disabled={!mat.activo} />

                      <select value={mat.tipo_falla}
                        onChange={e => updateMaterial(mat.id, cajon.id, 'tipo_falla', e.target.value)}
                        className="input text-xs py-1 px-1" disabled={!mat.activo}>
                        <option value="grave">Grave</option>
                        <option value="menor">Menor</option>
                        <option value="ninguno">Ninguno</option>
                      </select>

                      {mat.tiene_vencimiento ? (
                        <input
                          type="date"
                          value={mat.fecha_vencimiento || ''}
                          onChange={e => updateMaterial(mat.id, cajon.id, 'fecha_vencimiento', e.target.value || null)}
                          className={`text-xs py-1 px-1 rounded-lg border text-center w-full ${colorVto(mat.fecha_vencimiento)} ${!mat.activo ? 'opacity-40' : ''}`}
                          disabled={!mat.activo}
                        />
                      ) : (
                        <div className="text-xs text-gray-300 text-center">—</div>
                      )}

                      <div className="flex items-center justify-center">
                        <div onClick={() => mat.activo && updateMaterial(mat.id, cajon.id, 'tiene_vencimiento', !mat.tiene_vencimiento)}
                          className={`w-6 h-3.5 rounded-full cursor-pointer transition-colors ${mat.tiene_vencimiento ? 'bg-blue-500' : 'bg-gray-200'}`}>
                          <div className={`w-2.5 h-2.5 bg-white rounded-full mt-0.5 transition-transform ${mat.tiene_vencimiento ? 'translate-x-3' : 'translate-x-0.5'}`}></div>
                        </div>
                      </div>

                      <div className="flex items-center justify-center">
                        <div onClick={() => updateMaterial(mat.id, cajon.id, 'activo', !mat.activo).then(() =>
                          toast.success(mat.activo ? 'Material desactivado' : 'Material activado'))}
                          className={`w-6 h-3.5 rounded-full cursor-pointer transition-colors ${mat.activo ? 'bg-green-500' : 'bg-gray-200'}`}>
                          <div className={`w-2.5 h-2.5 bg-white rounded-full mt-0.5 transition-transform ${mat.activo ? 'translate-x-3' : 'translate-x-0.5'}`}></div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Dos botones de agregar por cajón */}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button onClick={() => agregarMaterial(cajon.id)}
                      className="py-2 border border-dashed border-blue-300 rounded-xl text-xs text-blue-600 font-medium bg-blue-50 active:bg-blue-100">
                      + Material
                    </button>
                    <button onClick={() => abrirModalEquipo(cajon.id)}
                      className="py-2 border border-dashed border-purple-300 rounded-xl text-xs text-purple-600 font-medium bg-purple-50 active:bg-purple-100">
                      + Equipo en este cajón
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}

        {/* Cajones desactivados */}
        {cajonesInactivos.length > 0 && (
          <div className="card border-gray-100">
            <div className="section-title mb-3">Cajones desactivados ({cajonesInactivos.length})</div>
            {cajonesInactivos.map(cajon => (
              <div key={cajon.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 opacity-50">
                <span className="text-sm flex-1 line-through text-gray-400">{cajon.nombre}</span>
                <button onClick={() => toggleCajon(cajon.id, cajon.activo)}
                  className="text-xs px-2 py-1 rounded-lg border border-green-200 text-green-600 bg-green-50">Activar</button>
              </div>
            ))}
          </div>
        )}

        <div className="card bg-amber-50 border-amber-100">
          <p className="text-xs text-amber-700 leading-relaxed">
            Los cambios se guardan automáticamente. Los equipos médicos (desfibrilador, laringoscopio, monitor...)
            van en la tabla de equipos con su número de censo, serie y fechas de mantenimiento. Los consumibles
            (fármacos, gasas, jeringas) van como materiales dentro de cada cajón.
          </p>
        </div>
      </div>

      {/* Modal Agregar Equipo */}
      {modalEquipoAbierto && carro && (
        <ModalAgregarEquipo
          hospitalId={carro.hospital_id}
          servicioId={carro.servicio_id}
          carroId={carroId}
          carroNombre={`${carro.codigo} — ${carro.nombre}`}
          cajones={cajonesActivos.map(c => ({ id: c.id, nombre: c.nombre }))}
          cajonPreseleccionado={cajonPreseleccionado}
          onClose={() => setModalEquipoAbierto(false)}
          onCreado={onEquipoCreado}
        />
      )}
    </div>
  )
}

// =====================================================================
// Fila de equipo en la lista
// =====================================================================

function FilaEquipo({ equipo, compacta = false, onDesactivar }: {
  equipo: Equipo
  compacta?: boolean
  onDesactivar: () => void
}) {
  const proximoMant = equipo.fecha_proximo_mantenimiento
  const claseSemaforo = proximoMant ? colorVto(proximoMant) : ''

  return (
    <div className={`flex items-center gap-2 ${compacta ? 'py-1.5' : 'py-2'} border-b border-gray-50 last:border-0`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {equipo.indispensable && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">★ Indisp</span>
          )}
          <span className="text-xs font-semibold text-gray-900 truncate">{equipo.nombre}</span>
          {equipo.categoria && (
            <span className="text-xs text-gray-400">· {equipo.categoria}</span>
          )}
        </div>
        <div className="text-xs text-gray-500 truncate mt-0.5">
          {[equipo.marca, equipo.modelo].filter(Boolean).join(' ')}
          {equipo.numero_censo && <span className="ml-2 text-gray-400">Censo: {equipo.numero_censo}</span>}
          {equipo.numero_serie && <span className="ml-2 text-gray-400">S/N: {equipo.numero_serie}</span>}
        </div>
      </div>
      {proximoMant && (
        <span className={`text-xs px-1.5 py-0.5 rounded border ${claseSemaforo}`}>
          Mant: {labelVto(proximoMant)}
        </span>
      )}
      <button
        onClick={onDesactivar}
        className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 bg-red-50 active:bg-red-100"
        aria-label="Quitar del carro"
      >
        ✕
      </button>
    </div>
  )
}

// =====================================================================
// Modal de Agregar Equipo
// =====================================================================

function ModalAgregarEquipo({
  hospitalId, servicioId, carroId, carroNombre,
  cajones, cajonPreseleccionado,
  onClose, onCreado,
}: {
  hospitalId: string
  servicioId: string | null
  carroId: string
  carroNombre: string
  cajones: { id: string, nombre: string }[]
  cajonPreseleccionado: string
  onClose: () => void
  onCreado: () => void
}) {
  const [form, setForm] = useState<FormEquipo>({ ...formVacio, cajon_id: cajonPreseleccionado })
  const [guardando, setGuardando] = useState(false)
  const [escanerAbierto, setEscanerAbierto] = useState(false)
  const [duplicado, setDuplicado] = useState<Duplicado | null>(null)
  const [comprobandoDup, setComprobandoDup] = useState(false)
  const supabase = createClient()

  // Debounce de los campos que disparan búsqueda
  const censoDeb = useDebounce(form.numero_censo.trim(), 400)
  const serieDeb = useDebounce(form.numero_serie.trim(), 400)
  const codigoDeb = useDebounce(form.codigo_barras.trim(), 400)

  // Buscar duplicados cuando cambian los campos debounced
  useEffect(() => {
    let cancelado = false
    async function buscar() {
      if (!censoDeb && !serieDeb && !codigoDeb) {
        setDuplicado(null)
        return
      }
      setComprobandoDup(true)
      const filtros: string[] = []
      if (censoDeb) filtros.push(`numero_censo.eq.${censoDeb}`)
      if (serieDeb) filtros.push(`numero_serie.eq.${serieDeb}`)
      if (codigoDeb) filtros.push(`codigo_barras.eq.${codigoDeb}`)
      if (filtros.length === 0) { setComprobandoDup(false); return }

      const { data } = await supabase
        .from('equipos')
        .select('*, carros(id, codigo, nombre, numero_censo), servicios(id, nombre)')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .or(filtros.join(','))
        .limit(1)
        .maybeSingle()

      if (cancelado) return

      if (data) {
        // No es duplicado si el equipo encontrado YA está asignado a este carro
        // (el usuario podría estar editando mentalmente uno que ya está aquí).
        if (data.carro_id === carroId) {
          setDuplicado(null)
        } else {
          let campo: Duplicado['campoColisionado'] = 'numero_censo'
          let valor = ''
          if (censoDeb && data.numero_censo === censoDeb) { campo = 'numero_censo'; valor = censoDeb }
          else if (serieDeb && data.numero_serie === serieDeb) { campo = 'numero_serie'; valor = serieDeb }
          else if (codigoDeb && data.codigo_barras === codigoDeb) { campo = 'codigo_barras'; valor = codigoDeb }

          const ubicacionDesc = data.carros
            ? `Carro ${(data.carros as any).codigo || (data.carros as any).nombre}`
            : data.servicios
              ? `Servicio ${(data.servicios as any).nombre}`
              : 'Sin ubicación (equipo de hospital)'

          setDuplicado({
            equipo: data as Equipo,
            ubicacionDesc,
            campoColisionado: campo,
            valor,
          })
        }
      } else {
        setDuplicado(null)
      }
      setComprobandoDup(false)
    }
    buscar()
    return () => { cancelado = true }
  }, [censoDeb, serieDeb, codigoDeb, hospitalId, carroId, supabase])

  // Validación de obligatorios
  const camposOk =
    form.nombre.trim().length > 0 &&
    form.categoria.trim().length > 0 &&
    form.marca.trim().length > 0 &&
    form.modelo.trim().length > 0 &&
    form.numero_censo.trim().length > 0

  // Escáner: al leer, busca en equipos del hospital
  async function onCodigoEscaneado(codigo: string) {
    setEscanerAbierto(false)
    const codigoLimpio = codigo.trim()
    if (!codigoLimpio) return

    // Buscar si ya existe un equipo con ese código
    const { data } = await supabase
      .from('equipos')
      .select('*, carros(id, codigo, nombre), servicios(id, nombre)')
      .eq('hospital_id', hospitalId)
      .eq('activo', true)
      .or(`codigo_barras.eq.${codigoLimpio},numero_censo.eq.${codigoLimpio},numero_serie.eq.${codigoLimpio}`)
      .limit(1)
      .maybeSingle()

    if (data) {
      // Ya existe → preguntar
      const ubicacion = data.carros
        ? `carro ${(data.carros as any).codigo || (data.carros as any).nombre}`
        : data.servicios ? `servicio ${(data.servicios as any).nombre}` : 'sin ubicación'

      if (data.carro_id === carroId) {
        toast('Este equipo ya está en este carro', { icon: 'ℹ️' })
        return
      }

      const confirmar = confirm(
        `Este código pertenece a "${data.nombre}" (${ubicacion}).\n\n` +
        `¿Quieres moverlo a este carro?`
      )
      if (confirmar) {
        await reasignarEquipo(data as Equipo)
      }
    } else {
      // No existe → prerrellenar formulario
      setForm(f => ({ ...f, codigo_barras: codigoLimpio }))
      toast.success('Código leído — completa el formulario')
    }
  }

  // Reasignación con generación de alerta si era indispensable
  async function reasignarEquipo(eq: Equipo) {
    setGuardando(true)
    try {
      const origenCarroId = eq.carro_id
      const origenServicioId = eq.servicio_id
      const eraIndispensable = eq.indispensable

      const { error: errUpd } = await supabase
        .from('equipos')
        .update({
          carro_id: carroId,
          cajon_id: form.cajon_id || null,
          servicio_id: servicioId,   // seguir el servicio del nuevo carro
        })
        .eq('id', eq.id)
      if (errUpd) throw errUpd

      // Registrar en historial como movimiento
      await supabase.from('historial_mantenimientos').insert({
        equipo_id: eq.id,
        tipo: 'reasignacion',
        fecha: new Date().toISOString().split('T')[0],
        descripcion: `Equipo reasignado a carro ${carroNombre}`,
        resultado: 'ok',
      })

      // Si era indispensable y venía de un carro/servicio, generar alerta
      if (eraIndispensable && (origenCarroId || origenServicioId)) {
        await supabase.from('alertas').insert({
          hospital_id: hospitalId,
          tipo: 'equipo_indispensable_movido',
          severidad: 'alta',
          titulo: `Equipo indispensable movido: ${eq.nombre}`,
          mensaje:
            `El equipo "${eq.nombre}"` +
            (eq.numero_censo ? ` (censo ${eq.numero_censo})` : '') +
            ` marcado como INDISPENSABLE ha sido movido a ${carroNombre}. ` +
            `Revisa si el origen requiere reposición.`,
          carro_id: origenCarroId,
          servicio_id: origenServicioId,
          resuelta: false,
        })
      }

      toast.success(eraIndispensable
        ? '✓ Equipo reasignado. Alerta creada por ser indispensable.'
        : '✓ Equipo reasignado a este carro')
      onCreado()
    } catch (err: any) {
      toast.error(err.message || 'Error al reasignar')
    } finally {
      setGuardando(false)
    }
  }

  // Crear equipo nuevo
  async function crear() {
    if (!camposOk) {
      toast.error('Completa los campos obligatorios')
      return
    }
    // Si hay duplicado detectado, no permitir crear: el usuario debe reasignar o cambiar el valor
    if (duplicado) {
      toast.error('Hay un conflicto sin resolver. Reasigna o cambia el valor duplicado.')
      return
    }

    setGuardando(true)
    try {
      const payload: any = {
        hospital_id: hospitalId,
        servicio_id: servicioId,
        carro_id: carroId,
        cajon_id: form.cajon_id || null,
        nombre: form.nombre.trim(),
        categoria: form.categoria.trim(),
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        numero_censo: form.numero_censo.trim(),
        numero_serie: form.numero_serie.trim() || null,
        codigo_barras: form.codigo_barras.trim() || null,
        indispensable: form.indispensable,
        estado: 'operativo',
        activo: true,
        empresa_mantenimiento: form.empresa_mantenimiento.trim() || null,
        contacto: form.contacto.trim() || null,
        numero_contrato: form.numero_contrato.trim() || null,
        observaciones: form.observaciones.trim() || null,
      }

      const freqNum = parseInt(form.frecuencia_mantenimiento)
      if (!isNaN(freqNum) && freqNum > 0) payload.frecuencia_mantenimiento = freqNum

      if (form.fecha_ultimo_mantenimiento) payload.fecha_ultimo_mantenimiento = form.fecha_ultimo_mantenimiento
      if (form.fecha_proximo_mantenimiento) payload.fecha_proximo_mantenimiento = form.fecha_proximo_mantenimiento
      if (form.fecha_ultima_calibracion) payload.fecha_ultima_calibracion = form.fecha_ultima_calibracion
      if (form.fecha_proxima_calibracion) payload.fecha_proxima_calibracion = form.fecha_proxima_calibracion
      if (form.fecha_fin_garantia) payload.fecha_fin_garantia = form.fecha_fin_garantia

      const { error } = await supabase.from('equipos').insert(payload)
      if (error) throw error

      toast.success('Equipo creado y vinculado al carro')
      onCreado()
    } catch (err: any) {
      // Si el índice único falla (carrera con otro cliente), damos mensaje claro
      if (err.code === '23505') {
        toast.error('Ese censo/serie/código ya existe en este hospital')
      } else {
        toast.error(err.message || 'Error al crear equipo')
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4"
           onClick={onClose}>
        <div
          className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
            <div>
              <div className="font-semibold text-sm">Agregar equipo</div>
              <div className="text-xs text-gray-400">{carroNombre}</div>
            </div>
            <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
          </div>

          {/* Botón escanear */}
          <div className="px-4 pt-3">
            <button onClick={() => setEscanerAbierto(true)}
              className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              <span>📷</span> Escanear código de barras
            </button>
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              Si el código ya existe, te preguntaremos si quieres moverlo aquí
            </p>
          </div>

          {/* Aviso de duplicado */}
          {duplicado && (
            <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-xs font-semibold text-amber-800 mb-1">
                ⚠️ Ya existe un equipo con ese {duplicado.campoColisionado === 'numero_censo' ? 'censo' : duplicado.campoColisionado === 'numero_serie' ? 'número de serie' : 'código de barras'}
              </div>
              <div className="text-xs text-amber-700 mb-2">
                <strong>{duplicado.equipo.nombre}</strong> está en <strong>{duplicado.ubicacionDesc}</strong>.
                {duplicado.equipo.indispensable && (
                  <span className="block mt-1 text-red-700 font-semibold">
                    ★ Marcado como INDISPENSABLE: mover generará una alerta
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => reasignarEquipo(duplicado.equipo)}
                  disabled={guardando}
                  className="py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  Mover aquí
                </button>
                <button
                  onClick={() => setForm(f => ({
                    ...f,
                    [duplicado.campoColisionado]: '',
                  }))}
                  className="py-2 border border-amber-300 text-amber-700 rounded-lg text-xs font-semibold bg-white"
                >
                  Usar otro
                </button>
              </div>
            </div>
          )}

          {/* Formulario */}
          <div className="p-4 space-y-3">
            <Campo label="Nombre *" value={form.nombre}
              onChange={v => setForm(f => ({ ...f, nombre: v }))}
              placeholder="Ej: Desfibrilador bifásico" />

            <div>
              <label className="label">Categoría *</label>
              <select className="input"
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                <option value="">Seleccionar…</option>
                {CATEGORIAS_EQUIPO.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Campo label="Marca *" value={form.marca}
                onChange={v => setForm(f => ({ ...f, marca: v }))}
                placeholder="Ej: Philips" />
              <Campo label="Modelo *" value={form.modelo}
                onChange={v => setForm(f => ({ ...f, modelo: v }))}
                placeholder="Ej: HeartStart XL+" />
            </div>

            <Campo label="Nº de censo *" value={form.numero_censo}
              onChange={v => setForm(f => ({ ...f, numero_censo: v }))}
              placeholder="Código interno del hospital"
              hint={comprobandoDup ? 'Comprobando duplicados…' : undefined} />

            <div className="grid grid-cols-2 gap-2">
              <Campo label="Nº de serie" value={form.numero_serie}
                onChange={v => setForm(f => ({ ...f, numero_serie: v }))} />
              <Campo label="Código de barras" value={form.codigo_barras}
                onChange={v => setForm(f => ({ ...f, codigo_barras: v }))} />
            </div>

            <div>
              <label className="label">Ubicación dentro del carro</label>
              <select className="input"
                value={form.cajon_id}
                onChange={e => setForm(f => ({ ...f, cajon_id: e.target.value }))}>
                <option value="">Sobre el carro (encima)</option>
                {cajones.map(c => (
                  <option key={c.id} value={c.id}>Dentro del cajón: {c.nombre}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl cursor-pointer">
              <input type="checkbox"
                checked={form.indispensable}
                onChange={e => setForm(f => ({ ...f, indispensable: e.target.checked }))}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="text-xs font-semibold text-red-700">Equipo indispensable</div>
                <div className="text-xs text-red-600">Si se mueve a otra ubicación, se generará alerta crítica automática.</div>
              </div>
            </label>

            {/* Fechas (opcionales) */}
            <details className="pt-1">
              <summary className="text-xs font-semibold text-gray-600 cursor-pointer py-1">
                Mantenimiento, calibración y garantía (opcional)
              </summary>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <CampoFecha label="Último mantenimiento" value={form.fecha_ultimo_mantenimiento}
                    onChange={v => setForm(f => ({ ...f, fecha_ultimo_mantenimiento: v }))} />
                  <CampoFecha label="Próximo mantenimiento" value={form.fecha_proximo_mantenimiento}
                    onChange={v => setForm(f => ({ ...f, fecha_proximo_mantenimiento: v }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CampoFecha label="Última calibración" value={form.fecha_ultima_calibracion}
                    onChange={v => setForm(f => ({ ...f, fecha_ultima_calibracion: v }))} />
                  <CampoFecha label="Próxima calibración" value={form.fecha_proxima_calibracion}
                    onChange={v => setForm(f => ({ ...f, fecha_proxima_calibracion: v }))} />
                </div>
                <CampoFecha label="Fin de garantía" value={form.fecha_fin_garantia}
                  onChange={v => setForm(f => ({ ...f, fecha_fin_garantia: v }))} />
                <Campo label="Frecuencia de mantenimiento (meses)"
                  value={form.frecuencia_mantenimiento}
                  onChange={v => setForm(f => ({ ...f, frecuencia_mantenimiento: v.replace(/\D/g, '') }))}
                  placeholder="12" />
              </div>
            </details>

            <details>
              <summary className="text-xs font-semibold text-gray-600 cursor-pointer py-1">
                Proveedor y contrato (opcional)
              </summary>
              <div className="mt-2 space-y-2">
                <Campo label="Empresa de mantenimiento" value={form.empresa_mantenimiento}
                  onChange={v => setForm(f => ({ ...f, empresa_mantenimiento: v }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Campo label="Contacto" value={form.contacto}
                    onChange={v => setForm(f => ({ ...f, contacto: v }))} />
                  <Campo label="Nº de contrato" value={form.numero_contrato}
                    onChange={v => setForm(f => ({ ...f, numero_contrato: v }))} />
                </div>
              </div>
            </details>

            <div>
              <label className="label">Observaciones</label>
              <textarea className="input"
                rows={2}
                value={form.observaciones}
                onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
              />
            </div>
          </div>

          {/* Footer sticky */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium"
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              onClick={crear}
              disabled={!camposOk || guardando || !!duplicado}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : 'Crear equipo'}
            </button>
          </div>
        </div>
      </div>

      {/* Escáner en pantalla completa */}
      {escanerAbierto && (
        <EscanerCodigoBarras
          onScan={onCodigoEscaneado}
          onClose={() => setEscanerAbierto(false)}
        />
      )}
    </>
  )
}

// =====================================================================
// Inputs auxiliares
// =====================================================================

function Campo({ label, value, onChange, placeholder, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        className="input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}

function CampoFecha({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="date"
        className="input"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

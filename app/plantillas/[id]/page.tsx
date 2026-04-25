'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'

// =====================================================================
// Tipos
// =====================================================================
interface Item {
  id: string
  seccion_id: string
  nombre: string
  descripcion: string | null
  orden: number
  tipo_campo: string
  requerido: boolean
  cantidad_esperada: number | null
  tiene_vencimiento: boolean
  unidad: string | null
  tipos_incidencia: string[]
  activo: boolean
  _editando?: boolean
}

interface Seccion {
  id: string
  plantilla_id: string
  nombre: string
  descripcion_ayuda: string | null
  tipo: string
  icono: string
  orden: number
  obligatoria: boolean
  activo: boolean
  items: Item[]
  _expandida?: boolean
  _editando?: boolean
}

interface Plantilla {
  id: string
  nombre: string
  descripcion: string | null
  tipo_carro: string | null
  es_base: boolean
  activo: boolean
}

// =====================================================================
// Constantes
// =====================================================================
const TIPOS_SECCION = [
  { value: 'materiales',    label: 'Materiales y medicamentos', icono: '📦' },
  { value: 'equipos',       label: 'Equipos médicos',           icono: '🩺' },
  { value: 'desfibrilador', label: 'Desfibrilador',             icono: '⚡' },
  { value: 'precintos',     label: 'Precintos',                 icono: '🔒' },
  { value: 'medicamentos',  label: 'Medicamentos',              icono: '💊' },
  { value: 'observaciones', label: 'Observaciones',             icono: '📝' },
  { value: 'custom',        label: 'Sección personalizada',     icono: '✏️' },
]

const TIPOS_CAMPO = [
  { value: 'compuesto',  label: 'Completo (cantidad + vto + estado + foto)' },
  { value: 'checkbox',   label: 'Solo verificación (sí/no)' },
  { value: 'cantidad',   label: 'Cantidad' },
  { value: 'fecha_vto',  label: 'Fecha de vencimiento' },
  { value: 'texto',      label: 'Texto libre' },
  { value: 'foto',       label: 'Foto obligatoria' },
]

const TIPOS_INCIDENCIA_DISPONIBLES = [
  'falta', 'vencimiento', 'deterioro', 'cantidad_incorrecta',
  'caducado', 'mal_estado', 'precinto_roto', 'otro',
]

const TIPOS_CARRO = [
  { value: '', label: 'Todos los tipos' },
  { value: 'parada', label: 'Carro de parada' },
  { value: 'trauma', label: 'Carro de trauma' },
  { value: 'quemados', label: 'Carro de quemados' },
  { value: 'neonatos', label: 'Carro de neonatos' },
  { value: 'pediatrico', label: 'Carro pediátrico' },
  { value: 'otro', label: 'Otro' },
]

// =====================================================================
// Componente principal
// =====================================================================
export default function EditorPlantillaPage() {
  const [plantilla, setPlantilla]   = useState<Plantilla | null>(null)
  const [secciones, setSecciones]   = useState<Seccion[]>([])
  const [hospital, setHospital]     = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [guardando, setGuardando]   = useState(false)
  const [editandoPlantilla, setEditandoPlantilla] = useState(false)
  const [formPlantilla, setFormPlantilla] = useState({ nombre: '', descripcion: '', tipo_carro: '', es_base: false })
  const [nuevaSeccion, setNuevaSeccion] = useState(false)
  const [formSeccion, setFormSeccion] = useState({ nombre: '', tipo: 'custom', icono: '📋', obligatoria: true, descripcion_ayuda: '' })

  const router = useRouter()
  const params = useParams()
  const plantillaId = params.id as string
  const supabase = createClient()

  useHospitalTheme(hospital?.color_primario)

  useEffect(() => { cargarDatos() }, [plantillaId])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles')
      .select('*, hospitales(*)').eq('id', user.id).single()
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) { router.push('/'); return }
    setHospital((p as any).hospitales)

    const { data: pl } = await supabase.from('plantillas')
      .select('*').eq('id', plantillaId).single()
    if (!pl) { router.push('/admin/plantillas'); return }
    setPlantilla(pl)
    setFormPlantilla({ nombre: pl.nombre, descripcion: pl.descripcion || '', tipo_carro: pl.tipo_carro || '', es_base: pl.es_base })

    const { data: secs } = await supabase.from('plantilla_secciones')
      .select('*').eq('plantilla_id', plantillaId)
      .eq('activo', true).order('orden')

    const secsConItems: Seccion[] = []
    for (const s of (secs || [])) {
      const { data: its } = await supabase.from('plantilla_items')
        .select('*').eq('seccion_id', s.id)
        .eq('activo', true).order('orden')
      secsConItems.push({ ...s, items: its || [], _expandida: true })
    }
    setSecciones(secsConItems)
    setLoading(false)
  }

  // ================================================================
  // Plantilla
  // ================================================================
  async function guardarPlantilla() {
    if (!formPlantilla.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const { error } = await supabase.from('plantillas').update({
      nombre: formPlantilla.nombre.trim(),
      descripcion: formPlantilla.descripcion.trim() || null,
      tipo_carro: formPlantilla.tipo_carro || null,
      es_base: formPlantilla.es_base,
    }).eq('id', plantillaId)
    if (error) { toast.error(error.message); setGuardando(false); return }
    setPlantilla(p => p ? { ...p, ...formPlantilla, tipo_carro: formPlantilla.tipo_carro || null } : null)
    setEditandoPlantilla(false)
    toast.success('Plantilla actualizada')
    setGuardando(false)
  }

  // ================================================================
  // Secciones
  // ================================================================
  async function crearSeccion() {
    if (!formSeccion.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const maxOrden = secciones.length > 0 ? Math.max(...secciones.map(s => s.orden)) : 0
    const tipoInfo = TIPOS_SECCION.find(t => t.value === formSeccion.tipo)
    const { data: nueva, error } = await supabase.from('plantilla_secciones').insert({
      plantilla_id: plantillaId,
      nombre: formSeccion.nombre.trim(),
      tipo: formSeccion.tipo,
      icono: formSeccion.icono || tipoInfo?.icono || '📋',
      orden: maxOrden + 1,
      obligatoria: formSeccion.obligatoria,
      descripcion_ayuda: formSeccion.descripcion_ayuda.trim() || null,
    }).select().single()
    if (error) { toast.error(error.message); setGuardando(false); return }
    setSecciones(prev => [...prev, { ...nueva, items: [], _expandida: true }])
    setNuevaSeccion(false)
    setFormSeccion({ nombre: '', tipo: 'custom', icono: '📋', obligatoria: true, descripcion_ayuda: '' })
    toast.success('Sección creada')
    setGuardando(false)
  }

  async function actualizarSeccion(seccionId: string, campos: Partial<Seccion>) {
    const { error } = await supabase.from('plantilla_secciones').update(campos).eq('id', seccionId)
    if (error) { toast.error(error.message); return }
    setSecciones(prev => prev.map(s => s.id === seccionId ? { ...s, ...campos, _editando: false } : s))
    toast.success('Sección actualizada')
  }

  async function eliminarSeccion(seccionId: string) {
    if (!confirm('¿Eliminar esta sección y todos sus ítems?')) return
    await supabase.from('plantilla_secciones').update({ activo: false }).eq('id', seccionId)
    setSecciones(prev => prev.filter(s => s.id !== seccionId))
    toast.success('Sección eliminada')
  }

  async function moverSeccion(seccionId: string, direccion: 'arriba' | 'abajo') {
    const idx = secciones.findIndex(s => s.id === seccionId)
    if (direccion === 'arriba' && idx === 0) return
    if (direccion === 'abajo' && idx === secciones.length - 1) return
    const newSecs = [...secciones]
    const swapIdx = direccion === 'arriba' ? idx - 1 : idx + 1
    ;[newSecs[idx], newSecs[swapIdx]] = [newSecs[swapIdx], newSecs[idx]]
    newSecs[idx].orden = idx + 1
    newSecs[swapIdx].orden = swapIdx + 1
    setSecciones(newSecs)
    await supabase.from('plantilla_secciones').update({ orden: idx + 1 }).eq('id', newSecs[idx].id)
    await supabase.from('plantilla_secciones').update({ orden: swapIdx + 1 }).eq('id', newSecs[swapIdx].id)
  }

  // ================================================================
  // Ítems
  // ================================================================
  async function crearItem(seccionId: string) {
    const seccion = secciones.find(s => s.id === seccionId)
    if (!seccion) return
    const maxOrden = seccion.items.length > 0 ? Math.max(...seccion.items.map(i => i.orden)) : 0
    const { data: nuevo, error } = await supabase.from('plantilla_items').insert({
      seccion_id: seccionId,
      nombre: 'Nuevo ítem',
      tipo_campo: 'compuesto',
      orden: maxOrden + 1,
      requerido: true,
      tiene_vencimiento: false,
      tipos_incidencia: ['falta', 'vencimiento', 'deterioro', 'cantidad_incorrecta', 'caducado', 'mal_estado', 'otro'],
    }).select().single()
    if (error) { toast.error(error.message); return }
    setSecciones(prev => prev.map(s =>
      s.id === seccionId
        ? { ...s, items: [...s.items, { ...nuevo, _editando: true }] }
        : s
    ))
  }

  async function actualizarItem(seccionId: string, itemId: string, campos: Partial<Item>) {
    const { error } = await supabase.from('plantilla_items').update(campos).eq('id', itemId)
    if (error) { toast.error(error.message); return }
    setSecciones(prev => prev.map(s =>
      s.id === seccionId
        ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, ...campos, _editando: false } : i) }
        : s
    ))
    toast.success('Ítem guardado')
  }

  async function eliminarItem(seccionId: string, itemId: string) {
    if (!confirm('¿Eliminar este ítem?')) return
    await supabase.from('plantilla_items').update({ activo: false }).eq('id', itemId)
    setSecciones(prev => prev.map(s =>
      s.id === seccionId
        ? { ...s, items: s.items.filter(i => i.id !== itemId) }
        : s
    ))
  }

  async function moverItem(seccionId: string, itemId: string, direccion: 'arriba' | 'abajo') {
    const seccion = secciones.find(s => s.id === seccionId)
    if (!seccion) return
    const idx = seccion.items.findIndex(i => i.id === itemId)
    if (direccion === 'arriba' && idx === 0) return
    if (direccion === 'abajo' && idx === seccion.items.length - 1) return
    const newItems = [...seccion.items]
    const swapIdx = direccion === 'arriba' ? idx - 1 : idx + 1
    ;[newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]]
    newItems[idx].orden = idx + 1
    newItems[swapIdx].orden = swapIdx + 1
    setSecciones(prev => prev.map(s => s.id === seccionId ? { ...s, items: newItems } : s))
    await supabase.from('plantilla_items').update({ orden: idx + 1 }).eq('id', newItems[idx].id)
    await supabase.from('plantilla_items').update({ orden: swapIdx + 1 }).eq('id', newItems[swapIdx].id)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando editor...</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push('/admin/plantillas')} className="text-blue-700 text-sm font-medium">← Plantillas</button>
        <span className="font-semibold text-sm flex-1 text-center truncate">{plantilla?.nombre}</span>
        <button onClick={() => router.push(`/admin/plantillas/${plantillaId}/informe`)}
          className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold">
          PDF
        </button>
      </div>

      <div className="content pb-10">

        {/* Datos de la plantilla */}
        {!editandoPlantilla ? (
          <div className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-base text-gray-900">{plantilla?.nombre}</span>
                  {plantilla?.es_base && <span className="badge bg-blue-100 text-blue-700 text-xs border border-blue-200">⭐ Base</span>}
                  {plantilla?.tipo_carro && <span className="badge bg-gray-100 text-gray-600 text-xs">{TIPOS_CARRO.find(t => t.value === plantilla.tipo_carro)?.label}</span>}
                </div>
                {plantilla?.descripcion && <p className="text-xs text-gray-400">{plantilla.descripcion}</p>}
                <p className="text-xs text-gray-400 mt-1">{secciones.length} secciones · {secciones.reduce((a, s) => a + s.items.length, 0)} ítems</p>
              </div>
              <button onClick={() => setEditandoPlantilla(true)}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-500 bg-gray-50 flex-shrink-0">
                Editar
              </button>
            </div>
          </div>
        ) : (
          <div className="card border-blue-200">
            <div className="section-title mb-3">Editar plantilla</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" value={formPlantilla.nombre}
                  onChange={e => setFormPlantilla(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input resize-none" rows={2} value={formPlantilla.descripcion}
                  onChange={e => setFormPlantilla(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tipo de carro</label>
                <select className="input" value={formPlantilla.tipo_carro}
                  onChange={e => setFormPlantilla(f => ({ ...f, tipo_carro: e.target.value }))}>
                  {TIPOS_CARRO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={formPlantilla.es_base} className="w-4 h-4"
                  onChange={e => setFormPlantilla(f => ({ ...f, es_base: e.target.checked }))} />
                <div>
                  <div className="text-xs font-semibold">Plantilla base del hospital</div>
                  <div className="text-xs text-gray-400">Se aplica a todos los carros sin plantilla específica</div>
                </div>
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={guardarPlantilla} disabled={guardando} className="btn-primary flex-1">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setEditandoPlantilla(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        )}

        {/* Secciones */}
        {secciones.map((seccion, secIdx) => (
          <SeccionEditor
            key={seccion.id}
            seccion={seccion}
            secIdx={secIdx}
            totalSecciones={secciones.length}
            onToggleExpand={() => setSecciones(prev => prev.map(s => s.id === seccion.id ? { ...s, _expandida: !s._expandida } : s))}
            onToggleEditar={() => setSecciones(prev => prev.map(s => s.id === seccion.id ? { ...s, _editando: !s._editando } : s))}
            onActualizar={(campos) => actualizarSeccion(seccion.id, campos)}
            onEliminar={() => eliminarSeccion(seccion.id)}
            onMover={(dir) => moverSeccion(seccion.id, dir)}
            onCrearItem={() => crearItem(seccion.id)}
            onActualizarItem={(itemId, campos) => actualizarItem(seccion.id, itemId, campos)}
            onEliminarItem={(itemId) => eliminarItem(seccion.id, itemId)}
            onMoverItem={(itemId, dir) => moverItem(seccion.id, itemId, dir)}
            onToggleEditarItem={(itemId) => setSecciones(prev => prev.map(s =>
              s.id === seccion.id
                ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, _editando: !i._editando } : i) }
                : s
            ))}
          />
        ))}

        {/* Nueva sección */}
        {nuevaSeccion ? (
          <div className="card border-blue-200 bg-blue-50">
            <div className="section-title mb-3">Nueva sección</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" placeholder="Ej: Vía aérea, Acceso venoso..."
                  value={formSeccion.nombre}
                  onChange={e => setFormSeccion(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tipo de sección</label>
                <select className="input" value={formSeccion.tipo}
                  onChange={e => {
                    const tipo = e.target.value
                    const tipoInfo = TIPOS_SECCION.find(t => t.value === tipo)
                    setFormSeccion(f => ({ ...f, tipo, icono: tipoInfo?.icono || '📋', nombre: f.nombre || tipoInfo?.label || '' }))
                  }}>
                  {TIPOS_SECCION.map(t => <option key={t.value} value={t.value}>{t.icono} {t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Icono</label>
                  <input className="input" placeholder="📋" value={formSeccion.icono}
                    onChange={e => setFormSeccion(f => ({ ...f, icono: e.target.value }))} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formSeccion.obligatoria} className="w-4 h-4"
                      onChange={e => setFormSeccion(f => ({ ...f, obligatoria: e.target.checked }))} />
                    <span className="text-xs font-semibold">Obligatoria</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="label">Ayuda para el auditor <span className="text-gray-400">(opcional)</span></label>
                <input className="input" placeholder="Instrucción que verá el auditor al realizar el control"
                  value={formSeccion.descripcion_ayuda}
                  onChange={e => setFormSeccion(f => ({ ...f, descripcion_ayuda: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={crearSeccion} disabled={guardando} className="btn-primary flex-1">
                {guardando ? 'Creando...' : 'Crear sección'}
              </button>
              <button onClick={() => setNuevaSeccion(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setNuevaSeccion(true)}
            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-400 active:bg-gray-50 flex items-center justify-center gap-2">
            + Añadir sección
          </button>
        )}
      </div>
    </div>
  )
}

// =====================================================================
// Subcomponente: editor de sección
// =====================================================================
function SeccionEditor({
  seccion, secIdx, totalSecciones,
  onToggleExpand, onToggleEditar, onActualizar, onEliminar, onMover,
  onCrearItem, onActualizarItem, onEliminarItem, onMoverItem, onToggleEditarItem,
}: any) {
  const [formLocal, setFormLocal] = useState({
    nombre: seccion.nombre,
    icono: seccion.icono,
    obligatoria: seccion.obligatoria,
    descripcion_ayuda: seccion.descripcion_ayuda || '',
  })

  return (
    <div className={`card border-l-4 ${seccion.obligatoria ? 'border-l-blue-400' : 'border-l-gray-200'}`}>
      {/* Cabecera de sección */}
      <div className="flex items-center gap-2 mb-0">
        <span className="text-lg flex-shrink-0">{seccion.icono}</span>
        <div className="flex-1 min-w-0" onClick={onToggleExpand}>
          <div className="font-semibold text-sm text-gray-900 cursor-pointer">{seccion.nombre}</div>
          <div className="text-xs text-gray-400">
            {seccion.items.length} ítem{seccion.items.length !== 1 ? 's' : ''}
            {' · '}{seccion.obligatoria ? 'Obligatoria' : 'Opcional'}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onMover('arriba')} disabled={secIdx === 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 disabled:opacity-30 text-xs">↑</button>
          <button onClick={() => onMover('abajo')} disabled={secIdx === totalSecciones - 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 disabled:opacity-30 text-xs">↓</button>
          <button onClick={onToggleEditar}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 text-xs">✏️</button>
          <button onClick={onToggleExpand}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 text-xs">
            {seccion._expandida ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Editar sección */}
      {seccion._editando && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_60px] gap-2">
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={formLocal.nombre}
                  onChange={e => setFormLocal(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Icono</label>
                <input className="input text-center" value={formLocal.icono}
                  onChange={e => setFormLocal(f => ({ ...f, icono: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Texto de ayuda para el auditor</label>
              <input className="input" placeholder="Instrucción visible durante el control"
                value={formLocal.descripcion_ayuda}
                onChange={e => setFormLocal(f => ({ ...f, descripcion_ayuda: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formLocal.obligatoria} className="w-4 h-4"
                onChange={e => setFormLocal(f => ({ ...f, obligatoria: e.target.checked }))} />
              <span className="text-xs font-semibold">Sección obligatoria</span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => onActualizar(formLocal)} className="btn-primary flex-1 text-xs">Guardar</button>
              <button onClick={() => { if (confirm('¿Eliminar sección?')) onEliminar() }}
                className="text-xs border border-red-200 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
                Eliminar
              </button>
              <button onClick={onToggleEditar} className="btn-secondary text-xs">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Ítems */}
      {seccion._expandida && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {seccion.tipo === 'materiales' && (
            <div className="p-2 bg-blue-50 rounded-xl text-xs text-blue-600 mb-3">
              Los materiales de esta sección se gestionan desde <strong>Admin → Carros → Materiales</strong>.
              Aquí puedes añadir ítems de verificación adicionales.
            </div>
          )}
          {seccion.tipo === 'desfibrilador' && (
            <div className="p-2 bg-amber-50 rounded-xl text-xs text-amber-600 mb-3">
              Esta sección incluye automáticamente los campos del desfibrilador (modelo, censo, próximo mantenimiento).
            </div>
          )}
          {seccion.tipo === 'precintos' && (
            <div className="p-2 bg-gray-50 rounded-xl text-xs text-gray-500 mb-3">
              Esta sección incluye automáticamente los campos de precinto retirado y precinto colocado con foto.
            </div>
          )}

          {seccion.items.map((item: Item, itemIdx: number) => (
            <ItemEditor
              key={item.id}
              item={item}
              itemIdx={itemIdx}
              totalItems={seccion.items.length}
              onToggleEditar={() => onToggleEditarItem(item.id)}
              onActualizar={(campos: Partial<Item>) => onActualizarItem(item.id, campos)}
              onEliminar={() => onEliminarItem(item.id)}
              onMover={(dir: 'arriba' | 'abajo') => onMoverItem(item.id, dir)}
            />
          ))}

          <button onClick={onCrearItem}
            className="w-full mt-2 py-2 border border-dashed border-gray-200 rounded-xl text-xs font-semibold text-gray-400 active:bg-gray-50">
            + Añadir ítem a esta sección
          </button>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// Subcomponente: editor de ítem
// =====================================================================
function ItemEditor({ item, itemIdx, totalItems, onToggleEditar, onActualizar, onEliminar, onMover }: any) {
  const [form, setForm] = useState({
    nombre: item.nombre,
    descripcion: item.descripcion || '',
    tipo_campo: item.tipo_campo,
    requerido: item.requerido,
    cantidad_esperada: item.cantidad_esperada || '',
    tiene_vencimiento: item.tiene_vencimiento,
    unidad: item.unidad || '',
    tipos_incidencia: item.tipos_incidencia || TIPOS_INCIDENCIA_DISPONIBLES,
  })

  function toggleIncidencia(tipo: string) {
    setForm(f => ({
      ...f,
      tipos_incidencia: f.tipos_incidencia.includes(tipo)
        ? f.tipos_incidencia.filter((t: string) => t !== tipo)
        : [...f.tipos_incidencia, tipo],
    }))
  }

  return (
    <div className={`mb-2 rounded-xl border ${item._editando ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
      {/* Vista compacta */}
      {!item._editando && (
        <div className="flex items-center gap-2 p-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-800 truncate">{item.nombre}</div>
            <div className="text-xs text-gray-400">
              {TIPOS_CAMPO.find(t => t.value === item.tipo_campo)?.label || item.tipo_campo}
              {item.cantidad_esperada ? ` · ×${item.cantidad_esperada}` : ''}
              {item.tiene_vencimiento ? ' · Con vto.' : ''}
              {item.requerido ? ' · Requerido' : ' · Opcional'}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onMover('arriba')} disabled={itemIdx === 0}
              className="w-6 h-6 flex items-center justify-center text-gray-400 disabled:opacity-30 text-xs">↑</button>
            <button onClick={() => onMover('abajo')} disabled={itemIdx === totalItems - 1}
              className="w-6 h-6 flex items-center justify-center text-gray-400 disabled:opacity-30 text-xs">↓</button>
            <button onClick={onToggleEditar}
              className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white">
              Editar
            </button>
          </div>
        </div>
      )}

      {/* Formulario de edición */}
      {item._editando && (
        <div className="p-3 flex flex-col gap-3">
          <div>
            <label className="label">Nombre del ítem *</label>
            <input className="input" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="label">Descripción / ayuda</label>
            <input className="input" placeholder="Instrucción para el auditor"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div>
            <label className="label">Tipo de campo</label>
            <select className="input" value={form.tipo_campo}
              onChange={e => setForm(f => ({ ...f, tipo_campo: e.target.value }))}>
              {TIPOS_CAMPO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {(form.tipo_campo === 'cantidad' || form.tipo_campo === 'compuesto') && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Cantidad esperada</label>
                <input className="input" type="number" min="1" value={form.cantidad_esperada}
                  onChange={e => setForm(f => ({ ...f, cantidad_esperada: e.target.value }))} />
              </div>
              <div>
                <label className="label">Unidad</label>
                <input className="input" placeholder="ml, mg, unidades..." value={form.unidad}
                  onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} />
              </div>
            </div>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.tiene_vencimiento} className="w-4 h-4"
                onChange={e => setForm(f => ({ ...f, tiene_vencimiento: e.target.checked }))} />
              <span className="text-xs font-semibold">Tiene fecha de vencimiento</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requerido} className="w-4 h-4"
                onChange={e => setForm(f => ({ ...f, requerido: e.target.checked }))} />
              <span className="text-xs font-semibold">Requerido</span>
            </label>
          </div>
          <div>
            <label className="label">Tipos de incidencia aplicables</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {TIPOS_INCIDENCIA_DISPONIBLES.map(tipo => (
                <button key={tipo} type="button"
                  onClick={() => toggleIncidencia(tipo)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    form.tipos_incidencia.includes(tipo)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}>
                  {tipo.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onActualizar({
              nombre: form.nombre.trim(),
              descripcion: form.descripcion.trim() || null,
              tipo_campo: form.tipo_campo,
              requerido: form.requerido,
              cantidad_esperada: form.cantidad_esperada ? parseInt(form.cantidad_esperada) : null,
              tiene_vencimiento: form.tiene_vencimiento,
              unidad: form.unidad.trim() || null,
              tipos_incidencia: form.tipos_incidencia,
            })} className="btn-primary flex-1 text-xs">Guardar ítem</button>
            <button onClick={() => { if (confirm('¿Eliminar este ítem?')) onEliminar() }}
              className="text-xs border border-red-200 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">🗑️</button>
            <button onClick={onToggleEditar} className="btn-secondary text-xs">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

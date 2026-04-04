'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'

interface Material {
  id: string
  nombre: string
  cantidad_requerida: number
  tipo_falla: 'menor' | 'grave' | 'ninguno'
  activo: boolean
  tiene_vencimiento: boolean
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

export default function GestionMaterialesPage() {
  const [carro, setCarro] = useState<any>(null)
  const [cajones, setCajones] = useState<Cajon[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState<string|null>(null)
  const router = useRouter()
  const params = useParams()
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [carroId])

  async function cargarDatos() {
    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('id', carroId).single()
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
        .map((m: any) => ({ ...m, tiene_vencimiento: m.tiene_vencimiento ?? true }))
    })))
    setLoading(false)
  }

  // ── CAJONES ──────────────────────────────────────────────

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
    const { error } = await supabase.from('cajones')
      .update({ nombre: nuevo.trim() }).eq('id', cajonId)
    if (error) { toast.error('Error al renombrar'); return }
    setCajones(prev => prev.map(c => c.id === cajonId ? { ...c, nombre: nuevo.trim() } : c))
    toast.success('Cajón renombrado')
  }

  async function toggleCajon(cajonId: string, activo: boolean) {
    const { error } = await supabase.from('cajones')
      .update({ activo: !activo }).eq('id', cajonId)
    if (error) { toast.error('Error'); return }
    setCajones(prev => prev.map(c => c.id === cajonId ? { ...c, activo: !activo } : c))
    toast.success(!activo ? 'Cajón activado' : 'Cajón desactivado')
  }

  function toggleExpandido(cajonId: string) {
    setCajones(prev => prev.map(c => c.id === cajonId ? { ...c, expandido: !c.expandido } : c))
  }

  // ── MATERIALES ───────────────────────────────────────────

  async function agregarMaterial(cajonId: string) {
    const nombre = prompt('Nombre del material:')
    if (!nombre?.trim()) return
    const orden = cajones.find(c => c.id === cajonId)?.materiales.length || 0
    const { data, error } = await supabase.from('materiales').insert({
      cajon_id: cajonId,
      nombre: nombre.trim(),
      cantidad_requerida: 1,
      tipo_falla: 'menor',
      activo: true,
      tiene_vencimiento: true,
      orden,
    }).select().single()
    if (error) { toast.error('Error al agregar material'); return }
    setCajones(prev => prev.map(c =>
      c.id === cajonId ? { ...c, materiales: [...c.materiales, { ...data, tiene_vencimiento: true }] } : c
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

  async function toggleMaterial(matId: string, cajonId: string, activo: boolean) {
    await updateMaterial(matId, cajonId, 'activo', !activo)
    toast.success(!activo ? 'Material activado' : 'Material desactivado')
  }

  async function toggleVencimiento(matId: string, cajonId: string, tiene: boolean) {
    await updateMaterial(matId, cajonId, 'tiene_vencimiento', !tiene)
  }

  async function editarNombre(matId: string, cajonId: string, nombreActual: string) {
    const nuevo = prompt('Nuevo nombre:', nombreActual)
    if (!nuevo?.trim() || nuevo === nombreActual) return
    await updateMaterial(matId, cajonId, 'nombre', nuevo.trim())
    toast.success('Nombre actualizado')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  const cajonesActivos = cajones.filter(c => c.activo)
  const cajonesInactivos = cajones.filter(c => !c.activo)

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Gestión de materiales</span>
      </div>

      <div className="content">
        {/* Info carro */}
        <div className="card bg-blue-50 border-blue-100">
          <div className="text-sm font-semibold text-blue-800">{carro?.codigo} — {carro?.nombre}</div>
          <div className="text-xs text-blue-600 mt-1">{(carro?.servicios as any)?.nombre || carro?.ubicacion}</div>
          <div className="flex gap-3 mt-2 text-xs text-blue-500">
            <span>{cajonesActivos.length} cajones activos</span>
            <span>{cajonesActivos.reduce((acc, c) => acc + c.materiales.filter(m => m.activo).length, 0)} materiales activos</span>
          </div>
        </div>

        {/* Leyenda */}
        <div className="card py-2.5 px-3">
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>Fallo grave</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <span>Fallo menor</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-gray-300"></div>
              <span>Sin fallo</span>
            </div>
          </div>
        </div>

        {/* Cajones activos */}
        {cajonesActivos.map(cajon => (
          <div key={cajon.id} className="card">
            {/* Header cajón */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => toggleExpandido(cajon.id)}
                className="flex-1 flex items-center gap-2 text-left"
              >
                <span className="text-sm font-semibold flex-1">{cajon.nombre}</span>
                <span className="text-xs text-gray-400">{cajon.materiales.filter(m => m.activo).length} activos</span>
                <span className="text-gray-400 text-xs">{cajon.expandido ? '▲' : '▼'}</span>
              </button>
              <button
                onClick={() => renombrarCajon(cajon.id, cajon.nombre)}
                className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-gray-50"
              >✏️</button>
              <button
                onClick={() => toggleCajon(cajon.id, cajon.activo)}
                className="text-xs px-2 py-1 rounded-lg border border-amber-200 text-amber-600 bg-amber-50"
              >Desactivar</button>
            </div>

            {cajon.expandido && (
              <>
                {/* Headers tabla */}
                <div className="grid grid-cols-[1fr_44px_72px_32px_32px] gap-1 px-1 mb-1">
                  <div className="text-xs text-gray-400 font-semibold">Material</div>
                  <div className="text-xs text-gray-400 text-center">Cant</div>
                  <div className="text-xs text-gray-400 text-center">Fallo</div>
                  <div className="text-xs text-gray-400 text-center">Vto</div>
                  <div className="text-xs text-gray-400 text-center">Act</div>
                </div>

                {/* Materiales */}
                {cajon.materiales.map(mat => (
                  <div key={mat.id}
                    className={`grid grid-cols-[1fr_44px_72px_32px_32px] gap-1 items-center py-1.5 border-b border-gray-50 last:border-0 ${!mat.activo ? 'opacity-40' : ''}`}
                  >
                    {/* Nombre */}
                    <button
                      className="text-xs text-left font-medium leading-tight truncate"
                      onClick={() => editarNombre(mat.id, cajon.id, mat.nombre)}
                    >
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          mat.tipo_falla === 'grave' ? 'bg-red-500' :
                          mat.tipo_falla === 'menor' ? 'bg-amber-400' : 'bg-gray-300'
                        }`}></div>
                        <span className="truncate">{mat.nombre}</span>
                        {guardando === mat.id && <span className="text-blue-400">...</span>}
                      </div>
                    </button>

                    {/* Cantidad */}
                    <input
                      type="number"
                      min={1}
                      value={mat.cantidad_requerida}
                      onChange={e => updateMaterial(mat.id, cajon.id, 'cantidad_requerida', parseInt(e.target.value) || 1)}
                      className="input text-xs py-1 text-center px-1"
                      disabled={!mat.activo}
                    />

                    {/* Tipo falla */}
                    <select
                      value={mat.tipo_falla}
                      onChange={e => updateMaterial(mat.id, cajon.id, 'tipo_falla', e.target.value)}
                      className="input text-xs py-1 px-1"
                      disabled={!mat.activo}
                    >
                      <option value="grave">Grave</option>
                      <option value="menor">Menor</option>
                      <option value="ninguno">Ninguno</option>
                    </select>

                    {/* Toggle vencimiento */}
                    <div className="flex items-center justify-center">
                      <div
                        onClick={() => mat.activo && toggleVencimiento(mat.id, cajon.id, mat.tiene_vencimiento)}
                        className={`w-7 h-4 rounded-full cursor-pointer transition-colors ${
                          mat.tiene_vencimiento ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${
                          mat.tiene_vencimiento ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}></div>
                      </div>
                    </div>

                    {/* Toggle activo */}
                    <div className="flex items-center justify-center">
                      <div
                        onClick={() => toggleMaterial(mat.id, cajon.id, mat.activo)}
                        className={`w-7 h-4 rounded-full cursor-pointer transition-colors ${
                          mat.activo ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${
                          mat.activo ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}></div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Botón agregar material */}
                <button
                  onClick={() => agregarMaterial(cajon.id)}
                  className="w-full mt-2 py-2 border border-dashed border-blue-300 rounded-xl text-xs text-blue-600 font-medium bg-blue-50 active:bg-blue-100"
                >
                  + Agregar material
                </button>
              </>
            )}
          </div>
        ))}

        {/* Cajones desactivados */}
        {cajonesInactivos.length > 0 && (
          <div className="card border-gray-100">
            <div className="section-title mb-3">Cajones desactivados ({cajonesInactivos.length})</div>
            {cajonesInactivos.map(cajon => (
              <div key={cajon.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 opacity-50">
                <span className="text-sm flex-1 line-through text-gray-400">{cajon.nombre}</span>
                <button
                  onClick={() => toggleCajon(cajon.id, cajon.activo)}
                  className="text-xs px-2 py-1 rounded-lg border border-green-200 text-green-600 bg-green-50"
                >Activar</button>
              </div>
            ))}
          </div>
        )}

        {/* Botón agregar cajón */}
        <button
          onClick={agregarCajon}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm text-gray-500 font-medium bg-white active:bg-gray-50"
        >
          + Agregar cajón nuevo
        </button>

        <div className="card bg-amber-50 border-amber-100">
          <p className="text-xs text-amber-700 leading-relaxed">
            Los cambios se guardan automáticamente. Los materiales y cajones desactivados no aparecen en las auditorías pero se conserva su historial.
          </p>
        </div>
      </div>
    </div>
  )
}

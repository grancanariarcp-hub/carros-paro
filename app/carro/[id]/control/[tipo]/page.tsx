'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { colorVencimiento, classBadgeVto, formatFecha, proximoControl } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Carro, Cajon, Material, Perfil, Desfibrilador } from '@/lib/types'

interface ItemState {
  material_id: string
  cantidad_ok: boolean
  estado_ok: boolean
  tiene_falla: boolean
  tipo_falla: 'menor' | 'grave' | null
  descripcion_falla: string
  foto_url: string
  fecha_vencimiento: string
  foto_file?: File
}

export default function ControlPage() {
  const [carro, setCarro] = useState<Carro|null>(null)
  const [cajones, setCajones] = useState<Cajon[]>([])
  const [desf, setDesf] = useState<Desfibrilador|null>(null)
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [items, setItems] = useState<Record<string, ItemState>>({})
  const [desfForm, setDesfForm] = useState({ numero_censo: '', modelo: '', fecha_mantenimiento: '' })
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const carroId = params.id as string
  const tipo = params.tipo as string
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fotoTarget, setFotoTarget] = useState<string|null>(null)

  useEffect(() => { cargarDatos() }, [carroId])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)

    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('id', carroId).single()
    setCarro(c)

    const { data: cajonesData } = await supabase.from('cajones')
      .select('*, materiales(*)')
      .eq('carro_id', carroId)
      .order('orden')
    setCajones(cajonesData || [])

    const { data: d } = await supabase.from('desfibriladores')
      .select('*').eq('carro_id', carroId).eq('activo', true).single()
    if (d) {
      setDesf(d)
      setDesfForm({
        numero_censo: d.numero_censo || '',
        modelo: d.modelo || '',
        fecha_mantenimiento: d.fecha_mantenimiento || ''
      })
    }

    // Inicializar items
    const initItems: Record<string, ItemState> = {}
    for (const cajonData of (cajonesData || [])) {
      for (const mat of (cajonData.materiales || [])) {
        if (mat.activo) {
          initItems[mat.id] = {
            material_id: mat.id,
            cantidad_ok: false, estado_ok: false,
            tiene_falla: false, tipo_falla: null,
            descripcion_falla: '', foto_url: '', fecha_vencimiento: ''
          }
        }
      }
    }
    setItems(initItems)
    setLoading(false)
  }

  function updateItem(matId: string, field: keyof ItemState, value: any) {
    setItems(prev => ({ ...prev, [matId]: { ...prev[matId], [field]: value } }))
  }

  function toggleFalla(matId: string) {
    const curr = items[matId]?.tiene_falla
    setItems(prev => ({ ...prev, [matId]: { ...prev[matId], tiene_falla: !curr, tipo_falla: null } }))
  }

  function abrirFoto(matId: string) {
    setFotoTarget(matId)
    fileInputRef.current?.click()
  }

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !fotoTarget) return
    updateItem(fotoTarget, 'foto_file', file)
    updateItem(fotoTarget, 'foto_url', URL.createObjectURL(file))
    setFotoTarget(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function calcularResultado(): 'operativo' | 'condicional' | 'no_operativo' {
    const fallos = Object.values(items).filter(i => i.tiene_falla)
    if (fallos.some(f => f.tipo_falla === 'grave')) return 'no_operativo'
    if (fallos.some(f => f.tipo_falla === 'menor')) return 'condicional'
    return 'operativo'
  }

  function hayVtosBloqueantes(): boolean {
    return Object.values(items).some(i => {
      if (!i.fecha_vencimiento) return false
      return colorVencimiento(i.fecha_vencimiento) === 'rojo'
    })
  }

  async function guardar() {
    if (!desfForm.numero_censo || !desfForm.modelo || !desfForm.fecha_mantenimiento) {
      toast.error('Completá todos los datos del desfibrilador')
      return
    }
    if (hayVtosBloqueantes()) {
      toast.error('Hay materiales con vencimiento menor a 7 días. Actualizá las fechas antes de guardar.')
      return
    }

    setGuardando(true)
    const resultado = calcularResultado()

    try {
      // Subir fotos
      for (const [matId, item] of Object.entries(items)) {
        if (item.foto_file) {
          const ext = item.foto_file.name.split('.').pop()
          const path = `${carroId}/${Date.now()}_${matId}.${ext}`
          const { data: up } = await supabase.storage
            .from('fotos-fallos').upload(path, item.foto_file)
          if (up) {
            const { data: url } = supabase.storage.from('fotos-fallos').getPublicUrl(path)
            updateItem(matId, 'foto_url', url.publicUrl)
            items[matId].foto_url = url.publicUrl
          }
        }
      }

      // Guardar inspección
      const { data: insp, error: inspError } = await supabase.from('inspecciones').insert({
        carro_id: carroId,
        tipo,
        resultado,
        auditor_id: perfil?.id,
        numero_censo_desf: desfForm.numero_censo,
        modelo_desf: desfForm.modelo,
        fecha_mantenimiento_desf: desfForm.fecha_mantenimiento,
      }).select().single()

      if (inspError) throw inspError

      // Guardar items
      const itemsArr = Object.values(items).map(i => ({
        inspeccion_id: insp.id,
        material_id: i.material_id,
        cantidad_ok: i.cantidad_ok,
        estado_ok: i.estado_ok,
        tiene_falla: i.tiene_falla,
        tipo_falla: i.tiene_falla ? i.tipo_falla : null,
        descripcion_falla: i.descripcion_falla || null,
        foto_url: i.foto_url || null,
        fecha_vencimiento: i.fecha_vencimiento || null,
      }))
      await supabase.from('items_inspeccion').insert(itemsArr)

      // Actualizar carro
      const proximo = tipo !== 'post_uso'
        ? proximoControl(carro?.frecuencia_control || 'mensual')
        : carro?.proximo_control

      await supabase.from('carros').update({
        estado: resultado,
        ultimo_control: new Date().toISOString(),
        ultimo_tipo_control: tipo,
        proximo_control: proximo,
      }).eq('id', carroId)

      // Actualizar desfibrilador
      if (desf) {
        await supabase.from('desfibriladores').update({
          numero_censo: desfForm.numero_censo,
          modelo: desfForm.modelo,
          fecha_mantenimiento: desfForm.fecha_mantenimiento,
        }).eq('id', desf.id)
      } else {
        await supabase.from('desfibriladores').insert({
          carro_id: carroId,
          numero_censo: desfForm.numero_censo,
          modelo: desfForm.modelo,
          fecha_mantenimiento: desfForm.fecha_mantenimiento,
        })
      }

      // Alerta si no operativo
      if (resultado === 'no_operativo') {
        await supabase.from('alertas').insert({
          carro_id: carroId,
          tipo: 'no_operativo',
          mensaje: `Carro ${carro?.codigo} declarado NO OPERATIVO en control del ${new Date().toLocaleDateString('es')}`
        })
      }

      // Log auditoría
      await supabase.from('log_auditoria').insert({
        usuario_id: perfil?.id,
        accion: 'control_realizado',
        tabla_afectada: 'inspecciones',
        registro_id: insp.id,
        detalle: { tipo, resultado, carro_codigo: carro?.codigo }
      })

      router.push(`/carro/${carroId}/resultado/${insp.id}`)
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  const tipoLabel = tipo === 'mensual' ? 'Control mensual'
    : tipo === 'post_uso' ? 'Control post-utilización'
    : tipo === 'extra' ? 'Control extra' : tipo

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">{tipoLabel}</span>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFotoChange} />

      <div className="content">
        <div className="card">
          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
            <div><div className="label">Carro</div><div className="font-semibold">{carro?.codigo}</div></div>
            <div><div className="label">Fecha</div><div className="font-semibold">{new Date().toLocaleDateString('es-AR')}</div></div>
            <div><div className="label">Servicio</div><div className="font-semibold">{(carro?.servicios as any)?.nombre || '—'}</div></div>
            <div><div className="label">Auditor</div><div className="font-semibold">{perfil?.nombre}</div></div>
            <div><div className="label">Último control</div><div className="font-semibold">{formatFecha(carro?.ultimo_control) || '—'}</div></div>
            <div><div className="label">Tipo anterior</div><div className="font-semibold">{carro?.ultimo_tipo_control?.replace('_',' ') || '—'}</div></div>
          </div>
          <div className="pt-2 border-t border-gray-50">
            <div className="section-title mb-2">Semáforo de vencimientos</div>
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div><span className="text-xs text-gray-500">+30 días</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></div><span className="text-xs text-gray-500">7–30 días</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div><span className="text-xs text-gray-500">&lt;7 días · bloqueante</span></div>
            </div>
          </div>
        </div>

        {cajones.map(cajon => {
          const mats = (cajon.materiales || []).filter((m: Material) => m.activo)
          if (mats.length === 0) return null
          const tieneProblemas = mats.some((m: Material) => items[m.id]?.tiene_falla)

          return (
            <div key={cajon.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">{cajon.nombre}</div>
                {tieneProblemas
                  ? <span className="badge bg-amber-100 text-amber-800">Revisar</span>
                  : <span className="badge bg-green-100 text-green-700">Sin fallas</span>}
              </div>

              <div className="grid grid-cols-[1fr_60px_26px_26px_26px] gap-1 items-center mb-2 pb-1 border-b border-gray-50">
                <div className="text-xs text-gray-400 font-semibold">Material</div>
                <div className="text-xs text-gray-400 text-center">Vto.</div>
                <div className="text-xs text-gray-400 text-center">Cant</div>
                <div className="text-xs text-gray-400 text-center">Est.</div>
                <div className="text-xs text-gray-400 text-center">Falla</div>
              </div>

              {mats.map((mat: Material) => {
                const item = items[mat.id]
                if (!item) return null
                const vtoClass = item.fecha_vencimiento ? classBadgeVto(item.fecha_vencimiento) : 'bg-gray-100 text-gray-400'
                const vtoColor = colorVencimiento(item.fecha_vencimiento)

                return (
                  <div key={mat.id}>
                    <div className="grid grid-cols-[1fr_60px_26px_26px_26px] gap-1 items-center py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-xs font-medium leading-tight">{mat.nombre}</div>
                        <div className="text-xs text-gray-400">×{mat.cantidad_requerida}</div>
                      </div>
                      <button
                        className={`vto-badge ${vtoClass} text-xs`}
                        onClick={() => {
                          const v = prompt('Fecha de vencimiento (AAAA-MM-DD):',item.fecha_vencimiento)
                          if (v) updateItem(mat.id, 'fecha_vencimiento', v)
                        }}
                      >
                        {item.fecha_vencimiento
                          ? new Date(item.fecha_vencimiento).toLocaleDateString('es-AR',{month:'short',year:'2-digit'})
                          : 'Ingresá'}
                      </button>
                      <div
                        className={`chk-box mx-auto ${item.cantidad_ok ? 'checked-ok' : ''}`}
                        onClick={() => updateItem(mat.id, 'cantidad_ok', !item.cantidad_ok)}
                      >
                        {item.cantidad_ok && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth={3}/></svg>}
                      </div>
                      <div
                        className={`chk-box mx-auto ${item.estado_ok ? 'checked-ok' : ''}`}
                        onClick={() => updateItem(mat.id, 'estado_ok', !item.estado_ok)}
                      >
                        {item.estado_ok && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth={3}/></svg>}
                      </div>
                      <div
                        className={`chk-box mx-auto border-red-300 ${item.tiene_falla ? 'checked-falla' : ''}`}
                        onClick={() => toggleFalla(mat.id)}
                      >
                        {item.tiene_falla && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" strokeWidth={3}/><line x1="6" y1="6" x2="18" y2="18" strokeWidth={3}/></svg>}
                      </div>
                    </div>

                    {vtoColor === 'rojo' && item.fecha_vencimiento && (
                      <div className="mb-1 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold">
                        ⛔ Vencimiento &lt;7 días — actualizá la fecha para poder guardar
                      </div>
                    )}

                    {item.tiene_falla && (
                      <div className="falla-drawer mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeWidth={2}/><line x1="12" y1="9" x2="12" y2="13" strokeWidth={2}/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2}/></svg>
                          Falla detectada — {mat.nombre}
                        </div>
                        <div>
                          <div className="label mb-1">Tipo de falla</div>
                          <div className="flex gap-2">
                            {(['menor','grave'] as const).map(tf => (
                              <button key={tf}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  item.tipo_falla === tf
                                    ? tf === 'menor' ? 'bg-amber-600 text-white border-amber-600'
                                      : 'bg-red-700 text-white border-red-700'
                                    : 'bg-white text-gray-700 border-gray-200'
                                }`}
                                onClick={() => updateItem(mat.id, 'tipo_falla', tf)}
                              >
                                Fallo {tf}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="label mb-1">Descripción de la falla</div>
                          <textarea
                            className="input resize-none"
                            rows={2}
                            placeholder="Describí la falla en detalle..."
                            value={item.descripcion_falla}
                            onChange={e => updateItem(mat.id, 'descripcion_falla', e.target.value)}
                          />
                        </div>
                        <div>
                          <div className="label mb-1">Fotografía de evidencia</div>
                          {item.foto_url ? (
                            <div className="relative">
                              <img src={item.foto_url} alt="evidencia"
                                className="w-full h-28 object-cover rounded-xl border border-red-200" />
                              <button
                                onClick={() => { updateItem(mat.id, 'foto_url', ''); updateItem(mat.id, 'foto_file', undefined) }}
                                className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center"
                              >✕</button>
                              <div className="text-xs text-green-700 mt-1 font-medium">✓ Foto adjunta correctamente</div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                className="flex-1 py-2.5 border border-dashed border-red-300 rounded-xl text-xs text-red-600 font-medium flex items-center justify-center gap-2 bg-white active:bg-red-50"
                                onClick={() => abrirFoto(mat.id)}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeWidth={2}/><circle cx="12" cy="13" r="4" strokeWidth={2}/></svg>
                                Tomar foto
                              </button>
                              <button
                                className="flex-1 py-2.5 border border-dashed border-red-300 rounded-xl text-xs text-red-600 font-medium flex items-center justify-center gap-2 bg-white active:bg-red-50"
                                onClick={() => abrirFoto(mat.id)}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2}/><circle cx="8.5" cy="8.5" r="1.5" strokeWidth={2}/><polyline points="21 15 16 10 5 21" strokeWidth={2}/></svg>
                                Desde galería
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        <div className="card">
          <div className="font-semibold text-sm mb-3">Desfibrilador</div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="label">N° censo *</label>
              <input className="input" placeholder="Ej: DEF-2024-0312" value={desfForm.numero_censo}
                onChange={e => setDesfForm({...desfForm, numero_censo: e.target.value})} />
            </div>
            <div>
              <label className="label">Modelo *</label>
              <input className="input" placeholder="Ej: Zoll AED Plus" value={desfForm.modelo}
                onChange={e => setDesfForm({...desfForm, modelo: e.target.value})} />
            </div>
            <div>
              <label className="label">Fecha próximo mantenimiento *</label>
              <input className="input" type="date" value={desfForm.fecha_mantenimiento}
                onChange={e => setDesfForm({...desfForm, fecha_mantenimiento: e.target.value})} />
            </div>
          </div>
        </div>

        <button className="btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Finalizar y guardar control'}
        </button>
      </div>
    </div>
  )
}

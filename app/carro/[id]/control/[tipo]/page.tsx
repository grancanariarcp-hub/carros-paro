'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname, useParams } from 'next/navigation'
import { colorVencimiento, classBadgeVto, formatFecha, proximoControl } from '@/lib/utils'
import toast from 'react-hot-toast'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'
import FirmaDigital, { type DatosFirma } from '@/components/FirmaDigital'
import type { Carro, Cajon, Material, Perfil, Desfibrilador } from '@/lib/types'
import { rutaPadre } from '@/lib/navigation'

interface ItemState {
  material_id: string
  cantidad_ok: boolean
  estado_ok: boolean
  tiene_falla: boolean
  tipo_falla: 'menor' | 'grave' | null
  descripcion_falla: string
  foto_url: string
  fecha_vencimiento: string
  tiene_vencimiento: boolean
  foto_file?: File
}

interface PrecintoState {
  numero: string
  foto_file?: File
  foto_url: string
}

export default function ControlPage() {
  const [carro, setCarro] = useState<Carro | null>(null)
  const [cajones, setCajones] = useState<Cajon[]>([])
  const [desf, setDesf] = useState<Desfibrilador | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [items, setItems] = useState<Record<string, ItemState>>({})
  const [desfForm, setDesfForm] = useState({
    numero_censo: '', modelo: '', marca: '',
    fecha_ultimo_mantenimiento: '', fecha_mantenimiento: ''
  })
  const [precintoRetirado, setPrecintoRetirado] = useState<PrecintoState>({ numero: '', foto_url: '' })
  const [precintoColocado, setPrecintoColocado] = useState<PrecintoState>({ numero: '', foto_url: '' })
  const [guardando, setGuardando] = useState(false)
  const [escaneando, setEscaneando] = useState(false)
  const [mostrarFirma, setMostrarFirma] = useState(false)
  const [campoEscaneo, setCampoEscaneo] = useState<'precinto_retirado' | 'precinto_colocado' | 'desf_censo'>('precinto_retirado')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const carroId = params.id as string
  const tipo = params.tipo as string
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filePrecintoRef = useRef<HTMLInputElement>(null)
  const [fotoTarget, setFotoTarget] = useState<string | null>(null)
  const [fotoPrecintoTarget, setFotoPrecintoTarget] = useState<'retirado' | 'colocado' | null>(null)

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
      .eq('activo', true)
      .order('orden')
    setCajones(cajonesData || [])

    const { data: d } = await supabase.from('desfibriladores')
      .select('*').eq('carro_id', carroId).eq('activo', true).single()
    if (d) {
      setDesf(d)
      setDesfForm({
        numero_censo: d.numero_censo || '',
        modelo: d.modelo || '',
        marca: d.marca || '',
        fecha_ultimo_mantenimiento: d.fecha_ultimo_mantenimiento || '',
        fecha_mantenimiento: d.fecha_mantenimiento || '',
      })
    }

    const initItems: Record<string, ItemState> = {}
    for (const cajonData of (cajonesData || [])) {
      for (const mat of (cajonData.materiales || [])) {
        if (mat.activo) {
          initItems[mat.id] = {
            material_id: mat.id,
            cantidad_ok: false,
            estado_ok: false,
            tiene_falla: false,
            tipo_falla: null,
            descripcion_falla: '',
            foto_url: '',
            fecha_vencimiento: mat.fecha_vencimiento || '',
            tiene_vencimiento: mat.tiene_vencimiento ?? true,
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

  async function actualizarFechaVto(matId: string, fecha: string) {
    updateItem(matId, 'fecha_vencimiento', fecha)
    await supabase.from('materiales')
      .update({ fecha_vencimiento: fecha || null })
      .eq('id', matId)
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

  function abrirFotoPrecinto(tipo: 'retirado' | 'colocado') {
    setFotoPrecintoTarget(tipo)
    filePrecintoRef.current?.click()
  }

  function handleFotoPrecintoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !fotoPrecintoTarget) return
    const url = URL.createObjectURL(file)
    if (fotoPrecintoTarget === 'retirado') {
      setPrecintoRetirado(prev => ({ ...prev, foto_file: file, foto_url: url }))
    } else {
      setPrecintoColocado(prev => ({ ...prev, foto_file: file, foto_url: url }))
    }
    setFotoPrecintoTarget(null)
    if (filePrecintoRef.current) filePrecintoRef.current.value = ''
  }

  async function subirFotoPrecinto(tipo: 'retirado' | 'colocado', file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `precintos/${carroId}/${Date.now()}_precinto_${tipo}.${ext}`
    const { data } = await supabase.storage.from('evidencias').upload(path, file)
    if (!data) return null
    const { data: url } = supabase.storage.from('evidencias').getPublicUrl(path)
    return url.publicUrl
  }

  function calcularResultado(): 'operativo' | 'condicional' | 'no_operativo' {
    const fallos = Object.values(items).filter(i => i.tiene_falla)
    if (fallos.some(f => f.tipo_falla === 'grave')) return 'no_operativo'
    if (fallos.some(f => f.tipo_falla === 'menor')) return 'condicional'
    return 'operativo'
  }

  function hayVtosBloqueantes(): boolean {
    return Object.values(items).some(i => {
      if (!i.tiene_vencimiento || !i.fecha_vencimiento) return false
      return colorVencimiento(i.fecha_vencimiento) === 'rojo'
    })
  }

  // Paso 1: validar y abrir pantalla de firma
  function solicitarFirma() {
    if (!desfForm.numero_censo || !desfForm.modelo || !desfForm.fecha_mantenimiento) {
      toast.error('Completá todos los datos del desfibrilador')
      return
    }
    if (hayVtosBloqueantes()) {
      toast.error('Hay materiales con vencimiento menor a 7 días. Actualizá las fechas antes de continuar.')
      return
    }
    setMostrarFirma(true)
  }

  // Paso 2: recibir firma y guardar todo
  async function guardarConFirma(datosFirma: DatosFirma) {
    setGuardando(true)
    const resultado = calcularResultado()

    try {
      // Subir fotos de fallos
      for (const [matId, item] of Object.entries(items)) {
        if (item.foto_file) {
          const ext = item.foto_file.name.split('.').pop()
          const path = `${carroId}/${Date.now()}_${matId}.${ext}`
          const { data: up } = await supabase.storage
            .from('fotos-fallos').upload(path, item.foto_file)
          if (up) {
            const { data: url } = supabase.storage.from('fotos-fallos').getPublicUrl(path)
            items[matId].foto_url = url.publicUrl
          }
        }
      }

      // Subir fotos de precintos
      let urlFotoPrecintoRetirado: string | null = null
      let urlFotoPrecintoColocado: string | null = null
      if (precintoRetirado.foto_file) {
        urlFotoPrecintoRetirado = await subirFotoPrecinto('retirado', precintoRetirado.foto_file)
      }
      if (precintoColocado.foto_file) {
        urlFotoPrecintoColocado = await subirFotoPrecinto('colocado', precintoColocado.foto_file)
      }

      // Subir PNG de la firma
      let firmaUrl: string | null = null
      const firmaPath = `firmas/${carroId}/${Date.now()}_firma.png`
      const { data: firmaUp, error: firmaErr } = await supabase.storage
        .from('evidencias')
        .upload(firmaPath, datosFirma.blob, { contentType: 'image/png', upsert: false })
      if (firmaUp && !firmaErr) {
        const { data: firmaPublic } = supabase.storage
          .from('evidencias')
          .getPublicUrl(firmaPath)
        firmaUrl = firmaPublic.publicUrl
      } else {
        console.warn('[firma] Error al subir PNG:', firmaErr?.message)
        // No bloqueamos el guardado si falla la subida de la firma
      }

      // Guardar inspección con firma
      const { data: insp, error: inspError } = await supabase.from('inspecciones').insert({
        carro_id: carroId,
        tipo,
        resultado,
        auditor_id: perfil?.id,
        numero_censo_desf: desfForm.numero_censo,
        modelo_desf: desfForm.modelo,
        fecha_mantenimiento_desf: desfForm.fecha_mantenimiento,
        precinto_retirado: precintoRetirado.numero || null,
        precinto_colocado: precintoColocado.numero || null,
        foto_precinto_retirado: urlFotoPrecintoRetirado,
        foto_precinto_colocado: urlFotoPrecintoColocado,
        // Datos de firma
        firma_url: firmaUrl,
        firmante_nombre: datosFirma.nombre,
        firmante_cargo: datosFirma.cargo || null,
        firmado_en: datosFirma.firmadoEn.toISOString(),
        firmante_usuario_id: perfil?.id || null,
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
      const desfData = {
        numero_censo: desfForm.numero_censo,
        modelo: desfForm.modelo,
        marca: desfForm.marca || null,
        fecha_ultimo_mantenimiento: desfForm.fecha_ultimo_mantenimiento || null,
        fecha_mantenimiento: desfForm.fecha_mantenimiento,
      }
      if (desf) {
        await supabase.from('desfibriladores').update(desfData).eq('id', desf.id)
      } else {
        await supabase.from('desfibriladores').insert({ carro_id: carroId, ...desfData })
      }

      // Alerta si no operativo
      if (resultado === 'no_operativo') {
        await supabase.from('alertas').insert({
          carro_id: carroId,
          tipo: 'carro_no_operativo',
          mensaje: `Carro ${carro?.codigo} declarado NO OPERATIVO en control del ${new Date().toLocaleDateString('es')}`,
        })
      }

      // Log auditoría
      await supabase.from('log_auditoria').insert({
        usuario_id: perfil?.id,
        accion: 'control_realizado',
        tabla_afectada: 'inspecciones',
        registro_id: insp.id,
        detalle: {
          tipo, resultado, carro_codigo: carro?.codigo,
          firmante: datosFirma.nombre,
          firmante_cargo: datosFirma.cargo || null,
          firma_capturada: !!firmaUrl,
          precinto_retirado: precintoRetirado.numero || null,
          precinto_colocado: precintoColocado.numero || null,
        }
      })

      setMostrarFirma(false)
      router.push(`/carro/${carroId}/resultado/${insp.id}`)
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message)
      setGuardando(false)
    }
  }

  function handleEscaneo(codigo: string) {
    setEscaneando(false)
    if (campoEscaneo === 'precinto_retirado') {
      setPrecintoRetirado(prev => ({ ...prev, numero: codigo }))
      toast.success('Precinto retirado: ' + codigo)
    } else if (campoEscaneo === 'precinto_colocado') {
      setPrecintoColocado(prev => ({ ...prev, numero: codigo }))
      toast.success('Precinto colocado: ' + codigo)
    } else if (campoEscaneo === 'desf_censo') {
      setDesfForm(prev => ({ ...prev, numero_censo: codigo }))
      toast.success('N° censo desfibrilador: ' + codigo)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  const tipoLabel = tipo === 'mensual' ? 'Control mensual'
    : tipo === 'post_uso' ? 'Control post-utilización'
    : tipo === 'extra' ? 'Control extra' : tipo

  return (
    <div className="page">
      {escaneando && (
        <EscanerCodigoBarras
          onResult={handleEscaneo}
          onClose={() => setEscaneando(false)}
        />
      )}

      {/* Pantalla de firma — se superpone al finalizar */}
      {mostrarFirma && (
        <FirmaDigital
          nombreSugerido={perfil?.nombre || ''}
          cargoSugerido={perfil?.rol || ''}
          onConfirmar={guardarConFirma}
          onCancelar={() => setMostrarFirma(false)}
          guardando={guardando}
        />
      )}

      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">{tipoLabel}</span>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFotoChange} />
      <input ref={filePrecintoRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFotoPrecintoChange} />

      <div className="content">

        {/* Encabezado */}
        <div className="card">
          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
            <div><div className="label">Carro</div><div className="font-semibold">{carro?.codigo}</div></div>
            <div><div className="label">Fecha</div><div className="font-semibold">{new Date().toLocaleDateString('es-ES')}</div></div>
            <div><div className="label">Servicio</div><div className="font-semibold">{(carro?.servicios as any)?.nombre || '—'}</div></div>
            <div><div className="label">Auditor</div><div className="font-semibold">{perfil?.nombre}</div></div>
            <div><div className="label">Último control</div><div className="font-semibold">{formatFecha(carro?.ultimo_control) || '—'}</div></div>
            <div><div className="label">Tipo anterior</div><div className="font-semibold">{carro?.ultimo_tipo_control?.replace('_', ' ') || '—'}</div></div>
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

        {/* Precinto retirado */}
        <div className="card border-amber-100 bg-amber-50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm text-amber-800">Precinto retirado</div>
              <div className="text-xs text-amber-600">Registra el número del precinto que rompes para iniciar el control</div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="label">Número de precinto retirado</label>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Ej: PR-2024-00312"
                  value={precintoRetirado.numero}
                  onChange={e => setPrecintoRetirado(prev => ({ ...prev, numero: e.target.value }))} />
                <button type="button"
                  onClick={() => { setCampoEscaneo('precinto_retirado'); setEscaneando(true) }}
                  className="flex-shrink-0 px-3 py-2 bg-amber-700 text-white rounded-xl text-xs font-semibold active:opacity-80">
                  📷
                </button>
              </div>
            </div>
            <div>
              <label className="label">Foto del precinto retirado <span className="text-gray-400">(opcional)</span></label>
              {precintoRetirado.foto_url ? (
                <div className="relative">
                  <img src={precintoRetirado.foto_url} alt="precinto retirado"
                    className="w-full h-28 object-cover rounded-xl border border-amber-200" />
                  <button onClick={() => setPrecintoRetirado(prev => ({ ...prev, foto_file: undefined, foto_url: '' }))}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                  <div className="text-xs text-green-700 mt-1 font-medium">✓ Foto adjunta</div>
                </div>
              ) : (
                <button className="w-full py-2.5 border border-dashed border-amber-300 rounded-xl text-xs text-amber-700 font-medium flex items-center justify-center gap-2 bg-white active:bg-amber-50"
                  onClick={() => abrirFotoPrecinto('retirado')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeWidth={2} /><circle cx="12" cy="13" r="4" strokeWidth={2} /></svg>
                  Fotografiar precinto retirado
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cajones */}
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

              <div className="grid grid-cols-[1fr_70px_26px_26px_26px] gap-1 items-center mb-2 pb-1 border-b border-gray-50">
                <div className="text-xs text-gray-400 font-semibold">Material</div>
                <div className="text-xs text-gray-400 text-center">Vto.</div>
                <div className="text-xs text-gray-400 text-center">Cant</div>
                <div className="text-xs text-gray-400 text-center">Est.</div>
                <div className="text-xs text-gray-400 text-center">Falla</div>
              </div>

              {mats.map((mat: Material) => {
                const item = items[mat.id]
                if (!item) return null
                const vtoColor = item.tiene_vencimiento && item.fecha_vencimiento
                  ? colorVencimiento(item.fecha_vencimiento) : null
                const vtoInputClass = !item.tiene_vencimiento
                  ? 'bg-gray-50 border-gray-200 text-gray-300'
                  : !item.fecha_vencimiento ? 'bg-gray-50 border-gray-300 text-gray-400'
                    : vtoColor === 'rojo' ? 'bg-red-100 border-red-400 text-red-700'
                      : vtoColor === 'amarillo' ? 'bg-amber-100 border-amber-400 text-amber-700'
                        : 'bg-green-100 border-green-400 text-green-700'

                return (
                  <div key={mat.id}>
                    <div className="grid grid-cols-[1fr_70px_26px_26px_26px] gap-1 items-center py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-xs font-medium leading-tight">{mat.nombre}</div>
                        <div className="text-xs text-gray-400">×{mat.cantidad_requerida}</div>
                      </div>
                      {item.tiene_vencimiento ? (
                        <input type="date" value={item.fecha_vencimiento || ''}
                          onChange={e => actualizarFechaVto(mat.id, e.target.value)}
                          className={`text-xs py-1 px-1 rounded-lg border text-center w-full font-medium ${vtoInputClass}`} />
                      ) : (
                        <div className="text-xs text-gray-300 text-center">—</div>
                      )}
                      <div className={`chk-box mx-auto ${item.cantidad_ok ? 'checked-ok' : ''}`}
                        onClick={() => updateItem(mat.id, 'cantidad_ok', !item.cantidad_ok)}>
                        {item.cantidad_ok && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth={3} /></svg>}
                      </div>
                      <div className={`chk-box mx-auto ${item.estado_ok ? 'checked-ok' : ''}`}
                        onClick={() => updateItem(mat.id, 'estado_ok', !item.estado_ok)}>
                        {item.estado_ok && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth={3} /></svg>}
                      </div>
                      <div className={`chk-box mx-auto border-red-300 ${item.tiene_falla ? 'checked-falla' : ''}`}
                        onClick={() => toggleFalla(mat.id)}>
                        {item.tiene_falla && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" strokeWidth={3} /><line x1="6" y1="6" x2="18" y2="18" strokeWidth={3} /></svg>}
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
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeWidth={2} /><line x1="12" y1="9" x2="12" y2="13" strokeWidth={2} /><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2} /></svg>
                          Falla — {mat.nombre}
                        </div>
                        <div>
                          <div className="label mb-1">Tipo de falla</div>
                          <div className="flex gap-2">
                            {(['menor', 'grave'] as const).map(tf => (
                              <button key={tf}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  item.tipo_falla === tf
                                    ? tf === 'menor' ? 'bg-amber-600 text-white border-amber-600' : 'bg-red-700 text-white border-red-700'
                                    : 'bg-white text-gray-700 border-gray-200'
                                }`}
                                onClick={() => updateItem(mat.id, 'tipo_falla', tf)}>
                                Fallo {tf}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="label mb-1">Descripción</div>
                          <textarea className="input resize-none" rows={2}
                            placeholder="Describí la falla en detalle..."
                            value={item.descripcion_falla}
                            onChange={e => updateItem(mat.id, 'descripcion_falla', e.target.value)} />
                        </div>
                        <div>
                          <div className="label mb-1">Fotografía de evidencia</div>
                          {item.foto_url ? (
                            <div className="relative">
                              <img src={item.foto_url} alt="evidencia"
                                className="w-full h-28 object-cover rounded-xl border border-red-200" />
                              <button onClick={() => { updateItem(mat.id, 'foto_url', ''); updateItem(mat.id, 'foto_file', undefined) }}
                                className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                              <div className="text-xs text-green-700 mt-1 font-medium">✓ Foto adjunta</div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button className="flex-1 py-2.5 border border-dashed border-red-300 rounded-xl text-xs text-red-600 font-medium flex items-center justify-center gap-2 bg-white active:bg-red-50"
                                onClick={() => abrirFoto(mat.id)}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeWidth={2} /><circle cx="12" cy="13" r="4" strokeWidth={2} /></svg>
                                Tomar foto
                              </button>
                              <button className="flex-1 py-2.5 border border-dashed border-red-300 rounded-xl text-xs text-red-600 font-medium flex items-center justify-center gap-2 bg-white active:bg-red-50"
                                onClick={() => abrirFoto(mat.id)}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} /><circle cx="8.5" cy="8.5" r="1.5" strokeWidth={2} /><polyline points="21 15 16 10 5 21" strokeWidth={2} /></svg>
                                Galería
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

        {/* Desfibrilador */}
        <div className="card">
          <div className="font-semibold text-sm mb-3">Desfibrilador</div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Marca</label>
                <input className="input" placeholder="Ej: Zoll" value={desfForm.marca}
                  onChange={e => setDesfForm({ ...desfForm, marca: e.target.value })} />
              </div>
              <div>
                <label className="label">Modelo *</label>
                <input className="input" placeholder="Ej: AED Plus" value={desfForm.modelo}
                  onChange={e => setDesfForm({ ...desfForm, modelo: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">N° censo *</label>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Ej: DEF-2024-0312" value={desfForm.numero_censo}
                  onChange={e => setDesfForm({ ...desfForm, numero_censo: e.target.value })} />
                <button type="button"
                  onClick={() => { setCampoEscaneo('desf_censo'); setEscaneando(true) }}
                  className="flex-shrink-0 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold active:opacity-80">
                  📷
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Último mantenimiento</label>
                <input className="input" type="date" value={desfForm.fecha_ultimo_mantenimiento}
                  onChange={e => setDesfForm({ ...desfForm, fecha_ultimo_mantenimiento: e.target.value })} />
              </div>
              <div>
                <label className="label">Próximo mantenimiento *</label>
                <input className="input" type="date" value={desfForm.fecha_mantenimiento}
                  onChange={e => setDesfForm({ ...desfForm, fecha_mantenimiento: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        {/* Precinto colocado */}
        <div className="card border-blue-100 bg-blue-50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-blue-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-sm text-blue-800">Precinto colocado</div>
              <div className="text-xs text-blue-600">Registra el número del nuevo precinto con el que sellas el carro</div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="label">Número de precinto colocado</label>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Ej: PR-2024-00313"
                  value={precintoColocado.numero}
                  onChange={e => setPrecintoColocado(prev => ({ ...prev, numero: e.target.value }))} />
                <button type="button"
                  onClick={() => { setCampoEscaneo('precinto_colocado'); setEscaneando(true) }}
                  className="flex-shrink-0 px-3 py-2 bg-blue-700 text-white rounded-xl text-xs font-semibold active:opacity-80">
                  📷
                </button>
              </div>
            </div>
            <div>
              <label className="label">Foto del precinto colocado <span className="text-gray-400">(opcional)</span></label>
              {precintoColocado.foto_url ? (
                <div className="relative">
                  <img src={precintoColocado.foto_url} alt="precinto colocado"
                    className="w-full h-28 object-cover rounded-xl border border-blue-200" />
                  <button onClick={() => setPrecintoColocado(prev => ({ ...prev, foto_file: undefined, foto_url: '' }))}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                  <div className="text-xs text-green-700 mt-1 font-medium">✓ Foto adjunta</div>
                </div>
              ) : (
                <button className="w-full py-2.5 border border-dashed border-blue-300 rounded-xl text-xs text-blue-700 font-medium flex items-center justify-center gap-2 bg-white active:bg-blue-50"
                  onClick={() => abrirFotoPrecinto('colocado')}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeWidth={2} /><circle cx="12" cy="13" r="4" strokeWidth={2} /></svg>
                  Fotografiar precinto colocado
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Botón finalizar — ahora abre la firma */}
        <button className="btn-primary" onClick={solicitarFirma} disabled={guardando}>
          {guardando ? 'Guardando...' : '✍️ Finalizar y firmar control'}
        </button>

      </div>
    </div>
  )
}

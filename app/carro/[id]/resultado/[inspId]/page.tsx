'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { formatFechaHora, formatFecha } from '@/lib/utils'
import type { Inspeccion, ItemInspeccion } from '@/lib/types'

export default function ResultadoPage() {
  const [insp, setInsp] = useState<Inspeccion | null>(null)
  const [items, setItems] = useState<ItemInspeccion[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [auditorNombre, setAuditorNombre] = useState<string>('')
  const [carroData, setCarroData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const inspId = params.inspId as string
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [inspId])

  async function cargarDatos() {
    try {
      // 1) Usuario autenticado
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase
          .from('perfiles').select('*').eq('id', user.id).single()
        setPerfil(p)
      }

      // 2) Inspección — sin joins para evitar fallos silenciosos
      const { data: ins, error: insError } = await supabase
        .from('inspecciones')
        .select('*')
        .eq('id', inspId)
        .single()

      if (insError) {
        setError('Error al cargar la inspección: ' + insError.message)
        setLoading(false)
        return
      }
      if (!ins) {
        setError('No se encontró la inspección con ID: ' + inspId)
        setLoading(false)
        return
      }
      setInsp(ins)

      // 3) Nombre del auditor — query separada
      if (ins.auditor_id) {
        const { data: aud } = await supabase
          .from('perfiles')
          .select('nombre')
          .eq('id', ins.auditor_id)
          .single()
        setAuditorNombre(aud?.nombre || '—')
      }

      // 4) Datos del carro — query separada
      const { data: carro } = await supabase
        .from('carros')
        .select('codigo, nombre, proximo_control, frecuencia_control, servicios(nombre)')
        .eq('id', carroId)
        .single()
      setCarroData(carro)

      // 5) Items con falla — usando .is() para booleanos
      const { data: its, error: itsError } = await supabase
        .from('items_inspeccion')
        .select('*, materiales(nombre, tipo_falla)')
        .eq('inspeccion_id', inspId)
        .is('tiene_falla', true)

      if (itsError) {
        console.warn('[resultado] Error al cargar items:', itsError.message)
      }
      setItems(its || [])

    } catch (err: any) {
      setError('Error inesperado: ' + (err?.message || String(err)))
    } finally {
      setLoading(false)
    }
  }

  function irAlInicio() {
    if (!perfil) { router.push('/'); return }
    if (perfil.rol === 'administrador') router.push('/admin')
    else if (perfil.rol === 'supervisor') router.push('/supervisor')
    else router.push('/auditor')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando resultado...</div>
    </div>
  )

  // Mostrar error en vez de pantalla en blanco
  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-sm w-full text-center">
        <div className="text-2xl mb-2">⚠️</div>
        <div className="text-sm font-semibold text-red-700 mb-1">Error al cargar</div>
        <div className="text-xs text-gray-500 mb-4">{error}</div>
        <button onClick={() => router.back()} className="btn-secondary text-sm">← Volver</button>
      </div>
    </div>
  )

  if (!insp) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-sm w-full text-center">
        <div className="text-2xl mb-2">🔍</div>
        <div className="text-sm font-semibold text-gray-700 mb-1">Inspección no encontrada</div>
        <div className="text-xs text-gray-400 mb-4">ID: {inspId}</div>
        <button onClick={() => router.back()} className="btn-secondary text-sm">← Volver</button>
      </div>
    </div>
  )

  const inspAny = insp as any
  const fallosGraves  = items.filter(i => i.tipo_falla === 'grave')
  const fallosMenores = items.filter(i => i.tipo_falla === 'menor')

  const config = {
    operativo: {
      bg: 'bg-green-50', border: 'border-green-200', icon: '✓',
      iconBg: 'bg-green-500', title: 'Carro operativo',
      titleColor: 'text-green-800', sub: 'Sin fallos detectados', subColor: 'text-green-600',
    },
    condicional: {
      bg: 'bg-amber-50', border: 'border-amber-200', icon: '⚠',
      iconBg: 'bg-amber-500', title: 'Carro operativo condicional',
      titleColor: 'text-amber-800',
      sub: `${fallosMenores.length} fallo${fallosMenores.length !== 1 ? 's' : ''} menor${fallosMenores.length !== 1 ? 'es' : ''}`,
      subColor: 'text-amber-600',
    },
    no_operativo: {
      bg: 'bg-red-50', border: 'border-red-200', icon: '✕',
      iconBg: 'bg-red-600', title: 'CARRO NO OPERATIVO',
      titleColor: 'text-red-800',
      sub: `${fallosGraves.length} fallo${fallosGraves.length !== 1 ? 's' : ''} grave${fallosGraves.length !== 1 ? 's' : ''}`,
      subColor: 'text-red-600',
    },
  }

  const r = config[insp.resultado as keyof typeof config] || config.operativo

  return (
    <div className="page">
      <div className="topbar">
        <span className="font-semibold text-sm">Resultado del control</span>
      </div>

      <div className="content">
        {/* Banner resultado */}
        <div className={`${r.bg} border ${r.border} rounded-2xl p-5 text-center`}>
          <div className={`w-14 h-14 ${r.iconBg} rounded-full flex items-center justify-center mx-auto mb-3`}>
            <span className="text-white text-2xl font-bold">{r.icon}</span>
          </div>
          <div className={`text-lg font-bold ${r.titleColor}`}>{r.title}</div>
          <div className={`text-sm mt-1 ${r.subColor}`}>{r.sub}</div>
          {insp.resultado === 'no_operativo' && (
            <div className="mt-2 text-xs text-red-600 font-medium">
              Se envió alerta al administrador y supervisores
            </div>
          )}
        </div>

        {/* Resumen */}
        <div className="card">
          <div className="section-title mb-3">Resumen del control</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><div className="label">Carro</div><div className="font-semibold">{carroData?.codigo || '—'}</div></div>
            <div><div className="label">Fecha y hora</div><div className="font-semibold">{formatFechaHora(inspAny.fecha)}</div></div>
            <div><div className="label">Auditor</div><div className="font-semibold">{auditorNombre}</div></div>
            <div><div className="label">Tipo</div><div className="font-semibold">{insp.tipo?.replace('_', ' ')}</div></div>
            {insp.tipo !== 'post_uso' && carroData?.proximo_control && (
              <div className="col-span-2">
                <div className="label">Próximo control programado</div>
                <div className="font-semibold">{formatFecha(carroData.proximo_control)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Firma digital */}
        {inspAny.firma_url && (
          <div className="card">
            <div className="section-title mb-3">Firma digital</div>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <img
                  src={inspAny.firma_url}
                  alt="Firma digital"
                  className="w-full border border-gray-200 rounded-xl bg-white"
                  style={{ maxHeight: '120px', objectFit: 'contain' }}
                />
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-xs font-semibold text-gray-800">
                  {inspAny.firmante_nombre || auditorNombre}
                </div>
                {inspAny.firmante_cargo && (
                  <div className="text-xs text-gray-500 mt-0.5">{inspAny.firmante_cargo}</div>
                )}
                {inspAny.firmado_en && (
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(inspAny.firmado_en).toLocaleString('es-ES', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                )}
                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" strokeWidth={2.5} />
                  </svg>
                  Firmado
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fallos graves */}
        {fallosGraves.length > 0 && (
          <div className="card border-red-200">
            <div className="font-semibold text-sm text-red-700 mb-3">Fallos graves</div>
            {fallosGraves.map(f => (
              <div key={f.id} className="mb-3 pb-3 border-b border-red-100 last:border-0 last:mb-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{(f.materiales as any)?.nombre}</div>
                    {f.descripcion_falla && <div className="text-xs text-gray-500 mt-0.5">{f.descripcion_falla}</div>}
                    {f.foto_url && <img src={f.foto_url} alt="evidencia" className="mt-2 w-full h-24 object-cover rounded-lg" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fallos menores */}
        {fallosMenores.length > 0 && (
          <div className="card border-amber-200">
            <div className="font-semibold text-sm text-amber-700 mb-3">Fallos menores</div>
            {fallosMenores.map(f => (
              <div key={f.id} className="mb-3 pb-3 border-b border-amber-100 last:border-0 last:mb-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{(f.materiales as any)?.nombre}</div>
                    {f.descripcion_falla && <div className="text-xs text-gray-500 mt-0.5">{f.descripcion_falla}</div>}
                    {f.foto_url && <img src={f.foto_url} alt="evidencia" className="mt-2 w-full h-24 object-cover rounded-lg" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Confirmación */}
        <div className="card bg-green-50 border-green-100">
          <div className="text-sm font-semibold text-green-800 mb-1">
            ✓ Control guardado correctamente
          </div>
          <div className="text-xs text-green-700">
            Registrado con fecha, hora, auditor y trazabilidad completa.
            {inspAny.firma_url && ' Firma digital incluida.'}
            {insp.tipo !== 'post_uso' && carroData?.proximo_control && ` Próximo control: ${formatFecha(carroData.proximo_control)}.`}
          </div>
        </div>

        {/* Informe PDF */}
        <button
          className="btn-secondary text-left flex items-center gap-3"
          onClick={() => router.push(`/carro/${carroId}/informe/${inspId}`)}
        >
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeWidth={2} />
              <polyline points="14 2 14 8 20 8" strokeWidth={2} />
              <line x1="16" y1="13" x2="8" y2="13" strokeWidth={2} />
              <line x1="16" y1="17" x2="8" y2="17" strokeWidth={2} />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Generar informe de este control</div>
            <div className="text-xs text-gray-400">PDF con membrete, fallos, fotos y firma digital</div>
          </div>
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="9 18 15 12 9 6" strokeWidth={2} />
          </svg>
        </button>

        <button className="btn-primary" onClick={irAlInicio}>
          Volver al inicio
        </button>
      </div>
    </div>
  )
}

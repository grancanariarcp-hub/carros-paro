'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { formatFechaHora, formatFecha } from '@/lib/utils'
import type { Inspeccion, ItemInspeccion } from '@/lib/types'

export default function ResultadoPage() {
  const [insp, setInsp] = useState<Inspeccion|null>(null)
  const [items, setItems] = useState<ItemInspeccion[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params = useParams()
  const inspId = params.inspId as string
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [inspId])

  async function cargarDatos() {
    const { data: ins } = await supabase.from('inspecciones')
      .select('*, carros(codigo,nombre,proximo_control,frecuencia_control), perfiles(nombre)')
      .eq('id', inspId).single()
    setInsp(ins)
    const { data: its } = await supabase.from('items_inspeccion')
      .select('*, materiales(nombre,tipo_falla)')
      .eq('inspeccion_id', inspId)
      .eq('tiene_falla', true)
    setItems(its || [])
    setLoading(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>
  if (!insp) return null

  const fallosGraves = items.filter(i => i.tipo_falla === 'grave')
  const fallosMenores = items.filter(i => i.tipo_falla === 'menor')
  const carro = insp.carros as any
  const auditor = insp.perfiles as any

  const config = {
    operativo: {
      bg: 'bg-green-50', border: 'border-green-200', icon: '✓',
      iconBg: 'bg-green-500', title: 'Carro operativo',
      titleColor: 'text-green-800', sub: 'Sin fallos detectados', subColor: 'text-green-600'
    },
    condicional: {
      bg: 'bg-amber-50', border: 'border-amber-200', icon: '⚠',
      iconBg: 'bg-amber-500', title: 'Carro operativo condicional',
      titleColor: 'text-amber-800', sub: `${fallosMenores.length} fallo${fallosMenores.length!==1?'s':''} menor${fallosMenores.length!==1?'es':''}`, subColor: 'text-amber-600'
    },
    no_operativo: {
      bg: 'bg-red-50', border: 'border-red-200', icon: '✕',
      iconBg: 'bg-red-600', title: 'CARRO NO OPERATIVO',
      titleColor: 'text-red-800', sub: `${fallosGraves.length} fallo${fallosGraves.length!==1?'s':''} grave${fallosGraves.length!==1?'s':''}`, subColor: 'text-red-600'
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
              Se envió alerta por email al administrador y supervisores
            </div>
          )}
        </div>

        {/* Resumen */}
        <div className="card">
          <div className="section-title mb-3">Resumen del control</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><div className="label">Carro</div><div className="font-semibold">{carro?.codigo}</div></div>
            <div><div className="label">Fecha y hora</div><div className="font-semibold">{formatFechaHora(insp.fecha)}</div></div>
            <div><div className="label">Auditor</div><div className="font-semibold">{auditor?.nombre}</div></div>
            <div><div className="label">Tipo</div><div className="font-semibold">{insp.tipo?.replace('_',' ')}</div></div>
            {insp.tipo !== 'post_uso' && (
              <div className="col-span-2">
                <div className="label">Próximo control programado</div>
                <div className="font-semibold">{formatFecha(carro?.proximo_control)}</div>
              </div>
            )}
          </div>
        </div>

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
                    {f.foto_url && <img src={f.foto_url} alt="evidencia" className="mt-2 w-full h-24 object-cover rounded-lg"/>}
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
                    {f.foto_url && <img src={f.foto_url} alt="evidencia" className="mt-2 w-full h-24 object-cover rounded-lg"/>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Confirmación */}
        <div className="card bg-green-50 border-green-100">
          <div className="text-sm font-semibold text-green-800 mb-1">✓ Control guardado correctamente</div>
          <div className="text-xs text-green-700">
            Registrado con fecha, hora, auditor y trazabilidad completa.
            {insp.tipo !== 'post_uso' && ` Próximo control: ${formatFecha(carro?.proximo_control)}.`}
          </div>
        </div>

        <button className="btn-primary" onClick={() => router.push('/auditor')}>
          Volver al inicio
        </button>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { estadoColor, formatFechaHora } from '@/lib/utils'
import type { Inspeccion } from '@/lib/types'

export default function HistorialPage() {
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([])
  const [loading, setLoading] = useState(true)
  const [carro, setCarro] = useState<any>(null)
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  useEffect(() => {
    async function cargar() {
      const { data: c } = await supabase.from('carros').select('codigo,nombre').eq('id', id).single()
      setCarro(c)
      const { data } = await supabase.from('inspecciones')
        .select('*, perfiles(nombre)')
        .eq('carro_id', id)
        .order('fecha', { ascending: false })
      setInspecciones(data || [])
      setLoading(false)
    }
    cargar()
  }, [id])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Historial — {carro?.codigo}</span>
      </div>
      <div className="content">
        <div className="card">
          <div className="section-title mb-3">
            {inspecciones.length} controles registrados
          </div>
          {inspecciones.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-8">Sin controles registrados aún</div>
          )}
          {inspecciones.map(ins => {
            const e = estadoColor(ins.resultado)
            const auditor = (ins.perfiles as any)?.nombre
            return (
              <div key={ins.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${id}/resultado/${ins.id}`)}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {ins.tipo?.replace('_',' ')} · {e.label}
                  </div>
                  <div className="text-xs text-gray-400">
                    {auditor} · {formatFechaHora(ins.fecha)}
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

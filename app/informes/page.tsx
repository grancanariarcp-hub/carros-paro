'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import type { Perfil } from '@/lib/types'
import { rutaPadre } from '@/lib/navigation'

export default function InformesPage() {
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      if (!p?.activo || p.rol === 'auditor') { router.push('/'); return }
      setPerfil(p)
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  const informes = [
    {
      tipo: 'controles_vencidos',
      titulo: 'Controles vencidos',
      desc: 'Carros que superaron su fecha de próximo control sin ser auditados',
      color: 'bg-red-50 border-red-200',
      iconBg: 'bg-red-100',
      iconColor: '#dc2626',
      codigo: 'INF-CTRL',
    },
    {
      tipo: 'no_operativos',
      titulo: 'Carros no operativos',
      desc: 'Carros en estado NO operativo con detalle de fallos graves e historial',
      color: 'bg-amber-50 border-amber-200',
      iconBg: 'bg-amber-100',
      iconColor: '#d97706',
      codigo: 'INF-NOP',
    },
    {
      tipo: 'vencimientos',
      titulo: 'Vencimientos de material',
      desc: 'Materiales vencidos o próximos a vencer filtrados por rango de fechas',
      color: 'bg-orange-50 border-orange-200',
      iconBg: 'bg-orange-100',
      iconColor: '#ea580c',
      codigo: 'INF-VTO',
    },
    {
      tipo: 'historial_auditorias',
      titulo: 'Historial de auditorías',
      desc: 'Todas las inspecciones realizadas con filtros por carro, auditor y resultado',
      color: 'bg-blue-50 border-blue-200',
      iconBg: 'bg-blue-100',
      iconColor: '#1d4ed8',
      codigo: 'INF-HIST',
    },
  ]

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Informes</span>
      </div>

      <div className="content">
        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700 leading-relaxed">
            Los informes se generan con datos en tiempo real. Cada informe tiene un código automático editable según nomenclatura ISO.
          </p>
        </div>

        {informes.map(inf => (
          <button
            key={inf.tipo}
            className={`w-full text-left card border ${inf.color} flex items-center gap-3`}
            onClick={() => router.push(`/informes/${inf.tipo}`)}
          >
            <div className={`w-10 h-10 rounded-xl ${inf.iconBg} flex items-center justify-center flex-shrink-0`}>
              <svg style={{width:'20px', height:'20px'}} fill="none" stroke={inf.iconColor} viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeWidth={2}/>
                <polyline points="14 2 14 8 20 8" strokeWidth={2}/>
                <line x1="16" y1="13" x2="8" y2="13" strokeWidth={2}/>
                <line x1="16" y1="17" x2="8" y2="17" strokeWidth={2}/>
                <polyline points="10 9 9 9 8 9" strokeWidth={2}/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{inf.titulo}</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-tight">{inf.desc}</div>
              <div className="text-xs text-gray-400 mt-1">{inf.codigo}-{new Date().getFullYear()}-XXX</div>
            </div>
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" strokeWidth={2}/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor } from '@/lib/utils'
import type { Perfil, Carro } from '@/lib/types'

export default function SupervisorPage() {
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [carros, setCarros] = useState<Carro[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      if (!p || (p.rol !== 'supervisor' && p.rol !== 'administrador')) { router.push('/'); return }
      setPerfil(p)
      const { data: c } = await supabase.from('carros').select('*, servicios(nombre)').eq('activo', true).order('codigo')
      setCarros(c || [])
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  const stats = {
    op: carros.filter(c => c.estado === 'operativo').length,
    cond: carros.filter(c => c.estado === 'condicional').length,
    nop: carros.filter(c => c.estado === 'no_operativo').length,
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="flex-1">
          <div className="text-xs text-gray-400">Bienvenida/o</div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{perfil?.nombre}</span>
            <span className="badge bg-teal-100 text-teal-800">Supervisor</span>
          </div>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
          className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">Salir</button>
      </div>

      <div className="content">
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center"><div className="text-2xl font-bold text-green-700">{stats.op}</div><div className="text-xs text-gray-500 mt-1">Operativos</div></div>
          <div className="card text-center"><div className="text-2xl font-bold text-amber-600">{stats.cond}</div><div className="text-xs text-gray-500 mt-1">Condicionales</div></div>
          <div className="card text-center"><div className="text-2xl font-bold text-red-700">{stats.nop}</div><div className="text-xs text-gray-500 mt-1">No operativos</div></div>
        </div>

        <button className="btn-primary" onClick={() => router.push('/admin/nuevo-carro')}>+ Crear nuevo carro</button>

        <div className="card">
          <div className="section-title mb-3">Acciones rápidas</div>
          <button className="btn-secondary mb-2 text-left" onClick={() => router.push('/admin')}>👥 Aprobar nuevos auditores</button>
          <button className="btn-secondary mb-2 text-left" onClick={() => router.push('/admin?tab=informes')}>📊 Generar informes</button>
        </div>

        <div className="card">
          <div className="section-title mb-3">Todos los carros</div>
          {carros.map(c => {
            const e = estadoColor(c.estado)
            return (
              <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                  <div className="text-xs text-gray-400">{(c.servicios as any)?.nombre || '—'}</div>
                </div>
                <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

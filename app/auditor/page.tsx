'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor, formatFecha, diasHastaControl } from '@/lib/utils'
import type { Carro, Perfil } from '@/lib/types'

export default function AuditorPage() {
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [carros, setCarros] = useState<Carro[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !p.activo) { router.push('/'); return }
    setPerfil(p)
    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('activo', true).order('codigo')
    setCarros(c || [])
    setLoading(false)
  }

  const carrosFiltrados = carros.filter(c =>
    c.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.ubicacion || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  const urgentes = carros.filter(c => {
    const dias = diasHastaControl(c.proximo_control)
    return dias !== null && dias <= 3
  })

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  return (
    <div className="page">
      <div className="topbar">
        <div className="flex-1">
          <div className="text-xs text-gray-400">Bienvenido/a</div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{perfil?.nombre}</span>
            <span className="badge bg-blue-100 text-blue-800 text-xs">{perfil?.rol}</span>
          </div>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
          className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">Salir</button>
      </div>

      <div className="content">
        {/* Buscador */}
        <div className="card">
          <div className="section-title mb-3">Buscar carro</div>
          <input
            className="input mb-2"
            placeholder="Nombre, código o ubicación..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          <button
            className="btn-secondary flex items-center justify-center gap-2"
            onClick={() => toast_qr()}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.24M16.24 12l1.83 1.83a9 9 0 01-13.14 0L6.76 12H12z" />
            </svg>
            Escanear QR / NFC
          </button>
        </div>

        {/* Pendientes urgentes */}
        {urgentes.length > 0 && (
          <div className="card border-amber-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="section-title">Controles urgentes</span>
              <span className="badge bg-amber-100 text-amber-800">{urgentes.length}</span>
            </div>
            {urgentes.map(c => {
              const dias = diasHastaControl(c.proximo_control)
              return (
                <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{c.codigo}</div>
                    <div className="text-xs text-gray-400">
                      {dias !== null && dias < 0 ? 'Control vencido' : dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <span className="badge bg-amber-100 text-amber-800">Urgente</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Lista carros */}
        <div className="card">
          <div className="section-title mb-3">
            Todos los carros ({carrosFiltrados.length})
          </div>
          {carrosFiltrados.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-6">
              {busqueda ? 'No se encontraron carros' : 'No hay carros disponibles'}
            </div>
          )}
          {carrosFiltrados.map(c => {
            const e = estadoColor(c.estado)
            const dias = diasHastaControl(c.proximo_control)
            return (
              <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                  <div className="text-xs text-gray-400">
                    {(c.servicios as any)?.nombre || c.ubicacion || '—'}
                    {c.proximo_control && ` · Control: ${formatFecha(c.proximo_control)}`}
                  </div>
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

function toast_qr() {
  import('react-hot-toast').then(({ default: toast }) => {
    toast('Funcionalidad QR/NFC disponible en dispositivo real', { icon: '📷' })
  })
}

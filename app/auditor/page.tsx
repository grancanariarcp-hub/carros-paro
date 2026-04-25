'use client'
import { useEffect, useState } from 'react'
import NotificacionesBell from '@/components/NotificacionesBell'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor, formatFecha, diasHastaControl } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'
import type { Carro, Perfil } from '@/lib/types'

export default function AuditorPage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [hospital, setHospital] = useState<any | null>(null)
  const [carros, setCarros] = useState<Carro[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'operativo' | 'condicional' | 'no_operativo'>('todos')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [loading, setLoading] = useState(true)
  const [escaneando, setEscaneando] = useState(false)
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !p.activo) { router.push('/'); return }
    setPerfil(p)

    if (p.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }

    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)')
      .eq('activo', true)
      .eq('hospital_id', p.hospital_id)
      .order('codigo')
    setCarros(c || [])
    setLoading(false)
  }

  // ================================================================
  // Escáner: busca carro o equipo por código y navega a su ficha
  // ================================================================
  async function onCodigoEscaneado(codigo: string) {
    setEscaneando(false)
    setBuscandoCodigo(true)
    const codigoLimpio = codigo.trim()

    // 1) Buscar en carros: codigo, numero_censo, codigo_barras_censo
    const { data: carro } = await supabase
      .from('carros')
      .select('id, codigo, nombre')
      .eq('hospital_id', perfil?.hospital_id)
      .or(`codigo.eq.${codigoLimpio},numero_censo.eq.${codigoLimpio},codigo_barras_censo.eq.${codigoLimpio}`)
      .eq('activo', true)
      .limit(1)
      .maybeSingle()

    if (carro) {
      setBuscandoCodigo(false)
      toast.success(`Carro encontrado: ${carro.codigo}`)
      router.push(`/carro/${carro.id}`)
      return
    }

    // 2) Buscar en equipos: codigo_barras, numero_censo, numero_serie
    const { data: equipo } = await supabase
      .from('equipos')
      .select('id, nombre')
      .eq('hospital_id', perfil?.hospital_id)
      .or(`codigo_barras.eq.${codigoLimpio},numero_censo.eq.${codigoLimpio},numero_serie.eq.${codigoLimpio}`)
      .eq('activo', true)
      .limit(1)
      .maybeSingle()

    if (equipo) {
      setBuscandoCodigo(false)
      toast.success(`Equipo encontrado: ${equipo.nombre}`)
      router.push(`/admin/equipos/${equipo.id}`)
      return
    }

    setBuscandoCodigo(false)
    toast.error(`No se encontró ningún carro ni equipo con el código "${codigoLimpio}"`)
  }

  const tiposCarro = Array.from(new Set(carros.map(c => (c as any).tipo_carro).filter(Boolean)))

  const carrosFiltrados = carros.filter(c => {
    const matchBusqueda = !busqueda ||
      c.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.ubicacion || '').toLowerCase().includes(busqueda.toLowerCase())
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
    const matchTipo = filtroTipo === 'todos' || (c as any).tipo_carro === filtroTipo
    return matchBusqueda && matchEstado && matchTipo
  })

  const urgentes = carros.filter(c => {
    const dias = diasHastaControl(c.proximo_control)
    return dias !== null && dias <= 3
  })

  const colorPrimario = hospital?.color_primario || '#1d4ed8'
  useHospitalTheme(hospital?.color_primario)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      {escaneando && (
        <EscanerCodigoBarras
          onResult={onCodigoEscaneado}
          onClose={() => setEscaneando(false)}
        />
      )}

      {/* Overlay mientras busca el código */}
      {buscandoCodigo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-sm font-semibold text-gray-700">Buscando...</div>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div className="topbar" style={{ borderBottom: `2px solid ${colorPrimario}20` }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hospital?.logo_url ? (
            <img src={hospital.logo_url} alt={hospital.nombre}
              style={{ height: '28px', objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: '28px', height: '28px', borderRadius: '6px',
              background: colorPrimario,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 80 80" fill="none">
                <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                  fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2.5" />
                <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs text-gray-400 leading-none truncate">{hospital?.nombre || 'Hospital'}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <button onClick={() => router.push('/perfil')} className="font-semibold text-sm truncate hover:underline text-left">{perfil?.nombre}</button>
              <span className="badge bg-blue-100 text-blue-800 text-xs flex-shrink-0">{perfil?.rol}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {perfil?.id && <NotificacionesBell usuarioId={perfil.id} />}
          <button
            onClick={() => router.push('/buscar')}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white active:bg-gray-50">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth={2} />
              <path d="m21 21-4.35-4.35" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">
            Salir
          </button>
        </div>
      </div>

      <div className="content">
        {/* Escáner prominente */}
        <div className="card border-blue-100 bg-blue-50">
          <div className="section-title mb-2 text-blue-800">Escanear carro o equipo</div>
          <p className="text-xs text-blue-600 mb-3">
            Escanea el código QR o de barras de cualquier carro o equipo para acceder directamente a su ficha.
          </p>
          <button
            onClick={() => setEscaneando(true)}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:bg-blue-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" strokeWidth={2} />
              <rect x="14" y="3" width="7" height="7" strokeWidth={2} />
              <rect x="3" y="14" width="7" height="7" strokeWidth={2} />
              <rect x="14" y="14" width="3" height="3" strokeWidth={2} />
            </svg>
            Abrir escáner
          </button>
        </div>

        {/* Buscador textual */}
        <div className="card">
          <div className="section-title mb-2">Buscar carro</div>
          <input
            className="input"
            placeholder="Nombre, código o ubicación..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        {/* Filtros estado */}
        <div className="flex gap-1.5 flex-wrap">
          {([
            ['todos', 'Todos'],
            ['operativo', 'Operativos'],
            ['condicional', 'Condicionales'],
            ['no_operativo', 'No operativos'],
          ] as const).map(([val, label]) => (
            <button key={val}
              onClick={() => setFiltroEstado(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filtroEstado === val
                ? val === 'operativo' ? 'bg-green-100 text-green-700 border-green-300'
                  : val === 'condicional' ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : val === 'no_operativo' ? 'bg-red-100 text-red-700 border-red-300'
                      : 'bg-gray-200 text-gray-700 border-gray-300'
                : 'bg-white text-gray-400 border-gray-200'
                }`}
            >{label}</button>
          ))}
        </div>

        {/* Filtro por tipo */}
        {tiposCarro.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setFiltroTipo('todos')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === 'todos' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
              Todos los tipos
            </button>
            {tiposCarro.map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === t ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Urgentes */}
        {urgentes.length > 0 && (
          <div className="card border-amber-200 bg-amber-50">
            <div className="flex items-center gap-2 mb-3">
              <span className="section-title text-amber-700">Controles urgentes</span>
              <span className="badge bg-amber-100 text-amber-800">{urgentes.length}</span>
            </div>
            {urgentes.map(c => {
              const dias = diasHastaControl(c.proximo_control)
              return (
                <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                    <div className="text-xs text-gray-500">
                      {dias !== null && dias < 0
                        ? `Control vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
                        : dias === 0 ? 'Control vence hoy'
                          : `Control vence en ${dias} día${dias !== 1 ? 's' : ''}`}
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
          <div className="flex items-center justify-between mb-3">
            <div className="section-title">
              Carros ({carrosFiltrados.length}{carrosFiltrados.length !== carros.length ? ` de ${carros.length}` : ''})
            </div>
            {(filtroEstado !== 'todos' || filtroTipo !== 'todos' || busqueda) && (
              <button
                onClick={() => { setFiltroEstado('todos'); setFiltroTipo('todos'); setBusqueda('') }}
                className="text-xs text-blue-600 font-semibold">
                Limpiar filtros
              </button>
            )}
          </div>
          {carrosFiltrados.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-6">
              {busqueda ? 'No se encontraron carros' : 'No hay carros que coincidan con los filtros'}
            </div>
          )}
          {carrosFiltrados.map(c => {
            const e = estadoColor(c.estado)
            const dias = diasHastaControl(c.proximo_control)
            const controlVencido = dias !== null && dias < 0
            return (
              <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                  <div className="text-xs flex items-center gap-1">
                    <span className="text-gray-400">{(c.servicios as any)?.nombre || c.ubicacion || '—'}</span>
                    {controlVencido && <span className="text-red-600 font-semibold">· Control vencido</span>}
                    {!controlVencido && c.proximo_control && (
                      <span className="text-gray-400">· {formatFecha(c.proximo_control)}</span>
                    )}
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

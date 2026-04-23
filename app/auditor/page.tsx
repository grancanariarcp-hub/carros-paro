'use client'
import { useEffect, useState } from 'react'
import NotificacionesBell from '@/components/NotificacionesBell'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor, formatFecha, diasHastaControl } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'
import type { Carro, Perfil } from '@/lib/types'

export default function AuditorPage() {
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [hospital, setHospital] = useState<any|null>(null)
  const [carros, setCarros] = useState<Carro[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos'|'operativo'|'condicional'|'no_operativo'>('todos')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
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
      {/* TOPBAR con identidad del hospital */}
      <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hospital?.logo_url ? (
            <img src={hospital.logo_url} alt={hospital.nombre}
              style={{height:'28px', objectFit:'contain', flexShrink:0}}/>
          ) : (
            <div style={{
              width:'28px', height:'28px', borderRadius:'6px',
              background: colorPrimario,
              display:'flex', alignItems:'center', justifyContent:'center',
              flexShrink:0,
            }}>
              <svg width="14" height="14" viewBox="0 0 80 80" fill="none">
                <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                  fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2.5"/>
                <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs text-gray-400 leading-none truncate">{hospital?.nombre || 'Hospital'}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-semibold text-sm truncate">{perfil?.nombre}</span>
              <span className="badge bg-blue-100 text-blue-800 text-xs flex-shrink-0">{perfil?.rol}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {perfil?.id && <NotificacionesBell usuarioId={perfil.id} />}
          <button
            onClick={() => router.push('/buscar')}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white active:bg-gray-50 flex-shrink-0">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth={2}/>
              <path d="m21 21-4.35-4.35" strokeWidth={2} strokeLinecap="round"/>
            </svg>
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">
            Salir
          </button>
        </div>
      </div>

      <div className="content">
        {/* Buscador */}
        <div className="card">
          <div className="section-title mb-2">Buscar carro</div>
          <input
            className="input mb-2"
            placeholder="Nombre, código o ubicación..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          <button
            className="btn-secondary flex items-center justify-center gap-2"
            onClick={() => toast('Escanea el QR del carro con la cámara', { icon: '📷' })}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
            </svg>
            Escanear QR / NFC
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-1.5 flex-wrap">
          {([
            ['todos', 'Todos'],
            ['operativo', 'Operativos'],
            ['condicional', 'Condicionales'],
            ['no_operativo', 'No operativos'],
          ] as const).map(([val, label]) => (
            <button key={val}
              onClick={() => setFiltroEstado(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filtroEstado === val
                  ? val === 'operativo' ? 'bg-green-100 text-green-700 border-green-300'
                    : val === 'condicional' ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : val === 'no_operativo' ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-gray-200 text-gray-700 border-gray-300'
                  : 'bg-white text-gray-400 border-gray-200'
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Filtro por tipo si hay más de uno */}
        {tiposCarro.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFiltroTipo('todos')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === 'todos' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}
            >Todos los tipos</button>
            {tiposCarro.map(t => (
              <button key={t}
                onClick={() => setFiltroTipo(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === t ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}
              >{t.replace('_',' ')}</button>
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
                      {dias !== null && dias < 0 ? `Control vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
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

'use client'
import { useEffect, useState, useCallback } from 'react'
import NotificacionesBell from '@/components/NotificacionesBell'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor, formatFecha, diasHastaControl } from '@/lib/utils'
import type { Perfil, Carro } from '@/lib/types'

export default function SupervisorPage() {
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [carros, setCarros] = useState<Carro[]>([])
  const [alertas, setAlertas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date>(new Date())
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const router = useRouter()
  const supabase = createClient()

  const cargarDatos = useCallback(async (perfil_id?: string, hospital_id?: string) => {
    const hId = hospital_id
    const [{ data: c }, { data: al }] = await Promise.all([
      supabase.from('carros')
        .select('*, servicios(nombre)')
        .eq('activo', true)
        .eq('hospital_id', hId)
        .order('codigo'),
      supabase.from('alertas')
        .select('*, carros(codigo,nombre,ubicacion)')
        .eq('resuelta', false)
        .eq('hospital_id', hId)
        .order('creado_en', { ascending: false })
    ])
    setCarros(c || [])
    setAlertas(al || [])
    setUltimaActualizacion(new Date())
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      if (!p || !['supervisor', 'administrador', 'superadmin'].includes(p.rol)) { router.push('/'); return }
      setPerfil(p)
      if (p.hospital_id) {
        const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
        setHospital(h)
      }
      await cargarDatos(p.id, p.hospital_id)
      setLoading(false)
    }
    init()
  }, [])

  // Auto-refresco cada 60 segundos
  useEffect(() => {
    if (!perfil?.hospital_id) return
    const interval = setInterval(() => {
      cargarDatos(perfil.id, perfil.hospital_id)
    }, 60000)
    return () => clearInterval(interval)
  }, [perfil, cargarDatos])

  const tiposCarro = Array.from(new Set(carros.map(c => (c as any).tipo_carro).filter(Boolean)))

  const carrosFiltrados = carros.filter(c => {
    const matchTipo = filtroTipo === 'todos' || (c as any).tipo_carro === filtroTipo
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
    return matchTipo && matchEstado
  })

  const stats = {
    total: carros.length,
    operativos: carros.filter(c => c.estado === 'operativo').length,
    condicionales: carros.filter(c => c.estado === 'condicional').length,
    no_operativos: carros.filter(c => c.estado === 'no_operativo').length,
    controles_vencidos: carros.filter(c => {
      const dias = diasHastaControl(c.proximo_control)
      return dias !== null && dias < 0
    }).length,
    proximos: carros.filter(c => {
      const dias = diasHastaControl(c.proximo_control)
      return dias !== null && dias >= 0 && dias <= 7
    }).length,
  }

  const pctOperativos = stats.total > 0 ? Math.round((stats.operativos / stats.total) * 100) : 0

  const colorPrimario = hospital?.color_primario || '#1d4ed8'

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      {/* TOPBAR */}
      <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hospital?.logo_url ? (
            <img src={hospital.logo_url} alt={hospital.nombre} style={{height:'28px', objectFit:'contain', flexShrink:0}}/>
          ) : (
            <div style={{width:'28px', height:'28px', borderRadius:'6px', background: colorPrimario, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 80 80" fill="none">
                <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2.5"/>
                <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs text-gray-400 leading-none truncate">{hospital?.nombre || 'Hospital'}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-semibold text-sm truncate">{perfil?.nombre}</span>
              <span className="badge bg-teal-100 text-teal-800 text-xs flex-shrink-0">Supervisor</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {perfil?.id && <NotificacionesBell usuarioId={perfil.id} />}
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">Salir</button>
        </div>
      </div>

      <div className="content">

        {/* SEMÁFORO GENERAL */}
        <div className="card" style={{background: pctOperativos === 100 ? '#f0fdf4' : pctOperativos >= 75 ? '#fffbeb' : '#fef2f2', borderColor: pctOperativos === 100 ? '#bbf7d0' : pctOperativos >= 75 ? '#fde68a' : '#fecaca'}}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Estado general del hospital</div>
              <div className="text-sm font-bold" style={{color: pctOperativos === 100 ? '#15803d' : pctOperativos >= 75 ? '#b45309' : '#dc2626'}}>
                {pctOperativos === 100 ? '✓ Todo operativo' : pctOperativos >= 75 ? '⚠ Revisión recomendada' : '🚨 Atención requerida'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold" style={{color: pctOperativos === 100 ? '#15803d' : pctOperativos >= 75 ? '#b45309' : '#dc2626'}}>{pctOperativos}%</div>
              <div className="text-xs text-gray-400">operativos</div>
            </div>
          </div>
          {/* Barra de progreso */}
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className="h-2.5 rounded-full transition-all" style={{
              width: `${pctOperativos}%`,
              background: pctOperativos === 100 ? '#16a34a' : pctOperativos >= 75 ? '#d97706' : '#dc2626'
            }}></div>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{stats.operativos} de {stats.total} carros operativos</span>
            <span>Actualizado: {ultimaActualizacion.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
        </div>

        {/* KPIs 2x3 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center p-3 cursor-pointer" onClick={() => setFiltroEstado('operativo')}>
            <div className="text-2xl font-bold text-green-700">{stats.operativos}</div>
            <div className="text-xs text-gray-500 mt-0.5">Operativos</div>
          </div>
          <div className="card text-center p-3 cursor-pointer" onClick={() => setFiltroEstado('condicional')}>
            <div className="text-2xl font-bold text-amber-600">{stats.condicionales}</div>
            <div className="text-xs text-gray-500 mt-0.5">Condicionales</div>
          </div>
          <div className="card text-center p-3 cursor-pointer" onClick={() => setFiltroEstado('no_operativo')}>
            <div className="text-2xl font-bold text-red-700">{stats.no_operativos}</div>
            <div className="text-xs text-gray-500 mt-0.5">No operativos</div>
          </div>
          <div className="card text-center p-3 cursor-pointer" onClick={() => setFiltroEstado('todos')}>
            <div className="text-2xl font-bold text-red-500">{stats.controles_vencidos}</div>
            <div className="text-xs text-gray-500 mt-0.5">Ctrl. vencidos</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-2xl font-bold text-orange-500">{stats.proximos}</div>
            <div className="text-xs text-gray-500 mt-0.5">Ctrl. próximos</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-2xl font-bold text-blue-700">{alertas.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Alertas</div>
          </div>
        </div>

        {/* ALERTAS ACTIVAS */}
        {alertas.length > 0 && (
          <div className="card border-red-200 bg-red-50">
            <div className="flex items-center justify-between mb-3">
              <span className="section-title text-red-700">Alertas activas</span>
              <span className="badge bg-red-100 text-red-800">{alertas.length}</span>
            </div>
            {alertas.slice(0, 3).map(a => (
              <div key={a.id} className="flex items-start gap-2 py-2 border-b border-red-100 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5"></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{(a.carros as any)?.codigo} — {(a.carros as any)?.nombre}</div>
                  <div className="text-xs text-gray-500 truncate">{a.mensaje}</div>
                </div>
                <button onClick={() => router.push(`/carro/${a.carro_id}`)}
                  className="text-xs text-red-600 font-semibold flex-shrink-0">Ver →</button>
              </div>
            ))}
            {alertas.length > 3 && (
              <div className="text-xs text-red-600 text-center mt-2 font-semibold">
                +{alertas.length - 3} alertas más
              </div>
            )}
          </div>
        )}

        {/* FILTROS */}
        <div className="flex gap-1.5 flex-wrap">
          {([['todos','Todos'],['operativo','Operativos'],['condicional','Condicionales'],['no_operativo','No operativos']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFiltroEstado(val)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filtroEstado === val
                  ? val === 'operativo' ? 'bg-green-100 text-green-700 border-green-300'
                    : val === 'condicional' ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : val === 'no_operativo' ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-gray-200 text-gray-700 border-gray-300'
                  : 'bg-white text-gray-400 border-gray-200'
              }`}>{label}</button>
          ))}
        </div>

        {tiposCarro.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setFiltroTipo('todos')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === 'todos' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
              Todos los tipos
            </button>
            {tiposCarro.map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === t ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
                {t.replace('_',' ')}
              </button>
            ))}
          </div>
        )}

        {/* LISTA DE CARROS CON SEMÁFORO */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="section-title">
              Carros ({carrosFiltrados.length}{carrosFiltrados.length !== carros.length ? ` de ${carros.length}` : ''})
            </div>
            {(filtroEstado !== 'todos' || filtroTipo !== 'todos') && (
              <button onClick={() => { setFiltroEstado('todos'); setFiltroTipo('todos') }}
                className="text-xs text-blue-600 font-semibold">Limpiar</button>
            )}
          </div>
          {carrosFiltrados.map(c => {
            const e = estadoColor(c.estado)
            const dias = diasHastaControl(c.proximo_control)
            const controlVencido = dias !== null && dias < 0
            const controlProximo = dias !== null && dias >= 0 && dias <= 7
            return (
              <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                {/* Semáforo */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <div className={`w-3 h-3 rounded-full ${c.estado === 'operativo' ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  <div className={`w-3 h-3 rounded-full ${c.estado === 'condicional' ? 'bg-amber-500' : 'bg-gray-200'}`}></div>
                  <div className={`w-3 h-3 rounded-full ${c.estado === 'no_operativo' ? 'bg-red-500' : 'bg-gray-200'}`}></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                  <div className="text-xs flex items-center gap-1 flex-wrap">
                    <span className="text-gray-400">{(c.servicios as any)?.nombre || c.ubicacion || '—'}</span>
                    {(c as any).tipo_carro && <span className="text-gray-300">·</span>}
                    {(c as any).tipo_carro && <span className="text-gray-400">{(c as any).tipo_carro.replace('_',' ')}</span>}
                    {controlVencido && <span className="text-red-600 font-semibold">· Control vencido</span>}
                    {!controlVencido && controlProximo && <span className="text-orange-500 font-semibold">· Control en {dias}d</span>}
                    {!controlVencido && !controlProximo && c.proximo_control && <span className="text-gray-400">· {formatFecha(c.proximo_control)}</span>}
                  </div>
                </div>
                <span className={`badge ${e.bg} ${e.text} flex-shrink-0`}>{e.label}</span>
              </div>
            )
          })}
          {carrosFiltrados.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-6">No hay carros que coincidan con los filtros</div>
          )}
        </div>

        {/* ACCESOS RÁPIDOS A INFORMES */}
        <div className="card">
          <div className="section-title mb-3">Informes rápidos</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { ruta: '/informes/situacion_general', label: 'Situación general', icon: '📊' },
              { ruta: '/informes/controles_vencidos', label: 'Controles vencidos', icon: '📅' },
              { ruta: '/informes/no_operativos', label: 'No operativos', icon: '🚨' },
              { ruta: '/informes/vencimientos', label: 'Vencimientos', icon: '⏰' },
            ].map(inf => (
              <button key={inf.ruta}
                className="flex items-center gap-2 p-3 border border-gray-200 rounded-xl text-left active:bg-gray-50"
                onClick={() => router.push(inf.ruta)}>
                <span className="text-lg">{inf.icon}</span>
                <span className="text-xs font-semibold text-gray-700 leading-tight">{inf.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* BOTÓN REFRESCAR */}
        <button
          onClick={() => perfil?.hospital_id && cargarDatos(perfil.id, perfil.hospital_id)}
          className="btn-secondary flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Actualizar datos
        </button>

      </div>
    </div>
  )
}

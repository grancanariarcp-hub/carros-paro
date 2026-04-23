'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'

interface Resultado {
  tipo: 'equipo' | 'carro' | 'material'
  id: string
  titulo: string
  subtitulo: string
  detalle: string
  estado?: string
  accion_url?: string
  datos: any
}

export default function BuscadorPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [escaneando, setEscaneando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarPerfil() }, [])

  async function cargarPerfil() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)
    if (p?.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }
  }

  async function buscar(termino: string) {
    if (!termino.trim() || termino.length < 2) return
    setBuscando(true)
    setBuscado(true)
    setResultados([])

    const hospitalId = perfil?.hospital_id
    const q = termino.trim().toLowerCase()

    try {
      const resultadosTemp: Resultado[] = []

      // ── EQUIPOS ──────────────────────────────────────────
      const { data: equipos } = await supabase.from('equipos')
        .select('*, servicios(nombre), carros(codigo, nombre)')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .or(`numero_censo.ilike.%${q}%,numero_serie.ilike.%${q}%,codigo_barras.ilike.%${q}%,nombre.ilike.%${q}%,marca.ilike.%${q}%,modelo.ilike.%${q}%`)
        .limit(10)

      for (const e of (equipos || [])) {
        const diasMant = e.fecha_proximo_mantenimiento
          ? Math.ceil((new Date(e.fecha_proximo_mantenimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : null
        const mantAlert = diasMant !== null && diasMant < 0 ? '🔴 Mant. vencido' : diasMant !== null && diasMant <= 30 ? `🟡 Mant. en ${diasMant}d` : null

        resultadosTemp.push({
          tipo: 'equipo',
          id: e.id,
          titulo: e.nombre,
          subtitulo: [e.marca, e.modelo].filter(Boolean).join(' '),
          detalle: [
            e.numero_censo && `Censo: ${e.numero_censo}`,
            e.numero_serie && `Serie: ${e.numero_serie}`,
            (e.servicios as any)?.nombre,
            (e.carros as any)?.codigo && `Carro: ${(e.carros as any).codigo}`,
            mantAlert,
          ].filter(Boolean).join(' · '),
          estado: e.estado,
          accion_url: `/admin/equipos`,
          datos: e,
        })
      }

      // ── CARROS ──────────────────────────────────────────
      const { data: carros } = await supabase.from('carros')
        .select('*, servicios(nombre)')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .or(`codigo.ilike.%${q}%,nombre.ilike.%${q}%,numero_censo.ilike.%${q}%,ubicacion.ilike.%${q}%`)
        .limit(10)

      for (const c of (carros || [])) {
        const dias = c.proximo_control
          ? Math.ceil((new Date(c.proximo_control).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : null
        resultadosTemp.push({
          tipo: 'carro',
          id: c.id,
          titulo: `${c.codigo} — ${c.nombre}`,
          subtitulo: (c.servicios as any)?.nombre || c.ubicacion || '',
          detalle: [
            c.numero_censo && `Censo: ${c.numero_censo}`,
            c.tipo_carro && c.tipo_carro.replace('_', ' '),
            dias !== null && dias < 0 ? '🔴 Control vencido' : dias !== null && dias <= 7 ? `🟡 Control en ${dias}d` : null,
          ].filter(Boolean).join(' · '),
          estado: c.estado,
          accion_url: `/carro/${c.id}`,
          datos: c,
        })
      }

      // ── MATERIALES ──────────────────────────────────────
      const { data: materiales } = await supabase.from('materiales')
        .select(`nombre, numero_serie, codigo_barras, marca, modelo,
          cajones!inner(nombre, carros!inner(id, codigo, nombre, hospital_id))`)
        .eq('activo', true)
        .or(`nombre.ilike.%${q}%,numero_serie.ilike.%${q}%,codigo_barras.ilike.%${q}%,marca.ilike.%${q}%`)
        .limit(10)

      for (const m of (materiales || [])) {
        const carro = (m.cajones as any)?.carros
        if (carro?.hospital_id !== hospitalId) continue
        resultadosTemp.push({
          tipo: 'material',
          id: Math.random().toString(),
          titulo: m.nombre,
          subtitulo: [m.marca, m.modelo].filter(Boolean).join(' '),
          detalle: [
            m.numero_serie && `Serie: ${m.numero_serie}`,
            `Cajón: ${(m.cajones as any)?.nombre}`,
            `Carro: ${carro?.codigo} — ${carro?.nombre}`,
          ].filter(Boolean).join(' · '),
          accion_url: `/carro/${carro?.id}`,
          datos: m,
        })
      }

      setResultados(resultadosTemp)
    } catch (err: any) {
      toast.error('Error en la búsqueda')
    } finally {
      setBuscando(false)
    }
  }

  function handleEscaneo(codigo: string) {
    setEscaneando(false)
    setBusqueda(codigo)
    buscar(codigo)
    toast.success('Código leído: ' + codigo)
  }

  function estadoColor(estado?: string) {
    switch (estado) {
      case 'operativo': return 'bg-green-100 text-green-700'
      case 'condicional': return 'bg-amber-100 text-amber-700'
      case 'no_operativo': return 'bg-red-100 text-red-700'
      case 'en_mantenimiento': return 'bg-amber-100 text-amber-700'
      case 'fuera_de_servicio': return 'bg-red-100 text-red-700'
      case 'baja': return 'bg-gray-100 text-gray-500'
      default: return 'bg-gray-100 text-gray-500'
    }
  }

  function estadoLabel(estado?: string) {
    switch (estado) {
      case 'operativo': return 'Operativo'
      case 'condicional': return 'Condicional'
      case 'no_operativo': return 'No operativo'
      case 'en_mantenimiento': return 'En mantenimiento'
      case 'fuera_de_servicio': return 'Fuera de servicio'
      case 'baja': return 'Baja'
      default: return estado || ''
    }
  }

  function iconoTipo(tipo: string) {
    if (tipo === 'equipo') return (
      <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    )
    if (tipo === 'carro') return (
      <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="2" strokeWidth={2}/>
          <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" strokeWidth={2}/>
        </svg>
      </div>
    )
    return (
      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeWidth={2}/>
        </svg>
      </div>
    )
  }

  const colorPrimario = hospital?.color_primario || '#1d4ed8'

  const equiposR = resultados.filter(r => r.tipo === 'equipo')
  const carrosR = resultados.filter(r => r.tipo === 'carro')
  const materialesR = resultados.filter(r => r.tipo === 'material')

  return (
    <div className="page">
      {escaneando && (
        <EscanerCodigoBarras
          onResult={handleEscaneo}
          onClose={() => setEscaneando(false)}
        />
      )}

      <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{hospital?.nombre}</div>
          <div className="font-semibold text-sm">Buscador de activos</div>
        </div>
        <div className="w-12 flex-shrink-0" />
      </div>

      <div className="content">

        {/* Buscador */}
        <div className="card">
          <div className="text-xs text-gray-500 mb-2">Busca por nombre, número de censo, serie o código de barras</div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1"
              placeholder="Ej: CEN-2024-0041, Zoll, UCI-01..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar(busqueda)}
              autoFocus
            />
            <button
              onClick={() => setEscaneando(true)}
              className="flex-shrink-0 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold active:opacity-80 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" strokeWidth={2}/>
                <rect x="14" y="3" width="7" height="7" strokeWidth={2}/>
                <rect x="3" y="14" width="7" height="7" strokeWidth={2}/>
                <rect x="14" y="14" width="3" height="3" strokeWidth={2}/>
              </svg>
              Escanear
            </button>
          </div>
          <button
            onClick={() => buscar(busqueda)}
            disabled={buscando || busqueda.length < 2}
            style={{background: colorPrimario}}
            className="w-full mt-2 py-2.5 text-white text-sm font-semibold rounded-xl active:opacity-80 disabled:opacity-40">
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {/* Sin resultados */}
        {buscado && !buscando && resultados.length === 0 && (
          <div className="card text-center py-10">
            <div className="text-3xl mb-3">🔍</div>
            <div className="text-sm font-semibold text-gray-600">Sin resultados</div>
            <div className="text-xs text-gray-400 mt-1">
              No se encontró ningún activo con "{busqueda}"
            </div>
          </div>
        )}

        {/* Resultados — Equipos */}
        {equiposR.length > 0 && (
          <>
            <div className="section-title">Equipos ({equiposR.length})</div>
            {equiposR.map(r => (
              <div key={r.id} className="card cursor-pointer active:opacity-80"
                onClick={() => router.push(r.accion_url || '/admin/equipos')}>
                <div className="flex items-start gap-3">
                  {iconoTipo(r.tipo)}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{r.titulo}</div>
                    {r.subtitulo && <div className="text-xs text-gray-400">{r.subtitulo}</div>}
                    {r.detalle && <div className="text-xs text-gray-500 mt-0.5">{r.detalle}</div>}
                  </div>
                  {r.estado && (
                    <span className={`badge text-xs flex-shrink-0 ${estadoColor(r.estado)}`}>
                      {estadoLabel(r.estado)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Resultados — Carros */}
        {carrosR.length > 0 && (
          <>
            <div className="section-title">Carros ({carrosR.length})</div>
            {carrosR.map(r => (
              <div key={r.id} className="card cursor-pointer active:opacity-80"
                onClick={() => router.push(r.accion_url || '/')}>
                <div className="flex items-start gap-3">
                  {iconoTipo(r.tipo)}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{r.titulo}</div>
                    {r.subtitulo && <div className="text-xs text-gray-400">{r.subtitulo}</div>}
                    {r.detalle && <div className="text-xs text-gray-500 mt-0.5">{r.detalle}</div>}
                  </div>
                  {r.estado && (
                    <span className={`badge text-xs flex-shrink-0 ${estadoColor(r.estado)}`}>
                      {estadoLabel(r.estado)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Resultados — Materiales */}
        {materialesR.length > 0 && (
          <>
            <div className="section-title">Materiales ({materialesR.length})</div>
            {materialesR.map(r => (
              <div key={r.id} className="card cursor-pointer active:opacity-80"
                onClick={() => router.push(r.accion_url || '/')}>
                <div className="flex items-start gap-3">
                  {iconoTipo(r.tipo)}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{r.titulo}</div>
                    {r.subtitulo && <div className="text-xs text-gray-400">{r.subtitulo}</div>}
                    {r.detalle && <div className="text-xs text-gray-500 mt-0.5">{r.detalle}</div>}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Ayuda */}
        {!buscado && (
          <div className="card bg-blue-50 border-blue-100">
            <div className="section-title mb-2 text-blue-600">¿Qué puedes buscar?</div>
            <div className="flex flex-col gap-2 text-xs text-blue-700">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">🔧</span>
                <span><strong>Equipos</strong> — por censo, serie, código de barras, marca o modelo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">🚑</span>
                <span><strong>Carros</strong> — por código, nombre, censo o ubicación</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-gray-600 flex-shrink-0">💊</span>
                <span><strong>Materiales</strong> — por nombre, serie o código de barras</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

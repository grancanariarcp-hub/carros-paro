'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname, useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'

interface Material {
  id: string
  nombre: string
  cantidad_requerida: number
  tiene_vencimiento: boolean
  fecha_vencimiento: string | null
  cajon_nombre: string
  cajon_orden: number
}

function colorVto(fecha: string | null): string {
  if (!fecha) return 'bg-gray-50 border-gray-200 text-gray-400'
  const dias = Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return 'bg-red-100 border-red-400 text-red-700'
  if (dias <= 7) return 'bg-red-100 border-red-400 text-red-700'
  if (dias <= 30) return 'bg-amber-100 border-amber-400 text-amber-700'
  return 'bg-green-100 border-green-400 text-green-700'
}

function diasLabel(fecha: string | null): string {
  if (!fecha) return 'Sin fecha'
  const dias = Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return `Vencido hace ${Math.abs(dias)}d`
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  if (dias <= 30) return `Vence en ${dias} días`
  return `${Math.floor(dias/30)} meses`
}

export default function VencimientosPage() {
  const [carro, setCarro] = useState<any>(null)
  const [materiales, setMateriales] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState<string|null>(null)
  const [filtro, setFiltro] = useState<'todos'|'proximos'|'sin_fecha'>('todos')
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [carroId])

  async function cargarDatos() {
    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('id', carroId).single()
    setCarro(c)

    const { data: cajs } = await supabase.from('cajones')
      .select('*, materiales(*)')
      .eq('carro_id', carroId)
      .eq('activo', true)
      .order('orden')

    const mats: Material[] = []
    for (const caj of (cajs || [])) {
      for (const mat of (caj.materiales || [])) {
        if (mat.activo && mat.tiene_vencimiento) {
          mats.push({
            id: mat.id,
            nombre: mat.nombre,
            cantidad_requerida: mat.cantidad_requerida,
            tiene_vencimiento: mat.tiene_vencimiento,
            fecha_vencimiento: mat.fecha_vencimiento,
            cajon_nombre: caj.nombre,
            cajon_orden: caj.orden,
          })
        }
      }
    }
    setMateriales(mats)
    setLoading(false)
  }

  async function actualizarFecha(matId: string, fecha: string | null) {
    setGuardando(matId)
    const { error } = await supabase.from('materiales')
      .update({ fecha_vencimiento: fecha || null }).eq('id', matId)
    if (error) { toast.error('Error al guardar'); setGuardando(null); return }
    setMateriales(prev => prev.map(m => m.id === matId ? { ...m, fecha_vencimiento: fecha } : m))
    setGuardando(null)
  }

  const materialesFiltrados = materiales.filter(m => {
    if (filtro === 'sin_fecha') return !m.fecha_vencimiento
    if (filtro === 'proximos') {
      if (!m.fecha_vencimiento) return false
      const dias = Math.ceil((new Date(m.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      return dias <= 30
    }
    return true
  })

  const vencidos = materiales.filter(m => {
    if (!m.fecha_vencimiento) return false
    return new Date(m.fecha_vencimiento) < new Date()
  }).length

  const proximos = materiales.filter(m => {
    if (!m.fecha_vencimiento) return false
    const dias = Math.ceil((new Date(m.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return dias >= 0 && dias <= 30
  }).length

  const sinFecha = materiales.filter(m => !m.fecha_vencimiento).length

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Vencimientos</span>
      </div>

      <div className="content">
        {/* Info carro */}
        <div className="card bg-blue-50 border-blue-100">
          <div className="text-sm font-semibold text-blue-800">{carro?.codigo} — {carro?.nombre}</div>
          <div className="text-xs text-blue-600 mt-1">{(carro?.servicios as any)?.nombre || carro?.ubicacion}</div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center py-3">
            <div className="text-xl font-bold text-red-600">{vencidos}</div>
            <div className="text-xs text-gray-500 mt-1">Vencidos</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xl font-bold text-amber-600">{proximos}</div>
            <div className="text-xs text-gray-500 mt-1">Próximos</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-xl font-bold text-gray-400">{sinFecha}</div>
            <div className="text-xs text-gray-500 mt-1">Sin fecha</div>
          </div>
        </div>

        {/* Nota criterio */}
        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700 leading-relaxed">
            Si un material tiene varias unidades con distintas fechas de vencimiento, registrá siempre la <span className="font-semibold">fecha más próxima</span>.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          {(['todos','proximos','sin_fecha'] as const).map(f => (
            <button key={f}
              onClick={() => setFiltro(f)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                filtro === f
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}>
              {f === 'todos' ? 'Todos' : f === 'proximos' ? 'Próximos' : 'Sin fecha'}
            </button>
          ))}
        </div>

        {/* Lista materiales agrupados por cajón */}
        {Object.entries(
          materialesFiltrados.reduce((acc, m) => {
            if (!acc[m.cajon_nombre]) acc[m.cajon_nombre] = []
            acc[m.cajon_nombre].push(m)
            return acc
          }, {} as Record<string, Material[]>)
        ).map(([cajonNombre, mats]) => (
          <div key={cajonNombre} className="card">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{cajonNombre}</div>
            {mats.map(mat => (
              <div key={mat.id} className="flex items-center gap-2 py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{mat.nombre}</div>
                  <div className={`text-xs mt-0.5 font-medium ${
                    mat.fecha_vencimiento
                      ? colorVto(mat.fecha_vencimiento).includes('red') ? 'text-red-600'
                        : colorVto(mat.fecha_vencimiento).includes('amber') ? 'text-amber-600'
                        : 'text-green-600'
                      : 'text-gray-400'
                  }`}>
                    {diasLabel(mat.fecha_vencimiento)}
                    {guardando === mat.id && ' · Guardando...'}
                  </div>
                </div>
                <input
                  type="date"
                  value={mat.fecha_vencimiento || ''}
                  onChange={e => actualizarFecha(mat.id, e.target.value || null)}
                  className={`text-xs py-1.5 px-2 rounded-xl border w-36 text-center font-medium ${colorVto(mat.fecha_vencimiento)}`}
                />
              </div>
            ))}
          </div>
        ))}

        {materialesFiltrados.length === 0 && (
          <div className="card text-center py-8">
            <div className="text-gray-400 text-sm">
              {filtro === 'sin_fecha' ? 'Todos los materiales tienen fecha registrada' :
               filtro === 'proximos' ? 'No hay vencimientos próximos' :
               'No hay materiales con vencimiento activo'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

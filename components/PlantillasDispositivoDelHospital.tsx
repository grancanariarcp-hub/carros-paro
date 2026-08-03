'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import CrearPlantillaDispositivo from './CrearPlantillaDispositivo'

interface Plantilla {
  id: string
  nombre: string
  marca: string | null
  modelo: string | null
  propia: boolean      // creada por este hospital, no del catálogo compartido
  adoptada: boolean
  unidades: number     // aparatos físicos dados de alta con este modelo
}

/**
 * Modelos de dispositivo que puede usar un hospital.
 *
 * El catálogo es compartido y cada centro marca los que usa: un hospital
 * pequeño no necesita ver los cien modelos del catálogo para elegir entre los
 * cuatro que tiene. Las plantillas propias del hospital no se marcan —son
 * suyas y siempre están disponibles.
 *
 * No se puede dejar de usar un modelo que tenga aparatos dados de alta: esos
 * equipos se quedarían apuntando a un modelo que ya no aparece en ningún sitio.
 */
export default function PlantillasDispositivoDelHospital({
  hospitalId,
}: {
  hospitalId: string
}) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [abierto, setAbierto]   = useState(false)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado]   = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const supabase = createClient()

  async function cargar() {
    setCargando(true)

    // Todo de una vez y se cruza en memoria: una consulta de conteo por modelo
    // serían decenas de llamadas y la ficha tardaría segundos en pintar.
    const [{ data: disponibles }, { data: adopciones }, { data: equipos }] = await Promise.all([
      supabase.from('plantillas_dispositivo')
        .select('id, nombre, marca, modelo, hospital_id')
        .or(`hospital_id.is.null,hospital_id.eq.${hospitalId}`)
        .is('deleted_at', null).eq('activo', true).order('nombre'),
      supabase.from('plantillas_dispositivo_hospital')
        .select('plantilla_id').eq('hospital_id', hospitalId),
      supabase.from('equipos')
        .select('plantilla_id').eq('hospital_id', hospitalId)
        .eq('activo', true).is('deleted_at', null).not('plantilla_id', 'is', null),
    ])

    const adoptadas = new Set((adopciones || []).map(a => a.plantilla_id))
    const porModelo = new Map<string, number>()
    for (const e of equipos || []) {
      porModelo.set(e.plantilla_id, (porModelo.get(e.plantilla_id) || 0) + 1)
    }

    setPlantillas((disponibles || []).map(p => ({
      id: p.id, nombre: p.nombre, marca: p.marca, modelo: p.modelo,
      propia: p.hospital_id !== null,
      adoptada: p.hospital_id !== null || adoptadas.has(p.id),
      unidades: porModelo.get(p.id) || 0,
    })))
    setCargando(false)
  }

  useEffect(() => { cargar() }, [hospitalId])

  async function alternar(p: Plantilla) {
    if (p.propia) {
      toast.error(`"${p.nombre}" es una plantilla propia de este hospital, no del catálogo.`)
      return
    }
    if (p.adoptada && p.unidades > 0) {
      toast.error(`"${p.nombre}" tiene ${p.unidades} aparato${p.unidades !== 1 ? 's' : ''} dado${p.unidades !== 1 ? 's' : ''} de alta. Reasígnalos antes de quitarlo.`)
      return
    }

    setOcupado(p.id)
    const { error } = p.adoptada
      ? await supabase.from('plantillas_dispositivo_hospital').delete()
          .eq('hospital_id', hospitalId).eq('plantilla_id', p.id)
      : await supabase.from('plantillas_dispositivo_hospital')
          .insert({ hospital_id: hospitalId, plantilla_id: p.id })
    setOcupado(null)

    if (error) { toast.error('No se pudo cambiar: ' + error.message); return }
    toast.success(p.adoptada ? `"${p.nombre}" retirado` : `"${p.nombre}" añadido`)
    await cargar()
  }

  const enUso    = plantillas.filter(p => p.adoptada).length
  const conAlta  = plantillas.filter(p => p.unidades > 0).length
  const visibles = plantillas.filter(p => {
    if (!busqueda) return true
    const t = busqueda.toLowerCase()
    return [p.nombre, p.marca, p.modelo].some(v => v?.toLowerCase().includes(t))
  })

  return (
    <div className="panel-hospital">
      <button className="panel-hospital-cabecera" onClick={() => setAbierto(a => !a)}>
        <span className="panel-hospital-titulo">
          <span className="panel-hospital-flecha" style={{ transform: abierto ? 'rotate(90deg)' : 'none' }}>▸</span>
          Plantillas de dispositivo
        </span>
        <span className="panel-hospital-resumen">
          {cargando ? 'cargando…' : `${enUso} en uso de ${plantillas.length} · ${conAlta} con aparatos`}
        </span>
      </button>

      {abierto && !cargando && (
        <div className="panel-hospital-cuerpo">
          {plantillas.length === 0 && (
            <div className="panel-hospital-aviso">
              No hay modelos en el catálogo todavía. Créalos aquí para que al dar
              de alta un aparato solo haya que poner el número de serie.
            </div>
          )}

          {plantillas.length > 10 && (
            <input className="sa-input" placeholder="Buscar por nombre, marca o modelo…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ marginBottom: '0.5rem' }} />
          )}

          {visibles.length > 0 && (
            <div className="panel-lista">
              {visibles.map(p => {
                const bloqueado = p.propia || (p.adoptada && p.unidades > 0)
                return (
                  <label key={p.id}
                    className={`panel-fila${bloqueado ? ' panel-fila-bloqueada' : ''}`}
                    title={p.propia
                      ? 'Plantilla propia de este hospital'
                      : p.adoptada && p.unidades > 0
                        ? `Tiene ${p.unidades} aparato(s): reasígnalos antes de quitarlo`
                        : p.adoptada ? 'Desmarcar para dejar de usarlo' : 'Marcar para usarlo'}>
                    <input type="checkbox" checked={p.adoptada}
                      disabled={bloqueado || ocupado === p.id}
                      onChange={() => alternar(p)} />
                    <span className={`panel-fila-nombre${p.adoptada ? '' : ' panel-fila-inactivo'}`}>
                      {p.nombre}
                      {(p.marca || p.modelo) && (
                        <span className="panel-fila-detalle">
                          {[p.marca, p.modelo].filter(Boolean).join(' ')}
                        </span>
                      )}
                    </span>
                    <span className="panel-fila-uso">
                      {p.propia && <span className="panel-fila-etiqueta">propia</span>}
                      {p.unidades > 0
                        ? <span>{p.unidades} aparato{p.unidades !== 1 ? 's' : ''}</span>
                        : <span className="panel-fila-vacio">sin altas</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {visibles.length === 0 && plantillas.length > 0 && (
            <div className="panel-hospital-vacio">Ningún modelo coincide con «{busqueda}».</div>
          )}

          <div className="panel-hospital-acciones">
            <CrearPlantillaDispositivo
              hospitalId={hospitalId}
              puedeAmpliarCatalogo
              alCrear={cargar}
            />
          </div>
        </div>
      )}
    </div>
  )
}

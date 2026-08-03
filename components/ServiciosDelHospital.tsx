'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import SelectorCatalogoServicios from './SelectorCatalogoServicios'

interface Servicio {
  id: string
  nombre: string
  activo: boolean
  carros: number
  equipos: number
}

/**
 * Servicios de un hospital: qué tiene, cuánto se usa cada uno, y gestión.
 *
 * El desglose por servicio (carros y equipos asignados) es lo que da valor a
 * esta pantalla: distingue de un vistazo un servicio realmente equipado de una
 * entrada muerta en la lista. Por eso va en la fila, no tras un filtro.
 *
 * Se desactiva en vez de borrar. Un servicio puede tener inspecciones
 * históricas colgando aunque hoy no se use, y borrarlo dejaría esos informes
 * sin referencia.
 */
export default function ServiciosDelHospital({
  hospitalId,
  hospitalNombre,
}: {
  hospitalId: string
  hospitalNombre?: string
}) {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [abierto, setAbierto]     = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  const [cargando, setCargando]   = useState(true)
  const [ocupado, setOcupado]     = useState<string | null>(null)
  const [busqueda, setBusqueda]   = useState('')
  const supabase = createClient()

  async function cargar() {
    setCargando(true)

    // Se traen carros y equipos del hospital de una vez y se cuentan en
    // memoria. Con 32 servicios, una consulta de conteo por servicio serían 64
    // llamadas y la pantalla tardaría segundos en pintar.
    const [{ data: svcs }, { data: carros }, { data: equipos }] = await Promise.all([
      supabase.from('servicios').select('id, nombre, activo')
        .eq('hospital_id', hospitalId).is('deleted_at', null).order('nombre'),
      supabase.from('carros').select('servicio_id')
        .eq('hospital_id', hospitalId).eq('activo', true),
      supabase.from('equipos').select('servicio_id')
        .eq('hospital_id', hospitalId).eq('activo', true),
    ])

    const contar = (filas: any[] | null) => {
      const m = new Map<string, number>()
      for (const f of filas || []) {
        if (!f.servicio_id) continue
        m.set(f.servicio_id, (m.get(f.servicio_id) || 0) + 1)
      }
      return m
    }
    const porCarros  = contar(carros)
    const porEquipos = contar(equipos)

    setServicios((svcs || []).map(s => ({
      ...s,
      carros:  porCarros.get(s.id)  || 0,
      equipos: porEquipos.get(s.id) || 0,
    })))
    setCargando(false)
  }

  useEffect(() => { cargar() }, [hospitalId])

  async function alternar(s: Servicio) {
    if (s.activo && s.carros > 0) {
      toast.error(`"${s.nombre}" tiene ${s.carros} carro${s.carros !== 1 ? 's' : ''} asignado${s.carros !== 1 ? 's' : ''}. Reasígnalos antes de desactivarlo.`)
      return
    }
    setOcupado(s.id)
    const { error } = await supabase.from('servicios')
      .update({ activo: !s.activo }).eq('id', s.id)
    setOcupado(null)

    if (error) { toast.error('No se pudo cambiar: ' + error.message); return }
    toast.success(s.activo ? `"${s.nombre}" desactivado` : `"${s.nombre}" activado`)
    await cargar()
  }

  const activos  = servicios.filter(s => s.activo).length
  const visibles = servicios.filter(s =>
    !busqueda || s.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const enUso    = servicios.filter(s => s.carros > 0 || s.equipos > 0).length

  return (
    <div className="panel-hospital">
      {/* Cabecera: resumen siempre visible, detalle bajo demanda. Con 32
          servicios, desplegarlo todo de entrada sepulta el resto de la ficha. */}
      <button className="panel-hospital-cabecera" onClick={() => setAbierto(a => !a)}>
        <span className="panel-hospital-titulo">
          <span className="panel-hospital-flecha" style={{ transform: abierto ? 'rotate(90deg)' : 'none' }}>▸</span>
          Servicios
        </span>
        <span className="panel-hospital-resumen">
          {cargando ? 'cargando…' : `${activos} activos de ${servicios.length} · ${enUso} en uso`}
        </span>
      </button>

      {abierto && !cargando && (
        <div className="panel-hospital-cuerpo">
          {servicios.length === 0 && !eligiendo && (
            <div className="panel-hospital-aviso">
              Este hospital no tiene servicios. Sin ellos no se puede asignar
              servicio a un supervisor, y sin servicio un supervisor no ve sus carros.
            </div>
          )}

          {servicios.length > 10 && (
            <input className="sa-input" placeholder="Buscar servicio…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ marginBottom: '0.5rem' }} />
          )}

          {visibles.length > 0 && (
            <div className="panel-lista">
              {visibles.map(s => {
                const bloqueado = s.activo && s.carros > 0
                return (
                  <label key={s.id}
                    className={`panel-fila${bloqueado ? ' panel-fila-bloqueada' : ''}`}
                    title={bloqueado
                      ? `Tiene ${s.carros} carro(s): reasígnalos antes de desactivarlo`
                      : s.activo ? 'Desmarcar para desactivar' : 'Marcar para activar'}>
                    <input
                      type="checkbox"
                      checked={s.activo}
                      disabled={bloqueado || ocupado === s.id}
                      onChange={() => alternar(s)}
                    />
                    <span className={`panel-fila-nombre${s.activo ? '' : ' panel-fila-inactivo'}`}>
                      {s.nombre}
                    </span>
                    <span className="panel-fila-uso">
                      {s.carros === 0 && s.equipos === 0
                        ? <span className="panel-fila-vacio">sin uso</span>
                        : <>
                            {s.carros > 0 && <span>{s.carros} carro{s.carros !== 1 ? 's' : ''}</span>}
                            {s.carros > 0 && s.equipos > 0 && <span className="panel-fila-sep">·</span>}
                            {s.equipos > 0 && <span>{s.equipos} equipo{s.equipos !== 1 ? 's' : ''}</span>}
                          </>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {visibles.length === 0 && servicios.length > 0 && (
            <div className="panel-hospital-vacio">Ningún servicio coincide con «{busqueda}».</div>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            {!eligiendo ? (
              <button onClick={() => setEligiendo(true)} className="sa-btn sa-btn-sec sa-btn-mini">
                + Añadir del catálogo
              </button>
            ) : (
              <SelectorCatalogoServicios
                hospitalId={hospitalId}
                nombresQueYaTiene={servicios.map(s => s.nombre)}
                onAnadidos={() => { setEligiendo(false); cargar() }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

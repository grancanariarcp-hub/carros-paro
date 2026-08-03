'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

interface Fila {
  id: string              // id del catálogo si es adoptable; id de la copia si es propia
  nombre: string
  descripcion: string | null
  secciones: number
  items: number
  /** id de la copia que tiene el hospital, si la tiene. */
  copiaId: string | null
  /** Creada por el hospital, no venida del catálogo. */
  propia: boolean
  carros: number
}

/**
 * Plantillas de carro de un hospital.
 *
 * Montar la lista de comprobación de un carro de parada desde cero son decenas
 * de ítems y hacerlo mal se paga en una parada, así que el catálogo da un
 * punto de partida revisado. Al adoptarla el hospital se queda con su COPIA:
 * puede ajustar cantidades o añadir secciones sin tocar la de otro centro, y
 * sin mover el historial de inspecciones firmadas que cuelga de ella.
 *
 * Retirar una plantilla con carros asignados está bloqueado: esos carros se
 * quedarían sin lista con la que pasar el control.
 */
export default function PlantillasCarroDelHospital({
  hospitalId,
}: {
  hospitalId: string
}) {
  const [filas, setFilas]       = useState<Fila[]>([])
  const [abierto, setAbierto]   = useState(false)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado]   = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const supabase = createClient()

  async function cargar() {
    setCargando(true)

    const [{ data: catalogo }, { data: propias }, { data: carros }] = await Promise.all([
      supabase.from('plantillas')
        .select('id, nombre, descripcion')
        .eq('es_plantilla', true).eq('activo', true).is('deleted_at', null).order('nombre'),
      supabase.from('plantillas')
        .select('id, nombre, descripcion, origen_plantilla_id')
        .eq('hospital_id', hospitalId).is('deleted_at', null).order('nombre'),
      supabase.from('carros')
        .select('plantilla_id').eq('hospital_id', hospitalId)
        .eq('activo', true).not('plantilla_id', 'is', null),
    ])

    // El contenido de cada plantilla en dos consultas, no en dos por fila: con
    // veinte plantillas serían cuarenta viajes y la ficha tardaría en pintar.
    const ids = [...(catalogo || []).map(p => p.id), ...(propias || []).map(p => p.id)]
    const { data: secciones } = ids.length
      ? await supabase.from('plantilla_secciones').select('id, plantilla_id').in('plantilla_id', ids)
      : { data: [] as any[] }
    const { data: items } = secciones?.length
      ? await supabase.from('plantilla_items').select('seccion_id')
          .in('seccion_id', secciones.map(s => s.id))
      : { data: [] as any[] }

    const seccionesPorPlantilla = new Map<string, string[]>()
    for (const s of secciones || []) {
      const lista = seccionesPorPlantilla.get(s.plantilla_id) || []
      lista.push(s.id)
      seccionesPorPlantilla.set(s.plantilla_id, lista)
    }
    const itemsPorSeccion = new Map<string, number>()
    for (const i of items || []) {
      itemsPorSeccion.set(i.seccion_id, (itemsPorSeccion.get(i.seccion_id) || 0) + 1)
    }
    const contenido = (plantillaId: string) => {
      const secs = seccionesPorPlantilla.get(plantillaId) || []
      return {
        secciones: secs.length,
        items: secs.reduce((n, s) => n + (itemsPorSeccion.get(s) || 0), 0),
      }
    }

    const carrosPor = new Map<string, number>()
    for (const c of carros || []) {
      carrosPor.set(c.plantilla_id, (carrosPor.get(c.plantilla_id) || 0) + 1)
    }

    const copiaPorOrigen = new Map<string, any>()
    for (const p of propias || []) {
      if (p.origen_plantilla_id) copiaPorOrigen.set(p.origen_plantilla_id, p)
    }

    // Primero el catálogo (marcado si ya se adoptó), después lo que el
    // hospital creó por su cuenta.
    const delCatalogo: Fila[] = (catalogo || []).map(p => {
      const copia = copiaPorOrigen.get(p.id)
      return {
        id: p.id, nombre: p.nombre, descripcion: p.descripcion,
        ...contenido(copia ? copia.id : p.id),
        copiaId: copia?.id ?? null,
        propia: false,
        carros: copia ? (carrosPor.get(copia.id) || 0) : 0,
      }
    })

    const soloSuyas: Fila[] = (propias || [])
      .filter(p => !p.origen_plantilla_id)
      .map(p => ({
        id: p.id, nombre: p.nombre, descripcion: p.descripcion,
        ...contenido(p.id),
        copiaId: p.id, propia: true,
        carros: carrosPor.get(p.id) || 0,
      }))

    setFilas([...delCatalogo, ...soloSuyas])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [hospitalId])

  async function alternar(f: Fila) {
    if (f.propia) {
      toast.error(`"${f.nombre}" la creó este hospital; se gestiona desde Plantillas.`)
      return
    }
    if (f.copiaId && f.carros > 0) {
      toast.error(`"${f.nombre}" la usan ${f.carros} carro${f.carros !== 1 ? 's' : ''}. Reasígnalos antes de retirarla.`)
      return
    }

    setOcupado(f.id)
    if (f.copiaId) {
      const { error } = await supabase.from('plantillas').delete().eq('id', f.copiaId)
      setOcupado(null)
      if (error) { toast.error('No se pudo retirar: ' + error.message); return }
      toast.success(`"${f.nombre}" retirada`)
    } else {
      const { error } = await supabase.rpc('copiar_plantilla_a_hospital', {
        p_hospital_id: hospitalId, p_plantilla_id: f.id, p_nombre: null,
      })
      setOcupado(null)
      if (error) { toast.error(error.message); return }
      toast.success(`"${f.nombre}" añadida con su lista de comprobación`)
    }
    await cargar()
  }

  const enUso    = filas.filter(f => f.copiaId).length
  const conCarro = filas.filter(f => f.carros > 0).length
  const visibles = filas.filter(f =>
    !busqueda || f.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="panel-hospital">
      <button className="panel-hospital-cabecera" onClick={() => setAbierto(a => !a)}>
        <span className="panel-hospital-titulo">
          <span className="panel-hospital-flecha" style={{ transform: abierto ? 'rotate(90deg)' : 'none' }}>▸</span>
          Plantillas de carro
        </span>
        <span className="panel-hospital-resumen">
          {cargando ? 'cargando…' : `${enUso} en uso de ${filas.length} · ${conCarro} con carros`}
        </span>
      </button>

      {abierto && !cargando && (
        <div className="panel-hospital-cuerpo">
          {filas.length === 0 && (
            <div className="panel-hospital-aviso">
              No hay plantillas de carro. Sin una lista de comprobación no se
              puede pasar un control, así que este hospital necesita al menos una.
            </div>
          )}

          {filas.length > 10 && (
            <input className="sa-input" placeholder="Buscar plantilla…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ marginBottom: '0.5rem' }} />
          )}

          {visibles.length > 0 && (
            <div className="panel-lista">
              {visibles.map(f => {
                const bloqueado = f.propia || (!!f.copiaId && f.carros > 0)
                return (
                  <label key={f.id}
                    className={`panel-fila${bloqueado ? ' panel-fila-bloqueada' : ''}`}
                    title={f.propia
                      ? 'La creó este hospital'
                      : f.copiaId && f.carros > 0
                        ? `La usan ${f.carros} carro(s): reasígnalos antes de retirarla`
                        : f.copiaId ? 'Desmarcar para retirarla' : 'Marcar para añadirla con su lista'}>
                    <input type="checkbox" checked={!!f.copiaId}
                      disabled={bloqueado || ocupado === f.id}
                      onChange={() => alternar(f)} />
                    <span className={`panel-fila-nombre${f.copiaId ? '' : ' panel-fila-inactivo'}`}>
                      {f.nombre}
                      <span className="panel-fila-detalle">
                        {f.secciones === 0
                          ? 'sin secciones'
                          : `${f.secciones} sección${f.secciones !== 1 ? 'es' : ''} · ${f.items} ítem${f.items !== 1 ? 's' : ''}`}
                      </span>
                    </span>
                    <span className="panel-fila-uso">
                      {f.propia && <span className="panel-fila-etiqueta">propia</span>}
                      {f.carros > 0
                        ? <span>{f.carros} carro{f.carros !== 1 ? 's' : ''}</span>
                        : <span className="panel-fila-vacio">sin carros</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {visibles.length === 0 && filas.length > 0 && (
            <div className="panel-hospital-vacio">Ninguna plantilla coincide con «{busqueda}».</div>
          )}
        </div>
      )}
    </div>
  )
}

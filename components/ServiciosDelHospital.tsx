'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import SelectorCatalogoServicios from './SelectorCatalogoServicios'

/**
 * Servicios de un hospital: ver, añadir del catálogo y desactivar.
 *
 * Se desactiva en vez de borrar. Un servicio puede tener inspecciones
 * históricas colgando aunque hoy no se use, y borrarlo dejaría esos informes
 * sin referencia. Desactivado desaparece de los desplegables y el historial
 * sigue entero.
 *
 * Importa que esté a la vista: sin servicios no se puede asignar uno a un
 * supervisor, y sin servicio un supervisor no ve sus carros ni admite ningún
 * cambio en su ficha (lo exige perfiles_servicio_coherente).
 */
export default function ServiciosDelHospital({
  hospitalId,
  hospitalNombre,
}: {
  hospitalId: string
  hospitalNombre?: string
}) {
  const [propios, setPropios]     = useState<any[]>([])
  const [eligiendo, setEligiendo] = useState(false)
  const [cargando, setCargando]   = useState(true)
  const [ocupado, setOcupado]     = useState<string | null>(null)
  const supabase = createClient()

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('servicios')
      .select('id, nombre, activo')
      .eq('hospital_id', hospitalId).is('deleted_at', null).order('nombre')

    // Cuántos carros usa cada uno: desactivar un servicio con carros dejaría
    // esos carros huérfanos en los listados.
    const conUso = await Promise.all((data || []).map(async s => {
      const { count } = await supabase.from('carros')
        .select('id', { count: 'exact', head: true })
        .eq('servicio_id', s.id).eq('activo', true)
      return { ...s, carros: count ?? 0 }
    }))

    setPropios(conUso)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [hospitalId])

  async function alternar(s: any) {
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

  if (cargando) {
    return <div className="text-xs text-gray-400 py-2">Cargando servicios…</div>
  }

  const activos = propios.filter(s => s.activo)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
          Servicios de {hospitalNombre || 'este hospital'} ({activos.length} activos de {propios.length})
        </div>
        {!eligiendo && (
          <button onClick={() => setEligiendo(true)} className="sa-btn sa-btn-sec sa-btn-mini">
            + Añadir del catálogo
          </button>
        )}
      </div>

      {propios.length === 0 && !eligiendo && (
        <div style={{ fontSize: '0.72rem', color: '#b45309', background: '#fffbeb',
                      border: '1px solid #fde68a', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.5rem' }}>
          Este hospital no tiene servicios. Sin ellos no se puede asignar servicio
          a un supervisor, y sin servicio un supervisor no ve sus carros.
        </div>
      )}

      {propios.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
            {propios.map(s => (
              <button
                key={s.id}
                onClick={() => alternar(s)}
                disabled={ocupado === s.id}
                title={s.activo
                  ? (s.carros > 0
                      ? `${s.carros} carro(s) asignados — reasígnalos para poder desactivarlo`
                      : 'Pulsa para desactivar')
                  : 'Pulsa para volver a activarlo'}
                style={{
                  fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
                  cursor: 'pointer', border: '1px solid transparent',
                  background: s.activo ? '#eef2ff' : '#f3f4f6',
                  color: s.activo ? '#4338ca' : '#9ca3af',
                  textDecoration: s.activo ? 'none' : 'line-through',
                  opacity: ocupado === s.id ? 0.5 : 1,
                }}>
                {s.nombre}
                {s.carros > 0 && <span style={{ opacity: 0.6 }}> · {s.carros}</span>}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
            Pulsa un servicio para activarlo o desactivarlo. El número indica
            carros asignados; no se desactiva un servicio que tenga carros.
          </div>
        </>
      )}

      {eligiendo && (
        <SelectorCatalogoServicios
          hospitalId={hospitalId}
          nombresQueYaTiene={propios.map(s => s.nombre)}
          onAnadidos={() => { setEligiendo(false); cargar() }}
        />
      )}
    </div>
  )
}

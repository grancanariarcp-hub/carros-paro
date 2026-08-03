'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import SelectorCatalogoServicios from './SelectorCatalogoServicios'

/**
 * Resumen compacto de los servicios de un hospital, para la ficha del
 * superadmin. El alta y la edición completa viven en /admin/servicios; aquí
 * solo se ve lo que tiene y se pueden traer más del catálogo.
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
  const supabase = createClient()

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('servicios')
      .select('id, nombre, activo')
      .eq('hospital_id', hospitalId).is('deleted_at', null).order('nombre')
    setPropios(data || [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [hospitalId])

  if (cargando) {
    return <div className="text-xs text-gray-400 py-2">Cargando servicios…</div>
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
          Servicios de {hospitalNombre || 'este hospital'} ({propios.length})
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
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          {propios.map(s => (
            <span key={s.id} style={{
              fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
              background: s.activo ? '#eef2ff' : '#f3f4f6',
              color: s.activo ? '#4338ca' : '#9ca3af',
            }}>
              {s.nombre}
            </span>
          ))}
        </div>
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

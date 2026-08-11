'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Avisa cuando en un hospital nadie tiene los avisos activados.
 *
 * Las alertas —carro no operativo, material caducado, inspección que lleva
 * días reabierta— se registran siempre, pero solo llegan a la campana y al
 * correo de quien las tiene activadas. Eso es deliberado: no se le encienden
 * los correos a nadie sin que alguien lo decida.
 *
 * El efecto secundario es peligroso: si nadie las activa, el sistema de
 * alertas funciona entero y no avisa a ninguna persona. Pasó de verdad —cero
 * de nueve usuarios activados— y no había forma de notarlo, porque desde
 * fuera todo parecía correcto.
 *
 * Así que se dice. Un carro no operativo del que nadie recibe aviso es
 * exactamente el fallo que esta aplicación existe para evitar.
 */
export default function AvisoSinDestinatarios({ hospitalId }: { hospitalId: string }) {
  const [conAvisos, setConAvisos] = useState<number | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('perfiles')
      .select('id', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId)
      .eq('activo', true)
      .eq('recibir_alertas', true)
      .then(({ count }) => setConAvisos(count ?? 0))
  }, [hospitalId])

  if (conAvisos === null || conAvisos > 0) return null

  return (
    <div className="panel-hospital-aviso" style={{ marginBottom: '0.5rem' }}>
      <strong>Nadie recibe los avisos de este centro.</strong> Las alertas se
      registran, pero no llegan a ninguna campana ni a ningún correo. Actívalas
      a quien deba enterarse desde la pestaña Usuarios.
    </div>
  )
}

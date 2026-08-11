'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'
import {
  listarPendientes, enviarPendientes, olvidarPendiente,
  type ControlPendiente,
} from '@/lib/controles-pendientes'

/**
 * Los controles que se firmaron sin cobertura y aún no han salido.
 *
 * Sin esto, un control guardado en el dispositivo es un control invisible:
 * quien lo firmó se va convencido de haberlo registrado. Así que se dice
 * cuántos quedan, se intenta enviarlos solo al volver la red, y se deja el
 * botón para insistir a mano.
 *
 * No aparece nada cuando no hay pendientes, que es lo normal.
 */
export default function ControlesPendientes() {
  const [cola, setCola] = useState<ControlPendiente[]>([])
  const [enviando, setEnviando] = useState(false)
  const supabase = createClient()

  const refrescar = useCallback(async () => {
    setCola(await listarPendientes())
  }, [])

  const sincronizar = useCallback(async (avisar: boolean) => {
    setEnviando(true)
    const { enviados, pendientes } = await enviarPendientes(supabase)
    setEnviando(false)
    await refrescar()

    if (enviados > 0) {
      toast.success(enviados === 1
        ? 'Se envió el control que quedaba pendiente'
        : `Se enviaron ${enviados} controles pendientes`)
    } else if (avisar && pendientes > 0) {
      toast.error('Sigue sin poder enviarse. Se volverá a intentar solo.')
    }
  }, [refrescar])

  useEffect(() => {
    refrescar()

    // Al recuperar la red se intenta solo: quien pasó el control ya se fue a
    // otra cosa y no tiene por qué acordarse de volver a pulsar nada.
    const alVolver = () => { sincronizar(false) }
    window.addEventListener('online', alVolver)

    // Y una vez al abrir, por si la red volvió con la pestaña cerrada.
    if (navigator.onLine) sincronizar(false)

    return () => window.removeEventListener('online', alVolver)
  }, [refrescar, sincronizar])

  if (cola.length === 0) return null

  return (
    <div className="pendientes">
      <div className="pendientes-cabecera">
        <span className="pendientes-punto" aria-hidden="true" />
        <strong>
          {cola.length === 1
            ? '1 control sin enviar'
            : `${cola.length} controles sin enviar`}
        </strong>
      </div>

      <p className="pendientes-texto">
        Se guardaron en este dispositivo porque no había conexión. Se enviarán
        solos en cuanto vuelva la red. No cierres sesión hasta entonces.
      </p>

      <ul className="pendientes-lista">
        {cola.map(p => (
          <li key={p.id}>
            <span>Carro <strong>{p.carroCodigo}</strong></span>
            <span className="pendientes-cuando">
              {new Date(p.guardadoEn).toLocaleString('es-ES', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            {p.intentos > 2 && p.ultimoError && (
              <span className="pendientes-error" title={p.ultimoError}>
                no se acepta: {p.ultimoError.slice(0, 60)}
                <button onClick={async () => {
                  if (!confirm(`¿Descartar el control del carro ${p.carroCodigo}? No se podrá recuperar.`)) return
                  await olvidarPendiente(p.id)
                  await refrescar()
                }}>descartar</button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <button className="btn-secondary" disabled={enviando}
        onClick={() => sincronizar(true)}>
        {enviando ? 'Enviando…' : 'Intentar ahora'}
      </button>
    </div>
  )
}

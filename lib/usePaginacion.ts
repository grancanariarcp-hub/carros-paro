import { useCallback, useState } from 'react'

/**
 * Listados que crecen sin fin, servidos por tandas.
 *
 * Un carro pasa un control al mes durante años; el historial de un supervisor
 * con veinte carros acumula cientos de inspecciones. Traérselas todas de una
 * vez funciona el primer año y deja de funcionar justo cuando la herramienta
 * lleva tiempo en uso y ya nadie recuerda cómo era sin ella.
 *
 * Se pide por tandas y se añade al final. Es "cargar más" y no páginas
 * numeradas a propósito: en un móvil, a pie de carro, se busca hacia abajo, no
 * se salta a la página 7.
 */
export interface Tanda<T> {
  filas: T[]
  cargando: boolean
  /** Quedan más por traer: hubo tantas como se pidieron. */
  hayMas: boolean
  /** Trae la siguiente tanda y la añade. */
  masFilas: () => Promise<void>
  /** Vuelve a empezar. Para cuando cambia un filtro. */
  reiniciar: () => Promise<void>
}

/**
 * @param traer  Recibe el rango [desde, hasta] y devuelve esa tanda.
 * @param porTanda  Cuántas por vez. 25 llena una pantalla de móvil sin sobrar.
 */
export function usePaginacion<T>(
  traer: (desde: number, hasta: number) => Promise<T[]>,
  porTanda = 25,
): Tanda<T> {
  const [filas, setFilas]       = useState<T[]>([])
  const [cargando, setCargando] = useState(false)
  const [hayMas, setHayMas]     = useState(true)

  const cargar = useCallback(async (desdeCero: boolean) => {
    setCargando(true)
    const inicio = desdeCero ? 0 : filas.length

    try {
      const tanda = await traer(inicio, inicio + porTanda - 1)
      setFilas(prev => (desdeCero ? tanda : [...prev, ...tanda]))
      // Si vinieron menos de las pedidas, no hay nada más detrás.
      setHayMas(tanda.length === porTanda)
    } finally {
      setCargando(false)
    }
  }, [traer, filas.length, porTanda])

  return {
    filas,
    cargando,
    hayMas,
    masFilas: () => cargar(false),
    reiniciar: () => cargar(true),
  }
}

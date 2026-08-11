'use client'

/**
 * El pie de un listado por tandas.
 *
 * Dice siempre cuántas se están viendo. Sin ese número, un listado recortado y
 * uno completo se ven igual, y quien busca una inspección de hace dos años se
 * va convencido de que no existe.
 */
export default function CargarMas({
  cargando,
  hayMas,
  cuantas,
  onMas,
  nombre = 'resultados',
}: {
  cargando: boolean
  hayMas: boolean
  cuantas: number
  onMas: () => void
  /** En plural: "inspecciones", "controles". */
  nombre?: string
}) {
  if (cuantas === 0) return null

  return (
    <div className="cargar-mas">
      <span className="cargar-mas-cuenta">
        {hayMas
          ? `${cuantas} ${nombre} — hay más`
          : `${cuantas} ${nombre}, todas`}
      </span>

      {hayMas && (
        <button onClick={onMas} disabled={cargando} className="btn-secondary">
          {cargando ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </div>
  )
}

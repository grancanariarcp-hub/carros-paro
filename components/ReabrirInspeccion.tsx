'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Reabrir y cerrar una inspección firmada.
 *
 * Una inspección firmada no se edita: se enmienda. Reabrirla exige motivo, y
 * queda registrado quién, cuándo y por qué. La firma original nunca se toca —
 * al cerrarla se añade "modificado el ..." junto a ella, no en su lugar.
 *
 * Quién puede hacerlo lo decide la base de datos (reabrir_inspeccion es
 * security definer y comprueba el rol). Aquí solo se oculta el botón cuando no
 * procede, para no ofrecer algo que va a fallar.
 */
export default function ReabrirInspeccion({
  inspeccionId,
  reabiertaEn,
  motivoReapertura,
  puedeReabrir,
  onCambio,
}: {
  inspeccionId: string
  reabiertaEn: string | null
  motivoReapertura?: string | null
  puedeReabrir: boolean
  onCambio: () => void
}) {
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const supabase = createClient()

  const motivoValido = motivo.trim().length >= 10

  async function reabrir() {
    if (!motivoValido) return
    setTrabajando(true)
    const { error } = await supabase.rpc('reabrir_inspeccion', {
      p_inspeccion_id: inspeccionId,
      p_motivo: motivo.trim(),
    })
    setTrabajando(false)

    if (error) { toast.error(error.message); return }
    toast.success('Inspección reabierta. Recuerda cerrarla al terminar.')
    setPidiendoMotivo(false)
    setMotivo('')
    onCambio()
  }

  async function cerrar() {
    setTrabajando(true)
    const { error } = await supabase.rpc('cerrar_inspeccion', {
      p_inspeccion_id: inspeccionId,
    })
    setTrabajando(false)

    if (error) { toast.error(error.message); return }
    toast.success('Inspección cerrada y sellada')
    onCambio()
  }

  // ---------------------------------------------------------------------
  // Abierta: lo importante es que se vea, y que cerrarla sea fácil. Una
  // inspección que se queda abierta por olvido es editable indefinidamente.
  // ---------------------------------------------------------------------
  if (reabiertaEn) {
    return (
      <div className="card" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
        <div className="flex items-start gap-2 mb-2">
          <span className="text-lg leading-none">🔓</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-amber-900">Inspección reabierta</div>
            <div className="text-xs text-amber-800 mt-0.5 leading-snug">
              Admite cambios hasta que la cierres. Al cerrarla quedará marcada
              como modificada, sin alterar la firma original.
            </div>
          </div>
        </div>

        {motivoReapertura && (
          <div className="text-xs text-amber-800 bg-amber-100 rounded-lg px-2.5 py-1.5 mb-2">
            <span className="font-semibold">Motivo:</span> {motivoReapertura}
          </div>
        )}

        {puedeReabrir && (
          <button onClick={cerrar} disabled={trabajando} className="btn-primary">
            {trabajando ? 'Cerrando…' : 'Cerrar y sellar inspección'}
          </button>
        )}
      </div>
    )
  }

  if (!puedeReabrir) return null

  // ---------------------------------------------------------------------
  // Cerrada
  // ---------------------------------------------------------------------
  if (!pidiendoMotivo) {
    return (
      <button
        onClick={() => setPidiendoMotivo(true)}
        className="w-full py-2 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 bg-white active:bg-gray-50 transition-colors"
      >
        Reabrir para corregir
      </button>
    )
  }

  return (
    <div className="card" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
      <div className="text-sm font-bold text-amber-900 mb-1">Reabrir la inspección</div>
      <p className="text-xs text-amber-800 mb-3 leading-snug">
        Explica por qué hay que corregirla. Queda registrado con tu nombre y la
        fecha, y aparecerá en el informe. La firma original no se altera.
      </p>

      <textarea
        className="input"
        rows={3}
        value={motivo}
        onChange={e => setMotivo(e.target.value)}
        placeholder="Ej.: faltaba anotar el laringoscopio del cajón 3"
        autoFocus
      />
      <div className="text-xs text-amber-700 mt-1 mb-3">
        {motivo.trim().length < 10
          ? `Faltan ${10 - motivo.trim().length} caracteres`
          : 'Listo'}
      </div>

      <div className="flex gap-2">
        <button onClick={reabrir} disabled={!motivoValido || trabajando} className="btn-primary">
          {trabajando ? 'Reabriendo…' : 'Reabrir'}
        </button>
        <button
          onClick={() => { setPidiendoMotivo(false); setMotivo('') }}
          className="btn-secondary"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

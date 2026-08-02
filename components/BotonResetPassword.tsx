'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Botón para que un administrador desbloquee a un usuario que ha perdido su
 * contraseña.
 *
 * Genera un enlace de un solo uso y lo muestra para copiarlo. Nunca revela ni
 * fija una contraseña: es el usuario quien elige la suya. Así la firma digital
 * de los controles sigue probando quién firmó, que es lo que la app existe
 * para garantizar.
 *
 * Quién puede usarlo lo decide la Edge Function, no este componente: aquí solo
 * se oculta el botón cuando no procede, pero la comprobación de verdad está en
 * el servidor.
 */
export default function BotonResetPassword({
  usuarioId,
  usuarioNombre,
  estilo,
  className,
}: {
  usuarioId: string
  usuarioNombre?: string
  estilo?: React.CSSProperties
  className?: string
}) {
  const [generando, setGenerando] = useState(false)
  const [enlace, setEnlace] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const supabase = createClient()

  async function generar() {
    setGenerando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Sesión expirada, vuelve a entrar'); return }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resetear-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ usuario_id: usuarioId }),
        },
      )
      const datos = await res.json()
      if (!res.ok || !datos.ok) throw new Error(datos.error || 'No se pudo generar el enlace')

      setEnlace(datos.enlace)
    } catch (err: any) {
      toast.error(err.message || 'No se pudo generar el enlace')
    } finally {
      setGenerando(false)
    }
  }

  async function copiar() {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      toast.error('No se pudo copiar; selecciona el texto a mano')
    }
  }

  if (enlace) {
    return (
      <div className="reset-enlace">
        <div className="reset-enlace-titulo">
          Enlace para {usuarioNombre || 'el usuario'}
        </div>
        <p className="reset-enlace-ayuda">
          Hazle llegar este enlace. Caduca en 1 hora y solo sirve una vez.
          Al abrirlo elegirá su nueva contraseña.
        </p>
        <textarea
          className="reset-enlace-campo"
          readOnly
          value={enlace}
          rows={3}
          onFocus={e => e.currentTarget.select()}
        />
        <div className="reset-enlace-acciones">
          <button type="button" onClick={copiar} className="btn-primary">
            {copiado ? '✓ Copiado' : 'Copiar enlace'}
          </button>
          <button type="button" onClick={() => setEnlace(null)} className="btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={generar}
      disabled={generando}
      style={estilo}
      className={className}
      title={`Generar enlace de recuperación para ${usuarioNombre || 'este usuario'}`}
    >
      {generando ? 'Generando…' : 'Restablecer contraseña'}
    </button>
  )
}

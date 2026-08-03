'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Alta de un servicio que no está en el catálogo.
 *
 * El catálogo cubre los servicios habituales, pero ningún catálogo cubre a
 * todos los hospitales: unidades propias, servicios que se llaman distinto en
 * cada centro, reorganizaciones. Sin poder crearlos, esos carros se quedan sin
 * clasificar.
 *
 * Quién puede hacerlo lo decide RLS, no este componente: el administrador solo
 * en su hospital, el superadmin en cualquiera. Añadir al catálogo compartido
 * queda reservado al superadmin —si cada centro pudiera, el pool se llenaría
 * de nombres locales que no le sirven a nadie más.
 */
export default function CrearServicio({
  hospitalId,
  nombresQueYaTiene,
  puedeAmpliarCatalogo = false,
  alCrear,
}: {
  hospitalId: string
  /** Para avisar del choque antes de enviarlo, no después del error. */
  nombresQueYaTiene: string[]
  /** Ofrece guardarlo también como plantilla para el resto de hospitales. */
  puedeAmpliarCatalogo?: boolean
  alCrear: () => void
}) {
  const [abierto, setAbierto]       = useState(false)
  const [nombre, setNombre]         = useState('')
  const [descripcion, setDesc]      = useState('')
  const [alCatalogo, setAlCatalogo] = useState(false)
  const [guardando, setGuardando]   = useState(false)
  const supabase = createClient()

  const limpio    = nombre.trim()
  const repetido  = nombresQueYaTiene.some(
    n => n.trim().toLowerCase() === limpio.toLowerCase()) && limpio.length > 0

  function cerrar() {
    setAbierto(false); setNombre(''); setDesc(''); setAlCatalogo(false)
  }

  async function guardar() {
    if (!limpio) { toast.error('El nombre es obligatorio'); return }
    if (repetido) { toast.error(`Este hospital ya tiene "${limpio}"`); return }

    setGuardando(true)
    const { error } = await supabase.from('servicios').insert({
      nombre: limpio,
      descripcion: descripcion.trim() || null,
      hospital_id: hospitalId,
      es_plantilla: false,
      activo: true,
    })

    if (error) {
      setGuardando(false)
      // 23505 = choca con el índice único. Puede venir de un servicio que
      // exista pero esté desactivado, y por eso no aparece en la lista.
      toast.error(error.code === '23505'
        ? `Ya existe un servicio "${limpio}" en este hospital (quizá desactivado)`
        : 'No se pudo crear: ' + error.message)
      return
    }

    // El catálogo va aparte y puede fallar por su cuenta sin que eso invalide
    // el servicio que acaba de crearse en el hospital.
    if (alCatalogo) {
      const { error: eCat } = await supabase.from('servicios').insert({
        nombre: limpio,
        descripcion: descripcion.trim() || null,
        hospital_id: null,
        es_plantilla: true,
        activo: true,
      })
      if (eCat) {
        toast.success(`"${limpio}" creado`)
        toast.error(eCat.code === '23505'
          ? 'En el catálogo ya estaba'
          : 'Creado en el hospital, pero no en el catálogo: ' + eCat.message)
        setGuardando(false); cerrar(); alCrear(); return
      }
    }

    setGuardando(false)
    toast.success(alCatalogo
      ? `"${limpio}" creado y añadido al catálogo`
      : `"${limpio}" creado`)
    cerrar()
    alCrear()
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="sa-btn sa-btn-sec sa-btn-mini">
        + Crear servicio
      </button>
    )
  }

  return (
    <div className="crear-servicio">
      <div className="crear-servicio-titulo">Nuevo servicio</div>

      <input
        className="sa-input"
        placeholder="Nombre (p. ej. Hospital de Día)"
        value={nombre}
        autoFocus
        maxLength={60}
        onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !repetido) guardar() }}
      />
      {repetido && (
        <div className="crear-servicio-error">Este hospital ya tiene «{limpio}».</div>
      )}

      <input
        className="sa-input"
        placeholder="Descripción (opcional)"
        value={descripcion}
        maxLength={120}
        onChange={e => setDesc(e.target.value)}
        style={{ marginTop: '0.4rem' }}
      />

      {puedeAmpliarCatalogo && (
        <label className="crear-servicio-catalogo">
          <input type="checkbox" checked={alCatalogo}
            onChange={e => setAlCatalogo(e.target.checked)} />
          <span>
            Añadirlo también al catálogo
            <span className="crear-servicio-pista">
              para que el resto de hospitales pueda elegirlo
            </span>
          </span>
        </label>
      )}

      <div className="crear-servicio-botones">
        <button onClick={guardar} disabled={!limpio || repetido || guardando}
          className="sa-btn sa-btn-pri sa-btn-mini">
          {guardando ? 'Creando…' : 'Crear'}
        </button>
        <button onClick={cerrar} disabled={guardando}
          className="sa-btn sa-btn-sec sa-btn-mini">
          Cancelar
        </button>
      </div>
    </div>
  )
}

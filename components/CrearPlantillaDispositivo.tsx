'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Alta de un modelo de dispositivo.
 *
 * Guarda un MODELO, no un aparato: el número de serie, el censo y las fechas
 * de calibración siguen viviendo en cada unidad física. Lo que se fija aquí es
 * lo que se repite igual en todas las unidades del mismo modelo y hoy hay que
 * recordar de memoria en cada alta.
 */
export default function CrearPlantillaDispositivo({
  hospitalId,
  puedeAmpliarCatalogo = false,
  alCrear,
}: {
  hospitalId: string
  /** Ofrece guardarlo en el catálogo compartido en vez de solo en el hospital. */
  puedeAmpliarCatalogo?: boolean
  alCrear: () => void
}) {
  const [abierto, setAbierto]     = useState(false)
  const [categorias, setCats]     = useState<any[]>([])
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    nombre: '', marca: '', modelo: '', categoria_id: '',
    frecuencia_mantenimiento: '', requiere_calibracion: false,
    alCatalogo: false,
  })
  const supabase = createClient()

  useEffect(() => {
    if (!abierto || categorias.length) return
    supabase.from('categorias_equipo').select('id, nombre')
      .eq('activo', true).order('nombre')
      .then(({ data }) => setCats(data || []))
  }, [abierto])

  function cerrar() {
    setAbierto(false)
    setForm({ nombre: '', marca: '', modelo: '', categoria_id: '',
      frecuencia_mantenimiento: '', requiere_calibracion: false, alCatalogo: false })
  }

  async function guardar() {
    const nombre = form.nombre.trim()
    if (!nombre) { toast.error('El nombre es obligatorio'); return }

    setGuardando(true)
    const { error } = await supabase.from('plantillas_dispositivo').insert({
      nombre,
      marca:  form.marca.trim()  || null,
      modelo: form.modelo.trim() || null,
      categoria_id: form.categoria_id || null,
      frecuencia_mantenimiento: form.frecuencia_mantenimiento.trim() || null,
      requiere_calibracion: form.requiere_calibracion,
      // En el catálogo compartido hospital_id va vacío; eso es lo que lo hace
      // visible para el resto de centros.
      hospital_id: form.alCatalogo ? null : hospitalId,
    })
    setGuardando(false)

    if (error) {
      toast.error(error.code === '23505'
        ? `Ya existe "${nombre}" con esa marca y modelo`
        : 'No se pudo crear: ' + error.message)
      return
    }
    toast.success(form.alCatalogo
      ? `"${nombre}" añadido al catálogo`
      : `"${nombre}" creado`)
    cerrar()
    alCrear()
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="sa-btn sa-btn-sec sa-btn-mini">
        + Crear modelo
      </button>
    )
  }

  return (
    <div className="crear-servicio">
      <div className="crear-servicio-titulo">Nuevo modelo de dispositivo</div>

      <input className="sa-input" autoFocus maxLength={80}
        placeholder="Nombre (p. ej. Monitor/Desfibrilador)"
        value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />

      {/* Marca y modelo en la misma fila: son lo que identifica el aparato y
          se rellenan siempre juntos. */}
      <div className="crear-plantilla-fila">
        <input className="sa-input" maxLength={60} placeholder="Marca (p. ej. Zoll)"
          value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} />
        <input className="sa-input" maxLength={60} placeholder="Modelo (p. ej. X Series)"
          value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} />
      </div>

      <div className="crear-plantilla-fila">
        <select className="sa-input" value={form.categoria_id}
          onChange={e => setForm({ ...form, categoria_id: e.target.value })}>
          <option value="">Categoría (opcional)</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className="sa-input" maxLength={40}
          placeholder="Mantenimiento (p. ej. anual)"
          value={form.frecuencia_mantenimiento}
          onChange={e => setForm({ ...form, frecuencia_mantenimiento: e.target.value })} />
      </div>

      <label className="crear-servicio-catalogo">
        <input type="checkbox" checked={form.requiere_calibracion}
          onChange={e => setForm({ ...form, requiere_calibracion: e.target.checked })} />
        <span>Requiere calibración periódica</span>
      </label>

      {puedeAmpliarCatalogo && (
        <label className="crear-servicio-catalogo">
          <input type="checkbox" checked={form.alCatalogo}
            onChange={e => setForm({ ...form, alCatalogo: e.target.checked })} />
          <span>
            Guardarlo en el catálogo compartido
            <span className="crear-servicio-pista">
              en vez de solo en este hospital; el resto de centros podrá elegirlo
            </span>
          </span>
        </label>
      )}

      <div className="crear-servicio-botones">
        <button onClick={guardar} disabled={!form.nombre.trim() || guardando}
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

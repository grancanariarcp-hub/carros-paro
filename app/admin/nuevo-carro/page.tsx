'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { Servicio } from '@/lib/types'

export default function NuevoCarroPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    codigo: '', nombre: '', ubicacion: '', servicio_id: '',
    responsable: '', frecuencia_control: 'mensual', primer_control: ''
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.from('servicios').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setServicios(data || []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.codigo || !form.nombre) {
      toast.error('Código y nombre son obligatorios')
      return
    }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase.rpc('copiar_plantilla', {
        p_codigo: form.codigo.toUpperCase(),
        p_nombre: form.nombre,
        p_ubicacion: form.ubicacion || null,
        p_servicio_id: form.servicio_id || null,
        p_responsable: form.responsable || null,
        p_frecuencia: form.frecuencia_control,
        p_proximo_control: form.primer_control || null,
        p_creado_por: user?.id,
      })

      if (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
          toast.error('Ya existe un carro con ese código')
        } else {
          throw error
        }
        return
      }

      toast.success('Carro creado con plantilla completa')
      router.push(`/admin/carro/${data}/materiales`)
    } catch (err: any) {
      toast.error('Error al crear el carro: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Nuevo carro</span>
      </div>
      <form onSubmit={handleSubmit} className="content">
        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700 leading-relaxed">
            Al crear el carro se copiará automáticamente la plantilla maestra con los 8 secciones y 95 materiales. Podrás personalizar el contenido después.
          </p>
        </div>

        <div className="card">
          <div className="section-title mb-4">Datos del carro</div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="label">Código / nombre corto *</label>
              <input className="input" placeholder="Ej: UTI-04" value={form.codigo}
                onChange={e => setForm({...form, codigo: e.target.value})} required />
            </div>
            <div>
              <label className="label">Nombre descriptivo *</label>
              <input className="input" placeholder="Ej: Carro parada UTI piso 4" value={form.nombre}
                onChange={e => setForm({...form, nombre: e.target.value})} required />
            </div>
            <div>
              <label className="label">Servicio / unidad</label>
              <select className="input" value={form.servicio_id}
                onChange={e => setForm({...form, servicio_id: e.target.value})}>
                <option value="">Seleccioná un servicio...</option>
                {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Ubicación física</label>
              <input className="input" placeholder="Ej: Pasillo B, piso 3" value={form.ubicacion}
                onChange={e => setForm({...form, ubicacion: e.target.value})} />
            </div>
            <div>
              <label className="label">Responsable del servicio</label>
              <input className="input" placeholder="Nombre del responsable" value={form.responsable}
                onChange={e => setForm({...form, responsable: e.target.value})} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title mb-4">Control periódico</div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="label">Frecuencia de control</label>
              <select className="input" value={form.frecuencia_control}
                onChange={e => setForm({...form, frecuencia_control: e.target.value})}>
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
            <div>
              <label className="label">Primer control programado</label>
              <input className="input" type="date" value={form.primer_control}
                onChange={e => setForm({...form, primer_control: e.target.value})} />
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creando carro...' : 'Crear carro con plantilla completa →'}
        </button>
      </form>
    </div>
  )
}

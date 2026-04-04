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
    if (!form.codigo || !form.nombre) { toast.error('Código y nombre son obligatorios'); return }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: carro, error } = await supabase.from('carros').insert({
      codigo: form.codigo.toUpperCase(),
      nombre: form.nombre,
      ubicacion: form.ubicacion || null,
      servicio_id: form.servicio_id || null,
      responsable: form.responsable || null,
      frecuencia_control: form.frecuencia_control,
      proximo_control: form.primer_control || null,
      estado: 'sin_control',
      creado_por: user?.id
    }).select().single()

    if (error) {
      if (error.code === '23505') toast.error('Ya existe un carro con ese código')
      else toast.error('Error al crear el carro')
      setLoading(false)
      return
    }
    toast.success('Carro creado correctamente')
    router.push(`/admin/carro/${carro.id}/materiales`)
  }

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Nuevo carro</span>
      </div>
      <form onSubmit={handleSubmit} className="content">
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
              <input className="input" placeholder="Ej: Carro UTI piso 4" value={form.nombre}
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

        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700">
            Después de crear el carro, podrás agregar los cajones y materiales. 
            También se generará el código QR automáticamente.
          </p>
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creando...' : 'Crear carro y continuar →'}
        </button>
      </form>
    </div>
  )
}

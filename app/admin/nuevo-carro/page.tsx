'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { Servicio } from '@/lib/types'

export default function NuevoCarroPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading] = useState(false)
  const [estadoPlan, setEstadoPlan] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [form, setForm] = useState({
    codigo: '', nombre: '', ubicacion: '', servicio_id: '',
    responsable: '', frecuencia_control: 'mensual', primer_control: ''
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) { router.back(); return }
    setPerfil(p)

    // Verificar límites del plan
    if (p.hospital_id) {
      const { data: plan } = await supabase.rpc('estado_plan', { p_hospital_id: p.hospital_id })
      setEstadoPlan(plan)
    }

    const { data: svcs } = await supabase.from('servicios')
      .select('*').eq('activo', true).order('nombre')
    setServicios(svcs || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.codigo || !form.nombre) {
      toast.error('Código y nombre son obligatorios')
      return
    }

    // Verificar límite de carros
    if (estadoPlan && !estadoPlan.puede_crear_carro) {
      toast.error(`Has alcanzado el límite de ${estadoPlan.max_carros} carros de tu plan. Contacta con CRITIC SL para ampliar.`)
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

      // Asignar hospital_id al carro recién creado
      if (perfil?.hospital_id) {
        await supabase.from('carros')
          .update({ hospital_id: perfil.hospital_id })
          .eq('id', data)
      }

      // Log de auditoría
      await supabase.from('log_auditoria').insert({
        usuario_id: user?.id,
        hospital_id: perfil?.hospital_id,
        accion: 'carro_creado',
        tabla_afectada: 'carros',
        registro_id: data,
        detalle: { codigo: form.codigo.toUpperCase(), nombre: form.nombre },
        resultado: 'exito',
      })

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

        {/* Estado del plan */}
        {estadoPlan && (
          <div className={`card ${estadoPlan.puede_crear_carro ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs font-semibold ${estadoPlan.puede_crear_carro ? 'text-blue-700' : 'text-red-700'}`}>
                  {estadoPlan.puede_crear_carro
                    ? `Plan ${estadoPlan.plan} — ${estadoPlan.carros_usados} de ${estadoPlan.max_carros} carros usados`
                    : `Límite alcanzado — ${estadoPlan.max_carros} carros máximo en tu plan`}
                </div>
                <div className={`text-xs mt-0.5 ${estadoPlan.puede_crear_carro ? 'text-blue-600' : 'text-red-600'}`}>
                  {estadoPlan.puede_crear_carro
                    ? `Quedan ${estadoPlan.carros_disponibles} carros disponibles`
                    : 'Contacta con CRITIC SL para ampliar tu plan'}
                </div>
              </div>
              {estadoPlan.puede_crear_carro && (
                <div className="text-right">
                  <div className="text-xs text-blue-400">{Math.round((estadoPlan.carros_usados/estadoPlan.max_carros)*100)}%</div>
                </div>
              )}
            </div>
            {!estadoPlan.puede_crear_carro && (
              <button type="button" className="mt-2 text-xs font-semibold text-red-700 underline"
                onClick={() => window.open('mailto:info@criticsl.com?subject=Ampliar plan', '_blank')}>
                Contactar con CRITIC SL →
              </button>
            )}
          </div>
        )}

        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700 leading-relaxed">
            Al crear el carro se copiará automáticamente la plantilla maestra con las 8 secciones y los materiales configurados. Podrás personalizar el contenido después.
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
                <option value="">Selecciona un servicio...</option>
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
                <option value="semanal">Semanal</option>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label className="label">Primer control programado</label>
              <input className="input" type="date" value={form.primer_control}
                onChange={e => setForm({...form, primer_control: e.target.value})} />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || (estadoPlan && !estadoPlan.puede_crear_carro)}
        >
          {loading ? 'Creando carro...' : 'Crear carro con plantilla completa →'}
        </button>
      </form>
    </div>
  )
}

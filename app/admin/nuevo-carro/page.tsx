'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { Servicio } from '@/lib/types'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'

export default function NuevoCarroPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [loading, setLoading] = useState(false)
  const [estadoPlan, setEstadoPlan] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [escaneando, setEscaneando] = useState(false)
  const [form, setForm] = useState({
    codigo: '', nombre: '', ubicacion: '', servicio_id: '',
    responsable: '', frecuencia_control: 'mensual', primer_control: '',
    numero_censo: '', tipo_carro: 'parada',
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
    if (p.hospital_id) {
      const { data: plan } = await supabase.rpc('estado_plan', { p_hospital_id: p.hospital_id })
      setEstadoPlan(plan)
    }
    const { data: svcs } = await supabase.from('servicios')
      .select('*').eq('activo', true).eq('hospital_id', p.hospital_id).order('nombre')
    setServicios(svcs || [])
  }

  function handleEscaneo(codigo: string) {
    setEscaneando(false)
    setForm(prev => ({ ...prev, numero_censo: codigo }))
    toast.success(`Código leído: ${codigo}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.codigo || !form.nombre) {
      toast.error('Código y nombre son obligatorios')
      return
    }
    if (estadoPlan && !estadoPlan.puede_crear_carro) {
      toast.error(`Has alcanzado el límite de ${estadoPlan.max_carros} carros de tu plan.`)
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
      if (perfil?.hospital_id) {
        await supabase.from('carros').update({
          hospital_id: perfil.hospital_id,
          numero_censo: form.numero_censo || null,
          codigo_barras_censo: form.numero_censo || null,
          tipo_carro: form.tipo_carro,
        }).eq('id', data)
      }
      await supabase.from('log_auditoria').insert({
        usuario_id: user?.id,
        hospital_id: perfil?.hospital_id,
        accion: 'carro_creado',
        tabla_afectada: 'carros',
        registro_id: data,
        detalle: { codigo: form.codigo.toUpperCase(), nombre: form.nombre, numero_censo: form.numero_censo },
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
      {escaneando && (
        <EscanerCodigoBarras
          onResult={handleEscaneo}
          onClose={() => setEscaneando(false)}
        />
      )}

      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Nuevo carro</span>
        <div className="w-12" />
      </div>

      <form onSubmit={handleSubmit} className="content">

        {estadoPlan && (
          <div className={`card ${estadoPlan.puede_crear_carro ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-200'}`}>
            <div className={`text-xs font-semibold ${estadoPlan.puede_crear_carro ? 'text-blue-700' : 'text-red-700'}`}>
              {estadoPlan.puede_crear_carro
                ? `Plan ${estadoPlan.plan} — ${estadoPlan.carros_usados} de ${estadoPlan.max_carros} carros usados`
                : `Límite alcanzado — ${estadoPlan.max_carros} carros máximo`}
            </div>
            <div className={`text-xs mt-0.5 ${estadoPlan.puede_crear_carro ? 'text-blue-600' : 'text-red-600'}`}>
              {estadoPlan.puede_crear_carro
                ? `Quedan ${estadoPlan.carros_disponibles} disponibles`
                : 'Contacta con CRITIC SL para ampliar tu plan'}
            </div>
          </div>
        )}

        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700 leading-relaxed">
            Al crear el carro se copiará automáticamente la plantilla maestra con las 8 secciones y los materiales configurados.
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
              <label className="label">Tipo de carro</label>
              <select className="input" value={form.tipo_carro}
                onChange={e => setForm({...form, tipo_carro: e.target.value})}>
                <option value="parada">Parada cardiorrespiratoria</option>
                <option value="via_aerea">Vía aérea difícil</option>
                <option value="trauma">Trauma</option>
                <option value="neonatal">Neonatal</option>
                <option value="otro">Otro</option>
              </select>
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
          <div className="section-title mb-4">Número de censo</div>
          <label className="label">Código de inventario del hospital</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Escribe o escanea el código"
              value={form.numero_censo}
              onChange={e => setForm({...form, numero_censo: e.target.value})}
            />
            <button
              type="button"
              onClick={() => setEscaneando(true)}
              className="flex-shrink-0 px-3 py-2 bg-gray-900 text-white rounded-xl flex items-center gap-1.5 text-xs font-semibold active:bg-gray-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h2v2H4zM4 10h2v2H4zM4 14h2v2H4zM10 6h2v2h-2zM10 10h2v2h-2zM10 14h2v2h-2zM16 6h2v2h-2zM16 10h2v2h-2zM16 14h2v2h-2z" strokeWidth={1.5}/>
                <rect x="2" y="4" width="8" height="8" rx="1" strokeWidth={1.5}/>
                <rect x="14" y="4" width="8" height="8" rx="1" strokeWidth={1.5}/>
                <rect x="2" y="16" width="8" height="4" rx="1" strokeWidth={1.5}/>
              </svg>
              Escanear
            </button>
          </div>
          <div className="text-xs text-gray-400 mt-1.5">
            Puedes escanear el código de barras del etiquetado de inventario del hospital
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

        <button type="submit" className="btn-primary"
          disabled={loading || (estadoPlan && !estadoPlan.puede_crear_carro)}>
          {loading ? 'Creando carro...' : 'Crear carro con plantilla completa →'}
        </button>
      </form>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import type { Servicio } from '@/lib/types'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'
import { rutaPadre } from '@/lib/navigation'

interface Plantilla {
  id: string
  nombre: string
  tipo_carro: string | null
  es_base: boolean
  servicio_id: string | null
}

export default function NuevoCarroPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [loading, setLoading] = useState(false)
  const [estadoPlan, setEstadoPlan] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [escaneando, setEscaneando] = useState(false)
  const [modo, setModo] = useState<'plantilla' | 'manual'>('plantilla')
  const [form, setForm] = useState({
    codigo: '', nombre: '', ubicacion: '', servicio_id: '',
    responsable: '', frecuencia_control: 'mensual', primer_control: '',
    numero_censo: '', tipo_carro: 'parada',
    plantilla_id: '',
  })
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'calidad', 'supervisor', 'superadmin'].includes(p.rol)) {
      toast.error('No tienes permisos para crear carros')
      router.push(rutaPadre(pathname))
      return
    }
    setPerfil(p)

    if (p.hospital_id) {
      const { data: plan } = await supabase.rpc('estado_plan', { p_hospital_id: p.hospital_id })
      setEstadoPlan(plan)
    }

    const { data: svcs } = await supabase.from('servicios')
      .select('*').eq('activo', true).eq('hospital_id', p.hospital_id).order('nombre')
    setServicios(svcs || [])

    // Plantillas: las del hospital + las globales (si existen).
    // Para supervisor: las del hospital (RLS filtra por servicio en plantillas
    // específicas; servicio_id IS NULL son globales del hospital).
    const { data: pls } = await supabase.from('plantillas')
      .select('id, nombre, tipo_carro, es_base, servicio_id')
      .eq('hospital_id', p.hospital_id).eq('activo', true).order('es_base', { ascending: false })
    setPlantillas(pls || [])

    // Pre-seleccionar el servicio del supervisor (no editable).
    if (p.rol === 'supervisor' && p.servicio_id) {
      setForm(f => ({ ...f, servicio_id: p.servicio_id }))
    }

    // Si hay plantilla base, pre-seleccionarla
    const base = (pls || []).find(pl => pl.es_base)
    if (base) {
      setForm(f => ({ ...f, plantilla_id: base.id, tipo_carro: base.tipo_carro || 'parada' }))
    }
  }

  function handleEscaneo(codigo: string) {
    setEscaneando(false)
    setForm(prev => ({ ...prev, numero_censo: codigo }))
    toast.success(`Código leído: ${codigo}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.codigo || !form.nombre) {
      toast.error('Código y nombre son obligatorios'); return
    }
    if (estadoPlan && !estadoPlan.puede_crear_carro) {
      toast.error(`Has alcanzado el límite de ${estadoPlan.max_carros} carros de tu plan.`); return
    }
    if (modo === 'plantilla' && !form.plantilla_id) {
      toast.error('Selecciona una plantilla o cambia a modo manual'); return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 1) Crear el carro vacío
      const { data: nuevoCarro, error: e1 } = await supabase.from('carros').insert({
        hospital_id: perfil.hospital_id,
        servicio_id: form.servicio_id || null,
        codigo: form.codigo.toUpperCase(),
        nombre: form.nombre,
        ubicacion: form.ubicacion || null,
        responsable: form.responsable || null,
        frecuencia_control: form.frecuencia_control,
        proximo_control: form.primer_control || null,
        numero_censo: form.numero_censo || null,
        codigo_barras_censo: form.numero_censo || null,
        tipo_carro: form.tipo_carro,
        estado: 'sin_control',
        creado_por: user?.id,
      }).select('id').single()

      if (e1) {
        if (e1.message.includes('unique') || e1.message.includes('duplicate')) {
          toast.error('Ya existe un carro con ese código')
        } else {
          throw e1
        }
        return
      }

      // 2) Si se eligió plantilla, copiar sus cajones e items
      if (modo === 'plantilla' && form.plantilla_id) {
        const { error: e2 } = await supabase.rpc('copiar_plantilla_a_carro', {
          p_carro_id: nuevoCarro!.id,
          p_plantilla_id: form.plantilla_id,
        })
        if (e2) {
          // El carro ya está creado; reportamos el fallo de plantilla pero
          // no lo eliminamos (el user puede añadir materiales manualmente).
          console.warn('copiar_plantilla_a_carro:', e2)
          toast.error('Carro creado, pero no se pudo aplicar la plantilla: ' + e2.message)
        } else {
          toast.success('Carro creado con plantilla aplicada')
        }
      } else {
        toast.success('Carro creado (sin plantilla — añade cajones manualmente)')
      }

      // 3) Audit log opcional (los triggers de BD ya lo registran)
      router.push(`/admin/carro/${nuevoCarro!.id}/materiales`)
    } catch (err: any) {
      toast.error('Error al crear el carro: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!perfil) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  const esSupervisor = perfil.rol === 'supervisor'
  const plantillasFiltradas = plantillas.filter(pl =>
    !pl.servicio_id || pl.servicio_id === form.servicio_id
  )

  return (
    <div className="page">
      {escaneando && (
        <EscanerCodigoBarras
          onResult={handleEscaneo}
          onClose={() => setEscaneando(false)}
        />
      )}

      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
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

        {/* MODO: Plantilla vs Manual */}
        <div className="card">
          <div className="section-title mb-3">¿Cómo creamos este carro?</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModo('plantilla')}
              className={`p-3 rounded-xl border text-left ${modo === 'plantilla' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <div className="text-2xl mb-1">📋</div>
              <div className="font-semibold text-sm">Desde plantilla</div>
              <div className="text-xs text-gray-500 mt-0.5">Cajones e items predefinidos</div>
            </button>
            <button type="button" onClick={() => setModo('manual')}
              className={`p-3 rounded-xl border text-left ${modo === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <div className="text-2xl mb-1">✍️</div>
              <div className="font-semibold text-sm">Manual</div>
              <div className="text-xs text-gray-500 mt-0.5">Añadir cajones después</div>
            </button>
          </div>

          {modo === 'plantilla' && (
            <div className="mt-3">
              <label className="label">Plantilla</label>
              <select className="input" value={form.plantilla_id}
                onChange={e => {
                  const pl = plantillas.find(p => p.id === e.target.value)
                  setForm(f => ({ ...f, plantilla_id: e.target.value, tipo_carro: pl?.tipo_carro || f.tipo_carro }))
                }}>
                <option value="">Selecciona una plantilla…</option>
                {plantillasFiltradas.map(pl => (
                  <option key={pl.id} value={pl.id}>
                    {pl.nombre}{pl.es_base ? ' (base)' : ''}{pl.tipo_carro ? ` — ${pl.tipo_carro}` : ''}
                  </option>
                ))}
              </select>
              {plantillasFiltradas.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No hay plantillas disponibles para este servicio. Crea una en{' '}
                  <button type="button" onClick={() => router.push('/admin/plantillas')}
                    className="underline">/admin/plantillas</button> o usa modo manual.
                </p>
              )}
            </div>
          )}
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
              <label className="label">
                Servicio / unidad
                {esSupervisor && <span className="ml-2 text-xs text-gray-400">(tu servicio)</span>}
              </label>
              <select
                className="input"
                value={form.servicio_id}
                onChange={e => setForm({...form, servicio_id: e.target.value})}
                disabled={esSupervisor}
              >
                <option value="">Selecciona un servicio...</option>
                {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              {servicios.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No hay servicios. Pídele al admin que cree uno en{' '}
                  <button type="button" onClick={() => router.push('/admin/servicios')}
                    className="underline">/admin/servicios</button>.
                </p>
              )}
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
                <rect x="3" y="3" width="7" height="7" strokeWidth={2}/>
                <rect x="14" y="3" width="7" height="7" strokeWidth={2}/>
                <rect x="3" y="14" width="7" height="7" strokeWidth={2}/>
                <rect x="14" y="14" width="3" height="3" strokeWidth={2}/>
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
          {loading ? 'Creando carro...'
            : modo === 'plantilla' ? 'Crear carro con plantilla →'
            : 'Crear carro vacío →'}
        </button>
      </form>
    </div>
  )
}

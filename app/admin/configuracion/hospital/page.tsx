'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'

interface Config {
  id?: string
  hospital_id: string
  informe_membrete: string | null
  informe_pie: string | null
  informe_numeracion_iso: string | null
  permite_control_mensual: boolean
  permite_control_post_uso: boolean
  permite_control_extra: boolean
  frecuencia_control_default: string
  alertas_vencimiento_dias: number
  alertas_control_dias: number
  requiere_firma: boolean
  retencion_inspecciones_anos: number | null
  retencion_log_auditoria_anos: number | null
  retencion_alertas_anos: number | null
}

export default function HospitalConfigPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    // Solo administradores y superadmin pueden editar la config del hospital.
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) {
      toast.error('Solo administradores pueden editar la configuración del hospital')
      router.push(rutaPadre(pathname))
      return
    }
    setPerfil(p)

    if (!p.hospital_id) { router.push('/admin'); return }

    const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
    setHospital(h)

    const { data: c } = await supabase.from('hospital_config')
      .select('*').eq('hospital_id', p.hospital_id).maybeSingle()

    setConfig(c || {
      hospital_id: p.hospital_id,
      informe_membrete: '',
      informe_pie: '',
      informe_numeracion_iso: 'INF',
      permite_control_mensual: true,
      permite_control_post_uso: true,
      permite_control_extra: true,
      frecuencia_control_default: 'mensual',
      alertas_vencimiento_dias: 7,
      alertas_control_dias: 0,
      requiere_firma: false,
      retencion_inspecciones_anos: 10,
      retencion_log_auditoria_anos: 10,
      retencion_alertas_anos: 5,
    })
    setLoading(false)
  }

  async function guardar() {
    if (!config) return
    setGuardando(true)
    const { error } = await supabase.from('hospital_config').upsert(
      { ...config, actualizado_en: new Date().toISOString() },
      { onConflict: 'hospital_id' }
    )
    setGuardando(false)
    if (error) { toast.error('Error al guardar: ' + error.message); return }
    toast.success('Configuración guardada')
  }

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev)
  }

  if (loading || !config) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando configuración...</div>
    </div>
  )

  const colorPrimario = hospital?.color_primario || '#1d4ed8'

  return (
    <div className="page">
      <div className="topbar" style={{ borderBottom: `2px solid ${colorPrimario}20` }}>
        <button onClick={() => router.push(rutaPadre(pathname))}
          className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{hospital?.nombre}</div>
          <div className="font-semibold text-sm">Ajustes del hospital</div>
        </div>
        <button onClick={guardar} disabled={guardando}
          style={{ background: colorPrimario }}
          className="text-xs text-white px-3 py-1.5 rounded-lg font-semibold flex-shrink-0 disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      <div className="content">
        {/* Informes */}
        <div className="card">
          <div className="section-title mb-3">Informes y firma</div>

          <div className="mb-3">
            <label className="label">Membrete (línea superior del PDF)</label>
            <input className="input" type="text"
              value={config.informe_membrete || ''}
              onChange={e => set('informe_membrete', e.target.value)}
              placeholder="Ej: Hospital General de Las Palmas — Servicio de Calidad" />
          </div>

          <div className="mb-3">
            <label className="label">Pie de página del PDF</label>
            <input className="input" type="text"
              value={config.informe_pie || ''}
              onChange={e => set('informe_pie', e.target.value)}
              placeholder="Ej: Generado por ÁSTOR — astormanager.com" />
          </div>

          <div className="mb-3">
            <label className="label">Prefijo de código ISO de informes</label>
            <input className="input" type="text"
              value={config.informe_numeracion_iso || ''}
              onChange={e => set('informe_numeracion_iso', e.target.value)}
              placeholder="INF" />
            <p className="text-xs text-gray-400 mt-1">
              Los códigos saldrán como {config.informe_numeracion_iso || 'INF'}-CTRL-2026-001, etc.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" checked={config.requiere_firma}
              onChange={e => set('requiere_firma', e.target.checked)} />
            Requerir firma digital en cada inspección
          </label>
        </div>

        {/* Alertas */}
        <div className="card">
          <div className="section-title mb-3">Alertas y avisos</div>

          <div className="mb-3">
            <label className="label">Días de antelación para vencimiento de material</label>
            <input className="input" type="number" min={1} max={90}
              value={config.alertas_vencimiento_dias}
              onChange={e => set('alertas_vencimiento_dias', parseInt(e.target.value) || 7)} />
            <p className="text-xs text-gray-400 mt-1">
              Se generará una alerta cuando un material esté a {config.alertas_vencimiento_dias} días o menos de caducar.
            </p>
          </div>

          <div className="mb-3">
            <label className="label">Días de antelación para control vencido</label>
            <input className="input" type="number" min={0} max={30}
              value={config.alertas_control_dias}
              onChange={e => set('alertas_control_dias', parseInt(e.target.value) || 0)} />
            <p className="text-xs text-gray-400 mt-1">
              0 = avisa solo cuando el control ya está vencido. 3 = avisa con 3 días de antelación.
            </p>
          </div>
        </div>

        {/* Tipos de control permitidos */}
        <div className="card">
          <div className="section-title mb-3">Tipos de control permitidos</div>
          <p className="text-xs text-gray-500 mb-3">
            Marca qué tipos de control podrán hacer los auditores en este hospital.
          </p>
          <label className="flex items-center gap-2 text-sm mb-2">
            <input type="checkbox" checked={config.permite_control_mensual}
              onChange={e => set('permite_control_mensual', e.target.checked)} />
            Control mensual / programado
          </label>
          <label className="flex items-center gap-2 text-sm mb-2">
            <input type="checkbox" checked={config.permite_control_post_uso}
              onChange={e => set('permite_control_post_uso', e.target.checked)} />
            Control post-uso
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={config.permite_control_extra}
              onChange={e => set('permite_control_extra', e.target.checked)} />
            Control extra (fuera de programación)
          </label>

          <div className="mt-3">
            <label className="label">Frecuencia de control por defecto</label>
            <select className="input" value={config.frecuencia_control_default}
              onChange={e => set('frecuencia_control_default', e.target.value)}>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
        </div>

        {/* Retención (ISO) */}
        <div className="card">
          <div className="section-title mb-3">Retención de datos (ISO / RGPD)</div>
          <p className="text-xs text-gray-500 mb-3">
            Cuánto tiempo guardamos cada tipo de información antes de archivar.
            Cambios afectan a registros futuros.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Inspecciones (años)</label>
              <input className="input" type="number" min={1} max={50}
                value={config.retencion_inspecciones_anos ?? 10}
                onChange={e => set('retencion_inspecciones_anos', parseInt(e.target.value) || 10)} />
            </div>
            <div>
              <label className="label">Auditoría (años)</label>
              <input className="input" type="number" min={1} max={50}
                value={config.retencion_log_auditoria_anos ?? 10}
                onChange={e => set('retencion_log_auditoria_anos', parseInt(e.target.value) || 10)} />
            </div>
            <div className="col-span-2">
              <label className="label">Alertas resueltas (años)</label>
              <input className="input" type="number" min={1} max={20}
                value={config.retencion_alertas_anos ?? 5}
                onChange={e => set('retencion_alertas_anos', parseInt(e.target.value) || 5)} />
            </div>
          </div>
        </div>

        <button onClick={guardar} disabled={guardando}
          style={{ background: colorPrimario }}
          className="w-full py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

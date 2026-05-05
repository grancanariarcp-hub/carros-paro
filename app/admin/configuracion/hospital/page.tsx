'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'

interface Config {
  id?: string
  hospital_id: string
  // Encabezado oficial de informes
  informe_unidad: string | null
  informe_comision: string | null
  informe_logo_principal_url: string | null
  informe_logo_secundario_url: string | null
  // Heredados (mantenemos por compat — informe_membrete será deprecado)
  informe_membrete: string | null
  informe_pie: string | null
  informe_numeracion_iso: string | null
  // Controles
  permite_control_mensual: boolean
  permite_control_post_uso: boolean
  permite_control_extra: boolean
  frecuencia_control_default: string
  alertas_vencimiento_dias: number
  alertas_control_dias: number
  requiere_firma: boolean
  // Retención
  retencion_inspecciones_anos: number | null
  retencion_log_auditoria_anos: number | null
  retencion_alertas_anos: number | null
}

interface PlantillaInforme {
  id?: string
  hospital_id: string
  tipo: string
  codigo_prefijo: string
  titulo_personalizado: string | null
  membrete_linea1: string | null
  membrete_linea2: string | null
  pie_pagina: string | null
  incluir_logo: boolean
  incluir_firma: boolean
  activo: boolean
}

const TIPOS_INFORME: { tipo: string; labelDefault: string; codigoDefault: string }[] = [
  { tipo: 'controles_vencidos',   labelDefault: 'Informe de controles vencidos',   codigoDefault: 'INF-CTRL' },
  { tipo: 'no_operativos',        labelDefault: 'Informe de carros no operativos', codigoDefault: 'INF-NOP' },
  { tipo: 'vencimientos',         labelDefault: 'Informe de vencimientos',         codigoDefault: 'INF-VTO' },
  { tipo: 'historial_auditorias', labelDefault: 'Historial de auditorías',         codigoDefault: 'INF-HIST' },
  { tipo: 'control_realizado',    labelDefault: 'Informe de control realizado',    codigoDefault: 'INF-CON' },
]

export default function HospitalConfigPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [plantillas, setPlantillas] = useState<Record<string, PlantillaInforme>>({})
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
      informe_unidad: 'UNIDAD DE GESTIÓN HOSPITALARIA',
      informe_comision: 'COMITÉ DE CALIDAD Y SEGURIDAD CLÍNICA',
      informe_logo_principal_url: null,
      informe_logo_secundario_url: null,
      informe_membrete: null,
      informe_pie: null,
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

    // Plantillas por tipo: cargamos las existentes y completamos las que faltan
    // con valores por defecto (solo en memoria — solo se persisten al guardar).
    const { data: pls } = await supabase.from('plantillas_informe')
      .select('*').eq('hospital_id', p.hospital_id)

    const map: Record<string, PlantillaInforme> = {}
    for (const t of TIPOS_INFORME) {
      const existente = (pls || []).find(pl => pl.tipo === t.tipo)
      map[t.tipo] = existente || {
        hospital_id: p.hospital_id,
        tipo: t.tipo,
        codigo_prefijo: t.codigoDefault,
        titulo_personalizado: t.labelDefault,
        membrete_linea1: null,
        membrete_linea2: null,
        pie_pagina: null,
        incluir_logo: true,
        incluir_firma: false,
        activo: true,
      }
    }
    setPlantillas(map)
    setLoading(false)
  }

  async function guardar() {
    if (!config) return
    setGuardando(true)
    try {
      const { error: e1 } = await supabase.from('hospital_config').upsert(
        { ...config, actualizado_en: new Date().toISOString() },
        { onConflict: 'hospital_id' }
      )
      if (e1) throw e1

      // Upsert de las plantillas de informe — una por tipo
      for (const tipo of Object.keys(plantillas)) {
        const pl = plantillas[tipo]
        const { error: e2 } = await supabase.from('plantillas_informe').upsert(
          pl,
          { onConflict: 'hospital_id,tipo' }
        )
        if (e2) throw e2
      }
      toast.success('Configuración guardada')
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev)
  }

  function setPlantilla(tipo: string, patch: Partial<PlantillaInforme>) {
    setPlantillas(prev => ({ ...prev, [tipo]: { ...prev[tipo], ...patch } }))
  }

  if (loading || !config) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando configuración...</div>
    </div>
  )

  const colorPrimario = hospital?.color_primario || '#1d4ed8'
  const tieneLogos = !!config.informe_logo_principal_url || !!config.informe_logo_secundario_url

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

        {/* ── ENCABEZADO OFICIAL DE INFORMES ──────────────────────────── */}
        <div className="card">
          <div className="section-title mb-3">Encabezado oficial de informes</div>
          <p className="text-xs text-gray-500 mb-4">
            Estos textos y logos aparecen en TODOS los PDFs generados desde la app
            (informes de inspección, controles, vencimientos, fichas de equipo).
          </p>

          {/* Vista previa de logos */}
          <div className="mb-4">
            <label className="label">Logos institucionales</label>
            {tieneLogos ? (
              <div className="flex gap-3 items-center bg-gray-50 rounded-xl p-3">
                {config.informe_logo_principal_url && (
                  <div className="text-center">
                    <img src={config.informe_logo_principal_url} alt="Logo principal"
                      className="max-h-16 max-w-32 object-contain mx-auto"
                      crossOrigin="anonymous" />
                    <div className="text-xs text-gray-400 mt-1">Principal</div>
                  </div>
                )}
                {config.informe_logo_secundario_url && (
                  <div className="text-center">
                    <img src={config.informe_logo_secundario_url} alt="Logo secundario"
                      className="max-h-16 max-w-32 object-contain mx-auto"
                      crossOrigin="anonymous" />
                    <div className="text-xs text-gray-400 mt-1">Secundario</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl">
                ⚠️ No hay logos configurados. Pídele al superadministrador que los suba
                (solo el superadmin puede gestionar los logos del hospital).
              </div>
            )}
          </div>

          <div className="mb-3">
            <label className="label">Línea 1 — Unidad</label>
            <input className="input" type="text"
              value={config.informe_unidad || ''}
              onChange={e => set('informe_unidad', e.target.value)}
              placeholder="Ej: UNIDAD DE PLANIFICACIÓN ESTRATÉGICA, CALIDAD Y DOCENCIA CONTINUADA" />
          </div>

          <div className="mb-3">
            <label className="label">Línea 2 — Comisión / Comité</label>
            <input className="input" type="text"
              value={config.informe_comision || ''}
              onChange={e => set('informe_comision', e.target.value)}
              placeholder="Ej: COMISIÓN DE REANIMACIÓN CARDIOPULMONAR" />
          </div>

          <label className="flex items-center gap-2 text-sm mt-3">
            <input type="checkbox" checked={config.requiere_firma}
              onChange={e => set('requiere_firma', e.target.checked)} />
            Requerir firma digital en cada inspección
          </label>
        </div>

        {/* ── PLANTILLAS POR TIPO DE INFORME ──────────────────────────── */}
        <div className="card">
          <div className="section-title mb-3">Plantillas por tipo de informe</div>
          <p className="text-xs text-gray-500 mb-4">
            Personaliza el código ISO y el título de cada tipo de informe. Los campos
            de membrete heredan de arriba si los dejas vacíos.
          </p>

          {TIPOS_INFORME.map(t => {
            const pl = plantillas[t.tipo]
            if (!pl) return null
            return (
              <div key={t.tipo} className="border border-gray-200 rounded-xl p-3 mb-3">
                <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">
                  {t.tipo.replace(/_/g, ' ')}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="col-span-1">
                    <label className="label">Prefijo ISO</label>
                    <input className="input text-xs"
                      value={pl.codigo_prefijo}
                      onChange={e => setPlantilla(t.tipo, { codigo_prefijo: e.target.value })}
                      placeholder={t.codigoDefault} />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Título del informe</label>
                    <input className="input text-xs"
                      value={pl.titulo_personalizado || ''}
                      onChange={e => setPlantilla(t.tipo, { titulo_personalizado: e.target.value })}
                      placeholder={t.labelDefault} />
                  </div>
                </div>

                <details className="mt-2">
                  <summary className="text-xs text-blue-600 cursor-pointer select-none">
                    Avanzado: override de membrete y pie
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="label text-xs">Membrete línea 1 (override)</label>
                      <input className="input text-xs"
                        value={pl.membrete_linea1 || ''}
                        onChange={e => setPlantilla(t.tipo, { membrete_linea1: e.target.value || null })}
                        placeholder="Hereda de Unidad si está vacío" />
                    </div>
                    <div>
                      <label className="label text-xs">Membrete línea 2 (override)</label>
                      <input className="input text-xs"
                        value={pl.membrete_linea2 || ''}
                        onChange={e => setPlantilla(t.tipo, { membrete_linea2: e.target.value || null })}
                        placeholder="Hereda de Comisión si está vacío" />
                    </div>
                    <div>
                      <label className="label text-xs">Pie de página</label>
                      <input className="input text-xs"
                        value={pl.pie_pagina || ''}
                        onChange={e => setPlantilla(t.tipo, { pie_pagina: e.target.value || null })}
                        placeholder="Texto al pie del PDF" />
                    </div>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={pl.incluir_logo}
                          onChange={e => setPlantilla(t.tipo, { incluir_logo: e.target.checked })} />
                        Incluir logo
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={pl.incluir_firma}
                          onChange={e => setPlantilla(t.tipo, { incluir_firma: e.target.checked })} />
                        Incluir firma
                      </label>
                    </div>
                  </div>
                </details>
              </div>
            )
          })}
        </div>

        {/* ── ALERTAS ─────────────────────────────────────────────────── */}
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

        {/* ── TIPOS DE CONTROL PERMITIDOS ─────────────────────────────── */}
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

        {/* ── RETENCIÓN ISO/RGPD ──────────────────────────────────────── */}
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

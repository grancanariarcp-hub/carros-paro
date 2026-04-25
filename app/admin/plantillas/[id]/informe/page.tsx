'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'

interface Destinatario {
  tipo: 'rol' | 'email'
  valor: string
}

interface ConfigInforme {
  id: string
  plantilla_id: string
  secciones_incluidas: string[]
  mostrar_logo: boolean
  mostrar_firma: boolean
  mostrar_fotos_fallos: boolean
  mostrar_precintos: boolean
  mostrar_vencimientos: boolean
  mostrar_resumen_fallos: boolean
  destinatarios: Destinatario[]
  envio_automatico: boolean
  cuando_enviar: string
  asunto_email: string | null
  mensaje_email: string | null
}

interface Seccion {
  id: string
  nombre: string
  icono: string
  orden: number
  obligatoria: boolean
}

const ROLES_DISPONIBLES = [
  { value: 'administrador', label: 'Administrador del hospital' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'auditor', label: 'Auditor que realizó el control' },
]

export default function ConfigInformePage() {
  const [config, setConfig]       = useState<ConfigInforme | null>(null)
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [plantilla, setPlantilla] = useState<any>(null)
  const [hospital, setHospital]   = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const router = useRouter()
  const params = useParams()
  const plantillaId = params.id as string
  const supabase = createClient()
  useHospitalTheme(hospital?.color_primario)

  useEffect(() => { cargarDatos() }, [plantillaId])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles')
      .select('*, hospitales(*)').eq('id', user.id).single()
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) { router.push('/'); return }
    setHospital((p as any).hospitales)

    const { data: pl } = await supabase.from('plantillas')
      .select('*').eq('id', plantillaId).single()
    setPlantilla(pl)

    const { data: secs } = await supabase.from('plantilla_secciones')
      .select('id, nombre, icono, orden, obligatoria')
      .eq('plantilla_id', plantillaId).eq('activo', true).order('orden')
    setSecciones(secs || [])

    const { data: cfg } = await supabase.from('plantilla_informes')
      .select('*').eq('plantilla_id', plantillaId).single()

    if (cfg) {
      setConfig({
        ...cfg,
        destinatarios: (cfg.destinatarios as any) || [],
        secciones_incluidas: cfg.secciones_incluidas || [],
      })
    } else {
      // Crear configuración por defecto
      const { data: nueva } = await supabase.from('plantilla_informes').insert({
        plantilla_id: plantillaId,
        secciones_incluidas: (secs || []).map(s => s.id),
        mostrar_logo: true,
        mostrar_firma: true,
        mostrar_fotos_fallos: true,
        mostrar_precintos: true,
        mostrar_vencimientos: true,
        mostrar_resumen_fallos: true,
        destinatarios: [{ tipo: 'rol', valor: 'administrador' }],
        envio_automatico: false,
        cuando_enviar: 'no_operativo',
      }).select().single()
      setConfig(nueva ? { ...nueva, destinatarios: nueva.destinatarios as any || [], secciones_incluidas: nueva.secciones_incluidas || [] } : null)
    }
    setLoading(false)
  }

  async function guardar() {
    if (!config) return
    setGuardando(true)
    const { error } = await supabase.from('plantilla_informes').update({
      secciones_incluidas: config.secciones_incluidas,
      mostrar_logo: config.mostrar_logo,
      mostrar_firma: config.mostrar_firma,
      mostrar_fotos_fallos: config.mostrar_fotos_fallos,
      mostrar_precintos: config.mostrar_precintos,
      mostrar_vencimientos: config.mostrar_vencimientos,
      mostrar_resumen_fallos: config.mostrar_resumen_fallos,
      destinatarios: config.destinatarios,
      envio_automatico: config.envio_automatico,
      cuando_enviar: config.cuando_enviar,
      asunto_email: config.asunto_email || null,
      mensaje_email: config.mensaje_email || null,
    }).eq('id', config.id)
    if (error) { toast.error(error.message); setGuardando(false); return }
    toast.success('Configuración guardada')
    setGuardando(false)
  }

  function toggleSeccion(seccionId: string) {
    if (!config) return
    setConfig(c => c ? {
      ...c,
      secciones_incluidas: c.secciones_incluidas.includes(seccionId)
        ? c.secciones_incluidas.filter(id => id !== seccionId)
        : [...c.secciones_incluidas, seccionId],
    } : null)
  }

  function moverSeccionEnPDF(seccionId: string, dir: 'arriba' | 'abajo') {
    if (!config) return
    const idx = config.secciones_incluidas.indexOf(seccionId)
    if (idx === -1) return
    const arr = [...config.secciones_incluidas]
    const swapIdx = dir === 'arriba' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= arr.length) return
    ;[arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]]
    setConfig(c => c ? { ...c, secciones_incluidas: arr } : null)
  }

  function toggleRol(rol: string) {
    if (!config) return
    const existe = config.destinatarios.find(d => d.tipo === 'rol' && d.valor === rol)
    if (existe) {
      setConfig(c => c ? { ...c, destinatarios: c.destinatarios.filter(d => !(d.tipo === 'rol' && d.valor === rol)) } : null)
    } else {
      setConfig(c => c ? { ...c, destinatarios: [...c.destinatarios, { tipo: 'rol', valor: rol }] } : null)
    }
  }

  function añadirEmail() {
    if (!nuevoEmail.trim() || !nuevoEmail.includes('@')) { toast.error('Email no válido'); return }
    if (!config) return
    if (config.destinatarios.find(d => d.tipo === 'email' && d.valor === nuevoEmail.trim())) {
      toast.error('Este email ya está añadido'); return
    }
    setConfig(c => c ? { ...c, destinatarios: [...c.destinatarios, { tipo: 'email', valor: nuevoEmail.trim() }] } : null)
    setNuevoEmail('')
  }

  function eliminarDestinatario(tipo: string, valor: string) {
    if (!config) return
    setConfig(c => c ? { ...c, destinatarios: c.destinatarios.filter(d => !(d.tipo === tipo && d.valor === valor)) } : null)
  }

  if (loading || !config) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando configuración...</div>
    </div>
  )

  const seccionesOrdenadas = config.secciones_incluidas
    .map(id => secciones.find(s => s.id === id))
    .filter(Boolean) as Seccion[]

  const seccionesNoIncluidas = secciones.filter(s => !config.secciones_incluidas.includes(s.id))

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(`/admin/plantillas/${plantillaId}`)}
          className="text-blue-700 text-sm font-medium">← Editor</button>
        <span className="font-semibold text-sm flex-1 text-center truncate">Informe PDF</span>
        <button onClick={guardar} disabled={guardando}
          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
          {guardando ? '...' : 'Guardar'}
        </button>
      </div>

      <div className="content pb-10">

        <div className="card bg-purple-50 border-purple-100">
          <div className="text-xs text-purple-700 font-semibold">{plantilla?.nombre}</div>
          <div className="text-xs text-purple-500 mt-0.5">
            Configura qué aparece en el informe PDF y a quién se envía automáticamente.
          </div>
        </div>

        {/* Opciones visuales del PDF */}
        <div className="card">
          <div className="section-title mb-3">Contenido del PDF</div>
          <div className="flex flex-col gap-2">
            {[
              { key: 'mostrar_logo',           label: 'Logo del hospital',             desc: 'Muestra el logo en la cabecera del PDF' },
              { key: 'mostrar_firma',           label: 'Firma del auditor',             desc: 'Incluye la imagen de la firma digital' },
              { key: 'mostrar_fotos_fallos',    label: 'Fotos de incidencias',          desc: 'Adjunta las fotos tomadas durante el control' },
              { key: 'mostrar_precintos',       label: 'Precintos',                     desc: 'Números de precinto retirado y colocado' },
              { key: 'mostrar_vencimientos',    label: 'Fechas de vencimiento',         desc: 'Tabla de materiales con sus fechas de vto.' },
              { key: 'mostrar_resumen_fallos',  label: 'Resumen de incidencias',        desc: 'Lista agrupada de todas las incidencias detectadas' },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 cursor-pointer">
                <input type="checkbox" checked={(config as any)[key]} className="w-4 h-4 accent-blue-600"
                  onChange={e => setConfig(c => c ? { ...c, [key]: e.target.checked } : null)} />
                <div className="flex-1">
                  <div className="text-xs font-semibold text-gray-800">{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Secciones a incluir en el PDF */}
        <div className="card">
          <div className="section-title mb-1">Secciones incluidas en el PDF</div>
          <div className="text-xs text-gray-400 mb-3">Arrastra para reordenar. Las secciones en gris no se incluirán.</div>

          {/* Secciones incluidas (en orden) */}
          {seccionesOrdenadas.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-green-700 mb-2">✓ Incluidas</div>
              {seccionesOrdenadas.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-2 p-2.5 mb-1.5 bg-green-50 border border-green-200 rounded-xl">
                  <span className="text-base">{s.icono}</span>
                  <span className="text-xs font-semibold text-gray-800 flex-1">{s.nombre}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moverSeccionEnPDF(s.id, 'arriba')} disabled={idx === 0}
                      className="w-6 h-6 flex items-center justify-center text-gray-400 disabled:opacity-30 text-xs">↑</button>
                    <button onClick={() => moverSeccionEnPDF(s.id, 'abajo')} disabled={idx === seccionesOrdenadas.length - 1}
                      className="w-6 h-6 flex items-center justify-center text-gray-400 disabled:opacity-30 text-xs">↓</button>
                    <button onClick={() => toggleSeccion(s.id)}
                      className="w-6 h-6 flex items-center justify-center text-red-400 text-xs">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Secciones no incluidas */}
          {seccionesNoIncluidas.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2">No incluidas</div>
              {seccionesNoIncluidas.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2.5 mb-1.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="text-base opacity-40">{s.icono}</span>
                  <span className="text-xs font-semibold text-gray-400 flex-1">{s.nombre}</span>
                  <button onClick={() => toggleSeccion(s.id)}
                    className="text-xs px-2 py-1 rounded-lg border border-green-200 text-green-600 bg-green-50">
                    + Incluir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Envío automático */}
        <div className="card">
          <div className="section-title mb-3">Envío automático por email</div>
          <label className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl cursor-pointer mb-3">
            <input type="checkbox" checked={config.envio_automatico} className="w-4 h-4 accent-blue-600"
              onChange={e => setConfig(c => c ? { ...c, envio_automatico: e.target.checked } : null)} />
            <div>
              <div className="text-xs font-semibold text-blue-800">Activar envío automático</div>
              <div className="text-xs text-blue-600">El informe se envía por email al finalizar el control</div>
            </div>
          </label>

          {config.envio_automatico && (
            <>
              <div className="mb-3">
                <label className="label">¿Cuándo enviar?</label>
                <select className="input" value={config.cuando_enviar}
                  onChange={e => setConfig(c => c ? { ...c, cuando_enviar: e.target.value } : null)}>
                  <option value="siempre">Siempre — al finalizar cualquier control</option>
                  <option value="solo_fallos">Solo cuando hay incidencias</option>
                  <option value="no_operativo">Solo cuando el resultado es No Operativo</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="label">Asunto del email <span className="text-gray-400">(opcional)</span></label>
                <input className="input" placeholder="Ej: Control de carro de parada — {{hospital}} — {{fecha}}"
                  value={config.asunto_email || ''}
                  onChange={e => setConfig(c => c ? { ...c, asunto_email: e.target.value } : null)} />
              </div>
              <div>
                <label className="label">Mensaje adicional <span className="text-gray-400">(opcional)</span></label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Mensaje que aparecerá en el cuerpo del email antes del informe"
                  value={config.mensaje_email || ''}
                  onChange={e => setConfig(c => c ? { ...c, mensaje_email: e.target.value } : null)} />
              </div>
            </>
          )}
        </div>

        {/* Destinatarios */}
        <div className="card">
          <div className="section-title mb-3">Destinatarios del informe</div>

          {/* Por rol */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-600 mb-2">Por rol</div>
            {ROLES_DISPONIBLES.map(r => (
              <label key={r.value} className="flex items-center gap-2 p-2.5 mb-1.5 rounded-xl border border-gray-100 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-600"
                  checked={config.destinatarios.some(d => d.tipo === 'rol' && d.valor === r.value)}
                  onChange={() => toggleRol(r.value)} />
                <span className="text-xs font-semibold text-gray-800">{r.label}</span>
              </label>
            ))}
          </div>

          {/* Emails específicos */}
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Emails adicionales</div>
            {config.destinatarios.filter(d => d.tipo === 'email').map(d => (
              <div key={d.valor} className="flex items-center gap-2 p-2.5 mb-1.5 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-xs flex-1 truncate">{d.valor}</span>
                <button onClick={() => eliminarDestinatario('email', d.valor)}
                  className="text-red-400 text-xs">✕</button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input className="input flex-1" type="email" placeholder="email@hospital.com"
                value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && añadirEmail()} />
              <button onClick={añadirEmail}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold flex-shrink-0">
                + Añadir
              </button>
            </div>
          </div>

          {/* Resumen de destinatarios */}
          {config.destinatarios.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400">
                El informe se enviará a: {config.destinatarios.map(d =>
                  d.tipo === 'rol'
                    ? ROLES_DISPONIBLES.find(r => r.value === d.valor)?.label || d.valor
                    : d.valor
                ).join(', ')}
              </div>
            </div>
          )}
        </div>

        <button onClick={guardar} disabled={guardando} className="btn-primary w-full">
          {guardando ? 'Guardando...' : '💾 Guardar configuración'}
        </button>
      </div>
    </div>
  )
}

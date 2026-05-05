'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'

const TABLAS = [
  { key: 'carros',                   label: 'Carros',                   default: true },
  { key: 'cajones',                  label: 'Cajones',                  default: true },
  { key: 'materiales',               label: 'Materiales',               default: true },
  { key: 'equipos',                  label: 'Equipos médicos',          default: true },
  { key: 'desfibriladores',          label: 'Desfibriladores',          default: true },
  { key: 'inspecciones',             label: 'Inspecciones (controles)', default: true },
  { key: 'items_inspeccion',         label: 'Detalle de inspecciones',  default: true },
  { key: 'historial_mantenimientos', label: 'Historial mantenimientos', default: true },
  { key: 'servicios',                label: 'Servicios',                default: true },
  { key: 'secciones',                label: 'Secciones',                default: true },
  { key: 'perfiles',                 label: 'Usuarios (sin password)',  default: true },
  { key: 'alertas',                  label: 'Alertas',                  default: true },
  { key: 'notificaciones',           label: 'Notificaciones',           default: false },
  { key: 'log_auditoria',            label: 'Bitácora ISO (audit log)', default: true },
  { key: 'plantillas',               label: 'Plantillas de control',    default: true },
  { key: 'plantilla_secciones',      label: 'Secciones de plantillas',  default: false },
  { key: 'plantilla_items',          label: 'Items de plantillas',      default: false },
  { key: 'plantilla_versiones',      label: 'Versiones inmutables (ISO)', default: true },
] as const

export default function ExportHospitalPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [servicioId, setServicioId] = useState('')
  const [tablasSelected, setTablasSelected] = useState<Record<string, boolean>>(() => {
    const obj: Record<string, boolean> = {}
    for (const t of TABLAS) obj[t.key] = t.default
    return obj
  })
  const [incluirEvidencias, setIncluirEvidencias] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) {
      toast.error('Solo administradores pueden exportar el historial')
      router.push(rutaPadre(pathname))
      return
    }
    setPerfil(p)

    if (p.hospital_id) {
      const [{ data: h }, { data: svcs }] = await Promise.all([
        supabase.from('hospitales').select('*').eq('id', p.hospital_id).single(),
        supabase.from('servicios').select('id, nombre').eq('hospital_id', p.hospital_id).eq('activo', true).order('nombre'),
      ])
      setHospital(h)
      setServicios(svcs || [])
    }
    setLoading(false)
  }

  function toggle(key: string) {
    setTablasSelected(s => ({ ...s, [key]: !s[key] }))
  }

  function todas(v: boolean) {
    const obj: Record<string, boolean> = {}
    for (const t of TABLAS) obj[t.key] = v
    setTablasSelected(obj)
  }

  async function exportar() {
    if (!hospital?.id) return
    setExportando(true)
    try {
      const tablasArr = TABLAS.filter(t => tablasSelected[t.key]).map(t => t.key)
      if (tablasArr.length === 0) {
        toast.error('Selecciona al menos una tabla')
        setExportando(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Sesión expirada'); setExportando(false); return }

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-hospital`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          hospital_id: hospital.id,
          desde: desde || null,
          hasta: hasta || null,
          servicio_id: servicioId || null,
          tablas: tablasArr,
          incluir_evidencias: incluirEvidencias,
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || `HTTP ${res.status}`)
      }

      // Descargar el ZIP
      const blob = await res.blob()
      const fechaArchivo = new Date().toISOString().slice(0, 10)
      const nombre = `astor-export_${hospital.slug || 'hospital'}_${fechaArchivo}.zip`

      const a = document.createElement('a')
      const objectUrl = URL.createObjectURL(blob)
      a.href = objectUrl
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)

      toast.success('Export descargado')
    } catch (err: any) {
      toast.error('Error: ' + err.message)
    } finally {
      setExportando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando…</div>
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
          <div className="font-semibold text-sm">Exportar historial</div>
        </div>
        <div className="w-12 flex-shrink-0" />
      </div>

      <div className="content">
        <div className="card bg-blue-50 border-blue-100 text-xs text-blue-800">
          <div className="font-semibold mb-1">📦 Cumplimiento RGPD Art. 20</div>
          Descarga TODO el historial de tu hospital en formato abierto (CSV + JSON).
          Funciona en cualquier sistema operativo, abre directamente con Excel o
          Google Sheets, e incluye un README con la estructura. Si algún día decides
          dejar de usar ÁSTOR, los datos son tuyos y son portables.
        </div>

        {/* Filtros de periodo */}
        <div className="card">
          <div className="section-title mb-3">Periodo</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={desde}
                onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={hasta}
                onChange={e => setHasta(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Si dejas en blanco, exporta todo el historial sin filtro de fechas.
            Solo aplica a inspecciones, mantenimientos, alertas, notificaciones y log.
          </p>
        </div>

        {/* Filtro de servicio */}
        <div className="card">
          <div className="section-title mb-3">Servicio</div>
          <select className="input" value={servicioId}
            onChange={e => setServicioId(e.target.value)}>
            <option value="">Todos los servicios del hospital</option>
            {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>

        {/* Selección de tablas */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="section-title">Tipos de información</div>
            <div className="flex gap-2 text-xs">
              <button onClick={() => todas(true)} className="text-blue-700 font-semibold">Todas</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => todas(false)} className="text-gray-500 font-semibold">Ninguna</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {TABLAS.map(t => (
              <label key={t.key} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={tablasSelected[t.key]}
                  onChange={() => toggle(t.key)} />
                <span>{t.label}</span>
                <span className="text-xs text-gray-400 ml-auto">{t.key}</span>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm pt-3 mt-2 border-t border-gray-100">
            <input type="checkbox" checked={incluirEvidencias}
              onChange={e => setIncluirEvidencias(e.target.checked)} />
            <span>Incluir lista de URLs de fotos / firmas (no se descarga el binario)</span>
          </label>
        </div>

        <button onClick={exportar} disabled={exportando}
          style={{ background: colorPrimario }}
          className="w-full py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
          {exportando ? 'Generando ZIP… (puede tardar 10-30s)' : '⬇ Generar y descargar ZIP'}
        </button>

        <div className="text-xs text-gray-400 mt-2 text-center">
          El archivo se genera en el servidor y se descarga directamente. No queda copia
          en la BD; cada export es nuevo.
        </div>
      </div>
    </div>
  )
}

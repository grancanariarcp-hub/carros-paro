'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

// =====================================================================
// Tipos
// =====================================================================
interface Mantenimiento {
  id: string
  tipo: string
  fecha: string
  descripcion: string | null
  empresa: string | null
  tecnico: string | null
  coste: number | null
  resultado: string
}

const TIPOS_MANT: Record<string, string> = {
  preventivo: 'Preventivo', correctivo: 'Correctivo',
  calibracion: 'Calibración', revision: 'Revisión',
  reasignacion: 'Reasignación', baja: 'Baja del equipo',
}

const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  operativo:         { label: 'Operativo',         color: '#16a34a', bg: '#dcfce7' },
  en_mantenimiento:  { label: 'En mantenimiento',  color: '#d97706', bg: '#fef9c3' },
  fuera_de_servicio: { label: 'Fuera de servicio', color: '#dc2626', bg: '#fee2e2' },
  baja:              { label: 'Baja',              color: '#6b7280', bg: '#f3f4f6' },
}

function formatFecha(f?: string | null) {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function diasHasta(f?: string | null): number | null {
  if (!f) return null
  return Math.ceil((new Date(f).getTime() - Date.now()) / 86400000)
}

function colorDias(dias: number | null): string {
  if (dias === null) return '#6b7280'
  if (dias < 0) return '#dc2626'
  if (dias <= 30) return '#d97706'
  return '#16a34a'
}

function labelDias(dias: number | null, fecha: string): string {
  if (dias === null) return fecha
  if (dias < 0) return `${fecha} (vencido hace ${Math.abs(dias)}d)`
  if (dias === 0) return `${fecha} (hoy)`
  return `${fecha} (en ${dias}d)`
}

// =====================================================================
// Componente
// =====================================================================
export default function FichaEquipoPDFPage() {
  const [equipo, setEquipo] = useState<any>(null)
  const [historial, setHistorial] = useState<Mantenimiento[]>([])
  const [hospital, setHospital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)

  // Secciones seleccionables
  const [secciones, setSecciones] = useState({
    general: true,
    mantenimiento: true,
    calibracion: true,
    garantia: true,
    historial: true,
    foto: true,
    observaciones: true,
  })

  const fichaRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const params = useParams()
  const equipoId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [equipoId])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: p } = await supabase.from('perfiles')
      .select('*, hospitales(*)').eq('id', user.id).single()
    setHospital((p as any)?.hospitales)

    const { data: eq } = await supabase.from('equipos')
      .select('*, servicios(nombre), carros(codigo, nombre), cajones(nombre)')
      .eq('id', equipoId).single()
    setEquipo(eq)

    const { data: hist } = await supabase.from('historial_mantenimientos')
      .select('*').eq('equipo_id', equipoId)
      .order('fecha', { ascending: false })
    setHistorial(hist || [])

    setLoading(false)
  }

  function toggleSeccion(key: keyof typeof secciones) {
    setSecciones(s => ({ ...s, [key]: !s[key] }))
  }

  async function descargarPDF() {
    if (!fichaRef.current) return
    setGenerando(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(fichaRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgHeight = (canvas.height * pdfWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
      heightLeft -= pdfHeight
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
        heightLeft -= pdfHeight
      }
      pdf.save(`ficha_${equipo?.numero_censo || equipo?.nombre}_${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err) {
      console.error('Error generando PDF:', err)
    } finally {
      setGenerando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando ficha...</div>
    </div>
  )
  if (!equipo) return null

  const colorPrimario = hospital?.color_primario || '#1d4ed8'
  const estadoInfo = ESTADOS[equipo.estado] || { label: equipo.estado, color: '#6b7280', bg: '#f3f4f6' }
  const diasMant = diasHasta(equipo.fecha_proximo_mantenimiento)
  const diasCal  = diasHasta(equipo.fecha_proxima_calibracion)
  const diasGar  = diasHasta(equipo.fecha_garantia_hasta)

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Ficha PDF</span>
        <button onClick={descargarPDF} disabled={generando}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1">
          {generando ? '⏳' : '⬇️'} {generando ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      <div className="content pb-8">
        {/* Panel de secciones a incluir */}
        <div className="card">
          <div className="section-title mb-3">Secciones a incluir en el PDF</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'general',       label: 'Datos generales' },
              { key: 'mantenimiento', label: 'Mantenimiento preventivo' },
              { key: 'calibracion',   label: 'Calibración' },
              { key: 'garantia',      label: 'Garantía' },
              { key: 'historial',     label: 'Historial de mantenimientos' },
              { key: 'foto',          label: 'Foto del equipo' },
              { key: 'observaciones', label: 'Observaciones' },
            ].map(({ key, label }) => (
              <label key={key}
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                  secciones[key as keyof typeof secciones]
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                <input
                  type="checkbox"
                  checked={secciones[key as keyof typeof secciones]}
                  onChange={() => toggleSeccion(key as keyof typeof secciones)}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-xs font-medium">{label}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setSecciones({ general: true, mantenimiento: true, calibracion: true, garantia: true, historial: true, foto: true, observaciones: true })}
              className="text-xs text-blue-600 font-semibold">Seleccionar todo</button>
            <span className="text-gray-300">·</span>
            <button onClick={() => setSecciones({ general: true, mantenimiento: false, calibracion: false, garantia: false, historial: false, foto: false, observaciones: false })}
              className="text-xs text-gray-500 font-semibold">Solo datos generales</button>
          </div>
        </div>

        {/* Vista previa del PDF */}
        <div ref={fichaRef} style={{ backgroundColor: '#ffffff', padding: '24px', fontFamily: 'sans-serif' }}>

          {/* Cabecera */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${colorPrimario}`, paddingBottom: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {hospital?.logo_url
                ? <img src={hospital.logo_url} alt="" style={{ height: '40px', objectFit: 'contain' }} crossOrigin="anonymous" />
                : <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: colorPrimario, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>+</span>
                  </div>}
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{hospital?.nombre}</div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>Ficha de equipo médico</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Generado: {new Date().toLocaleDateString('es-ES')}</div>
              <div style={{
                marginTop: '6px', display: 'inline-block',
                padding: '3px 10px', borderRadius: '12px',
                background: estadoInfo.bg, color: estadoInfo.color,
                fontSize: '11px', fontWeight: 700,
              }}>
                {estadoInfo.label}
              </div>
            </div>
          </div>

          {/* Nombre y categoría */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827' }}>{equipo.nombre}</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
              {[equipo.marca, equipo.modelo].filter(Boolean).join(' · ')}
              {equipo.categoria && ` · ${equipo.categoria}`}
              {equipo.indispensable && <span style={{ color: '#dc2626', fontWeight: 700 }}> · ★ Indispensable</span>}
            </div>
          </div>

          {/* Foto */}
          {secciones.foto && equipo.foto_url && (
            <div style={{ marginBottom: '18px', textAlign: 'center' }}>
              <img src={equipo.foto_url} alt={equipo.nombre} crossOrigin="anonymous"
                style={{ maxHeight: '160px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
            </div>
          )}

          {/* Datos generales */}
          {secciones.general && (
            <Bloque titulo="Identificación" color={colorPrimario}>
              <Grid2>
                <Campo label="N° de censo" valor={equipo.numero_censo} />
                <Campo label="N° de serie" valor={equipo.numero_serie} />
                <Campo label="Código de barras" valor={equipo.codigo_barras} />
                <Campo label="Categoría" valor={equipo.categoria} />
                <Campo label="Servicio" valor={equipo.servicios?.nombre} />
                <Campo label="Carro" valor={equipo.carros ? `${equipo.carros.codigo} — ${equipo.carros.nombre}` : null} />
                <Campo label="Cajón" valor={equipo.cajones?.nombre} />
                <Campo label="Adquisición" valor={formatFecha(equipo.fecha_adquisicion)} />
                <Campo label="Fabricación" valor={formatFecha(equipo.fecha_fabricacion)} />
                <Campo label="Indispensable" valor={equipo.indispensable ? '★ Sí — alerta al mover' : 'No'} />
              </Grid2>
            </Bloque>
          )}

          {/* Mantenimiento */}
          {secciones.mantenimiento && (
            <Bloque titulo="Mantenimiento preventivo" color={colorPrimario}>
              <Grid2>
                <Campo label="Empresa" valor={equipo.empresa_mantenimiento} />
                <Campo label="Frecuencia" valor={equipo.frecuencia_mantenimiento} />
                <Campo label="N° contrato" valor={equipo.numero_contrato} />
                <Campo label="Contacto" valor={equipo.contacto_mantenimiento} />
                <Campo label="Último mantenimiento" valor={formatFecha(equipo.fecha_ultimo_mantenimiento)} />
                <div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>Próximo mantenimiento</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: colorDias(diasMant) }}>
                    {equipo.fecha_proximo_mantenimiento ? labelDias(diasMant, formatFecha(equipo.fecha_proximo_mantenimiento)) : '—'}
                  </div>
                </div>
              </Grid2>
            </Bloque>
          )}

          {/* Calibración */}
          {secciones.calibracion && (equipo.fecha_ultima_calibracion || equipo.fecha_proxima_calibracion) && (
            <Bloque titulo="Calibración" color={colorPrimario}>
              <Grid2>
                <Campo label="Última calibración" valor={formatFecha(equipo.fecha_ultima_calibracion)} />
                <div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>Próxima calibración</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: colorDias(diasCal) }}>
                    {equipo.fecha_proxima_calibracion ? labelDias(diasCal, formatFecha(equipo.fecha_proxima_calibracion)) : '—'}
                  </div>
                </div>
              </Grid2>
            </Bloque>
          )}

          {/* Garantía */}
          {secciones.garantia && equipo.fecha_garantia_hasta && (
            <Bloque titulo="Garantía" color={colorPrimario}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: colorDias(diasGar) }}>
                {labelDias(diasGar, formatFecha(equipo.fecha_garantia_hasta))}
              </div>
            </Bloque>
          )}

          {/* Observaciones */}
          {secciones.observaciones && equipo.observaciones && (
            <Bloque titulo="Observaciones" color={colorPrimario}>
              <div style={{ fontSize: '12px', color: '#374151', lineHeight: '1.5' }}>{equipo.observaciones}</div>
            </Bloque>
          )}

          {/* Historial */}
          {secciones.historial && historial.length > 0 && (
            <Bloque titulo={`Historial de mantenimientos (${historial.length})`} color={colorPrimario}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    {['Fecha', 'Tipo', 'Empresa / Técnico', 'Descripción', 'Resultado'].map(h => (
                      <th key={h} style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h, i) => (
                    <tr key={h.id} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ padding: '4px 6px' }}>{formatFecha(h.fecha)}</td>
                      <td style={{ padding: '4px 6px' }}>{TIPOS_MANT[h.tipo] || h.tipo}</td>
                      <td style={{ padding: '4px 6px' }}>
                        {[h.empresa, h.tecnico].filter(Boolean).join(' / ') || '—'}
                        {h.coste ? ` · ${h.coste}€` : ''}
                      </td>
                      <td style={{ padding: '4px 6px' }}>{h.descripcion || '—'}</td>
                      <td style={{ padding: '4px 6px', fontWeight: 600,
                        color: h.resultado === 'correcto' ? '#16a34a' : h.resultado === 'con_incidencias' ? '#d97706' : '#dc2626' }}>
                        {h.resultado === 'correcto' ? 'Correcto' : h.resultado === 'con_incidencias' ? 'Con incidencias' : 'Retirado'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bloque>
          )}

          {secciones.historial && historial.length === 0 && (
            <Bloque titulo="Historial de mantenimientos" color={colorPrimario}>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>Sin registros de mantenimiento</div>
            </Bloque>
          )}

          {/* Pie */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#9ca3af', marginTop: '16px' }}>
            <span>ÁSTOR by CRITIC SL — Sistema de gestión de material crítico hospitalario</span>
            <span>Generado el {new Date().toLocaleString('es-ES')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Subcomponentes auxiliares
// =====================================================================

function Bloque({ titulo, color, children }: { titulo: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ background: color, color: '#fff', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, marginBottom: '8px' }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {children}
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{valor || '—'}</div>
    </div>
  )
}

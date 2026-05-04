'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { useHospitalTheme } from '@/lib/useHospitalTheme'
import { rutaPadre } from '@/lib/navigation'

interface Equipo {
  id: string
  nombre: string
  marca: string | null
  modelo: string | null
  numero_censo: string | null
  numero_serie: string | null
  categoria: string | null
  estado: string
  indispensable: boolean
  fecha_proximo_mantenimiento: string | null
  fecha_proxima_calibracion: string | null
  fecha_garantia_hasta: string | null
  frecuencia_mantenimiento: string | null
  empresa_mantenimiento: string | null
  servicios?: { nombre: string } | null
  carros?: { codigo: string; nombre: string } | null
}

interface Filtros {
  servicio_id: string
  categoria: string
  estado: string
  mantenimiento: 'todos' | 'vencido' | 'proximo_30' | 'proximo_90' | 'al_dia'
  indispensable: 'todos' | 'si' | 'no'
}

const ESTADOS_LABEL: Record<string, string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
  baja: 'Baja',
}

function diasHasta(fecha?: string | null): number | null {
  if (!fecha) return null
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000)
}

function formatFecha(fecha?: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function InformesPage() {
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [servicios, setServicios] = useState<any[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [filtros, setFiltros] = useState<Filtros>({
    servicio_id: 'todos',
    categoria: 'todos',
    estado: 'todos',
    mantenimiento: 'todos',
    indispensable: 'todos',
  })
  const informeRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useHospitalTheme(hospital?.color_primario)

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles')
      .select('*, hospitales(*)').eq('id', user.id).single()
    setPerfil(p)
    setHospital((p as any)?.hospitales)

    const hospitalId = p?.hospital_id
    if (!hospitalId) { setLoading(false); return }

    const [eqRes, svRes] = await Promise.all([
      supabase.from('equipos')
        .select('*, servicios(nombre), carros(codigo, nombre)')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .order('nombre'),
      supabase.from('servicios')
        .select('id, nombre')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .order('nombre'),
    ])

    const eqs = eqRes.data || []
    setEquipos(eqs)
    setServicios(svRes.data || [])

    // Extraer categorías únicas
    const cats = Array.from(new Set(eqs.map((e: any) => e.categoria).filter(Boolean))).sort() as string[]
    setCategorias(cats)

    setLoading(false)
  }

  // Aplicar filtros
  const equiposFiltrados = equipos.filter(e => {
    if (filtros.servicio_id !== 'todos' && (e.servicios as any)?.id !== filtros.servicio_id) {
      // Filtrar por servicio usando el campo servicio_id — buscar en equipos directamente
    }
    if (filtros.categoria !== 'todos' && e.categoria !== filtros.categoria) return false
    if (filtros.estado !== 'todos' && e.estado !== filtros.estado) return false
    if (filtros.indispensable === 'si' && !e.indispensable) return false
    if (filtros.indispensable === 'no' && e.indispensable) return false

    const dias = diasHasta(e.fecha_proximo_mantenimiento)
    if (filtros.mantenimiento === 'vencido' && (dias === null || dias >= 0)) return false
    if (filtros.mantenimiento === 'proximo_30' && (dias === null || dias < 0 || dias > 30)) return false
    if (filtros.mantenimiento === 'proximo_90' && (dias === null || dias < 0 || dias > 90)) return false
    if (filtros.mantenimiento === 'al_dia' && dias !== null && dias < 0) return false

    return true
  })

  // Agrupar por servicio para el informe
  const porServicio = equiposFiltrados.reduce((acc, eq) => {
    const sv = (eq.servicios as any)?.nombre || 'Sin servicio'
    if (!acc[sv]) acc[sv] = []
    acc[sv].push(eq)
    return acc
  }, {} as Record<string, Equipo[]>)

  function colorMant(dias: number | null): string {
    if (dias === null) return '#6b7280'
    if (dias < 0) return '#dc2626'
    if (dias <= 30) return '#d97706'
    return '#16a34a'
  }

  function tituloInforme(): string {
    const partes: string[] = []
    if (filtros.mantenimiento === 'vencido') partes.push('Mantenimientos vencidos')
    else if (filtros.mantenimiento === 'proximo_30') partes.push('Mantenimientos próximos 30d')
    else if (filtros.mantenimiento === 'proximo_90') partes.push('Mantenimientos próximos 90d')
    if (filtros.categoria !== 'todos') partes.push(filtros.categoria)
    if (filtros.indispensable === 'si') partes.push('Indispensables')
    if (filtros.estado !== 'todos') partes.push(ESTADOS_LABEL[filtros.estado] || filtros.estado)
    return partes.length > 0 ? partes.join(' · ') : 'Inventario completo de equipos'
  }

  async function descargarPDF() {
    if (!informeRef.current) return
    setGenerando(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')

      const canvas = await html2canvas(informeRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
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

      const fecha = new Date().toISOString().split('T')[0]
      pdf.save(`inventario_equipos_${fecha}.pdf`)
    } catch (err) {
      console.error('Error generando PDF:', err)
    } finally {
      setGenerando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Informes de equipos</span>
        <button onClick={descargarPDF} disabled={generando || equiposFiltrados.length === 0}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 flex items-center gap-1">
          {generando ? '⏳' : '⬇️'} {generando ? 'Generando...' : `PDF (${equiposFiltrados.length})`}
        </button>
      </div>

      <div className="content">
        {/* Filtros */}
        <div className="card">
          <div className="section-title mb-3">Filtros del informe</div>
          <div className="flex flex-col gap-2">
            <div>
              <label className="label">Servicio / Unidad</label>
              <select className="input" value={filtros.servicio_id}
                onChange={e => setFiltros(f => ({ ...f, servicio_id: e.target.value }))}>
                <option value="todos">Todos los servicios</option>
                {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Categoría</label>
                <select className="input" value={filtros.categoria}
                  onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))}>
                  <option value="todos">Todas</option>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Estado</label>
                <select className="input" value={filtros.estado}
                  onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
                  <option value="todos">Todos</option>
                  {Object.entries(ESTADOS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Mantenimiento</label>
                <select className="input" value={filtros.mantenimiento}
                  onChange={e => setFiltros(f => ({ ...f, mantenimiento: e.target.value as any }))}>
                  <option value="todos">Todos</option>
                  <option value="vencido">Vencido</option>
                  <option value="proximo_30">Próximos 30 días</option>
                  <option value="proximo_90">Próximos 90 días</option>
                  <option value="al_dia">Al día</option>
                </select>
              </div>
              <div>
                <label className="label">Indispensables</label>
                <select className="input" value={filtros.indispensable}
                  onChange={e => setFiltros(f => ({ ...f, indispensable: e.target.value as any }))}>
                  <option value="todos">Todos</option>
                  <option value="si">Solo indispensables</option>
                  <option value="no">No indispensables</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {equiposFiltrados.length} equipo{equiposFiltrados.length !== 1 ? 's' : ''} encontrado{equiposFiltrados.length !== 1 ? 's' : ''}
            </span>
            <button onClick={() => setFiltros({ servicio_id: 'todos', categoria: 'todos', estado: 'todos', mantenimiento: 'todos', indispensable: 'todos' })}
              className="text-xs text-blue-600 font-semibold">
              Limpiar filtros
            </button>
          </div>
        </div>

        {/* Vista previa del informe */}
        {equiposFiltrados.length === 0 ? (
          <div className="card text-center py-8">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-sm font-semibold text-gray-600">Sin resultados</div>
            <div className="text-xs text-gray-400 mt-1">Ajusta los filtros para ver equipos</div>
          </div>
        ) : (
          <div ref={informeRef} style={{ backgroundColor: '#ffffff', padding: '24px', fontFamily: 'sans-serif' }}>

            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '2px solid #1d4ed8', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {hospital?.logo_url ? (
                  <img src={hospital.logo_url} alt="Logo" style={{ height: '40px', objectFit: 'contain' }} crossOrigin="anonymous" />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: hospital?.color_primario || '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>+</span>
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{hospital?.nombre}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{tituloInforme()}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
                <div>Generado: {new Date().toLocaleDateString('es-ES')}</div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827', marginTop: '2px' }}>
                  {equiposFiltrados.length} equipos
                </div>
              </div>
            </div>

            {/* Equipos agrupados por servicio */}
            {Object.entries(porServicio).map(([servicio, eqs]) => (
              <div key={servicio} style={{ marginBottom: '24px' }}>
                <div style={{ background: '#1d4ed8', color: 'white', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                  {servicio} ({eqs.length})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Equipo</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Censo / Serie</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Categoría</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Estado</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Próx. Mant.</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Próx. Calib.</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600 }}>Garantía</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eqs.map((eq, i) => {
                      const diasMant = diasHasta(eq.fecha_proximo_mantenimiento)
                      return (
                        <tr key={eq.id} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ fontWeight: 600 }}>{eq.nombre}</div>
                            <div style={{ color: '#6b7280', fontSize: '10px' }}>{[eq.marca, eq.modelo].filter(Boolean).join(' ')}</div>
                            {eq.indispensable && <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600 }}>★ Indispensable</span>}
                          </td>
                          <td style={{ padding: '6px 8px', color: '#374151' }}>
                            <div>{eq.numero_censo || '—'}</div>
                            <div style={{ color: '#9ca3af', fontSize: '10px' }}>{eq.numero_serie || ''}</div>
                          </td>
                          <td style={{ padding: '6px 8px' }}>{eq.categoria || '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                              background: eq.estado === 'operativo' ? '#dcfce7' : eq.estado === 'en_mantenimiento' ? '#fef9c3' : '#fee2e2',
                              color: eq.estado === 'operativo' ? '#16a34a' : eq.estado === 'en_mantenimiento' ? '#d97706' : '#dc2626',
                            }}>
                              {ESTADOS_LABEL[eq.estado] || eq.estado}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: colorMant(diasMant), fontWeight: diasMant !== null && diasMant < 0 ? 700 : 400 }}>
                            {eq.fecha_proximo_mantenimiento ? (
                              <>
                                <div>{formatFecha(eq.fecha_proximo_mantenimiento)}</div>
                                {diasMant !== null && <div style={{ fontSize: '10px' }}>{diasMant < 0 ? `Vencido ${Math.abs(diasMant)}d` : `En ${diasMant}d`}</div>}
                              </>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '10px' }}>
                            {formatFecha(eq.fecha_proxima_calibracion)}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '10px' }}>
                            {formatFecha(eq.fecha_garantia_hasta)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Pie */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', marginTop: '8px' }}>
              <span>ÁSTOR by CRITIC SL — Sistema de gestión de material crítico hospitalario</span>
              <span>Generado el {new Date().toLocaleString('es-ES')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

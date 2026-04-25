'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useHospitalTheme } from '@/lib/useHospitalTheme'

// =====================================================================
// Tipos
// =====================================================================

interface Equipo {
  id: string
  nombre: string
  marca: string | null
  modelo: string | null
  numero_censo: string | null
  categoria: string | null
  estado: string
  indispensable: boolean
  servicio_id: string | null
  fecha_proximo_mantenimiento: string | null
  fecha_proxima_calibracion: string | null
  fecha_garantia_hasta: string | null
  servicios?: { nombre: string } | null
}

interface Control {
  id: string
  carro_id: string
  tipo: string
  resultado: string
  fecha: string
  firmante_nombre: string | null
  firma_url: string | null
  carros?: { codigo: string; nombre: string; servicios?: { nombre: string } | null } | null
  perfiles?: { nombre: string } | null
}

// =====================================================================
// Constantes
// =====================================================================

const ESTADOS_LABEL: Record<string, string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
  baja: 'Baja',
}

const RESULTADO_LABEL: Record<string, string> = {
  operativo: 'Operativo',
  condicional: 'Condicional',
  no_operativo: 'No operativo',
}

// =====================================================================
// Utilidades
// =====================================================================

function diasHasta(fecha?: string | null): number | null {
  if (!fecha) return null
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000)
}

function formatFecha(fecha?: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatFechaHora(fecha?: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function colorMant(dias: number | null): string {
  if (dias === null) return '#6b7280'
  if (dias < 0) return '#dc2626'
  if (dias <= 30) return '#d97706'
  return '#16a34a'
}

// =====================================================================
// Componente principal
// =====================================================================

export default function AdminInformesPage() {
  const [seccion, setSeccion] = useState<'equipos' | 'controles'>('equipos')
  const [hospital, setHospital] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)

  // Estado inventario equipos
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [filtrosEq, setFiltrosEq] = useState({
    servicio_id: 'todos', categoria: 'todos', estado: 'todos',
    mantenimiento: 'todos', indispensable: 'todos',
  })

  // Estado historial controles
  const [controles, setControles] = useState<Control[]>([])
  const [filtrosCtrl, setFiltrosCtrl] = useState({
    servicio_id: 'todos', resultado: 'todos', tipo: 'todos',
    fecha_desde: '', fecha_hasta: '', firmado: 'todos',
  })

  const informeEqRef = useRef<HTMLDivElement>(null)
  const informeCtrlRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useHospitalTheme(hospital?.color_primario)

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles')
      .select('*, hospitales(*)').eq('id', user.id).single()
    if (!p || !['administrador', 'supervisor', 'auditor', 'superadmin'].includes(p.rol)) {
      router.push('/'); return
    }
    setPerfil(p)
    setHospital((p as any)?.hospitales)

    const hospitalId = p?.hospital_id
    if (!hospitalId) { setLoading(false); return }

    const [eqRes, svRes, ctrlRes] = await Promise.all([
      supabase.from('equipos')
        .select('id, nombre, marca, modelo, numero_censo, categoria, estado, indispensable, servicio_id, fecha_proximo_mantenimiento, fecha_proxima_calibracion, fecha_garantia_hasta, servicios(nombre)')
        .eq('hospital_id', hospitalId).eq('activo', true).order('nombre'),
      supabase.from('servicios')
        .select('id, nombre').eq('hospital_id', hospitalId).eq('activo', true).order('nombre'),
      supabase.from('inspecciones')
        .select('id, carro_id, tipo, resultado, fecha, firmante_nombre, firma_url, carros(codigo, nombre, servicios(nombre)), perfiles(nombre)')
        .order('fecha', { ascending: false })
        .limit(200),
    ])

    const eqs = (eqRes.data || []) as Equipo[]
    setEquipos(eqs)
    setServicios(svRes.data || [])
    setControles((ctrlRes.data || []) as Control[])
    setCategorias(Array.from(new Set(eqs.map(e => e.categoria).filter(Boolean))).sort() as string[])
    setLoading(false)
  }

  // ================================================================
  // Filtros equipos
  // ================================================================
  const equiposFiltrados = equipos.filter(e => {
    if (filtrosEq.servicio_id !== 'todos' && e.servicio_id !== filtrosEq.servicio_id) return false
    if (filtrosEq.categoria !== 'todos' && e.categoria !== filtrosEq.categoria) return false
    if (filtrosEq.estado !== 'todos' && e.estado !== filtrosEq.estado) return false
    if (filtrosEq.indispensable === 'si' && !e.indispensable) return false
    if (filtrosEq.indispensable === 'no' && e.indispensable) return false
    const dias = diasHasta(e.fecha_proximo_mantenimiento)
    if (filtrosEq.mantenimiento === 'vencido' && (dias === null || dias >= 0)) return false
    if (filtrosEq.mantenimiento === 'proximo_30' && (dias === null || dias < 0 || dias > 30)) return false
    if (filtrosEq.mantenimiento === 'proximo_90' && (dias === null || dias < 0 || dias > 90)) return false
    if (filtrosEq.mantenimiento === 'al_dia' && dias !== null && dias < 0) return false
    return true
  })

  const porServicio = equiposFiltrados.reduce((acc, eq) => {
    const sv = (eq.servicios as any)?.nombre || 'Sin servicio'
    if (!acc[sv]) acc[sv] = []
    acc[sv].push(eq)
    return acc
  }, {} as Record<string, Equipo[]>)

  // ================================================================
  // Filtros controles
  // ================================================================
  const controlesFiltrados = controles.filter(c => {
    const svNombre = (c.carros as any)?.servicios?.nombre
    if (filtrosCtrl.servicio_id !== 'todos') {
      const sv = servicios.find(s => s.id === filtrosCtrl.servicio_id)
      if (sv && svNombre !== sv.nombre) return false
    }
    if (filtrosCtrl.resultado !== 'todos' && c.resultado !== filtrosCtrl.resultado) return false
    if (filtrosCtrl.tipo !== 'todos' && c.tipo !== filtrosCtrl.tipo) return false
    if (filtrosCtrl.firmado === 'si' && !c.firma_url) return false
    if (filtrosCtrl.firmado === 'no' && c.firma_url) return false
    if (filtrosCtrl.fecha_desde && c.fecha < filtrosCtrl.fecha_desde) return false
    if (filtrosCtrl.fecha_hasta && c.fecha > filtrosCtrl.fecha_hasta + 'T23:59:59') return false
    return true
  })

  // ================================================================
  // Títulos de informe
  // ================================================================
  function tituloInformeEq(): string {
    const partes: string[] = []
    if (filtrosEq.servicio_id !== 'todos') {
      const sv = servicios.find(s => s.id === filtrosEq.servicio_id)
      if (sv) partes.push(sv.nombre)
    }
    if (filtrosEq.mantenimiento === 'vencido') partes.push('Mantenimientos vencidos')
    else if (filtrosEq.mantenimiento === 'proximo_30') partes.push('Próximos 30 días')
    else if (filtrosEq.mantenimiento === 'proximo_90') partes.push('Próximos 90 días')
    if (filtrosEq.categoria !== 'todos') partes.push(filtrosEq.categoria)
    if (filtrosEq.indispensable === 'si') partes.push('Indispensables')
    if (filtrosEq.estado !== 'todos') partes.push(ESTADOS_LABEL[filtrosEq.estado] || filtrosEq.estado)
    return partes.length > 0 ? partes.join(' · ') : 'Inventario completo de equipos'
  }

  // ================================================================
  // Descarga PDF
  // ================================================================
  async function descargarPDF(ref: React.RefObject<HTMLDivElement>, nombre: string) {
    if (!ref.current) return
    setGenerando(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(ref.current, {
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
      pdf.save(`${nombre}_${new Date().toISOString().split('T')[0]}.pdf`)
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

  const colorPrimario = hospital?.color_primario || '#1d4ed8'

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Informes</span>
        <button
          onClick={() => descargarPDF(
            seccion === 'equipos' ? informeEqRef : informeCtrlRef,
            seccion === 'equipos' ? 'inventario_equipos' : 'historial_controles'
          )}
          disabled={generando || (seccion === 'equipos' ? equiposFiltrados.length === 0 : controlesFiltrados.length === 0)}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40">
          {generando ? '⏳' : '⬇️'} PDF ({seccion === 'equipos' ? equiposFiltrados.length : controlesFiltrados.length})
        </button>
      </div>

      {/* Selector de sección */}
      <div className="flex bg-white border-b border-gray-100">
        <button
          onClick={() => setSeccion('equipos')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${seccion === 'equipos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400'}`}>
          🔧 Inventario equipos
        </button>
        <button
          onClick={() => setSeccion('controles')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${seccion === 'controles' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400'}`}>
          📋 Historial controles
        </button>
      </div>

      <div className="content pb-8">

        {/* ============================================================
            SECCIÓN: INVENTARIO DE EQUIPOS
        ============================================================ */}
        {seccion === 'equipos' && (
          <>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="section-title">Filtros</div>
                {Object.values(filtrosEq).some(v => v !== 'todos' && v !== '') && (
                  <button onClick={() => setFiltrosEq({ servicio_id: 'todos', categoria: 'todos', estado: 'todos', mantenimiento: 'todos', indispensable: 'todos' })}
                    className="text-xs text-blue-600 font-semibold">Limpiar</button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <label className="label">Servicio</label>
                  <select className="input" value={filtrosEq.servicio_id}
                    onChange={e => setFiltrosEq(f => ({ ...f, servicio_id: e.target.value }))}>
                    <option value="todos">Todos los servicios</option>
                    {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Categoría</label>
                    <select className="input" value={filtrosEq.categoria}
                      onChange={e => setFiltrosEq(f => ({ ...f, categoria: e.target.value }))}>
                      <option value="todos">Todas</option>
                      {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Estado</label>
                    <select className="input" value={filtrosEq.estado}
                      onChange={e => setFiltrosEq(f => ({ ...f, estado: e.target.value }))}>
                      <option value="todos">Todos</option>
                      {Object.entries(ESTADOS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Mantenimiento</label>
                    <select className="input" value={filtrosEq.mantenimiento}
                      onChange={e => setFiltrosEq(f => ({ ...f, mantenimiento: e.target.value as any }))}>
                      <option value="todos">Todos</option>
                      <option value="vencido">Vencido</option>
                      <option value="proximo_30">Próximos 30d</option>
                      <option value="proximo_90">Próximos 90d</option>
                      <option value="al_dia">Al día</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Indispensables</label>
                    <select className="input" value={filtrosEq.indispensable}
                      onChange={e => setFiltrosEq(f => ({ ...f, indispensable: e.target.value as any }))}>
                      <option value="todos">Todos</option>
                      <option value="si">Solo indispensables</option>
                      <option value="no">No indispensables</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500">
                {equiposFiltrados.length} equipo{equiposFiltrados.length !== 1 ? 's' : ''} encontrado{equiposFiltrados.length !== 1 ? 's' : ''} de {equipos.length}
              </div>
            </div>

            {equiposFiltrados.length === 0 ? (
              <div className="card text-center py-8">
                <div className="text-2xl mb-2">📋</div>
                <div className="text-sm text-gray-500">Sin resultados. Ajusta los filtros.</div>
              </div>
            ) : (
              <div ref={informeEqRef} style={{ backgroundColor: '#fff', padding: '24px', fontFamily: 'sans-serif' }}>
                {/* Cabecera */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${colorPrimario}`, paddingBottom: '14px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {hospital?.logo_url
                      ? <img src={hospital.logo_url} alt="" style={{ height: '36px', objectFit: 'contain' }} crossOrigin="anonymous" />
                      : <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: colorPrimario, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#fff', fontWeight: 700 }}>+</span>
                        </div>}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{hospital?.nombre}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{tituloInformeEq()}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
                    <div>{new Date().toLocaleDateString('es-ES')}</div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#111' }}>{equiposFiltrados.length} equipos</div>
                  </div>
                </div>

                {/* Tabla por servicio */}
                {Object.entries(porServicio).map(([sv, eqs]) => (
                  <div key={sv} style={{ marginBottom: '20px' }}>
                    <div style={{ background: colorPrimario, color: '#fff', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                      {sv} ({eqs.length})
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                      <thead>
                        <tr style={{ background: '#f3f4f6' }}>
                          {['Equipo', 'Censo', 'Categoría', 'Estado', 'Próx. Mant.', 'Próx. Calib.', 'Garantía'].map(h => (
                            <th key={h} style={{ padding: '5px 6px', textAlign: h === 'Equipo' || h === 'Censo' || h === 'Categoría' ? 'left' : 'center', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {eqs.map((eq, i) => {
                          const dias = diasHasta(eq.fecha_proximo_mantenimiento)
                          return (
                            <tr key={eq.id} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                              <td style={{ padding: '5px 6px' }}>
                                <div style={{ fontWeight: 600 }}>{eq.nombre}</div>
                                {eq.indispensable && <span style={{ fontSize: '9px', color: '#dc2626', fontWeight: 700 }}>★ Indispensable</span>}
                              </td>
                              <td style={{ padding: '5px 6px' }}>{eq.numero_censo || '—'}</td>
                              <td style={{ padding: '5px 6px' }}>{eq.categoria || '—'}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: eq.estado === 'operativo' ? '#dcfce7' : '#fee2e2', color: eq.estado === 'operativo' ? '#16a34a' : '#dc2626' }}>
                                  {ESTADOS_LABEL[eq.estado] || eq.estado}
                                </span>
                              </td>
                              <td style={{ padding: '5px 6px', textAlign: 'center', color: colorMant(dias), fontWeight: dias !== null && dias < 0 ? 700 : 400 }}>
                                {eq.fecha_proximo_mantenimiento ? (
                                  <div>{formatFecha(eq.fecha_proximo_mantenimiento)}<br />
                                    <span style={{ fontSize: '9px' }}>{dias !== null ? (dias < 0 ? `Vencido ${Math.abs(dias)}d` : `En ${dias}d`) : ''}</span>
                                  </div>
                                ) : '—'}
                              </td>
                              <td style={{ padding: '5px 6px', textAlign: 'center' }}>{formatFecha(eq.fecha_proxima_calibracion)}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'center' }}>{formatFecha(eq.fecha_garantia_hasta)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#9ca3af' }}>
                  <span>ÁSTOR by CRITIC SL</span>
                  <span>Generado el {new Date().toLocaleString('es-ES')}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ============================================================
            SECCIÓN: HISTORIAL DE CONTROLES
        ============================================================ */}
        {seccion === 'controles' && (
          <>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="section-title">Filtros</div>
                {Object.values(filtrosCtrl).some(v => v !== 'todos' && v !== '') && (
                  <button onClick={() => setFiltrosCtrl({ servicio_id: 'todos', resultado: 'todos', tipo: 'todos', fecha_desde: '', fecha_hasta: '', firmado: 'todos' })}
                    className="text-xs text-blue-600 font-semibold">Limpiar</button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Fecha desde</label>
                    <input type="date" className="input" value={filtrosCtrl.fecha_desde}
                      onChange={e => setFiltrosCtrl(f => ({ ...f, fecha_desde: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Fecha hasta</label>
                    <input type="date" className="input" value={filtrosCtrl.fecha_hasta}
                      onChange={e => setFiltrosCtrl(f => ({ ...f, fecha_hasta: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Servicio</label>
                  <select className="input" value={filtrosCtrl.servicio_id}
                    onChange={e => setFiltrosCtrl(f => ({ ...f, servicio_id: e.target.value }))}>
                    <option value="todos">Todos los servicios</option>
                    {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label">Resultado</label>
                    <select className="input" value={filtrosCtrl.resultado}
                      onChange={e => setFiltrosCtrl(f => ({ ...f, resultado: e.target.value }))}>
                      <option value="todos">Todos</option>
                      <option value="operativo">Operativo</option>
                      <option value="condicional">Condicional</option>
                      <option value="no_operativo">No operativo</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Tipo</label>
                    <select className="input" value={filtrosCtrl.tipo}
                      onChange={e => setFiltrosCtrl(f => ({ ...f, tipo: e.target.value }))}>
                      <option value="todos">Todos</option>
                      <option value="mensual">Mensual</option>
                      <option value="post_uso">Post-uso</option>
                      <option value="extra">Extra</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Firmado</label>
                    <select className="input" value={filtrosCtrl.firmado}
                      onChange={e => setFiltrosCtrl(f => ({ ...f, firmado: e.target.value }))}>
                      <option value="todos">Todos</option>
                      <option value="si">Con firma</option>
                      <option value="no">Sin firma</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500">
                {controlesFiltrados.length} control{controlesFiltrados.length !== 1 ? 'es' : ''} encontrado{controlesFiltrados.length !== 1 ? 's' : ''} de {controles.length}
              </div>
            </div>

            {controlesFiltrados.length === 0 ? (
              <div className="card text-center py-8">
                <div className="text-2xl mb-2">📋</div>
                <div className="text-sm text-gray-500">Sin resultados. Ajusta los filtros.</div>
              </div>
            ) : (
              <div ref={informeCtrlRef} style={{ backgroundColor: '#fff', padding: '24px', fontFamily: 'sans-serif' }}>
                {/* Cabecera */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${colorPrimario}`, paddingBottom: '14px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {hospital?.logo_url
                      ? <img src={hospital.logo_url} alt="" style={{ height: '36px', objectFit: 'contain' }} crossOrigin="anonymous" />
                      : <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: colorPrimario, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#fff', fontWeight: 700 }}>+</span>
                        </div>}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{hospital?.nombre}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Historial de controles de carros de parada</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
                    <div>{new Date().toLocaleDateString('es-ES')}</div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#111' }}>{controlesFiltrados.length} controles</div>
                  </div>
                </div>

                {/* Tabla de controles */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      {['Fecha', 'Carro', 'Servicio', 'Tipo', 'Resultado', 'Auditor', 'Firma'].map(h => (
                        <th key={h} style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {controlesFiltrados.map((c, i) => {
                      const carro = c.carros as any
                      const colorResult = c.resultado === 'operativo' ? '#16a34a' : c.resultado === 'condicional' ? '#d97706' : '#dc2626'
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#fff' : '#f9fafb', cursor: 'pointer' }}
                          onClick={() => router.push(`/carro/${c.carro_id}/resultado/${c.id}`)}>
                          <td style={{ padding: '5px 6px' }}>{formatFechaHora(c.fecha)}</td>
                          <td style={{ padding: '5px 6px', fontWeight: 600 }}>{carro?.codigo}<br /><span style={{ fontWeight: 400, color: '#6b7280' }}>{carro?.nombre}</span></td>
                          <td style={{ padding: '5px 6px' }}>{carro?.servicios?.nombre || '—'}</td>
                          <td style={{ padding: '5px 6px' }}>{c.tipo?.replace('_', ' ')}</td>
                          <td style={{ padding: '5px 6px' }}>
                            <span style={{ fontWeight: 700, color: colorResult }}>
                              {RESULTADO_LABEL[c.resultado] || c.resultado}
                            </span>
                          </td>
                          <td style={{ padding: '5px 6px' }}>{(c.perfiles as any)?.nombre || '—'}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                            {c.firma_url ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#9ca3af' }}>—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#9ca3af', marginTop: '12px' }}>
                  <span>ÁSTOR by CRITIC SL</span>
                  <span>Generado el {new Date().toLocaleString('es-ES')}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

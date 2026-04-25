'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { formatFechaHora, formatFecha } from '@/lib/utils'

export default function InformeControlPage() {
  const [insp, setInsp] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [itemsTodos, setItemsTodos] = useState<any[]>([])
  const [carro, setCarro] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [auditorNombre, setAuditorNombre] = useState('')
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const informeRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const params = useParams()
  const inspId = params.inspId as string
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [inspId])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*, hospitales(*)').eq('id', user.id).single()
    setPerfil(p)
    setHospital((p as any)?.hospitales)

    const { data: ins } = await supabase.from('inspecciones').select('*').eq('id', inspId).single()
    setInsp(ins)

    if (ins?.auditor_id) {
      const { data: aud } = await supabase.from('perfiles').select('nombre').eq('id', ins.auditor_id).single()
      setAuditorNombre(aud?.nombre || '—')
    }

    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('id', carroId).single()
    setCarro(c)

    // Items con falla
    const { data: fallos } = await supabase.from('items_inspeccion')
      .select('*, materiales(nombre, tipo_falla, cantidad_requerida)')
      .eq('inspeccion_id', inspId)
      .is('tiene_falla', true)
    setItems(fallos || [])

    // Todos los items para el listado completo
    const { data: todos } = await supabase.from('items_inspeccion')
      .select('*, materiales(nombre, tipo_falla, cantidad_requerida)')
      .eq('inspeccion_id', inspId)
      .order('material_id')
    setItemsTodos(todos || [])

    setLoading(false)
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
      const imgWidth = pdfWidth
      const imgHeight = (canvas.height * pdfWidth) / canvas.width

      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pdfHeight
      }

      const fecha = new Date().toISOString().split('T')[0]
      pdf.save(`control_${carro?.codigo}_${fecha}.pdf`)
    } catch (err: any) {
      console.error('Error generando PDF:', err)
    } finally {
      setGenerando(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando informe...</div>
    </div>
  )
  if (!insp || !carro) return null

  const fallosGraves = items.filter(i => i.tipo_falla === 'grave')
  const fallosMenores = items.filter(i => i.tipo_falla === 'menor')
  const itemsOk = itemsTodos.filter(i => !i.tiene_falla)
  const colorResultado = insp.resultado === 'operativo' ? '#16a34a'
    : insp.resultado === 'condicional' ? '#d97706' : '#dc2626'
  const labelResultado = insp.resultado === 'operativo' ? 'OPERATIVO'
    : insp.resultado === 'condicional' ? 'CONDICIONAL' : 'NO OPERATIVO'

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Informe del control</span>
        <button
          onClick={descargarPDF}
          disabled={generando}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1">
          {generando ? '⏳' : '⬇️'} {generando ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      <div className="content pb-8">
        {/* Contenido del informe — este div se captura para el PDF */}
        <div ref={informeRef} style={{ backgroundColor: '#ffffff', padding: '24px', fontFamily: 'sans-serif' }}>

          {/* Cabecera con logo y datos del hospital */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '2px solid #1d4ed8', paddingBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {hospital?.logo_url ? (
                <img src={hospital.logo_url} alt="Logo" style={{ height: '48px', objectFit: 'contain' }} crossOrigin="anonymous" />
              ) : (
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: hospital?.color_primario || '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>+</span>
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>{hospital?.nombre || 'Hospital'}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Informe de control de carro de parada</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Fecha del control</div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{formatFecha(insp.fecha)}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Generado</div>
              <div style={{ fontSize: '12px' }}>{new Date().toLocaleDateString('es-ES')}</div>
            </div>
          </div>

          {/* Resultado destacado */}
          <div style={{ background: colorResultado + '15', border: `2px solid ${colorResultado}`, borderRadius: '12px', padding: '16px', marginBottom: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: colorResultado, letterSpacing: '1px' }}>
              {labelResultado}
            </div>
            <div style={{ fontSize: '13px', color: '#374151', marginTop: '4px' }}>
              {insp.tipo?.replace('_', ' ').toUpperCase()} — {carro.codigo} · {carro.nombre}
            </div>
          </div>

          {/* Datos del control */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Datos del carro</div>
              <Fila label="Código" valor={carro.codigo} />
              <Fila label="Nombre" valor={carro.nombre} />
              <Fila label="Servicio" valor={carro.servicios?.nombre || '—'} />
              <Fila label="Ubicación" valor={carro.ubicacion || '—'} />
            </div>
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Datos del control</div>
              <Fila label="Tipo" valor={insp.tipo?.replace('_', ' ')} />
              <Fila label="Fecha y hora" valor={formatFechaHora(insp.fecha)} />
              <Fila label="Auditor" valor={auditorNombre} />
              <Fila label="Próximo control" valor={formatFecha(carro.proximo_control) || '—'} />
            </div>
          </div>

          {/* Desfibrilador */}
          {insp.numero_censo_desf && (
            <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '12px', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: '#1d4ed8', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase' }}>Desfibrilador</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <Fila label="N° censo" valor={insp.numero_censo_desf} />
                <Fila label="Modelo" valor={insp.modelo_desf || '—'} />
                <Fila label="Próx. mantenimiento" valor={formatFecha(insp.fecha_mantenimiento_desf) || '—'} />
              </div>
            </div>
          )}

          {/* Precintos */}
          {(insp.precinto_retirado || insp.precinto_colocado) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {insp.precinto_retirado && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 600, marginBottom: '4px' }}>🔓 Precinto retirado</div>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>{insp.precinto_retirado}</div>
                </div>
              )}
              {insp.precinto_colocado && (
                <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 600, marginBottom: '4px' }}>🔒 Precinto colocado</div>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>{insp.precinto_colocado}</div>
                </div>
              )}
            </div>
          )}

          {/* Fallos graves */}
          {fallosGraves.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Fallos graves ({fallosGraves.length})
              </div>
              {fallosGraves.map((f: any, i: number) => (
                <div key={i} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{f.materiales?.nombre}</div>
                  {f.descripcion_falla && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{f.descripcion_falla}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Fallos menores */}
          {fallosMenores.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#d97706', marginBottom: '8px' }}>
                ⚠ Fallos menores ({fallosMenores.length})
              </div>
              {fallosMenores.map((f: any, i: number) => (
                <div key={i} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{f.materiales?.nombre}</div>
                  {f.descripcion_falla && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{f.descripcion_falla}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Listado completo de materiales */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
              Materiales revisados ({itemsTodos.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: '#374151' }}>Material</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: '#374151' }}>Cantidad</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: '#374151' }}>Vencimiento</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: '#374151' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {itemsTodos.map((item: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td style={{ padding: '6px 8px' }}>{item.materiales?.nombre || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {item.cantidad_ok ? '✓' : '✗'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '11px' }}>
                      {item.fecha_vencimiento ? formatFecha(item.fecha_vencimiento) : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {item.tiene_falla ? (
                        <span style={{ color: item.tipo_falla === 'grave' ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                          {item.tipo_falla === 'grave' ? 'Fallo grave' : 'Fallo menor'}
                        </span>
                      ) : (
                        <span style={{ color: '#16a34a' }}>✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Firma digital */}
          {insp.firma_url && (
            <div style={{ marginBottom: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>Firma digital</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px' }}>
                <div style={{ flex: 1 }}>
                  <img src={insp.firma_url} alt="Firma"
                    style={{ maxHeight: '80px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white' }}
                    crossOrigin="anonymous" />
                </div>
                <div style={{ textAlign: 'right', fontSize: '12px' }}>
                  <div style={{ fontWeight: 600 }}>{insp.firmante_nombre || auditorNombre}</div>
                  {insp.firmante_cargo && <div style={{ color: '#6b7280' }}>{insp.firmante_cargo}</div>}
                  <div style={{ color: '#9ca3af', marginTop: '4px' }}>
                    {insp.firmado_en ? new Date(insp.firmado_en).toLocaleString('es-ES', {
                      day: '2-digit', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    }) : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pie de página */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af' }}>
            <span>ÁSTOR by CRITIC SL — Sistema de gestión de carros de parada</span>
            <span>Documento generado automáticamente con trazabilidad completa</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
      <span style={{ color: '#6b7280' }}>{label}:</span>
      <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{valor}</span>
    </div>
  )
}

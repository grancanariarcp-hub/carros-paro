'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface MatVto {
  carro_codigo: string
  carro_nombre: string
  servicio: string
  servicio_id: string
  ubicacion: string
  responsable: string
  material: string
  fecha_vencimiento: string
  dias: number
}

function colorDias(dias: number): string {
  if (dias < 0) return 'bg-red-100 text-red-800 border border-red-300'
  if (dias <= 7) return 'bg-red-100 text-red-800 border border-red-300'
  if (dias <= 15) return 'bg-orange-100 text-orange-800 border border-orange-300'
  if (dias <= 30) return 'bg-amber-100 text-amber-800 border border-amber-300'
  return 'bg-green-100 text-green-800 border border-green-300'
}

function labelDias(dias: number): string {
  if (dias < 0) return `Vencido hace ${Math.abs(dias)}d`
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  return `${dias} días`
}

function colorPDF(dias: number): string {
  if (dias <= 7) return '#fee2e2'
  if (dias <= 15) return '#ffedd5'
  if (dias <= 30) return '#fef9c3'
  return '#f0fdf4'
}

export default function InformeVencimientosPage() {
  const [datos, setDatos] = useState<MatVto[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codigo, setCodigo] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  })
  const [servicios, setServicios] = useState<any[]>([])
  const [servicio, setServicio] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)

    const { data: svcs } = await supabase.from('servicios').select('*').eq('activo', true).order('nombre')
    setServicios(svcs || [])

    const { data: cod } = await supabase.rpc('generar_codigo_informe', { tipo_inf: 'vencimientos' })
    setCodigo(cod || '')

    await buscar('', fechaHasta, '')
    setLoading(false)
  }

  async function buscar(svc: string, hasta: string, desde: string) {
    const hoy = new Date().toISOString().split('T')[0]

    const { data } = await supabase.from('materiales')
      .select(`
        nombre, fecha_vencimiento,
        cajones!inner(
          carro_id,
          carros!inner(codigo, nombre, ubicacion, responsable, servicio_id, activo, servicios(nombre))
        )
      `)
      .eq('activo', true)
      .eq('tiene_vencimiento', true)
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', hasta || hoy)
      .order('fecha_vencimiento', { ascending: true })

    let resultado: MatVto[] = (data || []).map((m: any) => {
      const carro = m.cajones?.carros
      const dias = Math.ceil((new Date(m.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      return {
        carro_codigo: carro?.codigo || '—',
        carro_nombre: carro?.nombre || '—',
        servicio: carro?.servicios?.nombre || '—',
        servicio_id: carro?.servicio_id || '',
        ubicacion: carro?.ubicacion || '—',
        responsable: carro?.responsable || '—',
        material: m.nombre,
        fecha_vencimiento: m.fecha_vencimiento,
        dias,
      }
    })

    if (svc) resultado = resultado.filter(m => m.servicio_id === svc)
    if (desde) resultado = resultado.filter(m => m.fecha_vencimiento >= desde)

    setDatos(resultado)
  }

  const porCarro = datos.reduce((acc, m) => {
    const key = m.carro_codigo
    if (!acc[key]) acc[key] = { info: m, materiales: [] }
    acc[key].materiales.push(m)
    return acc
  }, {} as Record<string, { info: MatVto, materiales: MatVto[] }>)

  function generarPDF() {
    const fecha = new Date().toLocaleDateString('es-ES')
    const servicioNombre = servicio ? servicios.find(s => s.id === servicio)?.nombre : 'Todos'
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 2cm; color: #1e293b; font-size: 11px; }
  .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; }
  .hospital { font-size: 14px; font-weight: bold; color: #1d4ed8; }
  .titulo { font-size: 18px; font-weight: bold; margin: 6px 0 2px; }
  .codigo { font-size: 11px; color: #64748b; }
  .carro-block { margin-bottom: 20px; page-break-inside: avoid; }
  .carro-header { background: #1d4ed8; color: white; padding: 8px 10px; border-radius: 6px 6px 0 0; }
  .carro-meta { background: #f8fafc; padding: 6px 10px; font-size: 10px; color: #64748b; border: 1px solid #e2e8f0; border-top: none; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-top: none; }
  th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
  .sin-datos { text-align: center; padding: 40px 20px; border: 1px dashed #e2e8f0; border-radius: 8px; margin-top: 10px; color: #64748b; }
  .sin-datos-titulo { font-size: 15px; font-weight: bold; margin-bottom: 8px; color: #16a34a; }
  .footer { margin-top: 30px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { @page { margin: 1.5cm; } }
</style></head><body>
<div class="header">
  <div class="hospital">Hospital Universitario de Gran Canaria Doctor Negrín</div>
  <div class="titulo">Informe de Vencimientos de Material</div>
  <div class="codigo">Código: ${codigo} · Generado: ${fecha} · Por: ${perfil?.nombre}</div>
  <div class="codigo" style="margin-top:4px">
    ${fechaDesde ? `Desde: ${fechaDesde} · ` : ''}Hasta: ${fechaHasta} · Servicio: ${servicioNombre} · Total: ${datos.length} material${datos.length !== 1 ? 'es' : ''}
  </div>
</div>
${datos.length === 0 ? `
<div class="sin-datos">
  <div class="sin-datos-titulo">✓ Sin vencimientos en el período seleccionado</div>
  <div style="font-size:12px;">No se encontraron materiales con vencimiento en el rango de fechas y filtros seleccionados.</div>
</div>
` : `
${Object.values(porCarro).map(({ info, materiales }) => `
<div class="carro-block">
  <div class="carro-header"><strong>${info.carro_codigo}</strong> — ${info.carro_nombre}</div>
  <div class="carro-meta">Servicio: ${info.servicio} · Ubicación: ${info.ubicacion} · Responsable: ${info.responsable}</div>
  <table>
    <thead><tr><th>Material</th><th>Fecha vencimiento</th><th>Días restantes</th></tr></thead>
    <tbody>
      ${materiales.map(m => `<tr style="background:${colorPDF(m.dias)}">
        <td>${m.material}</td>
        <td>${new Date(m.fecha_vencimiento).toLocaleDateString('es-ES')}</td>
        <td><strong>${labelDias(m.dias)}</strong></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`).join('')}
`}
<div class="footer">
  🔴 &lt;7 días · 🟠 8-15 días · 🟡 16-30 días<br>
  Hospital Universitario de Gran Canaria Doctor Negrín · Sistema Auditor Carros de Parada · GranCanariaRCP · Dr. Lübbe
</div>
</body></html>`
    const v = window.open('', '_blank')
    if (v) { v.document.write(html); v.document.close(); v.onload = () => v.print() }
  }

  async function compartir() {
    const texto = datos.length === 0
      ? `*Informe Vencimientos - ${codigo}*\nH.U. Gran Canaria Doctor Negrín\n\n✓ Sin vencimientos en el período seleccionado a fecha ${new Date().toLocaleDateString('es-ES')}`
      : `*Informe Vencimientos - ${codigo}*\nH.U. Gran Canaria Doctor Negrín\n\n${Object.values(porCarro).map(({ info, materiales }) =>
          `*${info.carro_codigo}* - ${info.servicio}\n${materiales.map(m => `  • ${m.material}: ${labelDias(m.dias)}`).join('\n')}`
        ).join('\n\n')}`
    if (navigator.share) {
      await navigator.share({ title: `Informe ${codigo}`, text: texto })
    } else {
      await navigator.clipboard.writeText(texto)
      toast.success('Copiado al portapapeles')
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Vencimientos</span>
      </div>
      <div className="content">
        <div className="card">
          <label className="label">Código del informe (editable)</label>
          <input className="input" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </div>

        <div className="card">
          <div className="section-title mb-3">Filtros</div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Desde</label>
                <input className="input" type="date" value={fechaDesde}
                  onChange={e => { setFechaDesde(e.target.value); buscar(servicio, fechaHasta, e.target.value) }} />
              </div>
              <div>
                <label className="label">Hasta</label>
                <input className="input" type="date" value={fechaHasta}
                  onChange={e => { setFechaHasta(e.target.value); buscar(servicio, e.target.value, fechaDesde) }} />
              </div>
            </div>
            <div>
              <label className="label">Servicio</label>
              <select className="input" value={servicio}
                onChange={e => { setServicio(e.target.value); buscar(e.target.value, fechaHasta, fechaDesde) }}>
                <option value="">Todos los servicios</option>
                {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card py-2.5 px-3">
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div><span className="text-gray-500">&lt;7 días o vencido</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-100 border border-orange-300"></div><span className="text-gray-500">8-15 días</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></div><span className="text-gray-500">16-30 días</span></div>
          </div>
        </div>

        <div className="card bg-orange-50 border-orange-200">
          <div className="text-sm font-semibold text-orange-800">
            {datos.length} material{datos.length !== 1 ? 'es' : ''} en {Object.keys(porCarro).length} carro{Object.keys(porCarro).length !== 1 ? 's' : ''}
          </div>
        </div>

        {Object.values(porCarro).map(({ info, materiales }) => (
          <div key={info.carro_codigo} className="card">
            <div className="font-semibold text-sm text-blue-700 mb-1">{info.carro_codigo} — {info.carro_nombre}</div>
            <div className="text-xs text-gray-400 mb-3">{info.servicio} · {info.ubicacion} · Resp: {info.responsable}</div>
            {materiales.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="text-sm font-medium">{m.material}</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-400">{new Date(m.fecha_vencimiento).toLocaleDateString('es-ES')}</div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${colorDias(m.dias)}`}>
                    {labelDias(m.dias)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}

        {datos.length === 0 && (
          <div className="card text-center py-8">
            <div className="text-green-600 font-semibold text-sm">✓ Sin vencimientos en el período seleccionado</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={generarPDF}>Imprimir PDF</button>
          <button className="btn-secondary" onClick={compartir}>Compartir</button>
        </div>
      </div>
    </div>
  )
}

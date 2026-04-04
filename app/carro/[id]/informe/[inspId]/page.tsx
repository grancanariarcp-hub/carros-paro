'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { estadoColor, formatFecha, formatFechaHora } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function InformeControlPage() {
  const [insp, setInsp] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [desf, setDesf] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codigo, setCodigo] = useState('')
  const router = useRouter()
  const params = useParams()
  const inspId = params.inspId as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [inspId])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)

    const { data: ins } = await supabase.from('inspecciones')
      .select('*, carros(codigo,nombre,ubicacion,responsable,frecuencia_control,proximo_control,servicios(nombre)), perfiles(nombre)')
      .eq('id', inspId).single()
    setInsp(ins)

    const { data: its } = await supabase.from('items_inspeccion')
      .select('*, materiales(nombre,cantidad_requerida,cajones(nombre))')
      .eq('inspeccion_id', inspId)
      .order('id')
    setItems(its || [])

    if (ins?.carro_id) {
      const { data: d } = await supabase.from('desfibriladores')
        .select('*').eq('carro_id', ins.carro_id).eq('activo', true).single()
      setDesf(d)
    }

    const { data: cod } = await supabase.rpc('generar_codigo_informe', { tipo_inf: 'control_realizado' })
    setCodigo(cod || '')
    setLoading(false)
  }

  function generarPDF() {
    if (!insp) return
    const carro = insp.carros
    const auditor = insp.perfiles
    const e = estadoColor(insp.resultado)
    const fallosGraves = items.filter(i => i.tiene_falla && i.tipo_falla === 'grave')
    const fallosMenores = items.filter(i => i.tiene_falla && i.tipo_falla === 'menor')
    const fecha = new Date().toLocaleDateString('es-ES')

    const colorEstado = insp.resultado === 'operativo' ? '#16a34a' : insp.resultado === 'condicional' ? '#d97706' : '#dc2626'
    const bgEstado = insp.resultado === 'operativo' ? '#f0fdf4' : insp.resultado === 'condicional' ? '#fffbeb' : '#fef2f2'
    const labelEstado = insp.resultado === 'operativo' ? 'CARRO OPERATIVO' : insp.resultado === 'condicional' ? 'CARRO OPERATIVO CONDICIONAL' : 'CARRO NO OPERATIVO'

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 2cm; color: #1e293b; font-size: 11px; }
  .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px; }
  .hospital { font-size: 14px; font-weight: bold; color: #1d4ed8; }
  .titulo { font-size: 18px; font-weight: bold; margin: 6px 0 2px; }
  .codigo { font-size: 10px; color: #64748b; }
  .resultado-banner { background: ${bgEstado}; border: 2px solid ${colorEstado}; border-radius: 8px; padding: 14px; text-align: center; margin: 16px 0; }
  .resultado-titulo { font-size: 20px; font-weight: bold; color: ${colorEstado}; }
  .section { font-weight: bold; font-size: 12px; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .meta-item { font-size: 10px; }
  .meta-label { color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-weight: bold; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  .fallo-grave { background: #fee2e2; border-left: 3px solid #dc2626; padding: 8px 10px; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
  .fallo-menor { background: #fef9c3; border-left: 3px solid #d97706; padding: 8px 10px; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
  .foto { max-width: 180px; max-height: 130px; border-radius: 6px; margin-top: 6px; }
  .vto-red { background:#fee2e2; color:#991b1b; padding:1px 6px; border-radius:8px; }
  .vto-amber { background:#fef9c3; color:#854d0e; padding:1px 6px; border-radius:8px; }
  .vto-green { background:#dcfce7; color:#166534; padding:1px 6px; border-radius:8px; }
  .footer { margin-top: 30px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { @page { margin: 1.5cm; } }
</style></head><body>
<div class="header">
  <div class="hospital">Hospital Universitario de Gran Canaria Doctor Negrín</div>
  <div class="titulo">Informe de Control Realizado</div>
  <div class="codigo">Código: ${codigo} · Generado: ${fecha} · Por: ${perfil?.nombre}</div>
</div>

<div class="resultado-banner">
  <div class="resultado-titulo">${labelEstado}</div>
  ${fallosGraves.length > 0 ? `<div style="font-size:11px;color:${colorEstado};margin-top:4px">${fallosGraves.length} fallo${fallosGraves.length !== 1 ? 's' : ''} grave${fallosGraves.length !== 1 ? 's' : ''} detectado${fallosGraves.length !== 1 ? 's' : ''}</div>` : ''}
  ${fallosMenores.length > 0 ? `<div style="font-size:11px;color:${colorEstado};margin-top:2px">${fallosMenores.length} fallo${fallosMenores.length !== 1 ? 's' : ''} menor${fallosMenores.length !== 1 ? 'es' : ''} detectado${fallosMenores.length !== 1 ? 's' : ''}</div>` : ''}
</div>

<div class="section">Datos del control</div>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">Carro: </span><strong>${carro?.codigo}</strong></div>
  <div class="meta-item"><span class="meta-label">Nombre: </span>${carro?.nombre}</div>
  <div class="meta-item"><span class="meta-label">Servicio: </span>${carro?.servicios?.nombre || '—'}</div>
  <div class="meta-item"><span class="meta-label">Ubicación: </span>${carro?.ubicacion || '—'}</div>
  <div class="meta-item"><span class="meta-label">Responsable: </span>${carro?.responsable || '—'}</div>
  <div class="meta-item"><span class="meta-label">Auditor: </span>${auditor?.nombre || '—'}</div>
  <div class="meta-item"><span class="meta-label">Fecha y hora: </span>${new Date(insp.fecha).toLocaleString('es-ES')}</div>
  <div class="meta-item"><span class="meta-label">Tipo control: </span>${insp.tipo?.replace('_', ' ')}</div>
  ${insp.tipo !== 'post_uso' ? `<div class="meta-item"><span class="meta-label">Próximo control: </span>${formatFecha(carro?.proximo_control)}</div>` : ''}
</div>

${desf ? `
<div class="section">Desfibrilador</div>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">Marca: </span>${desf.marca || '—'}</div>
  <div class="meta-item"><span class="meta-label">Modelo: </span>${desf.modelo || '—'}</div>
  <div class="meta-item"><span class="meta-label">N° censo: </span>${desf.numero_censo || '—'}</div>
  <div class="meta-item"><span class="meta-label">Último mantenimiento: </span>${formatFecha(desf.fecha_ultimo_mantenimiento)}</div>
  <div class="meta-item"><span class="meta-label">Próximo mantenimiento: </span>${formatFecha(desf.fecha_mantenimiento)}</div>
</div>` : ''}

${fallosGraves.length > 0 ? `
<div class="section" style="color:#dc2626">Fallos graves detectados</div>
${fallosGraves.map(i => `
<div class="fallo-grave">
  <strong>${i.materiales?.nombre || '—'}</strong>
  ${i.descripcion_falla ? `<br><span style="color:#64748b">${i.descripcion_falla}</span>` : ''}
  ${i.foto_url ? `<br><img class="foto" src="${i.foto_url}" alt="evidencia"/>` : ''}
</div>`).join('')}` : ''}

${fallosMenores.length > 0 ? `
<div class="section" style="color:#d97706">Fallos menores detectados</div>
${fallosMenores.map(i => `
<div class="fallo-menor">
  <strong>${i.materiales?.nombre || '—'}</strong>
  ${i.descripcion_falla ? `<br><span style="color:#64748b">${i.descripcion_falla}</span>` : ''}
  ${i.foto_url ? `<br><img class="foto" src="${i.foto_url}" alt="evidencia"/>` : ''}
</div>`).join('')}` : ''}

<div class="section">Detalle completo del control</div>
<table>
  <thead><tr><th>Material</th><th>Cant. OK</th><th>Estado OK</th><th>Vencimiento</th><th>Falla</th></tr></thead>
  <tbody>
    ${items.map(i => {
      let vtoClass = ''
      let vtoLabel = '—'
      if (i.fecha_vencimiento) {
        const dias = Math.ceil((new Date(i.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        vtoClass = dias <= 7 ? 'vto-red' : dias <= 30 ? 'vto-amber' : 'vto-green'
        vtoLabel = `<span class="${vtoClass}">${new Date(i.fecha_vencimiento).toLocaleDateString('es-ES')}</span>`
      }
      return `<tr>
        <td>${i.materiales?.nombre || '—'}</td>
        <td>${i.cantidad_ok ? '✓' : '✗'}</td>
        <td>${i.estado_ok ? '✓' : '✗'}</td>
        <td>${vtoLabel}</td>
        <td>${i.tiene_falla ? `<strong style="color:${i.tipo_falla === 'grave' ? '#dc2626' : '#d97706'}">${i.tipo_falla}</strong>` : '—'}</td>
      </tr>`
    }).join('')}
  </tbody>
</table>

<div class="footer">
  Informe generado automáticamente · Hospital Universitario de Gran Canaria Doctor Negrín<br>
  Sistema Auditor Carros de Parada · GranCanariaRCP · Dr. Lübbe
</div>
</body></html>`

    const v = window.open('', '_blank')
    if (v) { v.document.write(html); v.document.close(); v.onload = () => v.print() }
  }

  async function compartir() {
    const carro = insp?.carros
    const labelEstado = insp?.resultado === 'operativo' ? '✅ OPERATIVO' : insp?.resultado === 'condicional' ? '⚠️ CONDICIONAL' : '🚨 NO OPERATIVO'
    const texto = `*Informe Control - ${codigo}*\nH.U. Gran Canaria Doctor Negrín\n\n*${carro?.codigo}* - ${carro?.nombre}\n${labelEstado}\nFecha: ${new Date(insp?.fecha).toLocaleString('es-ES')}\nAuditor: ${insp?.perfiles?.nombre}\nTipo: ${insp?.tipo?.replace('_', ' ')}`
    if (navigator.share) {
      await navigator.share({ title: `Informe ${codigo}`, text: texto })
    } else {
      await navigator.clipboard.writeText(texto)
      toast.success('Copiado al portapapeles')
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>
  if (!insp) return null

  const carro = insp.carros
  const e = estadoColor(insp.resultado)
  const fallosGraves = items.filter(i => i.tiene_falla && i.tipo_falla === 'grave')
  const fallosMenores = items.filter(i => i.tiene_falla && i.tipo_falla === 'menor')

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Informe de control</span>
      </div>
      <div className="content">
        <div className="card">
          <label className="label">Código del informe (editable)</label>
          <input className="input" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </div>

        {/* Resultado */}
        <div className={`rounded-2xl p-4 text-center border ${
          insp.resultado === 'operativo' ? 'bg-green-50 border-green-200' :
          insp.resultado === 'condicional' ? 'bg-amber-50 border-amber-200' :
          'bg-red-50 border-red-200'
        }`}>
          <div className={`text-lg font-bold ${e.text}`}>
            {insp.resultado === 'operativo' ? 'CARRO OPERATIVO' :
             insp.resultado === 'condicional' ? 'CARRO OPERATIVO CONDICIONAL' : 'CARRO NO OPERATIVO'}
          </div>
          {fallosGraves.length > 0 && <div className={`text-xs mt-1 ${e.text}`}>{fallosGraves.length} fallo{fallosGraves.length !== 1 ? 's' : ''} grave{fallosGraves.length !== 1 ? 's' : ''}</div>}
          {fallosMenores.length > 0 && <div className={`text-xs mt-0.5 ${e.text}`}>{fallosMenores.length} fallo{fallosMenores.length !== 1 ? 's' : ''} menor{fallosMenores.length !== 1 ? 'es' : ''}</div>}
        </div>

        {/* Datos */}
        <div className="card">
          <div className="section-title mb-3">Datos del control</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><div className="label">Carro</div><div className="val">{carro?.codigo}</div></div>
            <div><div className="label">Servicio</div><div className="val">{carro?.servicios?.nombre || '—'}</div></div>
            <div><div className="label">Auditor</div><div className="val">{insp.perfiles?.nombre}</div></div>
            <div><div className="label">Fecha y hora</div><div className="val">{formatFechaHora(insp.fecha)}</div></div>
            <div><div className="label">Tipo</div><div className="val">{insp.tipo?.replace('_', ' ')}</div></div>
            {insp.tipo !== 'post_uso' && <div><div className="label">Próximo control</div><div className="val">{formatFecha(carro?.proximo_control)}</div></div>}
          </div>
        </div>

        {/* Fallos */}
        {fallosGraves.length > 0 && (
          <div className="card border-red-200">
            <div className="section-title text-red-700 mb-3">Fallos graves</div>
            {fallosGraves.map(i => (
              <div key={i.id} className="mb-3 p-2 bg-red-50 rounded-xl border border-red-100">
                <div className="text-sm font-semibold">{i.materiales?.nombre}</div>
                {i.descripcion_falla && <div className="text-xs text-gray-500 mt-0.5">{i.descripcion_falla}</div>}
                {i.foto_url && <img src={i.foto_url} alt="evidencia" className="mt-2 w-full h-28 object-cover rounded-xl"/>}
              </div>
            ))}
          </div>
        )}

        {fallosMenores.length > 0 && (
          <div className="card border-amber-200">
            <div className="section-title text-amber-700 mb-3">Fallos menores</div>
            {fallosMenores.map(i => (
              <div key={i.id} className="mb-3 p-2 bg-amber-50 rounded-xl border border-amber-100">
                <div className="text-sm font-semibold">{i.materiales?.nombre}</div>
                {i.descripcion_falla && <div className="text-xs text-gray-500 mt-0.5">{i.descripcion_falla}</div>}
                {i.foto_url && <img src={i.foto_url} alt="evidencia" className="mt-2 w-full h-28 object-cover rounded-xl"/>}
              </div>
            ))}
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

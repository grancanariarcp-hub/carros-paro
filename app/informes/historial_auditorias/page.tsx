'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor, formatFechaHora } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function InformeHistorialPage() {
  const [datos, setDatos] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codigo, setCodigo] = useState('')
  const [auditores, setAuditores] = useState<any[]>([])
  const [carros, setCarros] = useState<any[]>([])
  const [filtros, setFiltros] = useState({
    auditor: '', carro: '', resultado: '', desde: '', hasta: ''
  })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)

    const [{ data: auds }, { data: cars }, { data: cod }] = await Promise.all([
      supabase.from('perfiles').select('id,nombre').eq('activo', true).order('nombre'),
      supabase.from('carros').select('id,codigo,nombre').eq('activo', true).order('codigo'),
      supabase.rpc('generar_codigo_informe', { tipo_inf: 'historial_auditorias' })
    ])
    setAuditores(auds || [])
    setCarros(cars || [])
    setCodigo(cod || '')

    await buscar({ auditor: '', carro: '', resultado: '', desde: '', hasta: '' })
    setLoading(false)
  }

  async function buscar(f: typeof filtros) {
    let q = supabase.from('inspecciones')
      .select('*, carros(codigo,nombre,ubicacion,responsable,servicios(nombre)), perfiles(nombre)')
      .order('fecha', { ascending: false })
      .limit(200)

    if (f.auditor) q = q.eq('auditor_id', f.auditor)
    if (f.carro) q = q.eq('carro_id', f.carro)
    if (f.resultado) q = q.eq('resultado', f.resultado)
    if (f.desde) q = q.gte('fecha', f.desde)
    if (f.hasta) q = q.lte('fecha', f.hasta + 'T23:59:59')

    const { data } = await q
    setDatos(data || [])
  }

  function updateFiltro(campo: string, valor: string) {
    const nf = { ...filtros, [campo]: valor }
    setFiltros(nf)
    buscar(nf)
  }

  function generarPDF() {
    const fecha = new Date().toLocaleDateString('es-ES')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 2cm; color: #1e293b; font-size: 10px; }
  .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; }
  .hospital { font-size: 14px; font-weight: bold; color: #1d4ed8; }
  .titulo { font-size: 18px; font-weight: bold; margin: 6px 0 2px; }
  .codigo { font-size: 10px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1d4ed8; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge-op { background:#dcfce7; color:#166534; padding:1px 6px; border-radius:8px; }
  .badge-cond { background:#fef9c3; color:#854d0e; padding:1px 6px; border-radius:8px; }
  .badge-nop { background:#fee2e2; color:#991b1b; padding:1px 6px; border-radius:8px; }
  .sin-datos { text-align: center; padding: 40px 20px; border: 1px dashed #e2e8f0; border-radius: 8px; margin-top: 10px; color: #64748b; }
  .sin-datos-titulo { font-size: 15px; font-weight: bold; margin-bottom: 8px; }
  .footer { margin-top: 30px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { @page { margin: 1.5cm; size: landscape; } }
</style></head><body>
<div class="header">
  <div class="hospital">Hospital Universitario de Gran Canaria Doctor Negrín</div>
  <div class="titulo">Historial de Auditorías</div>
  <div class="codigo">Código: ${codigo} · Generado: ${fecha} · Por: ${perfil?.nombre} · Total registros: ${datos.length}</div>
  <div class="codigo" style="margin-top:4px">
    ${filtros.desde ? `Desde: ${filtros.desde} · ` : ''}${filtros.hasta ? `Hasta: ${filtros.hasta} · ` : ''}Resultado: ${filtros.resultado || 'Todos'}
  </div>
</div>
${datos.length === 0 ? `
<div class="sin-datos">
  <div class="sin-datos-titulo">Sin registros</div>
  <div style="font-size:12px;">No se encontraron auditorías para los filtros seleccionados en la fecha de generación de este informe.</div>
</div>
` : `
<table>
  <thead><tr>
    <th>Fecha y hora</th><th>Carro</th><th>Servicio</th><th>Tipo</th><th>Resultado</th><th>Auditor</th>
  </tr></thead>
  <tbody>
    ${datos.map(ins => {
      const r = ins.resultado
      const badge = r === 'operativo' ? 'badge-op' : r === 'condicional' ? 'badge-cond' : 'badge-nop'
      const label = r === 'operativo' ? 'Operativo' : r === 'condicional' ? 'Condicional' : 'No operativo'
      return `<tr>
        <td>${new Date(ins.fecha).toLocaleString('es-ES')}</td>
        <td><strong>${ins.carros?.codigo}</strong></td>
        <td>${ins.carros?.servicios?.nombre || '—'}</td>
        <td>${ins.tipo?.replace('_', ' ')}</td>
        <td><span class="${badge}">${label}</span></td>
        <td>${ins.perfiles?.nombre || '—'}</td>
      </tr>`
    }).join('')}
  </tbody>
</table>
`}
<div class="footer">Hospital Universitario de Gran Canaria Doctor Negrín · Sistema Auditor Carros de Parada · GranCanariaRCP · Dr. Lübbe</div>
</body></html>`
    const v = window.open('', '_blank')
    if (v) { v.document.write(html); v.document.close(); v.onload = () => v.print() }
  }

  function generarExcel() {
    const headers = ['Fecha y hora', 'Código carro', 'Nombre carro', 'Servicio', 'Ubicación', 'Responsable', 'Tipo control', 'Resultado', 'Auditor']
    const rows = datos.map(ins => [
      new Date(ins.fecha).toLocaleString('es-ES'),
      ins.carros?.codigo || '',
      ins.carros?.nombre || '',
      ins.carros?.servicios?.nombre || '',
      ins.carros?.ubicacion || '',
      ins.carros?.responsable || '',
      ins.tipo?.replace('_', ' ') || '',
      ins.resultado || '',
      ins.perfiles?.nombre || ''
    ])
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${codigo}_historial_auditorias.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function compartir() {
    const texto = datos.length === 0
      ? `*Historial Auditorías - ${codigo}*\nH.U. Gran Canaria Doctor Negrín\n\nSin registros para los filtros seleccionados a fecha ${new Date().toLocaleDateString('es-ES')}`
      : `*Historial Auditorías - ${codigo}*\nH.U. Gran Canaria Doctor Negrín\nTotal: ${datos.length} controles\n\n${datos.slice(0, 10).map(ins => `• ${new Date(ins.fecha).toLocaleDateString('es-ES')} · ${ins.carros?.codigo} · ${ins.tipo?.replace('_', ' ')} · ${ins.resultado}`).join('\n')}${datos.length > 10 ? `\n...y ${datos.length - 10} más` : ''}`
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
        <span className="font-semibold text-sm flex-1 text-right">Historial auditorías</span>
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
                <input className="input" type="date" value={filtros.desde}
                  onChange={e => updateFiltro('desde', e.target.value)} />
              </div>
              <div>
                <label className="label">Hasta</label>
                <input className="input" type="date" value={filtros.hasta}
                  onChange={e => updateFiltro('hasta', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Carro</label>
              <select className="input" value={filtros.carro} onChange={e => updateFiltro('carro', e.target.value)}>
                <option value="">Todos los carros</option>
                {carros.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Auditor</label>
              <select className="input" value={filtros.auditor} onChange={e => updateFiltro('auditor', e.target.value)}>
                <option value="">Todos los auditores</option>
                {auditores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Resultado</label>
              <select className="input" value={filtros.resultado} onChange={e => updateFiltro('resultado', e.target.value)}>
                <option value="">Todos</option>
                <option value="operativo">Operativo</option>
                <option value="condicional">Condicional</option>
                <option value="no_operativo">No operativo</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card bg-blue-50 border-blue-100">
          <div className="text-sm font-semibold text-blue-800">{datos.length} registro{datos.length !== 1 ? 's' : ''} encontrado{datos.length !== 1 ? 's' : ''}</div>
        </div>

        {datos.map(ins => {
          const e = estadoColor(ins.resultado)
          return (
            <div key={ins.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-sm">{ins.carros?.codigo} — {ins.tipo?.replace('_', ' ')}</div>
                  <div className="text-xs text-gray-400">{formatFechaHora(ins.fecha)}</div>
                </div>
                <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div><span className="text-gray-400">Servicio: </span>{ins.carros?.servicios?.nombre || '—'}</div>
                <div><span className="text-gray-400">Auditor: </span>{ins.perfiles?.nombre || '—'}</div>
                <div><span className="text-gray-400">Ubicación: </span>{ins.carros?.ubicacion || '—'}</div>
                <div><span className="text-gray-400">Responsable: </span>{ins.carros?.responsable || '—'}</div>
              </div>
            </div>
          )
        })}

        {datos.length === 0 && (
          <div className="card text-center py-8">
            <div className="text-gray-400 text-sm">Sin registros para los filtros seleccionados</div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button className="btn-primary" onClick={generarPDF}>PDF</button>
          <button className="btn-secondary" onClick={generarExcel}>Excel</button>
          <button className="btn-secondary" onClick={compartir}>Compartir</button>
        </div>
      </div>
    </div>
  )
}

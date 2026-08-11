'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { estadoColor, formatFechaHora } from '@/lib/utils'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'
import { informeHeaderHTML } from '@/components/InformeHeader'


function nombreArchivoPDF(codigo: string, tipo: string): string {
  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-ES').replace(/\//g, '-')
  const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }).replace(':', '-')
  return `${codigo}_${tipo}_${fecha}_${hora}.pdf`
}

async function descargarPDF(html: string, nombreArchivo: string) {
  const htmlConTitulo = html.replace('<head>', `<head><title>${nombreArchivo.replace('.pdf','')}</title>`)
  const v = window.open('', '_blank')
  if (v) { v.document.write(htmlConTitulo); v.document.close(); v.onload = () => { v.focus(); v.print() } }
}

export default function InformeHistorialPage() {
  const [datos, setDatos] = useState<any[]>([])
  const [recortado, setRecortado] = useState(false)
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [hospitalConfig, setHospitalConfig] = useState<any>(null)
  const [plantillaInforme, setPlantillaInforme] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codigo, setCodigo] = useState('')
  const [auditores, setAuditores] = useState<any[]>([])
  const [carros, setCarros] = useState<any[]>([])
  const [filtros, setFiltros] = useState({
    auditor: '', carro: '', resultado: '', desde: '', hasta: ''
  })
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)

    if (p?.hospital_id) {
      const [{ data: h }, { data: cfg }, { data: pl }] = await Promise.all([
        supabase.from('hospitales').select('*').eq('id', p.hospital_id).single(),
        supabase.from('hospital_config').select('*').eq('hospital_id', p.hospital_id).maybeSingle(),
        supabase.from('plantillas_informe').select('*')
          .eq('hospital_id', p.hospital_id).eq('tipo', 'historial_auditorias').maybeSingle(),
      ])
      setHospital(h)
      setHospitalConfig(cfg)
      setPlantillaInforme(pl)
    }

    const [{ data: auds }, { data: cars }, { data: cod }] = await Promise.all([
      supabase.from('perfiles').select('id,nombre').eq('activo', true).eq('hospital_id', p?.hospital_id).order('nombre'),
      supabase.from('carros').select('id,codigo,nombre').eq('activo', true).eq('hospital_id', p?.hospital_id).order('codigo'),
      supabase.rpc('generar_codigo_informe', { tipo_inf: 'historial_auditorias' })
    ])
    setAuditores(auds || [])
    setCarros(cars || [])
    setCodigo(cod || '')

    await buscar({ auditor: '', carro: '', resultado: '', desde: '', hasta: '' }, p?.hospital_id)
    setLoading(false)
  }

  async function buscar(f: typeof filtros, hospitalId?: string) {
    const hId = hospitalId || perfil?.hospital_id
    // El hospital se filtra EN LA CONSULTA, no despues.
    //
    // Antes se pedian 200 inspecciones de cualquier centro y se descartaban en
    // el navegador las de los demas. Con dos hospitales en marcha eso significa
    // que un informe podia salir con la mitad de sus controles, o con ninguno,
    // sin avisar de nada: las 200 se las habia llevado el otro centro. El
    // informe parecia correcto y estaba incompleto.
    //
    // El !inner obliga a que la union con carros filtre de verdad; sin el,
    // PostgREST devuelve la inspeccion igual con el carro a null.
    let q = supabase.from('inspecciones')
      .select('*, carros!inner(codigo,nombre,ubicacion,responsable,hospital_id,servicios(nombre)), perfiles(nombre)')
      .order('fecha', { ascending: false })
      .limit(500)

    if (hId) q = q.eq('carros.hospital_id', hId)

    if (f.auditor) q = q.eq('auditor_id', f.auditor)
    if (f.carro) q = q.eq('carro_id', f.carro)
    if (f.resultado) q = q.eq('resultado', f.resultado)
    if (f.desde) q = q.gte('fecha', f.desde)
    if (f.hasta) q = q.lte('fecha', f.hasta + 'T23:59:59')

    const { data } = await q
    setDatos(data || [])
    // Si vienen justo las 500, el informe esta recortado y hay que decirlo:
    // un informe incompleto que parece completo es peor que no tenerlo.
    setRecortado((data?.length ?? 0) >= 500)
  }

  function updateFiltro(campo: string, valor: string) {
    const nf = { ...filtros, [campo]: valor }
    setFiltros(nf)
    buscar(nf)
  }

  async function generarPDF() {
    const fecha = new Date().toLocaleDateString('es-ES')
    const nombreHospital = hospital?.nombre || 'Hospital'
    const headerHTML = informeHeaderHTML({
      hospital: hospital || { nombre: nombreHospital },
      hospitalConfig,
      plantillaInforme,
      tipoDocumento: 'HISTORIAL DE AUDITORÍAS',
      codigo,
      fecha,
      pagina: '1 de 1',
    })
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 2cm; color: #1e293b; font-size: 10px; }
  .meta-info { font-size: 10px; color: #64748b; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1d4ed8; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge-op { background:#dcfce7; color:#166534; padding:1px 6px; border-radius:8px; }
  .badge-cond { background:#fef9c3; color:#854d0e; padding:1px 6px; border-radius:8px; }
  .badge-nop { background:#fee2e2; color:#991b1b; padding:1px 6px; border-radius:8px; }
  .sin-datos { text-align: center; padding: 40px 20px; border: 1px dashed #e2e8f0; border-radius: 8px; margin-top: 10px; color: #64748b; }
  .footer { margin-top: 30px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { @page { margin: 1.5cm; size: landscape; } }
</style></head><body>
${headerHTML}
<div class="meta-info">
  Total: <strong>${datos.length}</strong> registros ·
  ${filtros.desde ? `Desde: <strong>${filtros.desde}</strong> · ` : ''}${filtros.hasta ? `Hasta: <strong>${filtros.hasta}</strong> · ` : ''}
  Resultado: <strong>${filtros.resultado || 'Todos'}</strong> · Por: <strong>${perfil?.nombre || ''}</strong>
</div>
${datos.length === 0 ? `
<div class="sin-datos">
  <div style="font-size:15px;font-weight:bold;margin-bottom:8px;">Sin registros</div>
  <div style="font-size:12px;">No se encontraron auditorías para los filtros seleccionados.</div>
</div>
` : `
<table>
  <thead><tr>
    <th>Fecha y hora</th><th>Carro</th><th>Servicio</th><th>Tipo</th><th>Resultado</th><th>Auditor</th><th>Firma</th>
  </tr></thead>
  <tbody>
    ${datos.map(ins => {
      const r = ins.resultado
      const badge = r === 'operativo' ? 'badge-op' : r === 'condicional' ? 'badge-cond' : 'badge-nop'
      const label = r === 'operativo' ? 'Operativo' : r === 'condicional' ? 'Condicional' : 'No operativo'

      // Estado de la firma. Que una inspección haya sido enmendada tiene que
      // constar en el documento impreso: es el que se le enseña a un auditor
      // externo, y verlo solo dentro de la app no sirve de nada allí.
      const i = ins as any
      const firma = !i.firmado_en
        ? '<span style="color:#9ca3af">Sin firmar</span>'
        : i.modificado_en
          ? `Firmada ${new Date(i.firmado_en).toLocaleDateString('es-ES')}`
            + `<br><span style="color:#b45309;font-weight:600">Modificada `
            + `${new Date(i.modificado_en).toLocaleDateString('es-ES')}`
            + (i.veces_reabierta > 1 ? ` (${i.veces_reabierta}×)` : '')
            + '</span>'
          : `Firmada ${new Date(i.firmado_en).toLocaleDateString('es-ES')}`

      return `<tr>
        <td>${new Date(ins.fecha).toLocaleString('es-ES')}</td>
        <td><strong>${ins.carros?.codigo}</strong></td>
        <td>${ins.carros?.servicios?.nombre || '—'}</td>
        <td>${ins.tipo?.replace('_', ' ')}</td>
        <td><span class="${badge}">${label}</span></td>
        <td>${ins.perfiles?.nombre || '—'}</td>
        <td style="font-size:11px">${firma}</td>
      </tr>`
    }).join('')}
  </tbody>
</table>
`}
<div class="footer">${nombreHospital} · Plataforma ÁSTOR · Desarrollado por CRITIC SL — Servicios Médicos</div>
</body></html>`
    const nombre = nombreArchivoPDF(codigo, 'historial_auditorias')
    await descargarPDF(html, nombre)
  }

  function generarExcel() {
    const nombreHospital = hospital?.nombre || 'Hospital'
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
    const nombreHospital = hospital?.nombre || 'Hospital'
    const texto = datos.length === 0
      ? `*Historial Auditorías - ${codigo}*\n${nombreHospital}\n\nSin registros para los filtros seleccionados a fecha ${new Date().toLocaleDateString('es-ES')}`
      : `*Historial Auditorías - ${codigo}*\n${nombreHospital}\nTotal: ${datos.length} controles\n\n${datos.slice(0, 10).map(ins => `• ${new Date(ins.fecha).toLocaleDateString('es-ES')} · ${ins.carros?.codigo} · ${ins.tipo?.replace('_', ' ')} · ${ins.resultado}`).join('\n')}${datos.length > 10 ? `\n...y ${datos.length - 10} más` : ''}`
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
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">{hospital?.nombre || 'Hospital'}</span>
        <span className="font-semibold text-sm text-right">Historial</span>
      </div>
      <div className="content">
        {/* Un informe recortado que parece completo es peor que no tenerlo:
            quien lo firma cree que ahi esta todo lo del periodo. */}
        {recortado && (
          <div className="card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
            <div className="text-xs" style={{ color: '#92400e' }}>
              <strong>Este informe esta recortado.</strong> Se muestran los 500
              controles mas recientes que cumplen los filtros. Acota las fechas
              para que salga el periodo entero.
            </div>
          </div>
        )}
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
          <div className="text-sm font-semibold text-blue-800">
            {datos.length} registro{datos.length !== 1 ? 's' : ''} encontrado{datos.length !== 1 ? 's' : ''}
          </div>
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
          <button className="btn-primary" onClick={generarPDF}>⬇ Descargar PDF</button>
          <button className="btn-secondary" onClick={generarExcel}>Excel</button>
          <button className="btn-secondary" onClick={compartir}>Compartir</button>
        </div>
      </div>
    </div>
  )
}

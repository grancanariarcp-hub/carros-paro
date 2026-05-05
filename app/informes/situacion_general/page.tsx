'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { informeHeaderHTML } from '@/components/InformeHeader'
import { estadoColor, formatFecha, diasHastaControl } from '@/lib/utils'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'


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

export default function InformeSituacionGeneralPage() {
  const [carros, setCarros] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [hospitalConfig, setHospitalConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codigo, setCodigo] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
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
      const [{ data: h }, { data: cfg }] = await Promise.all([
        supabase.from('hospitales').select('*').eq('id', p.hospital_id).single(),
        supabase.from('hospital_config').select('*').eq('hospital_id', p.hospital_id).maybeSingle(),
      ])
      setHospital(h)
      setHospitalConfig(cfg)
    }
    const { data: cod } = await supabase.rpc('generar_codigo_informe', { tipo_inf: 'situacion_general' })
    setCodigo(cod || '')
    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)')
      .eq('activo', true)
      .eq('hospital_id', p?.hospital_id)
      .order('codigo')
    setCarros(c || [])
    setLoading(false)
  }

  const tiposCarro = Array.from(new Set(carros.map(c => c.tipo_carro).filter(Boolean)))

  const carrosFiltrados = carros.filter(c => {
    const matchTipo = filtroTipo === 'todos' || c.tipo_carro === filtroTipo
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
    return matchTipo && matchEstado
  })

  const stats = {
    total: carrosFiltrados.length,
    operativos: carrosFiltrados.filter(c => c.estado === 'operativo').length,
    condicionales: carrosFiltrados.filter(c => c.estado === 'condicional').length,
    no_operativos: carrosFiltrados.filter(c => c.estado === 'no_operativo').length,
    sin_control: carrosFiltrados.filter(c => !c.ultimo_control).length,
    controles_vencidos: carrosFiltrados.filter(c => {
      const dias = diasHastaControl(c.proximo_control)
      return dias !== null && dias < 0
    }).length,
  }

  async function generarPDF() {
    const fecha = new Date().toLocaleDateString('es-ES')
    const nombreHospital = hospital?.nombre || 'Hospital'
    const headerHTML = informeHeaderHTML({
      hospital: hospital || { nombre: nombreHospital },
      hospitalConfig,
      tipoDocumento: 'INFORME DE SITUACIÓN GENERAL',
      codigo,
      fecha,
      pagina: '1 de 1',
    })
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;margin:2cm;color:#1e293b;font-size:11px}
  .meta-info{font-size:10px;color:#64748b;margin-bottom:16px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
  .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center}
  .kpi-num{font-size:24px;font-weight:bold;line-height:1}
  .kpi-label{font-size:10px;color:#64748b;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#1d4ed8;color:white;padding:7px 8px;text-align:left}
  td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even) td{background:#f8fafc}
  .badge-op{background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-weight:bold}
  .badge-cond{background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:10px;font-weight:bold}
  .badge-nop{background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-weight:bold}
  .badge-sc{background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:10px;font-weight:bold}
  .footer{margin-top:30px;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}
  @media print{@page{margin:1.5cm;size:landscape}}
</style></head><body>
${headerHTML}
<div class="meta-info">
  Tipo: <strong>${filtroTipo === 'todos' ? 'Todos' : filtroTipo.replace('_',' ')}</strong> ·
  Estado: <strong>${filtroEstado === 'todos' ? 'Todos' : filtroEstado.replace('_',' ')}</strong> ·
  Total: <strong>${carrosFiltrados.length}</strong> carros · Por: <strong>${perfil?.nombre || ''}</strong>
</div>
<div class="kpis">
  <div class="kpi"><div class="kpi-num" style="color:#16a34a">${stats.operativos}</div><div class="kpi-label">Operativos</div></div>
  <div class="kpi"><div class="kpi-num" style="color:#d97706">${stats.condicionales}</div><div class="kpi-label">Condicionales</div></div>
  <div class="kpi"><div class="kpi-num" style="color:#dc2626">${stats.no_operativos}</div><div class="kpi-label">No operativos</div></div>
  <div class="kpi"><div class="kpi-num" style="color:#dc2626">${stats.controles_vencidos}</div><div class="kpi-label">Controles vencidos</div></div>
  <div class="kpi"><div class="kpi-num" style="color:#475569">${stats.sin_control}</div><div class="kpi-label">Sin control previo</div></div>
  <div class="kpi"><div class="kpi-num" style="color:#1d4ed8">${stats.total}</div><div class="kpi-label">Total carros</div></div>
</div>
<table>
  <thead><tr>
    <th>Código</th><th>Nombre</th><th>Tipo</th><th>Servicio</th><th>Ubicación</th><th>Estado</th><th>Último control</th><th>Próximo control</th>
  </tr></thead>
  <tbody>
    ${carrosFiltrados.map(c => {
      const dias = diasHastaControl(c.proximo_control)
      const controlVencido = dias !== null && dias < 0
      const estadoBadge = c.estado === 'operativo' ? 'badge-op' : c.estado === 'condicional' ? 'badge-cond' : c.estado === 'no_operativo' ? 'badge-nop' : 'badge-sc'
      const estadoLabel = c.estado === 'operativo' ? 'Operativo' : c.estado === 'condicional' ? 'Condicional' : c.estado === 'no_operativo' ? 'No operativo' : 'Sin control'
      return `<tr>
        <td><strong>${c.codigo}</strong></td>
        <td>${c.nombre}</td>
        <td>${c.tipo_carro?.replace('_',' ') || '—'}</td>
        <td>${c.servicios?.nombre || '—'}</td>
        <td>${c.ubicacion || '—'}</td>
        <td><span class="${estadoBadge}">${estadoLabel}</span></td>
        <td>${c.ultimo_control ? new Date(c.ultimo_control).toLocaleDateString('es-ES') : '—'}</td>
        <td style="${controlVencido ? 'color:#dc2626;font-weight:bold' : ''}">${c.proximo_control ? new Date(c.proximo_control).toLocaleDateString('es-ES') : '—'}${controlVencido ? ' ⚠️' : ''}</td>
      </tr>`
    }).join('')}
  </tbody>
</table>
<div class="footer">${nombreHospital} · Plataforma ÁSTOR · Desarrollado por CRITIC SL — Servicios Médicos</div>
</body></html>`
    const nombre = nombreArchivoPDF(codigo, 'situacion_general')
    await descargarPDF(html, nombre)
  }

  async function compartir() {
    const nombreHospital = hospital?.nombre || 'Hospital'
    const texto = `*Situación General - ${codigo}*\n${nombreHospital}\n${new Date().toLocaleDateString('es-ES')}\n\n✅ Operativos: ${stats.operativos}\n⚠️ Condicionales: ${stats.condicionales}\n🚨 No operativos: ${stats.no_operativos}\n📅 Controles vencidos: ${stats.controles_vencidos}\nTotal: ${stats.total} carros`
    if (navigator.share) { await navigator.share({ title: `Informe ${codigo}`, text: texto }) }
    else { await navigator.clipboard.writeText(texto); toast.success('Copiado al portapapeles') }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">{hospital?.nombre || 'Hospital'}</span>
        <span className="font-semibold text-sm text-right">Situación general</span>
      </div>
      <div className="content">
        <div className="card">
          <label className="label">Código del informe (editable)</label>
          <input className="input" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-green-700">{stats.operativos}</div>
            <div className="text-xs text-gray-500 mt-0.5">Operativos</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-amber-600">{stats.condicionales}</div>
            <div className="text-xs text-gray-500 mt-0.5">Condicionales</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-red-700">{stats.no_operativos}</div>
            <div className="text-xs text-gray-500 mt-0.5">No operativos</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-red-600">{stats.controles_vencidos}</div>
            <div className="text-xs text-gray-500 mt-0.5">Ctrl. vencidos</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-gray-500">{stats.sin_control}</div>
            <div className="text-xs text-gray-500 mt-0.5">Sin control</div>
          </div>
          <div className="card text-center p-3">
            <div className="text-xl font-bold text-blue-700">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="card">
          <div className="section-title mb-2">Filtrar por estado</div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {([['todos','Todos'],['operativo','Operativos'],['condicional','Condicionales'],['no_operativo','No operativos']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setFiltroEstado(val)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroEstado === val ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>
          {tiposCarro.length > 0 && <>
            <div className="section-title mb-2">Filtrar por tipo</div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setFiltroTipo('todos')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === 'todos' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
                Todos los tipos
              </button>
              {tiposCarro.map(t => (
                <button key={t} onClick={() => setFiltroTipo(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipo === t ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
                  {t.replace('_',' ')}
                </button>
              ))}
            </div>
          </>}
        </div>

        {/* Lista de carros */}
        <div className="card">
          <div className="section-title mb-3">
            {carrosFiltrados.length} carro{carrosFiltrados.length !== 1 ? 's' : ''}
            {carrosFiltrados.length !== carros.length ? ` de ${carros.length}` : ''}
          </div>
          {carrosFiltrados.map(c => {
            const e = estadoColor(c.estado)
            const dias = diasHastaControl(c.proximo_control)
            const controlVencido = dias !== null && dias < 0
            return (
              <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                  <div className="text-xs flex items-center gap-1">
                    <span className="text-gray-400">{c.servicios?.nombre || c.ubicacion || '—'}</span>
                    {c.tipo_carro && <span className="text-gray-300">·</span>}
                    {c.tipo_carro && <span className="text-gray-400">{c.tipo_carro.replace('_',' ')}</span>}
                    {controlVencido && <span className="text-red-600 font-semibold">· Control vencido</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
                  {c.proximo_control && (
                    <span className={`text-xs ${controlVencido ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                      {formatFecha(c.proximo_control)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={generarPDF}>⬇ Descargar PDF</button>
          <button className="btn-secondary" onClick={compartir}>Compartir</button>
        </div>
      </div>
    </div>
  )
}

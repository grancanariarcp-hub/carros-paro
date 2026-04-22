'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { formatFecha } from '@/lib/utils'
import toast from 'react-hot-toast'

function nombreArchivoPDF(codigo: string, tipo: string): string {
  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-ES').replace(/\//g, '-')
  const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }).replace(':', '-')
  const tipoLimpio = tipo.replace(/ /g, '_').toLowerCase()
  return `${codigo}_${tipoLimpio}_${fecha}_${hora}.pdf`
}

async function descargarPDF(html: string, nombreArchivo: string) {
  // Inyectar el título con el nombre del archivo para que el navegador lo use al guardar
  const htmlConTitulo = html.replace('<head>', `<head><title>${nombreArchivo.replace('.pdf','')}</title>`)
  const v = window.open('', '_blank')
  if (v) {
    v.document.write(htmlConTitulo)
    v.document.close()
    v.onload = () => {
      v.focus()
      v.print()
    }
  }
}

export default function InformeControlesVencidosPage() {
  const [datos, setDatos] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codigo, setCodigo] = useState('')
  const [servicio, setServicio] = useState('')
  const [servicios, setServicios] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)

    if (p?.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }

    const { data: svcs } = await supabase.from('servicios').select('*').eq('activo', true).order('nombre')
    setServicios(svcs || [])

    const { data: cod } = await supabase.rpc('generar_codigo_informe', { tipo_inf: 'controles_vencidos' })
    setCodigo(cod || '')

    await buscar('', p?.hospital_id)
    setLoading(false)
  }

  async function buscar(svc: string, hospitalId?: string) {
    const hId = hospitalId || perfil?.hospital_id
    let q = supabase.from('carros')
      .select('*, servicios(nombre)')
      .eq('activo', true)
      .lt('proximo_control', new Date().toISOString().split('T')[0])
      .order('proximo_control', { ascending: true })

    if (hId) q = q.eq('hospital_id', hId)
    if (svc) q = q.eq('servicio_id', svc)
    const { data } = await q
    setDatos(data || [])
  }

  function diasRetraso(fecha: string): number {
    return Math.floor((new Date().getTime() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24))
  }

  function generarHTML(): string {
    const fecha = new Date().toLocaleDateString('es-ES')
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    const nombreHospital = hospital?.nombre || 'Hospital'
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #1e293b; }
  .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; display: flex; align-items: flex-start; gap: 16px; }
  .header-logo { max-height: 48px; object-fit: contain; }
  .header-text { flex: 1; }
  .hospital { font-size: 14px; font-weight: bold; color: #1d4ed8; }
  .titulo { font-size: 18px; font-weight: bold; margin: 6px 0 2px; }
  .codigo { font-size: 11px; color: #64748b; }
  .meta { display: flex; gap: 20px; font-size: 11px; color: #64748b; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1d4ed8; color: white; padding: 8px; text-align: left; }
  td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge-red { background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 10px; font-weight: bold; }
  .sin-datos { text-align: center; padding: 40px 20px; border: 1px dashed #e2e8f0; border-radius: 8px; color: #64748b; }
  .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style></head><body>
<div class="header">
  ${hospital?.logo_url ? `<img class="header-logo" src="${hospital.logo_url}" alt="${nombreHospital}" />` : ''}
  <div class="header-text">
    <div class="hospital">${nombreHospital}</div>
    <div class="titulo">Informe de Controles Vencidos</div>
    <div class="codigo">Código: ${codigo} · Generado: ${fecha} ${hora} · Por: ${perfil?.nombre}</div>
  </div>
</div>
<div class="meta">
  <span>Total carros vencidos: <strong>${datos.length}</strong></span>
  <span>Servicio: <strong>${servicio ? servicios.find((s: any) => s.id === servicio)?.nombre : 'Todos'}</strong></span>
</div>
${datos.length === 0 ? `
<div class="sin-datos">
  <div style="font-size:15px;font-weight:bold;color:#16a34a;margin-bottom:8px">✓ Sin controles vencidos</div>
  <div style="font-size:12px">No se encontraron carros con controles vencidos.</div>
</div>
` : `
<table>
  <thead><tr>
    <th>Código</th><th>Nombre</th><th>Servicio</th><th>Ubicación</th><th>Responsable</th><th>Fecha prevista</th><th>Días retraso</th>
  </tr></thead>
  <tbody>
    ${datos.map((c: any) => `<tr>
      <td><strong>${c.codigo}</strong></td>
      <td>${c.nombre}</td>
      <td>${c.servicios?.nombre || '—'}</td>
      <td>${c.ubicacion || '—'}</td>
      <td>${c.responsable || '—'}</td>
      <td>${formatFecha(c.proximo_control)}</td>
      <td><span class="badge-red">${diasRetraso(c.proximo_control)} días</span></td>
    </tr>`).join('')}
  </tbody>
</table>
`}
<div class="footer">${nombreHospital} · Plataforma ÁSTOR · Desarrollado por CRITIC SL — Servicios Médicos</div>
</body></html>`
  }

  async function generarPDF() {
    const html = generarHTML()
    const nombre = nombreArchivoPDF(codigo, 'controles_vencidos')
    await descargarPDF(html, nombre)
  }

  async function compartir() {
    const nombreHospital = hospital?.nombre || 'Hospital'
    const texto = datos.length === 0
      ? `*Informe Controles Vencidos - ${codigo}*\n${nombreHospital}\n\n✓ Sin controles vencidos a fecha ${new Date().toLocaleDateString('es-ES')}`
      : `*Informe Controles Vencidos - ${codigo}*\n${nombreHospital}\n\n${datos.map((c: any) => `• ${c.codigo} - ${c.nombre}: ${diasRetraso(c.proximo_control)} días de retraso`).join('\n')}`
    if (navigator.share) {
      await navigator.share({ title: `Informe ${codigo}`, text: texto })
    } else {
      await navigator.clipboard.writeText(texto)
      toast.success('Texto copiado al portapapeles')
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">{hospital?.nombre || 'Hospital'}</span>
        <span className="font-semibold text-sm text-right">Controles vencidos</span>
      </div>
      <div className="content">
        <div className="card">
          <label className="label">Código del informe (editable)</label>
          <input className="input" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </div>

        <div className="card">
          <div className="section-title mb-3">Filtros</div>
          <div>
            <label className="label">Servicio</label>
            <select className="input" value={servicio} onChange={e => { setServicio(e.target.value); buscar(e.target.value) }}>
              <option value="">Todos los servicios</option>
              {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="card bg-red-50 border-red-200">
          <div className="text-sm font-semibold text-red-800">{datos.length} carro{datos.length !== 1 ? 's' : ''} con control vencido</div>
          <div className="text-xs text-red-600 mt-1">Ordenados por fecha más atrasada primero</div>
        </div>

        {datos.map(c => {
          const dias = diasRetraso(c.proximo_control)
          return (
            <div key={c.id} className="card border-red-100">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-sm">{c.codigo}</div>
                  <div className="text-xs text-gray-500">{c.nombre}</div>
                </div>
                <span className="badge bg-red-100 text-red-800 text-xs">{dias} días de retraso</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Servicio: </span>{c.servicios?.nombre || '—'}</div>
                <div><span className="text-gray-400">Ubicación: </span>{c.ubicacion || '—'}</div>
                <div><span className="text-gray-400">Responsable: </span>{c.responsable || '—'}</div>
                <div><span className="text-gray-400">Fecha prevista: </span>{formatFecha(c.proximo_control)}</div>
              </div>
            </div>
          )
        })}

        {datos.length === 0 && (
          <div className="card text-center py-8">
            <div className="text-green-600 font-semibold text-sm">✓ No hay controles vencidos</div>
            <div className="text-xs text-gray-400 mt-1">Todos los carros están al día</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={generarPDF}>⬇ Descargar PDF</button>
          <button className="btn-secondary" onClick={compartir}>Compartir</button>
        </div>
      </div>
    </div>
  )
}

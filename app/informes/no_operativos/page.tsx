'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { formatFechaHora } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function InformeNoOperativosPage() {
  const [datos, setDatos] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codigo, setCodigo] = useState('')
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

    const { data: cod } = await supabase.rpc('generar_codigo_informe', { tipo_inf: 'no_operativos' })
    setCodigo(cod || '')

    await buscar('')
    setLoading(false)
  }

  async function buscar(svc: string) {
    let q = supabase.from('carros')
      .select('*, servicios(nombre)')
      .eq('activo', true)
      .eq('estado', 'no_operativo')
      .order('codigo')

    if (svc) q = q.eq('servicio_id', svc)
    const { data: carrosNop } = await q

    // Para cada carro no operativo cargar su última inspección con fallos graves y fotos
    const resultado = []
    for (const c of (carrosNop || [])) {
      const { data: insp } = await supabase.from('inspecciones')
        .select('*, perfiles(nombre)')
        .eq('carro_id', c.id)
        .eq('resultado', 'no_operativo')
        .order('fecha', { ascending: false })
        .limit(5)

      // Cargar items con fotos del último control no operativo
      let itemsFallos: any[] = []
      if (insp && insp.length > 0) {
        const { data: items } = await supabase.from('items_inspeccion')
          .select('*, materiales(nombre)')
          .eq('inspeccion_id', insp[0].id)
          .eq('tiene_falla', true)
        itemsFallos = items || []
      }

      resultado.push({ carro: c, inspecciones: insp || [], itemsFallos })
    }
    setDatos(resultado)
  }

  function generarPDF() {
    const fecha = new Date().toLocaleDateString('es-ES')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; margin: 2cm; color: #1e293b; font-size: 11px; }
  .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; }
  .hospital { font-size: 14px; font-weight: bold; color: #1d4ed8; }
  .titulo { font-size: 18px; font-weight: bold; margin: 6px 0 2px; }
  .codigo { font-size: 10px; color: #64748b; }
  .carro-block { margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
  .carro-header { background: #dc2626; color: white; padding: 10px 14px; }
  .carro-body { padding: 12px 14px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px; margin-bottom: 12px; }
  .fallo-item { background: #fee2e2; border-left: 3px solid #dc2626; padding: 6px 10px; margin-bottom: 6px; border-radius: 0 4px 4px 0; }
  .hist-item { font-size: 10px; color: #64748b; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
  .foto { max-width: 200px; max-height: 150px; border-radius: 6px; margin-top: 6px; }
  .footer { margin-top: 30px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { @page { margin: 1.5cm; } }
</style></head><body>
<div class="header">
  <div class="hospital">Hospital Universitario de Gran Canaria Doctor Negrín</div>
  <div class="titulo">Informe de Carros No Operativos</div>
  <div class="codigo">Código: ${codigo} · Generado: ${fecha} · Por: ${perfil?.nombre} · Total: ${datos.length} carro${datos.length !== 1 ? 's' : ''}</div>
</div>
${datos.map(({ carro, inspecciones, itemsFallos }) => `
<div class="carro-block">
  <div class="carro-header">
    <strong>🚨 ${carro.codigo}</strong> — ${carro.nombre} · NO OPERATIVO
  </div>
  <div class="carro-body">
    <div class="meta">
      <div><strong>Servicio:</strong> ${carro.servicios?.nombre || '—'}</div>
      <div><strong>Ubicación:</strong> ${carro.ubicacion || '—'}</div>
      <div><strong>Responsable:</strong> ${carro.responsable || '—'}</div>
      <div><strong>Último control:</strong> ${carro.ultimo_control ? new Date(carro.ultimo_control).toLocaleString('es-ES') : '—'}</div>
    </div>
    <div style="font-weight:bold; margin-bottom:8px; color:#dc2626;">Fallos graves detectados:</div>
    ${itemsFallos.filter(i => i.tipo_falla === 'grave').map(i => `
      <div class="fallo-item">
        <strong>${i.materiales?.nombre || '—'}</strong>
        ${i.descripcion_falla ? `<br>${i.descripcion_falla}` : ''}
        ${i.foto_url ? `<br><img class="foto" src="${i.foto_url}" alt="evidencia"/>` : ''}
      </div>
    `).join('')}
    <div style="font-weight:bold; margin: 12px 0 6px; color:#64748b;">Historial de estados no operativos:</div>
    ${inspecciones.map(ins => `
      <div class="hist-item">
        ${new Date(ins.fecha).toLocaleString('es-ES')} · ${ins.tipo?.replace('_', ' ')} · Auditor: ${ins.perfiles?.nombre || '—'}
      </div>
    `).join('')}
  </div>
</div>`).join('')}
<div class="footer">Hospital Universitario de Gran Canaria Doctor Negrín · Sistema Auditor Carros de Parada · GranCanariaRCP · Dr. Lübbe</div>
</body></html>`
    const v = window.open('', '_blank')
    if (v) { v.document.write(html); v.document.close(); v.onload = () => v.print() }
  }

  async function compartir() {
    const texto = `*Informe Carros No Operativos - ${codigo}*\nH.U. Gran Canaria Doctor Negrín\n\n${datos.map(({ carro, itemsFallos }) =>
      `🚨 *${carro.codigo}* - ${carro.servicios?.nombre || '—'}\nFallos graves: ${itemsFallos.filter((i: any) => i.tipo_falla === 'grave').map((i: any) => i.materiales?.nombre).join(', ')}`
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
        <span className="font-semibold text-sm flex-1 text-right">Carros no operativos</span>
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
            <select className="input" value={servicio}
              onChange={e => { setServicio(e.target.value); buscar(e.target.value) }}>
              <option value="">Todos los servicios</option>
              {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="card bg-red-50 border-red-200">
          <div className="text-sm font-semibold text-red-800">{datos.length} carro{datos.length !== 1 ? 's' : ''} no operativo{datos.length !== 1 ? 's' : ''}</div>
        </div>

        {datos.map(({ carro, inspecciones, itemsFallos }) => (
          <div key={carro.id} className="card border-red-200">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-sm text-red-700">{carro.codigo}</div>
                <div className="text-xs text-gray-500">{carro.nombre}</div>
              </div>
              <span className="badge bg-red-100 text-red-800">No operativo</span>
            </div>

            <div className="grid grid-cols-2 gap-1 text-xs mb-3">
              <div><span className="text-gray-400">Servicio: </span>{carro.servicios?.nombre || '—'}</div>
              <div><span className="text-gray-400">Ubicación: </span>{carro.ubicacion || '—'}</div>
              <div><span className="text-gray-400">Responsable: </span>{carro.responsable || '—'}</div>
              <div><span className="text-gray-400">Último control: </span>{formatFechaHora(carro.ultimo_control)}</div>
            </div>

            {itemsFallos.filter((i: any) => i.tipo_falla === 'grave').length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-red-700 mb-2">Fallos graves:</div>
                {itemsFallos.filter((i: any) => i.tipo_falla === 'grave').map((i: any) => (
                  <div key={i.id} className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-xs font-semibold">{i.materiales?.nombre}</div>
                    {i.descripcion_falla && <div className="text-xs text-gray-500 mt-0.5">{i.descripcion_falla}</div>}
                    {i.foto_url && (
                      <img src={i.foto_url} alt="evidencia"
                        className="mt-2 w-full h-28 object-cover rounded-lg border border-red-200" />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-gray-500 mb-2">Historial de estados no operativos:</div>
              {inspecciones.map((ins: any) => (
                <div key={ins.id} className="text-xs text-gray-400 py-1 border-b border-gray-50 last:border-0">
                  {formatFechaHora(ins.fecha)} · {ins.tipo?.replace('_', ' ')} · {ins.perfiles?.nombre}
                </div>
              ))}
            </div>
          </div>
        ))}

        {datos.length === 0 && (
          <div className="card text-center py-8">
            <div className="text-green-600 font-semibold text-sm">✓ No hay carros no operativos</div>
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

// supabase/functions/informe-mensual/index.ts
// Informe ejecutivo mensual via Resend
// Cron: día 1 de cada mes a las 8:00 UTC

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'contacto@astormanager.com'
const FROM_NAME      = Deno.env.get('FROM_NAME')  || 'ÁSTOR by CRITIC SL'
const APP_URL        = Deno.env.get('APP_URL')    || 'https://app.astormanager.com'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// =====================================================================
// Handler
// =====================================================================
Deno.serve(async () => {
  try {
    const ahora   = new Date()
    const inicio  = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString()
    const fin     = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59).toISOString()
    const labelMes = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
      .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

    console.log(`[informe-mensual] ${labelMes}`)

    const { data: hospitales } = await supabase
      .from('hospitales').select('id, nombre, color_primario').eq('activo', true)

    let enviados = 0

    for (const h of (hospitales || [])) {
      const datos = await getDatos(h.id, inicio, fin)

      // Administradores
      const { data: admins } = await supabase.from('perfiles')
        .select('nombre, email, email_alertas')
        .eq('hospital_id', h.id).eq('rol', 'administrador').eq('activo', true)

      for (const u of (admins || [])) {
        const to = u.email_alertas || u.email
        if (!to) continue
        await enviar(to, `Informe mensual ${labelMes} · ${h.nombre}`,
          htmlInforme({ color: h.color_primario || '#1d4ed8', datos, nombre: u.nombre, labelMes, ambito: 'Hospital completo', panelUrl: `${APP_URL}/admin` }))
        enviados++
      }

      // Supervisores
      const { data: supervisores } = await supabase.from('perfiles')
        .select('nombre, email, email_alertas, servicio_id, servicios(nombre)')
        .eq('hospital_id', h.id).eq('rol', 'supervisor').eq('activo', true)

      for (const u of (supervisores || [])) {
        const to = u.email_alertas || u.email
        if (!to || !u.servicio_id) continue
        const dSv = await getDatosServicio(h.id, u.servicio_id, inicio, fin)
        const svNombre = (u.servicios as any)?.nombre || 'tu servicio'
        await enviar(to, `Informe mensual ${labelMes} · ${svNombre}`,
          htmlInforme({ color: h.color_primario || '#1d4ed8', datos: dSv, nombre: u.nombre, labelMes, ambito: svNombre, panelUrl: `${APP_URL}/supervisor` }))
        enviados++
      }
    }

    // Superadmins
    const { data: superadmins } = await supabase.from('perfiles')
      .select('nombre, email, email_alertas').eq('rol', 'superadmin').eq('activo', true)

    for (const u of (superadmins || [])) {
      const to = u.email_alertas || u.email
      if (!to) continue
      const resumen = await getResumenGlobal((hospitales || []).map(h => h.id), inicio, fin)
      await enviar(to, `Informe global ${labelMes} · Todos los hospitales`,
        htmlGlobal({ hospitales: hospitales || [], resumen, nombre: u.nombre, labelMes, appUrl: APP_URL }))
      enviados++
    }

    return new Response(JSON.stringify({ ok: true, enviados, mes: labelMes }),
      { headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error('[informe-mensual] ERROR:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

// =====================================================================
// Resend
// =====================================================================
async function enviar(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [to], subject, html }),
  })
  if (!res.ok) console.error(`[resend] Error ${to}:`, await res.text())
  else console.log(`[resend] ✓ ${to}`)
}

// =====================================================================
// Datos
// =====================================================================
async function getDatos(hospitalId: string, inicio: string, fin: string) {
  const { data: carros } = await supabase.from('carros')
    .select('id, estado').eq('hospital_id', hospitalId).eq('activo', true)
  const ids = carros?.map(c => c.id) || []
  const { data: insp } = await supabase.from('inspecciones')
    .select('resultado').gte('fecha', inicio).lte('fecha', fin)
    .in('carro_id', ids.length ? ids : ['none'])
  const { data: equipos } = await supabase.from('equipos')
    .select('fecha_proximo_mantenimiento').eq('hospital_id', hospitalId).eq('activo', true)
  const { data: alertas } = await supabase.from('alertas')
    .select('severidad, resuelta').eq('hospital_id', hospitalId)
    .gte('creado_en', inicio).lte('creado_en', fin)
  return calcular(carros || [], insp || [], equipos || [], alertas || [])
}

async function getDatosServicio(hospitalId: string, servicioId: string, inicio: string, fin: string) {
  const { data: carros } = await supabase.from('carros')
    .select('id, estado').eq('hospital_id', hospitalId).eq('servicio_id', servicioId).eq('activo', true)
  const ids = carros?.map(c => c.id) || []
  const { data: insp } = await supabase.from('inspecciones')
    .select('resultado').gte('fecha', inicio).lte('fecha', fin)
    .in('carro_id', ids.length ? ids : ['none'])
  return calcular(carros || [], insp || [], [], [])
}

async function getResumenGlobal(ids: string[], inicio: string, fin: string) {
  let totalCarros = 0, totalInsp = 0, sumCumpl = 0, conProblemas = 0
  for (const id of ids) {
    const d = await getDatos(id, inicio, fin)
    totalCarros += d.totalCarros; totalInsp += d.totalInspecciones
    sumCumpl += d.cumplimiento
    if (d.carrosNoOperativos > 0 || d.alertasCriticas > 0) conProblemas++
  }
  return { totalCarros, totalInspecciones: totalInsp, totalHospitales: ids.length,
    cumplimientoMedio: ids.length ? Math.round(sumCumpl / ids.length) : 0, hospitalesConProblemas: conProblemas }
}

function calcular(carros: any[], insp: any[], equipos: any[], alertas: any[]) {
  const hoy = new Date()
  const total = carros.length
  const operativos = carros.filter(c => c.estado === 'operativo').length
  const noOp = carros.filter(c => c.estado === 'no_operativo').length
  const totalInsp = insp.length
  const ok = insp.filter(i => i.resultado === 'operativo').length
  const cumpl = totalInsp > 0 ? Math.round((ok / totalInsp) * 100) : 0
  const mantVencido = equipos.filter(e => e.fecha_proximo_mantenimiento && new Date(e.fecha_proximo_mantenimiento) < hoy).length
  const mantProximo = equipos.filter(e => {
    if (!e.fecha_proximo_mantenimiento) return false
    const d = Math.ceil((new Date(e.fecha_proximo_mantenimiento).getTime() - hoy.getTime()) / 86400000)
    return d >= 0 && d <= 30
  }).length
  return {
    totalCarros: total, carrosOperativos: operativos, carrosNoOperativos: noOp,
    totalInspecciones: totalInsp, inspeccionesOk: ok, inspeccionesConFallo: totalInsp - ok,
    cumplimiento: cumpl, equiposMantVencido: mantVencido, equiposMantProximo: mantProximo,
    alertasCriticas: alertas.filter(a => ['critica','alta'].includes(a.severidad)).length,
    alertasResueltas: alertas.filter(a => a.resuelta).length,
    totalAlertas: alertas.length,
  }
}

// =====================================================================
// HTML Templates
// =====================================================================
function htmlInforme({ color, datos, nombre, labelMes, ambito, panelUrl }: any): string {
  const cc = datos.cumplimiento >= 90 ? '#16a34a' : datos.cumplimiento >= 70 ? '#d97706' : '#dc2626'
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<div style="background:${color};border-radius:16px 16px 0 0;padding:32px 28px;text-align:center;">
  <div style="font-size:32px;font-weight:900;color:white;">ÁSTOR</div>
  <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px;">by CRITIC SL</div>
  <div style="color:white;font-size:20px;font-weight:700;margin-top:16px;">Informe mensual — ${labelMes}</div>
  <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:6px;">${ambito}</div>
</div>
<div style="background:white;padding:28px;border-radius:0 0 16px 16px;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
  <p style="color:#374151;font-size:14px;margin:0 0 24px;">Hola <strong>${nombre}</strong>, resumen de <strong>${labelMes}</strong>.</p>
  <table width="100%" cellpadding="4" cellspacing="0" style="margin-bottom:24px;"><tr>
    <td width="33%"><div style="background:#f9fafb;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:${cc};">${datos.cumplimiento}%</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">Cumplimiento</div></div></td>
    <td width="33%"><div style="background:#f9fafb;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#1d4ed8;">${datos.totalInspecciones}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">Controles</div></div></td>
    <td width="33%"><div style="background:#f9fafb;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#374151;">${datos.totalCarros}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;">Carros</div></div></td>
  </tr></table>
  <div style="margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:13px;font-weight:600;color:#111827;">Tasa de cumplimiento</span>
      <span style="font-size:13px;font-weight:700;color:${cc};">${datos.cumplimiento}%</span>
    </div>
    <div style="background:#e5e7eb;border-radius:99px;height:12px;overflow:hidden;">
      <div style="background:${cc};height:100%;width:${datos.cumplimiento}%;border-radius:99px;"></div>
    </div>
  </div>
  <div style="font-size:13px;font-weight:700;color:#111827;padding-bottom:8px;border-bottom:2px solid #f3f4f6;margin-bottom:12px;">Controles del mes</div>
  <table width="100%" cellpadding="4" cellspacing="0" style="margin-bottom:20px;"><tr>
    <td width="50%">${m('✅ Correctos', datos.inspeccionesOk, '#16a34a')}</td>
    <td width="50%">${m('⚠️ Con fallos', datos.inspeccionesConFallo, '#d97706')}</td>
  </tr><tr>
    <td>${m('🟢 Operativos', datos.carrosOperativos, '#16a34a')}</td>
    <td>${m('🔴 No operativos', datos.carrosNoOperativos, '#dc2626')}</td>
  </tr></table>
  ${datos.equiposMantVencido !== undefined ? `
  <div style="font-size:13px;font-weight:700;color:#111827;padding-bottom:8px;border-bottom:2px solid #f3f4f6;margin-bottom:12px;">Equipos</div>
  <table width="100%" cellpadding="4" cellspacing="0" style="margin-bottom:20px;"><tr>
    <td width="50%">${m('🔴 Mant. vencido', datos.equiposMantVencido, '#dc2626')}</td>
    <td width="50%">${m('🟡 Próximo 30d', datos.equiposMantProximo, '#d97706')}</td>
  </tr></table>
  <div style="font-size:13px;font-weight:700;color:#111827;padding-bottom:8px;border-bottom:2px solid #f3f4f6;margin-bottom:12px;">Alertas</div>
  <table width="100%" cellpadding="4" cellspacing="0" style="margin-bottom:24px;"><tr>
    <td width="33%">${m('Total', datos.totalAlertas, '#374151')}</td>
    <td width="33%">${m('🔴 Críticas', datos.alertasCriticas, '#dc2626')}</td>
    <td width="33%">${m('✅ Resueltas', datos.alertasResueltas, '#16a34a')}</td>
  </tr></table>` : ''}
  <div style="text-align:center;padding-top:8px;">
    <a href="${panelUrl}" style="display:inline-block;background:${color};color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:14px;">
      Ver detalle en ÁSTOR →
    </a>
  </div>
</div>
<div style="text-align:center;padding:20px 0 0;color:#9ca3af;font-size:11px;line-height:1.6;">
  Informe automático mensual · <strong>ÁSTOR by CRITIC SL</strong> · astormanager.com
</div>
</div></body></html>`
}

function htmlGlobal({ hospitales, resumen, nombre, labelMes, appUrl }: any): string {
  const cc = resumen.cumplimientoMedio >= 80 ? '#16a34a' : resumen.cumplimientoMedio >= 60 ? '#d97706' : '#dc2626'
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<div style="background:#111827;border-radius:16px 16px 0 0;padding:32px 28px;text-align:center;">
  <div style="font-size:32px;font-weight:900;color:white;">ÁSTOR</div>
  <div style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:2px;">Superadmin · Informe global</div>
  <div style="color:white;font-size:20px;font-weight:700;margin-top:16px;">${labelMes}</div>
  <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px;">${resumen.totalHospitales} hospitales</div>
</div>
<div style="background:white;padding:28px;border-radius:0 0 16px 16px;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
  <p style="color:#374151;font-size:14px;margin:0 0 24px;">Hola <strong>${nombre}</strong>, resumen global de <strong>${labelMes}</strong>.</p>
  <table width="100%" cellpadding="4" cellspacing="0" style="margin-bottom:24px;"><tr>
    <td width="25%">${m('Hospitales', resumen.totalHospitales, '#111827')}</td>
    <td width="25%">${m('Cumplimiento', resumen.cumplimientoMedio + '%', cc)}</td>
    <td width="25%">${m('Controles', resumen.totalInspecciones, '#1d4ed8')}</td>
    <td width="25%">${m('Con incidencias', resumen.hospitalesConProblemas, resumen.hospitalesConProblemas > 0 ? '#dc2626' : '#16a34a')}</td>
  </tr></table>
  <div style="font-size:13px;font-weight:700;color:#111827;padding-bottom:8px;border-bottom:2px solid #f3f4f6;margin-bottom:12px;">Hospitales monitorizados</div>
  ${hospitales.map((h: any) => `<div style="padding:10px 14px;border-radius:8px;background:#f9fafb;margin-bottom:6px;font-size:12px;color:#374151;border-left:3px solid ${h.color_primario || '#1d4ed8'};"><strong>${h.nombre}</strong></div>`).join('')}
  <div style="text-align:center;margin-top:24px;">
    <a href="${appUrl}/superadmin" style="display:inline-block;background:#111827;color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:14px;">
      Ver panel superadmin →
    </a>
  </div>
</div>
<div style="text-align:center;padding:20px 0 0;color:#9ca3af;font-size:11px;">
  Informe automático · <strong>ÁSTOR by CRITIC SL</strong> · astormanager.com
</div>
</div></body></html>`
}

function m(label: string, valor: any, color: string): string {
  return `<div style="background:#f9fafb;border-radius:8px;padding:10px 12px;">
<div style="font-size:18px;font-weight:800;color:${color};">${valor}</div>
<div style="font-size:11px;color:#6b7280;margin-top:2px;">${label}</div></div>`
}

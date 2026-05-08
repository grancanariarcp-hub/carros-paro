// supabase/functions/alerta-email/index.ts
// Se llama via pg_net desde un trigger de PostgreSQL
// cuando se inserta una nueva alerta en la tabla alertas

// Conectamos a postgres directamente (no vía PostgREST) — ver send-push para
// la explicación. Direct postgres usa role `postgres` que bypassa RLS.
import postgres from 'npm:postgres@3.4.4'

const DATABASE_URL    = Deno.env.get('SUPABASE_DB_URL')!
const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL      = Deno.env.get('FROM_EMAIL') || 'contacto@astormanager.com'
const FROM_NAME       = Deno.env.get('FROM_NAME')  || 'ÁSTOR by CRITIC SL'
const APP_URL         = Deno.env.get('APP_URL')    || 'https://app.astormanager.com'

const sql = postgres(DATABASE_URL, { prepare: false })

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const { alerta_id } = body

    if (!alerta_id) {
      return resp({ ok: false, error: 'alerta_id requerido' }, 400)
    }

    // Cargar la alerta + carro + hospital + servicio vía postgres directo.
    // Reintentamos hasta 3 veces por si pg_net se adelantó al commit.
    let filas: any[] = []
    for (let intento = 1; intento <= 3; intento++) {
      filas = await sql`
        select
          a.id, a.tipo, a.mensaje, a.severidad, a.creado_en, a.hospital_id,
          c.codigo as c_codigo, c.nombre as c_nombre,
          c.ubicacion as c_ubicacion, c.servicio_id as c_servicio_id,
          sv.nombre as sv_nombre,
          h.nombre as h_nombre, h.color_primario as h_color
        from public.alertas a
        left join public.carros c on c.id = a.carro_id
        left join public.servicios sv on sv.id = c.servicio_id
        left join public.hospitales h on h.id = a.hospital_id
        where a.id = ${alerta_id}::uuid
        limit 1
      `
      if (filas.length > 0) break
      console.log(`[alerta-email] intento ${intento}: alerta no visible aún`)
      await new Promise(r => setTimeout(r, 500))
    }
    if (filas.length === 0) {
      console.log(`[alerta-email] alerta ${alerta_id} NO encontrada tras 3 intentos`)
      return resp({ ok: false, error: 'Alerta no encontrada' }, 404)
    }
    const f = filas[0]
    const alerta = {
      id: f.id, tipo: f.tipo, mensaje: f.mensaje, severidad: f.severidad,
      creado_en: f.creado_en, hospital_id: f.hospital_id,
    }
    const hospital = { nombre: f.h_nombre, color_primario: f.h_color }
    const carro    = f.c_codigo ? {
      codigo: f.c_codigo, nombre: f.c_nombre, ubicacion: f.c_ubicacion,
      servicio_id: f.c_servicio_id,
      servicio: f.sv_nombre ? { nombre: f.sv_nombre } : null,
    } : null
    const color    = hospital?.color_primario || '#1d4ed8'

    // Solo alertas críticas/altas o tipos críticos
    const esUrgente = ['critica', 'alta'].includes(alerta.severidad) ||
      ['carro_no_operativo', 'equipo_mantenimiento_vencido', 'equipo_calibracion_vencida'].includes(alerta.tipo)

    if (!esUrgente) {
      return resp({ ok: true, mensaje: 'Alerta no urgente, no se envía email' })
    }

    // Destinatarios: admin/calidad/supervisor del hospital + superadmins
    const servicioId: string | null = carro?.servicio_id ?? null
    const todos = await sql`
      select id, nombre, email, email_alertas, rol, recibir_alertas
      from public.perfiles
      where activo = true
        and (
          (rol in ('administrador','calidad') and hospital_id = ${alerta.hospital_id}::uuid)
          or (rol = 'supervisor' and hospital_id = ${alerta.hospital_id}::uuid
              and (${servicioId}::uuid is null or servicio_id = ${servicioId}::uuid))
          or rol = 'superadmin'
        )
    `
    if (todos.length === 0) {
      return resp({ ok: true, mensaje: 'Sin destinatarios configurados' })
    }

    // Generar HTML del email
    const html = htmlAlerta({ alerta, hospital, carro, color, appUrl: APP_URL })
    const subject = asunto(alerta, carro, hospital)

    // Enviar a cada destinatario
    let enviados = 0
    for (const dest of todos) {
      const to = dest.email_alertas || dest.email
      if (!to) continue
      await enviarEmail({ to, subject, html })
      enviados++
    }

    console.log(`[alerta-email] ✓ ${enviados} emails enviados para alerta ${alerta_id}`)
    return resp({ ok: true, enviados })

  } catch (err: any) {
    console.error('[alerta-email] ERROR:', err)
    return resp({ ok: false, error: err.message }, 500)
  }
})

// =====================================================================
// Resend
// =====================================================================
async function enviarEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    console.error(`[resend] Error enviando a ${to}:`, await res.text())
  } else {
    console.log(`[resend] ✓ ${to}`)
  }
}

// =====================================================================
// Asunto del email
// =====================================================================
function asunto(alerta: any, carro: any, hospital: any): string {
  const nombreHospital = hospital?.nombre || 'Hospital'
  if (alerta.tipo === 'carro_no_operativo') {
    return `🚨 ALERTA — Carro no operativo · ${carro?.codigo || ''} · ${nombreHospital}`
  }
  if (alerta.tipo === 'equipo_mantenimiento_vencido') {
    return `⚠️ Mantenimiento vencido · ${nombreHospital}`
  }
  if (alerta.tipo === 'equipo_calibracion_vencida') {
    return `⚠️ Calibración vencida · ${nombreHospital}`
  }
  return `⚠️ Alerta ÁSTOR · ${nombreHospital}`
}

// =====================================================================
// Template HTML
// =====================================================================
function htmlAlerta({ alerta, hospital, carro, color, appUrl }: any): string {
  const colorAlerta = alerta.tipo === 'carro_no_operativo' ? '#dc2626'
    : alerta.severidad === 'alta' ? '#d97706'
    : '#1d4ed8'

  const iconoAlerta = alerta.tipo === 'carro_no_operativo' ? '🚨'
    : alerta.tipo === 'equipo_mantenimiento_vencido' ? '🔧'
    : alerta.tipo === 'equipo_calibracion_vencida' ? '📐'
    : '⚠️'

  const tipoLabel = alerta.tipo === 'carro_no_operativo' ? 'Carro no operativo'
    : alerta.tipo === 'equipo_mantenimiento_vencido' ? 'Mantenimiento vencido'
    : alerta.tipo === 'equipo_calibracion_vencida' ? 'Calibración vencida'
    : alerta.tipo?.replace(/_/g, ' ')

  const panelUrl = `${appUrl}/admin`

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:24px 16px;">

  <!-- Cabecera -->
  <div style="background:${colorAlerta};border-radius:16px 16px 0 0;padding:28px;text-align:center;">
    <div style="font-size:36px;margin-bottom:8px;">${iconoAlerta}</div>
    <div style="font-size:20px;font-weight:800;color:white;">${tipoLabel}</div>
    <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:6px;">${hospital?.nombre || 'Hospital'}</div>
  </div>

  <!-- Cuerpo -->
  <div style="background:white;padding:28px;border-radius:0 0 16px 16px;box-shadow:0 4px 16px rgba(0,0,0,0.08);">

    <!-- Mensaje principal -->
    <div style="background:${colorAlerta}10;border-left:4px solid ${colorAlerta};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:24px;">
      <div style="font-size:14px;color:#111827;line-height:1.5;">${alerta.mensaje}</div>
    </div>

    <!-- Datos del carro si existe -->
    ${carro ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">Carro afectado</div>
      <div style="background:#f9fafb;border-radius:10px;padding:14px;">
        <div style="font-size:16px;font-weight:700;color:#111827;">${carro.codigo} — ${carro.nombre}</div>
        ${carro.servicio?.nombre ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">Servicio: ${carro.servicio.nombre}</div>` : ''}
        ${carro.ubicacion ? `<div style="font-size:12px;color:#6b7280;">Ubicación: ${carro.ubicacion}</div>` : ''}
      </div>
    </div>` : ''}

    <!-- Fecha -->
    <div style="font-size:12px;color:#9ca3af;margin-bottom:24px;">
      Alerta generada el ${new Date(alerta.creado_en).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </div>

    <!-- CTA -->
    <div style="text-align:center;">
      <a href="${panelUrl}" style="display:inline-block;background:${color};color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:14px;">
        Ver en ÁSTOR →
      </a>
    </div>
  </div>

  <!-- Pie -->
  <div style="text-align:center;padding:20px 0 0;color:#9ca3af;font-size:11px;line-height:1.6;">
    <strong>ÁSTOR by CRITIC SL</strong> · Gestión y auditoría de material hospitalario<br/>
    astormanager.com
  </div>
</div>
</body>
</html>`
}

function resp(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

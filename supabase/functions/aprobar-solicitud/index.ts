// supabase/functions/aprobar-solicitud/index.ts
//
// Aprueba una solicitud de registro y DA DE ALTA a la persona de verdad.
//
// Antes, "aprobar" solo marcaba la fila como aprobada. No creaba la cuenta, no
// creaba el perfil y no avisaba a nadie. La solicitud desaparecía de la
// bandeja —que solo muestra las pendientes— y quien la había pedido seguía sin
// poder entrar, sin que nadie tuviera forma de notarlo. Le pasó a dos personas
// reales antes de detectarse.
//
// Hace falta una Edge Function porque dos cosas exigen la clave de servicio y
// no pueden hacerse desde el navegador:
//   · crear la cuenta con el correo YA confirmado. Con signUp queda sin
//     confirmar, y sin confirmar Supabase no deja iniciar sesión: la persona
//     aparecería como usuario de pleno derecho en la aplicación sin poder
//     entrar. Es exactamente lo que ya había pasado.
//   · generar el enlace de acceso.
//
//   POST { solicitud_id, hospital_id, rol, servicio_id? }
//   → { ok: true, enlace, email, nombre }
//
// AUTORIDAD (se comprueba aquí, no en el cliente):
//   superadmin            → cualquier hospital
//   administrador/calidad → solo el suyo, y nunca puede crear un superadmin
//   resto                 → denegado

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL      = Deno.env.get('APP_URL') || 'https://app.astormanager.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
}

const ROLES = ['administrador', 'calidad', 'supervisor', 'auditor', 'tecnico', 'readonly']

function resp(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Mismo criterio que en resetear-password: el enlace vuelve a donde se pidió. */
function destinoPermitido(req: Request): string {
  const origen = req.headers.get('Origin') ?? ''
  const admitido =
    origen === APP_URL ||
    /^https:\/\/carros-paro-[a-z0-9-]+-grancanariarcp-hubs-projects\.vercel\.app$/.test(origen) ||
    /^http:\/\/localhost:\d+$/.test(origen)
  return `${admitido ? origen : APP_URL}/nueva-contrasena`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return resp({ ok: false, error: 'No autorizado' }, 401)

    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: errUser } = await userClient.auth.getUser()
    if (errUser || !user) return resp({ ok: false, error: 'Sesión no válida' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: solicitante } = await admin.from('perfiles')
      .select('id, nombre, rol, hospital_id, activo').eq('id', user.id).single()

    if (!solicitante?.activo) return resp({ ok: false, error: 'Tu cuenta no está activa' }, 403)

    const esSuperadmin = solicitante.rol === 'superadmin'
    const esAdmin = solicitante.rol === 'administrador' || solicitante.rol === 'calidad'
    if (!esSuperadmin && !esAdmin) {
      return resp({ ok: false, error: 'Solo administradores pueden aprobar solicitudes' }, 403)
    }

    // -----------------------------------------------------------------------
    // Qué se pide
    // -----------------------------------------------------------------------
    const body = await req.json().catch(() => ({}))
    const { solicitud_id, hospital_id, rol, servicio_id } = body ?? {}

    if (!solicitud_id || !hospital_id || !rol) {
      return resp({ ok: false, error: 'Faltan solicitud, hospital o rol' }, 400)
    }
    if (!ROLES.includes(rol)) {
      // superadmin no está en la lista a propósito: no se crea desde aquí.
      return resp({ ok: false, error: `Rol no permitido: ${rol}` }, 400)
    }
    if (rol === 'supervisor' && !servicio_id) {
      // Lo exige perfiles_servicio_coherente, y sin servicio un supervisor no
      // vería ningún carro.
      return resp({ ok: false, error: 'Un supervisor necesita un servicio asignado' }, 400)
    }
    if (!esSuperadmin && hospital_id !== solicitante.hospital_id) {
      return resp({ ok: false, error: 'Solo puedes aprobar para tu propio hospital' }, 403)
    }

    const { data: solicitud } = await admin.from('solicitudes_registro')
      .select('id, nombre, email, estado').eq('id', solicitud_id).single()

    if (!solicitud) return resp({ ok: false, error: 'Solicitud no encontrada' }, 404)
    if (!solicitud.email) return resp({ ok: false, error: 'La solicitud no tiene correo' }, 400)

    const email = solicitud.email.trim().toLowerCase()

    // -----------------------------------------------------------------------
    // La cuenta de acceso
    // -----------------------------------------------------------------------
    // Puede existir ya: alguien que intentó registrarse por su cuenta meses
    // antes deja una cuenta a medias. Se reutiliza en vez de fallar.
    const { data: existentes } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    let cuenta = existentes?.users?.find(u => u.email?.toLowerCase() === email)

    if (!cuenta) {
      const { data: creada, error: errCrear } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,   // sin esto no podría iniciar sesión nunca
        user_metadata: { nombre: solicitud.nombre },
      })
      if (errCrear || !creada?.user) {
        return resp({ ok: false, error: errCrear?.message || 'No se pudo crear la cuenta' }, 500)
      }
      cuenta = creada.user
    } else if (!cuenta.email_confirmed_at) {
      // Existía sin confirmar: se confirma, que es justo lo que la bloqueaba.
      await admin.auth.admin.updateUserById(cuenta.id, { email_confirm: true })
    }

    // -----------------------------------------------------------------------
    // El perfil, que es lo que la aplicación mira para saber quién eres
    // -----------------------------------------------------------------------
    const { error: errPerfil } = await admin.from('perfiles').upsert({
      id: cuenta.id,
      nombre: solicitud.nombre,
      email,
      rol,
      hospital_id,
      servicio_id: servicio_id || null,
      activo: true,
      aprobado_por: solicitante.id,
    })

    if (errPerfil) {
      // Sin perfil, la cuenta entra pero la aplicación no sabe quién es. Se
      // avisa en vez de dar la solicitud por aprobada.
      return resp({ ok: false, error: `No se pudo crear el perfil: ${errPerfil.message}` }, 500)
    }

    // Solo ahora se marca como aprobada: si algo anterior falla, la solicitud
    // sigue en la bandeja y se puede reintentar, en vez de desaparecer sin que
    // nadie haya sido dado de alta.
    await admin.from('solicitudes_registro').update({
      estado: 'aprobada',
      gestionado_por: solicitante.id,
      gestionado_en: new Date().toISOString(),
    }).eq('id', solicitud_id)

    // -----------------------------------------------------------------------
    // El enlace con el que entrará por primera vez
    // -----------------------------------------------------------------------
    // Un enlace, no una contraseña: la elige la persona. La aplicación guarda
    // firmas con trazabilidad ISO, y si un administrador conociera la clave de
    // un auditor podría firmar en su nombre.
    const { data: enlaceData, error: errEnlace } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: destinoPermitido(req) },
    })

    const { error: errAudit } = await admin.from('log_auditoria').insert({
      usuario_id:     solicitante.id,
      accion:         'solicitud_aprobada',
      tabla_afectada: 'perfiles',
      registro_id:    cuenta.id,
      hospital_id,
      resultado:      'exito',
      user_agent:     req.headers.get('user-agent'),
      detalle: {
        solicitante_nombre: solicitante.nombre,
        aprobado_nombre: solicitud.nombre,
        aprobado_email: email,
        rol, servicio_id: servicio_id || null,
      },
    })
    if (errAudit) console.error('[aprobar-solicitud] no se pudo auditar:', errAudit.message)

    if (errEnlace || !enlaceData?.properties?.action_link) {
      // El alta ya está hecha y es lo importante; el enlace se puede volver a
      // generar desde el botón de restablecer contraseña.
      return resp({
        ok: true, enlace: null, email, nombre: solicitud.nombre,
        aviso: 'Usuario creado, pero no se pudo generar el enlace. Genéralo desde "Restablecer contraseña".',
      })
    }

    return resp({
      ok: true,
      enlace: enlaceData.properties.action_link,
      email,
      nombre: solicitud.nombre,
      expira_en_minutos: 60,
    })

  } catch (err: any) {
    console.error('[aprobar-solicitud] ERROR:', err)
    return resp({ ok: false, error: err.message }, 500)
  }
})

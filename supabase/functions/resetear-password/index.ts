// supabase/functions/resetear-password/index.ts
//
// Genera un enlace de recuperación de contraseña para otro usuario, para que
// un administrador pueda desbloquear a alguien que ha perdido su acceso.
//
// Devuelve el ENLACE, nunca una contraseña. El administrador se lo hace llegar
// al usuario y es el usuario quien elige su nueva clave. Esto es deliberado:
// la app guarda firmas digitales en cada inspección con trazabilidad ISO, y si
// un administrador conociera la contraseña de un auditor podría firmar en su
// nombre. El enlace preserva que la firma pruebe quién firmó.
//
//   POST { usuario_id: "uuid" }
//   → { ok: true, enlace: "https://...", email: "...", expira_en_minutos: 60 }
//
// AUTORIDAD (se comprueba aquí, no en el cliente):
//   superadmin           → cualquier usuario
//   administrador/calidad → solo usuarios de SU hospital, y nunca a un
//                           superadmin (sería escalada de privilegios: un
//                           admin de un centro tomaría una cuenta con acceso
//                           a todos los hospitales)
//   resto de roles        → denegado
//
// Cada uso queda registrado en log_auditoria.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL      = Deno.env.get('APP_URL') || 'https://app.astormanager.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
}

function resp(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/**
 * A dónde debe volver el enlace de recuperación.
 *
 * Se usa el Origin de quien llama, para que el enlace vuelva al MISMO sitio
 * desde el que se generó. Si se fija a producción, una vista previa genera
 * enlaces que llevan a producción, donde la pantalla puede no existir todavía
 * — el token se consume sin usarse y el usuario acaba viendo "credenciales no
 * válidas" al intentar entrar con una contraseña que nunca llegó a fijar.
 *
 * El Origin NO se acepta a ciegas: es un valor que controla quien llama, y
 * confiar en él sería un redirect abierto por el que robar el token. Solo se
 * admiten orígenes conocidos; cualquier otro cae a APP_URL. Supabase vuelve a
 * validarlo después contra uri_allow_list, así que hay dos filtros.
 */
function destinoPermitido(req: Request): string {
  const origen = req.headers.get('Origin') ?? ''

  const admitido =
    origen === APP_URL ||
    /^https:\/\/carros-paro-[a-z0-9-]+-grancanariarcp-hubs-projects\.vercel\.app$/.test(origen) ||
    /^http:\/\/localhost:\d+$/.test(origen)

  if (!admitido && origen) {
    console.warn(`[resetear-password] Origin no admitido, se usa APP_URL: ${origen}`)
  }
  return `${admitido ? origen : APP_URL}/nueva-contrasena`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ---------------------------------------------------------------------
    // 1) Identificar a quien llama
    // ---------------------------------------------------------------------
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
      .select('id, nombre, rol, hospital_id, activo')
      .eq('id', user.id).single()

    if (!solicitante || !solicitante.activo) {
      return resp({ ok: false, error: 'Tu cuenta no está activa' }, 403)
    }

    // ---------------------------------------------------------------------
    // 2) Localizar al usuario destino
    // ---------------------------------------------------------------------
    const body = await req.json().catch(() => ({}))
    const usuarioId: string | undefined = body?.usuario_id
    if (!usuarioId) return resp({ ok: false, error: 'usuario_id es obligatorio' }, 400)

    const { data: destino } = await admin.from('perfiles')
      .select('id, nombre, email, rol, hospital_id, activo')
      .eq('id', usuarioId).single()

    if (!destino) return resp({ ok: false, error: 'Usuario no encontrado' }, 404)
    if (!destino.email) {
      return resp({ ok: false, error: 'Ese usuario no tiene email; no se puede generar el enlace' }, 400)
    }

    // ---------------------------------------------------------------------
    // 3) ¿Tiene autoridad sobre ese usuario?
    // ---------------------------------------------------------------------
    const esSuperadmin = solicitante.rol === 'superadmin'
    const esAdmin      = solicitante.rol === 'administrador' || solicitante.rol === 'calidad'

    if (!esSuperadmin && !esAdmin) {
      return resp({ ok: false, error: 'Solo administradores pueden restablecer contraseñas' }, 403)
    }

    if (!esSuperadmin) {
      // Mismo hospital.
      if (!solicitante.hospital_id || destino.hospital_id !== solicitante.hospital_id) {
        return resp({ ok: false, error: 'Solo puedes restablecer usuarios de tu hospital' }, 403)
      }
      // Nunca a un superadmin: tomaría una cuenta con acceso a todos los centros.
      if (destino.rol === 'superadmin') {
        return resp({ ok: false, error: 'No puedes restablecer la contraseña de un superadministrador' }, 403)
      }
    }

    // ---------------------------------------------------------------------
    // 4) Generar el enlace de recuperación
    // ---------------------------------------------------------------------
    const redirectTo = destinoPermitido(req)
    const { data: enlaceData, error: errEnlace } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: destino.email,
      options: { redirectTo },
    })

    if (errEnlace || !enlaceData?.properties?.action_link) {
      console.error('[resetear-password] generateLink falló:', errEnlace)
      return resp({ ok: false, error: errEnlace?.message || 'No se pudo generar el enlace' }, 500)
    }

    // ---------------------------------------------------------------------
    // 5) Registrar en auditoría. Nunca se guarda el enlace: es una credencial
    //    de un solo uso y no debe quedar en la base de datos.
    // ---------------------------------------------------------------------
    await admin.from('log_auditoria').insert({
      usuario_id:      solicitante.id,
      accion:          'reset_password',
      tabla_afectada:  'perfiles',
      registro_id:     destino.id,
      hospital_id:     destino.hospital_id,
      resultado:       'ok',
      user_agent:      req.headers.get('user-agent'),
      detalle: {
        solicitante_nombre: solicitante.nombre,
        solicitante_rol:    solicitante.rol,
        destino_nombre:     destino.nombre,
        destino_email:      destino.email,
        destino_rol:        destino.rol,
      },
    })

    console.log(`[resetear-password] ${solicitante.rol} ${solicitante.id} → ${destino.id}`)

    return resp({
      ok: true,
      enlace: enlaceData.properties.action_link,
      email: destino.email,
      nombre: destino.nombre,
      expira_en_minutos: 60,
    })

  } catch (err: any) {
    console.error('[resetear-password] ERROR:', err)
    return resp({ ok: false, error: err.message }, 500)
  }
})

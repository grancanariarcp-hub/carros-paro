// supabase/functions/login-por-codigo/index.ts
// Autentica un usuario por su código de empleado (QR / código de barras)
// Devuelve access_token y refresh_token para establecer la sesión en el cliente

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { codigo } = await req.json()

    if (!codigo || typeof codigo !== 'string' || codigo.trim().length === 0) {
      return json({ error: 'Código requerido' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // 1. Buscar perfil por codigo_empleado
    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('id, nombre, email, rol, activo, hospital_id')
      .eq('codigo_empleado', codigo.trim())
      .single()

    if (perfilError || !perfil) {
      return json({ error: 'Código no reconocido' }, 404)
    }

    if (!perfil.activo) {
      return json({ error: 'Tu cuenta no está activa. Contacta al administrador.' }, 403)
    }

    if (!perfil.email) {
      return json({ error: 'Este usuario no tiene email configurado.' }, 400)
    }

    // 2. Generar enlace de magic link para ese email
    // Esto crea un token de sesión válido sin necesitar contraseña
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: perfil.email,
      options: {
        redirectTo: 'https://app.astormanager.com',
      },
    })

    if (linkError || !linkData) {
      console.error('[login-por-codigo] Error generando link:', linkError)
      return json({ error: 'Error al generar sesión. Intenta con usuario y contraseña.' }, 500)
    }

    // 3. Extraer los tokens del link generado
    // El link tiene formato: ...#access_token=xxx&refresh_token=yyy&...
    const url = new URL(linkData.properties.action_link)
    const hash = url.hash.slice(1) // quitar el #
    const params = new URLSearchParams(hash)

    const access_token  = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (!access_token || !refresh_token) {
      // Intentar desde hashed_token como alternativa
      console.error('[login-por-codigo] No se encontraron tokens en el link')
      return json({ error: 'Error al obtener tokens de sesión.' }, 500)
    }

    console.log(`[login-por-codigo] ✓ Sesión generada para: ${perfil.email} (${perfil.nombre})`)

    return json({
      ok: true,
      access_token,
      refresh_token,
      perfil: {
        id: perfil.id,
        nombre: perfil.nombre,
        email: perfil.email,
        rol: perfil.rol,
      },
    })

  } catch (err: any) {
    console.error('[login-por-codigo] ERROR:', err)
    return json({ error: err.message || 'Error interno' }, 500)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

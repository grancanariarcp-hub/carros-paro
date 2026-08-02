// supabase/functions/_shared/auth.ts
//
// Comprobación de autorización para las Edge Functions que solo debe poder
// invocar la propia base de datos (triggers de alertas y cron mensual).
//
// Contexto: estas funciones se despliegan con verify_jwt=false porque pg_net
// las llama sin sesión de usuario. Eso significa que Supabase NO filtra nada
// por ellas, así que la comprobación tiene que estar aquí. Sin esto quedan
// abiertas a Internet: la URL del proyecto es pública, viaja en el bundle del
// navegador.
//
// Se usa un secreto propio (ASTOR_EDGE_SECRET) en vez de comparar contra
// SUPABASE_SERVICE_ROLE_KEY. Motivo, comprobado el 2026-08-02: el formato de
// esa variable depende de la antigüedad del proyecto — en producción llega
// como JWT legacy (219 caracteres, "eyJ...") y en astor-dev como el formato
// nuevo (41 caracteres, "sb_secret_..."). Atarse a ella rompería al migrar de
// proyecto. Un secreto propio es además rotable sin tocar la clave maestra, y
// evita que la service_role viaje en cada notificación.
//
// NO usar en `login-por-codigo`: esa se invoca antes de que exista sesión y
// debe seguir siendo pública por diseño.
//
// ---------------------------------------------------------------------------
// PUESTA EN MARCHA (una vez por proyecto Supabase, con el mismo valor en los
// dos sitios; el valor NO se guarda en git):
//
//   SECRETO=$(openssl rand -base64 32)
//
//   1) Lado base de datos (lo envían los triggers y el cron):
//      insert into private.app_secrets (key, value)
//      values ('edge_shared_secret', '<SECRETO>')
//      on conflict (key) do update set value = excluded.value;
//
//   2) Lado Edge Function:
//      npx supabase secrets set ASTOR_EDGE_SECRET='<SECRETO>' --project-ref <ref>
//
// Para rotarlo: repetir ambos pasos con un valor nuevo. Hazlo en este orden
// (primero la base de datos, luego las funciones) y habrá como mucho unos
// segundos en que alguna notificación se rechace, en vez de una ventana
// abierta.
// ---------------------------------------------------------------------------

const SECRETO = Deno.env.get('ASTOR_EDGE_SECRET') ?? ''

/**
 * Comparación en tiempo constante. Un `===` normal corta en el primer byte
 * distinto, y esa diferencia de tiempo permite ir adivinando el secreto byte
 * a byte. Aquí el coste es irrelevante y elimina el problema.
 */
function igualdadSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diferencia === 0
}

/**
 * Devuelve una Response de rechazo si la petición no viene de la base de
 * datos, o `null` si está autorizada. Uso:
 *
 *   const noAutorizado = rechazarSiNoEsInterna(req)
 *   if (noAutorizado) return noAutorizado
 */
export function rechazarSiNoEsInterna(req: Request): Response | null {
  if (!SECRETO) {
    // Sin el secreto configurado no podemos validar nada. Fallamos cerrado:
    // preferimos que deje de funcionar de forma visible y con un mensaje claro
    // en el log a quedar abiertos sin que nadie se entere.
    console.error('[auth] falta ASTOR_EDGE_SECRET — ver supabase/functions/_shared/auth.ts')
    return new Response(
      JSON.stringify({ ok: false, error: 'configuración incompleta' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const recibido = req.headers.get('X-Astor-Secret') ?? ''
  if (!igualdadSegura(recibido, SECRETO)) {
    console.warn('[auth] llamada rechazada: X-Astor-Secret ausente o incorrecta')
    return new Response(
      JSON.stringify({ ok: false, error: 'no autorizado' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return null
}

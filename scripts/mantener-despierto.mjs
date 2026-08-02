/**
 * Evita que los proyectos Supabase del plan gratuito se duerman.
 *
 *   node scripts/mantener-despierto.mjs
 *
 * Los proyectos free se pausan tras ~7 días sin actividad. Cuando eso pasa el
 * DNS deja de resolver y todo falla con "Failed to fetch" — exactamente lo que
 * le ocurrió a producción el 2026-08-02. Una consulta trivial cuenta como
 * actividad y lo evita.
 *
 * Producción tiene además un ping externo (cron-job.org) que no depende de que
 * este ordenador esté encendido. astor-dev no lo tiene, y si se duerme la
 * suite de tests deja de poder ejecutarse.
 *
 * Lee los proyectos de .env.local y .env.test, así que basta con tenerlos
 * configurados. No escribe nada: solo lee una fila.
 */
import { readFileSync } from 'node:fs'

function cargar(archivo) {
  try {
    const env = {}
    for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
      const m = linea.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
    return env
  } catch {
    return {}
  }
}

const entornos = [
  { nombre: 'producción', env: cargar('.env.local') },
  { nombre: 'astor-dev',  env: cargar('.env.test')  },
]

let fallos = 0

for (const { nombre, env } of entornos) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.log(`  ⬜ ${nombre.padEnd(12)} sin configurar, se omite`)
    continue
  }

  const inicio = Date.now()
  try {
    // `hospitales` existe en los dos entornos y la consulta es mínima. Se usa
    // la clave anónima a propósito: la service_role no hace falta para esto.
    const res = await fetch(`${url}/rest/v1/hospitales?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    })
    const ms = Date.now() - inicio

    if (res.ok) {
      console.log(`  ✅ ${nombre.padEnd(12)} despierto (${res.status}, ${ms} ms)`)
    } else {
      fallos++
      console.log(`  ⚠️  ${nombre.padEnd(12)} responde ${res.status} — revísalo`)
    }
  } catch (err) {
    fallos++
    // Un fallo de DNS aquí es la señal de que el proyecto ya está pausado.
    console.log(`  ❌ ${nombre.padEnd(12)} sin respuesta: ${err.message}`)
    console.log(`     Si es de DNS, el proyecto está pausado: restáuralo desde`)
    console.log(`     https://supabase.com/dashboard`)
  }
}

process.exit(fallos > 0 ? 1 : 0)

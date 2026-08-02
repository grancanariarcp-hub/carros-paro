/**
 * Backup completo de los datos a backups/db/<fecha>/
 *
 * Vuelca todas las tablas vía API REST usando la service_role key.
 * No necesita la contraseña de Postgres ni pg_dump instalado.
 *
 * Uso:  node scripts/backup-datos.mjs
 *
 * Limitación: guarda DATOS, no el esquema. El esquema vive en
 * supabase/migrations/. Los dos juntos permiten reconstruir el proyecto.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PAGE = 1000

function cargarEnv() {
  const env = {}
  for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linea.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = cargarEnv()
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const cabeceras = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function listarTablas() {
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers: cabeceras })
  const spec = await res.json()
  return Object.keys(spec.definitions ?? spec.components?.schemas ?? {}).sort()
}

/** Descarga una tabla entera paginando de 1000 en 1000. */
async function descargar(tabla) {
  const filas = []
  for (let desde = 0; ; desde += PAGE) {
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=*`, {
      headers: { ...cabeceras, Range: `${desde}-${desde + PAGE - 1}` },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`)
    const lote = await res.json()
    filas.push(...lote)
    if (lote.length < PAGE) return filas
  }
}

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const destino = join('backups', 'db', sello)
mkdirSync(destino, { recursive: true })

const tablas = await listarTablas()
console.log(`Volcando ${tablas.length} tablas a ${destino}\n`)

const resumen = {}
let totalFilas = 0
let fallos = 0

for (const tabla of tablas) {
  try {
    const filas = await descargar(tabla)
    writeFileSync(join(destino, `${tabla}.json`), JSON.stringify(filas, null, 2))
    resumen[tabla] = filas.length
    totalFilas += filas.length
    console.log(`  ✅ ${tabla.padEnd(32)} ${filas.length} filas`)
  } catch (err) {
    resumen[tabla] = `ERROR: ${err.message}`
    fallos++
    console.log(`  ❌ ${tabla.padEnd(32)} ${err.message}`)
  }
}

// Usuarios de auth: viven en el esquema `auth`, que la API REST no expone.
// Sin ellos nadie podría iniciar sesión tras una restauración.
// OJO: la API no devuelve los hashes de contraseña. Al restaurar se conservan
// identidades, emails y roles, pero cada usuario tendrá que restablecer su clave.
let totalUsuarios = 0
try {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=1000`, { headers: cabeceras })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { users = [] } = await res.json()
  writeFileSync(join(destino, '_auth_users.json'), JSON.stringify(users, null, 2))
  totalUsuarios = users.length
  console.log(`\n  ✅ ${'auth.users'.padEnd(32)} ${users.length} usuarios`)
} catch (err) {
  fallos++
  console.log(`\n  ❌ ${'auth.users'.padEnd(32)} ${err.message}`)
}

writeFileSync(
  join(destino, '_manifiesto.json'),
  JSON.stringify(
    { fecha: new Date().toISOString(), proyecto: URL_BASE, totalFilas, totalUsuarios, tablas: resumen },
    null, 2
  )
)

console.log(`\n${totalFilas} filas en total. ${fallos ? `${fallos} tablas con error.` : 'Sin errores.'}`)
console.log(`Guardado en ${destino}`)

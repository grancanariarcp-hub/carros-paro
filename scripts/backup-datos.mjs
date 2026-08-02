/**
 * Backup completo de los datos a backups/db/<fecha>/
 *
 * Vuelca todas las tablas vía API REST usando la service_role key.
 * No necesita la contraseña de Postgres ni pg_dump instalado.
 *
 *   node scripts/backup-datos.mjs                    → carpeta con los JSON
 *   node scripts/backup-datos.mjs --cifrar <clave>   → además, un único
 *                                                      archivo .astorbak cifrado
 *
 * El backup contiene DATOS PERSONALES: firmas digitales del personal
 * sanitario, nombres y correos. Si va a salir de este ordenador —copia en la
 * nube, disco externo, otro equipo— usa --cifrar. Sin cifrar, cualquiera con
 * acceso al archivo lee todo.
 *
 * Para restaurarlo:  node scripts/restaurar-backup.mjs <archivo> <clave>
 *
 * Limitación: guarda DATOS, no el esquema. El esquema vive en
 * supabase/migrations/. Los dos juntos permiten reconstruir el proyecto.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, scryptSync, createCipheriv } from 'node:crypto'

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

// ---------------------------------------------------------------------------
// Cifrado opcional: empaqueta todo en un único archivo protegido con clave.
//
// AES-256-GCM: además de cifrar, detecta si el archivo se ha alterado — en un
// backup importa tanto que nadie lo lea como saber que llega íntegro.
// La clave pasa por scrypt, que es deliberadamente lento, para que probar
// claves a la fuerza sea caro.
// ---------------------------------------------------------------------------
const iCifrar = process.argv.indexOf('--cifrar')
if (iCifrar !== -1) {
  const clave = process.argv[iCifrar + 1]
  if (!clave || clave.startsWith('--')) {
    console.error('\n--cifrar necesita una clave: node scripts/backup-datos.mjs --cifrar "mi clave"')
    process.exit(1)
  }
  if (clave.length < 12) {
    console.error('\nUsa una clave de al menos 12 caracteres: esto protege datos personales.')
    process.exit(1)
  }

  // Reunimos todo lo volcado en un solo objeto.
  const paquete = { manifiesto: JSON.parse(readFileSync(join(destino, '_manifiesto.json'), 'utf8')), tablas: {}, usuarios: null }
  for (const tabla of tablas) {
    try { paquete.tablas[tabla] = JSON.parse(readFileSync(join(destino, `${tabla}.json`), 'utf8')) } catch {}
  }
  try { paquete.usuarios = JSON.parse(readFileSync(join(destino, '_auth_users.json'), 'utf8')) } catch {}

  const sal = randomBytes(16)
  const iv  = randomBytes(12)
  const derivada = scryptSync(clave, sal, 32)
  const cipher = createCipheriv('aes-256-gcm', derivada, iv)
  const cifrado = Buffer.concat([cipher.update(JSON.stringify(paquete), 'utf8'), cipher.final()])
  const etiqueta = cipher.getAuthTag()

  // Formato: [sal 16][iv 12][etiqueta 16][datos]
  const archivo = `${destino}.astorbak`
  writeFileSync(archivo, Buffer.concat([sal, iv, etiqueta, cifrado]))

  const mb = (Buffer.byteLength(JSON.stringify(paquete)) / 1048576).toFixed(2)
  console.log(`\nCifrado en ${archivo}  (${mb} MB de datos)`)
  console.log('Este archivo sí puede salir del ordenador. Guarda la clave aparte:')
  console.log('sin ella el backup es irrecuperable, no hay forma de saltársela.')
}

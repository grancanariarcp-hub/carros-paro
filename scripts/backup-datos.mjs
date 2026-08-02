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
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
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

// La clave puede venir por argumento o de BACKUP_CLAVE en .env.local. Lo
// segundo es lo que permite ejecutarlo desatendido desde el programador de
// tareas: nadie puede teclearla a las 3 de la mañana.
//
// Que la clave viva en esta máquina y el backup cifrado en la nube es
// precisamente la separación que hace útil el cifrado: quien acceda a Drive no
// tiene la clave. (En .env.local ya está la service_role, que da acceso total
// a la base de datos, así que la clave no empeora nada de lo que hay aquí.)
const cifrarPorEnv = !!env.BACKUP_CLAVE?.trim()
if (iCifrar !== -1 || cifrarPorEnv) {
  const clave = iCifrar !== -1
    ? process.argv[iCifrar + 1]
    : env.BACKUP_CLAVE.trim()

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

  // -------------------------------------------------------------------------
  // Copia a una carpeta sincronizada (Google Drive, OneDrive, disco externo).
  //
  // Solo se copia el archivo CIFRADO, nunca la carpeta con los JSON en claro.
  // Es la única razón por la que esta copia es aceptable: son datos personales
  // de personal sanitario, y una carpeta sincronizada acaba replicada en la
  // nube y en cualquier equipo con la misma cuenta.
  // -------------------------------------------------------------------------
  const destinoExterno = env.BACKUP_DESTINO?.trim()
  if (destinoExterno) {
    try {
      if (!existsSync(destinoExterno)) mkdirSync(destinoExterno, { recursive: true })
      const copia = join(destinoExterno, basename(archivo))
      copyFileSync(archivo, copia)
      const kb = (statSync(copia).size / 1024).toFixed(0)
      console.log(`\nCopiado a ${copia}  (${kb} KB)`)
      console.log('Si esa carpeta la sincroniza Drive u OneDrive, ya está fuera del ordenador.')

      // Rotación: se conservan los últimos BACKUP_CONSERVAR (12 por defecto).
      // Sin esto, una tarea programada llena la carpeta indefinidamente. Doce
      // backups diarios cubren casi dos semanas hacia atrás, que es margen
      // suficiente para detectar un borrado accidental y volver.
      const conservar = Number(env.BACKUP_CONSERVAR?.trim() || 12)
      const antiguos = readdirSync(destinoExterno)
        .filter(f => f.endsWith('.astorbak'))
        .sort()                 // el nombre es la fecha ISO: ordenar = cronológico
        .slice(0, -conservar)   // todos menos los más recientes

      for (const viejo of antiguos) {
        unlinkSync(join(destinoExterno, viejo))
        console.log(`  rotado (eliminado por antigüedad): ${viejo}`)
      }
    } catch (err) {
      // No se aborta: el backup local ya existe y es lo importante. Pero se
      // avisa fuerte, porque un fallo silencioso aquí deja la copia externa
      // sin actualizar sin que nadie se entere.
      console.error(`\n⚠️  NO se pudo copiar a ${destinoExterno}`)
      console.error(`   ${err.message}`)
      console.error('   El backup local sí se guardó. Copia el archivo a mano.')
    }
  } else {
    console.log('\nPara copiarlo automáticamente fuera del ordenador, añade a .env.local:')
    console.log('  BACKUP_DESTINO=<ruta de una carpeta sincronizada>')
  }
}

// Aviso si se pide destino externo sin cifrar: no se copia nada en claro.
if (iCifrar === -1 && !cifrarPorEnv && env.BACKUP_DESTINO?.trim()) {
  console.log('\n⚠️  Hay BACKUP_DESTINO configurado pero NO se ha cifrado, así que')
  console.log('   no se copia nada fuera. Estos datos incluyen firmas del personal')
  console.log('   sanitario y no deben salir del ordenador sin cifrar.')
  console.log('   Usa:  node scripts/backup-datos.mjs --cifrar "<clave>"')
}

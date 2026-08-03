/**
 * Aplica un archivo .sql a un proyecto Supabase por la API de gestión,
 * preservando los caracteres no ASCII.
 *
 *   node scripts/aplicar-migracion.mjs <ref-proyecto> <archivo.sql> [--registrar]
 *
 * Existe porque pasar el SQL a curl a través de la shell manglaba las tildes:
 * las funciones quedaban con "La inspecci<?>n est<?> firmada" dentro de su
 * propio código, y ese texto llegaba tal cual al usuario en los avisos de la
 * app. Aquí el cuerpo se construye con fetch y JSON nativos, sin pasar por la
 * línea de comandos, así que el UTF-8 llega intacto.
 *
 * Con --registrar, anota además la migración en supabase_migrations para que
 * producción y el repositorio no se desincronicen.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const [ref, archivo, ...resto] = process.argv.slice(2)

if (!ref || !archivo) {
  console.error('Uso: node scripts/aplicar-migracion.mjs <ref-proyecto> <archivo.sql> [--registrar]')
  process.exit(1)
}

function cargarEnv() {
  const env = {}
  for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linea.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const token = cargarEnv().SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en .env.local')
  process.exit(1)
}

const sql = readFileSync(archivo, 'utf8')
const ENDPOINT = `https://api.supabase.com/v1/projects/${ref}/database/query`

async function ejecutar(consulta) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ query: consulta }),
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(texto.slice(0, 400))
  return texto
}

try {
  await ejecutar(sql)
  console.log(`✅ aplicada: ${basename(archivo)}`)

  if (resto.includes('--registrar')) {
    const nombre = basename(archivo, '.sql')
    const version = nombre.split('_')[0]
    const etiqueta = nombre.slice(version.length + 1)
    await ejecutar(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ('${version}', '${etiqueta}') on conflict (version) do nothing`
    )
    console.log(`   registrada como ${version}`)
  }
} catch (err) {
  console.error(`❌ ${basename(archivo)}: ${err.message}`)
  process.exit(1)
}

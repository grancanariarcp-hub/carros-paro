/**
 * Lanza una consulta SQL de solo lectura contra un proyecto Supabase.
 *
 *   node scripts/consultar.mjs [prod|dev] "select ..."
 *
 * Para inspeccionar el estado real de la base (políticas, funciones, datos)
 * sin abrir el panel web. Pasar el SQL por la línea de comandos maltrata los
 * acentos en Windows, así que si la consulta lleva tildes, guárdala en un
 * archivo y usa scripts/aplicar-migracion.mjs.
 */
import { readFileSync } from 'node:fs'

const REFS = { prod: 'agpawdoibqdptgdkcktv', dev: 'hbetovvfbguwzqfcmgbq' }

const [entornoArg, ...sqlPartes] = process.argv.slice(2)
const ref = REFS[entornoArg] ?? entornoArg
const sql = sqlPartes.join(' ')

if (!ref || !sql) {
  console.error('Uso: node scripts/consultar.mjs [prod|dev] "select ..."')
  process.exit(1)
}

const env = {}
for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify({ query: sql }),
})

const cuerpo = await res.json()
if (!res.ok) {
  console.error(cuerpo.message ?? JSON.stringify(cuerpo))
  process.exit(1)
}
console.log(JSON.stringify(cuerpo, null, 2))

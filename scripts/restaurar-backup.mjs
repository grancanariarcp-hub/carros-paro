/**
 * Descifra un backup .astorbak y deja los JSON en una carpeta.
 *
 *   node scripts/restaurar-backup.mjs backups/db/2026-08-02T13-05-30.astorbak "mi clave"
 *
 * NO escribe nada en la base de datos: solo devuelve los datos legibles, para
 * que decidas qué hacer con ellos. Restaurar sobre un proyecto vivo es una
 * operación delicada y no debe pasar por accidente al teclear un comando.
 *
 * Existe este script porque un backup que nadie ha probado a restaurar no es
 * un backup: es un archivo del que se supone algo. Conviene ejecutarlo de vez
 * en cuando para confirmar que la clave es la que crees y el archivo se abre.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { scryptSync, createDecipheriv } from 'node:crypto'

const [archivo, clave] = process.argv.slice(2)

if (!archivo || !clave) {
  console.error('Uso: node scripts/restaurar-backup.mjs <archivo.astorbak> "<clave>"')
  process.exit(1)
}

let bruto
try {
  bruto = readFileSync(archivo)
} catch {
  console.error(`No se encuentra el archivo: ${archivo}`)
  process.exit(1)
}

// Formato: [sal 16][iv 12][etiqueta 16][datos]
const sal      = bruto.subarray(0, 16)
const iv       = bruto.subarray(16, 28)
const etiqueta = bruto.subarray(28, 44)
const cifrado  = bruto.subarray(44)

let paquete
try {
  const derivada = scryptSync(clave, sal, 32)
  const decipher = createDecipheriv('aes-256-gcm', derivada, iv)
  decipher.setAuthTag(etiqueta)
  const claro = Buffer.concat([decipher.update(cifrado), decipher.final()])
  paquete = JSON.parse(claro.toString('utf8'))
} catch {
  // AES-GCM no distingue entre clave incorrecta y archivo alterado: en ambos
  // casos falla la verificación. Se dicen las dos posibilidades.
  console.error('\nNo se pudo descifrar. O la clave no es correcta, o el')
  console.error('archivo está dañado o alterado.')
  process.exit(1)
}

const destino = join('backups', 'restaurado-' + basename(archivo, '.astorbak'))
mkdirSync(destino, { recursive: true })

let total = 0
for (const [tabla, filas] of Object.entries(paquete.tablas || {})) {
  writeFileSync(join(destino, `${tabla}.json`), JSON.stringify(filas, null, 2))
  total += Array.isArray(filas) ? filas.length : 0
  console.log(`  ${tabla.padEnd(32)} ${Array.isArray(filas) ? filas.length : '?'} filas`)
}

if (paquete.usuarios) {
  writeFileSync(join(destino, '_auth_users.json'), JSON.stringify(paquete.usuarios, null, 2))
  console.log(`  ${'auth.users'.padEnd(32)} ${paquete.usuarios.length} usuarios`)
}

writeFileSync(join(destino, '_manifiesto.json'), JSON.stringify(paquete.manifiesto ?? {}, null, 2))

console.log(`\nBackup del ${paquete.manifiesto?.fecha ?? '(fecha desconocida)'}`)
console.log(`${total} filas restauradas a ${destino}`)

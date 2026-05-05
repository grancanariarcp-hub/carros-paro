// Script de UN SOLO USO: genera un par VAPID (clave pública + privada) y
// lo imprime en consola. Después se copian a private.app_secrets de cada
// proyecto.
//
// Uso:
//   node scripts/generate-vapid-keys.mjs
//
// Después en SQL editor de cada proyecto (DEV y PROD):
//   insert into private.app_secrets (key, value, description) values
//     ('vapid_public_key',  '<la_publica>',  'VAPID public key (Web Push)'),
//     ('vapid_private_key', '<la_privada>',  'VAPID private key (Web Push)'),
//     ('vapid_subject',     'mailto:contacto@astormanager.com', 'VAPID subject')
//   on conflict (key) do update set value = excluded.value, updated_at = now();

import { webcrypto } from 'crypto'

// Web Push usa P-256 (ECDSA) según el estándar.
const keyPair = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
)

const publicJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey)
const privateJwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey)

// Formato de la clave pública para Web Push: 65 bytes uncompressed point
//   Concatenar 0x04 || x (32 bytes) || y (32 bytes), luego base64url
const x = Buffer.from(publicJwk.x, 'base64url')
const y = Buffer.from(publicJwk.y, 'base64url')
const publicRaw = Buffer.concat([Buffer.from([0x04]), x, y])
const publicKeyB64Url = publicRaw.toString('base64url')

// Privada en base64url (parámetro 'd' del JWK)
const privateKeyB64Url = privateJwk.d

console.log('---')
console.log('VAPID keys generadas:')
console.log('---')
console.log('vapid_public_key:')
console.log(publicKeyB64Url)
console.log()
console.log('vapid_private_key:')
console.log(privateKeyB64Url)
console.log()
console.log('vapid_subject:')
console.log('mailto:contacto@astormanager.com')
console.log('---')
console.log()
console.log('Para guardar en SQL editor (mismas keys en DEV y PROD si quieres,')
console.log('o genera 2 pares distintos para mayor aislamiento):')
console.log()
console.log(`insert into private.app_secrets (key, value, description) values
  ('vapid_public_key',  '${publicKeyB64Url}', 'VAPID public key (Web Push)'),
  ('vapid_private_key', '${privateKeyB64Url}', 'VAPID private key (Web Push)'),
  ('vapid_subject',     'mailto:contacto@astormanager.com', 'VAPID subject')
on conflict (key) do update set value = excluded.value, updated_at = now();`)

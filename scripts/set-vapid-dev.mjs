// Script de UN SOLO USO: inserta las VAPID keys en private.app_secrets de DEV.
// Las generamos con generate-vapid-keys.mjs y las hardcodeamos aquí solo
// porque son keys de DEV y el script va a .gitignore (.local).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-vapid-dev.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const VAPID_PUBLIC = 'BLTyMBikMPTnYxciSdGL5pVOHnaLecVMGyuZV6A0YBwWOr8bnfO0Gg5SbaMCIq1PDG8YQ4m04La97FtkLCiIwgI'
const VAPID_PRIVATE = 'ukhcri5-YLkMN9c2IL-sjWAHfc_pT3nRsvUlebNpPJ0'
const VAPID_SUBJECT = 'mailto:contacto@astormanager.com'

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const valores = [
  { key: 'vapid_public_key',  value: VAPID_PUBLIC,  description: 'VAPID public key (Web Push)' },
  { key: 'vapid_private_key', value: VAPID_PRIVATE, description: 'VAPID private key (Web Push)' },
  { key: 'vapid_subject',     value: VAPID_SUBJECT, description: 'VAPID subject' },
]

for (const v of valores) {
  const { error } = await sb.schema('private').from('app_secrets').upsert(
    { ...v, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  if (error) {
    console.error(`Error insertando ${v.key}:`, error.message)
    process.exit(2)
  }
  console.log(`✓ ${v.key} guardado`)
}

console.log('\n🎉 VAPID keys configuradas en DEV.')

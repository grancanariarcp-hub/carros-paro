// Script de UN SOLO USO: sube los 2 logos institucionales (Gobierno de
// Canarias + Servicio Canario de Salud) al bucket 'logos' del proyecto
// astor-dev y los asigna al hospital demo.
//
// Uso:
//   SUPABASE_URL=https://wpiz...supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
//   node scripts/upload-demo-logos.mjs
//
// Eliminar este script tras usarlo. Para PROD, el superadmin sube los logos
// desde la UI (que crearemos en la etapa 5).

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno')
  process.exit(1)
}

const HOSPITAL_DEMO_ID = '00000000-0000-0000-0000-000000000001'
const LOGOS_DIR = join(process.cwd(), 'public', 'logos')

const FILES = [
  {
    local: 'Servicio_canario_de_salud__SCS__svg.png',
    remote: `hospital-${HOSPITAL_DEMO_ID}/principal.png`,
    field: 'informe_logo_principal_url',
  },
  {
    local: 'Gobierno_de_Canarias.png',
    remote: `hospital-${HOSPITAL_DEMO_ID}/secundario.png`,
    field: 'informe_logo_secundario_url',
  },
]

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  for (const f of FILES) {
    const path = join(LOGOS_DIR, f.local)
    if (!existsSync(path)) {
      console.error(`No existe: ${path}`)
      process.exit(2)
    }
    const buffer = readFileSync(path)

    const { error: uploadError } = await sb.storage
      .from('logos')
      .upload(f.remote, buffer, { contentType: 'image/png', upsert: true })

    if (uploadError) {
      console.error(`upload ${f.local}:`, uploadError.message)
      process.exit(3)
    }
    const { data: { publicUrl } } = sb.storage.from('logos').getPublicUrl(f.remote)
    console.log(`✓ Subido ${f.local} → ${publicUrl}`)

    const { error: updateError } = await sb
      .from('hospital_config')
      .update({ [f.field]: publicUrl })
      .eq('hospital_id', HOSPITAL_DEMO_ID)

    if (updateError) {
      console.error(`update ${f.field}:`, updateError.message)
      process.exit(4)
    }
    console.log(`✓ ${f.field} actualizado en hospital_config`)
  }

  console.log('\n🎉 Logos subidos y asignados al hospital demo.')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(99)
})

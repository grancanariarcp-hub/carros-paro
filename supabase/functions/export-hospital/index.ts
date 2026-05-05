// supabase/functions/export-hospital/index.ts
//
// Exporta TODO el historial del hospital en un ZIP con CSVs estándar.
// Cumplimiento RGPD Art. 20 (derecho de portabilidad). Filtrable por
// periodo, servicio y tipos de información.
//
// Llamada (POST):
//   {
//     "hospital_id": "uuid",
//     "desde":       "2025-01-01"  | null,
//     "hasta":       "2026-12-31"  | null,
//     "servicio_id": "uuid"        | null,    // null = todos los servicios
//     "tablas":      ["carros","equipos","inspecciones",...]  | null = todas
//     "incluir_evidencias": true  // URLs públicas de fotos
//   }
//
// Permisos: solo administrador o superadmin del hospital. RLS no aplica
// porque usamos service_role key (export oficial debe ser completo).
// Verificamos en código el rol del solicitante.
//
// Respuesta: application/zip con nombre tipo
//   astor-export_<slug>_<fecha>.zip

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import JSZip from 'https://esm.sh/jszip@3.10.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TABLAS_DISPONIBLES = [
  'hospitales',          // datos del hospital
  'servicios',           // unidades
  'secciones',           // sub-grupos por servicio
  'perfiles',            // usuarios (sin password)
  'carros',              // todos los carros del hospital
  'cajones',             // cajones de cada carro
  'materiales',          // materiales de cada cajón
  'desfibriladores',     // desfibriladores
  'equipos',             // equipos médicos
  'historial_mantenimientos',
  'inspecciones',        // controles realizados
  'items_inspeccion',    // detalle de cada control
  'alertas',             // alertas (resueltas e in-resueltas)
  'notificaciones',      // notificaciones
  'log_auditoria',       // bitácora ISO completa
  'plantillas',          // plantillas de control
  'plantilla_secciones',
  'plantilla_items',
  'plantilla_versiones', // snapshots inmutables ISO
  'evidencias',          // metadatos de fotos firmadas
] as const

type Tabla = (typeof TABLAS_DISPONIBLES)[number]

interface ExportRequest {
  hospital_id?: string
  desde?: string | null
  hasta?: string | null
  servicio_id?: string | null
  tablas?: Tabla[] | null
  incluir_evidencias?: boolean
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function toCSV(rows: any[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const head = cols.join(',')
  const body = rows.map(r => cols.map(c => csvEscape(r[c])).join(',')).join('\n')
  return head + '\n' + body + '\n'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
      },
    })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

  let body: ExportRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (!body.hospital_id) {
    return new Response(JSON.stringify({ error: 'hospital_id es obligatorio' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Verificar rol del solicitante
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No autorizado' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Cliente con el JWT del usuario para verificar quién es
  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Token inválido' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Cliente admin para queries
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: perfil } = await admin.from('perfiles')
    .select('id, rol, hospital_id, activo')
    .eq('id', user.id).single()

  if (!perfil || !perfil.activo) {
    return new Response(JSON.stringify({ error: 'Perfil inactivo' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  // Solo admin del hospital o superadmin
  const esSuperadmin = perfil.rol === 'superadmin'
  const esAdminDeEsteHospital = perfil.rol === 'administrador' && perfil.hospital_id === body.hospital_id
  if (!esSuperadmin && !esAdminDeEsteHospital) {
    return new Response(JSON.stringify({ error: 'Solo administradores pueden exportar el historial' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Resolver tablas
  const tablas: Tabla[] = (body.tablas && body.tablas.length > 0)
    ? body.tablas.filter(t => (TABLAS_DISPONIBLES as readonly string[]).includes(t)) as Tabla[]
    : [...TABLAS_DISPONIBLES]

  const desde = body.desde || null
  const hasta = body.hasta || null
  const servicio_id = body.servicio_id || null

  const zip = new JSZip()
  const stats: Record<string, number> = {}
  const ahora = new Date().toISOString()

  // Datos del hospital (cabecera del export)
  const { data: hospitalData } = await admin.from('hospitales')
    .select('*').eq('id', body.hospital_id).single()
  const hospitalSlug = hospitalData?.slug || body.hospital_id

  // Helper genérico: query a una tabla, posiblemente filtrando por hospital
  // y por fecha. Soporta los joins explícitos requeridos para limitar al hospital.
  async function exportarTabla(tabla: Tabla): Promise<void> {
    let query: any = admin.from(tabla).select('*')

    // Filtro por hospital_id directo si la tabla lo tiene
    if (['hospitales','servicios','perfiles','carros','equipos','alertas','notificaciones',
         'log_auditoria','plantillas','plantillas_informe','informes','hospital_config',
         'evidencias','ubicaciones'].includes(tabla)) {
      if (tabla === 'hospitales') {
        query = query.eq('id', body.hospital_id)
      } else {
        query = query.eq('hospital_id', body.hospital_id)
      }
    } else if (tabla === 'cajones') {
      // cajones → carros → hospital
      const { data: ids } = await admin.from('carros').select('id').eq('hospital_id', body.hospital_id)
      query = query.in('carro_id', (ids || []).map(c => c.id))
    } else if (tabla === 'materiales') {
      const { data: cajIds } = await admin.from('cajones').select('id, carro_id, carros!inner(hospital_id)')
        .eq('carros.hospital_id', body.hospital_id)
      query = query.in('cajon_id', (cajIds || []).map((c: any) => c.id))
    } else if (tabla === 'desfibriladores') {
      const { data: ids } = await admin.from('carros').select('id').eq('hospital_id', body.hospital_id)
      query = query.in('carro_id', (ids || []).map(c => c.id))
    } else if (tabla === 'inspecciones') {
      const { data: ids } = await admin.from('carros').select('id').eq('hospital_id', body.hospital_id)
      query = query.in('carro_id', (ids || []).map(c => c.id))
    } else if (tabla === 'items_inspeccion') {
      const { data: insIds } = await admin.from('inspecciones').select('id, carros!inner(hospital_id)')
        .eq('carros.hospital_id', body.hospital_id)
      query = query.in('inspeccion_id', (insIds || []).map((i: any) => i.id))
    } else if (tabla === 'historial_mantenimientos') {
      const { data: eqIds } = await admin.from('equipos').select('id').eq('hospital_id', body.hospital_id)
      query = query.in('equipo_id', (eqIds || []).map(e => e.id))
    } else if (tabla === 'plantilla_secciones') {
      const { data: plIds } = await admin.from('plantillas').select('id').eq('hospital_id', body.hospital_id)
      query = query.in('plantilla_id', (plIds || []).map(p => p.id))
    } else if (tabla === 'plantilla_items') {
      const { data: secIds } = await admin.from('plantilla_secciones')
        .select('id, plantillas!inner(hospital_id)')
        .eq('plantillas.hospital_id', body.hospital_id)
      query = query.in('seccion_id', (secIds || []).map((s: any) => s.id))
    } else if (tabla === 'plantilla_versiones') {
      const { data: plIds } = await admin.from('plantillas').select('id').eq('hospital_id', body.hospital_id)
      query = query.in('plantilla_id', (plIds || []).map(p => p.id))
    } else if (tabla === 'secciones') {
      // secciones → servicios → hospital
      const { data: svIds } = await admin.from('servicios').select('id').eq('hospital_id', body.hospital_id)
      query = query.in('servicio_id', (svIds || []).map(s => s.id))
    }

    // Filtro por servicio_id si la tabla lo tiene
    if (servicio_id) {
      if (['carros','equipos','plantillas','servicios'].includes(tabla)) {
        if (tabla === 'servicios') query = query.eq('id', servicio_id)
        else query = query.eq('servicio_id', servicio_id)
      } else if (tabla === 'secciones') {
        query = query.eq('servicio_id', servicio_id)
      }
    }

    // Filtro por periodo (campo fecha varía por tabla)
    const camposFecha: Partial<Record<Tabla, string>> = {
      inspecciones: 'fecha',
      historial_mantenimientos: 'fecha',
      alertas: 'creado_en',
      notificaciones: 'creado_en',
      log_auditoria: 'fecha',
      items_inspeccion: 'fecha_vencimiento',  // mejor que nada
    }
    const campoFecha = camposFecha[tabla]
    if (campoFecha && (desde || hasta)) {
      if (desde) query = query.gte(campoFecha, desde)
      if (hasta) query = query.lte(campoFecha, hasta + 'T23:59:59.999Z')
    }

    // Para perfiles, omitimos campos sensibles
    if (tabla === 'perfiles') {
      query = admin.from('perfiles').select('id, hospital_id, servicio_id, nombre, email, rol, activo, codigo_empleado, recibir_alertas, email_alertas, creado_en, updated_at, deleted_at')
        .eq('hospital_id', body.hospital_id)
    }

    const { data, error } = await query
    if (error) {
      console.error(`Error exportando ${tabla}:`, error.message)
      zip.file(`errors/${tabla}.txt`, `Error: ${error.message}\n`)
      return
    }
    const rows = data || []
    stats[tabla] = rows.length
    if (rows.length > 0) {
      zip.file(`${tabla}.csv`, toCSV(rows))
      zip.file(`${tabla}.json`, JSON.stringify(rows, null, 2))
    }
  }

  // Exportar tablas en paralelo (con límite implícito: 20 tablas no es problema)
  await Promise.all(tablas.map(t => exportarTabla(t).catch(e => {
    console.error(`Falló ${t}:`, e)
    stats[t] = -1
  })))

  // Evidencias: lista de URLs (no descargamos los binarios para no inflar el ZIP).
  if (body.incluir_evidencias !== false) {
    const { data: evs } = await admin.from('evidencias').select('*')
      .eq('hospital_id', body.hospital_id)
    if (evs && evs.length > 0) {
      const lineas = ['url,hash_sha256,bucket,path,tipo,fecha,subido_por']
      for (const e of evs) {
        const { data: { publicUrl } } = admin.storage.from(e.bucket).getPublicUrl(e.path)
        lineas.push([publicUrl, e.hash_sha256, e.bucket, e.path, e.tipo, e.subido_en, e.subido_por]
          .map(csvEscape).join(','))
      }
      zip.file(`urls_evidencias.csv`, lineas.join('\n') + '\n')
    }
  }

  // README
  const readme = `# Export ÁSTOR — ${hospitalData?.nombre || 'Hospital'}

Generado el ${ahora} por ${perfil.rol} (${user.id})

Filtros aplicados:
  Hospital:     ${body.hospital_id}
  Desde:        ${desde || '(sin filtro)'}
  Hasta:        ${hasta || '(sin filtro)'}
  Servicio:     ${servicio_id || '(todos)'}
  Tablas:       ${tablas.join(', ')}

Estadísticas:
${Object.entries(stats).map(([t, n]) => `  ${t}: ${n} ${n === -1 ? '(error)' : 'filas'}`).join('\n')}

Estructura:
  - Cada tabla se exporta como CSV (formato abierto, abre en Excel) y JSON
    (formato estructurado, abre con cualquier herramienta de programación).
  - Archivos *.csv y *.json contienen los mismos datos.
  - urls_evidencias.csv: URLs públicas de fotos firmadas (válidas mientras
    el bucket de storage exista).

Cumplimiento:
  - RGPD Art. 20 (derecho de portabilidad de datos)
  - ISO 13485 (audit_log inmutable)

Si necesitas restaurar estos datos en una nueva instalación de ÁSTOR,
contacta con CRITIC SL — Servicios Médicos para asistencia.

CRITIC SL — Servicios Médicos
astormanager.com
`
  zip.file('README.txt', readme)

  const blob = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })

  const fechaArchivo = new Date().toISOString().slice(0, 10)
  const nombreArchivo = `astor-export_${hospitalSlug}_${fechaArchivo}.zip`

  return new Response(blob, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': blob.length.toString(),
    },
  })
})

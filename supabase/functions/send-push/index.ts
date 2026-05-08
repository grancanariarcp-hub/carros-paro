// supabase/functions/send-push/index.ts
// Llamada via pg_net desde el trigger trigger_alerta_push cuando se inserta
// una nueva alerta crítica/alta. Envía Web Push notifications a las
// suscripciones de los usuarios destinatarios.
//
// Implementa Web Push Protocol (RFC 8291) con encriptación aes128gcm y JWT
// VAPID (RFC 8292) usando Web Crypto API (sin dependencias npm).
//
// Las VAPID keys se leen de private.app_secrets:
//   - vapid_public_key  (65-byte P-256 uncompressed point, base64url)
//   - vapid_private_key (32-byte 'd' value del JWK, base64url)
//   - vapid_subject     (mailto:contacto@astormanager.com)

// Conectamos a postgres directamente, no vía PostgREST. Razones:
//   - El nuevo sistema "JWT Signing Keys" rompe el role-mapping de PostgREST
//     con las legacy JWT en algunos proyectos (queries devuelven [] aunque la
//     fila exista y RLS esté off).
//   - El cache de schema de PostgREST se queda pillado y los nuevos RPCs no
//     aparecen aunque se haga `notify pgrst, 'reload schema'` ni restart.
//   - postgres directo usa el role `postgres` (BYPASSRLS = true) — todo simple.
import postgres from 'npm:postgres@3.4.4'

const DATABASE_URL = Deno.env.get('SUPABASE_DB_URL')!
const APP_URL      = Deno.env.get('APP_URL') || 'https://app.astormanager.com'

const sql = postgres(DATABASE_URL, { prepare: false })

// ============================================================================
// Handler principal
// ============================================================================
Deno.serve(async (req) => {
  try {
    const { alerta_id } = await req.json()
    if (!alerta_id) return resp({ ok: false, error: 'alerta_id requerido' }, 400)

    console.log(`[send-push] alerta_id=${alerta_id}`)

    // 1) Cargar la alerta + carro + hospital
    //    Reintentamos hasta 3 veces con 500ms entre intentos por si pg_net
    //    invocó la función antes del commit de la transacción del INSERT.
    let alertas: any[] = []
    for (let intento = 1; intento <= 3; intento++) {
      alertas = await sql`
        select
          a.id, a.tipo, a.mensaje, a.severidad, a.creado_en,
          a.hospital_id, a.carro_id, a.equipo_id,
          c.codigo as c_codigo, c.nombre as c_nombre,
          c.ubicacion as c_ubicacion, c.servicio_id as c_servicio_id,
          h.nombre as h_nombre, h.color_primario as h_color
        from public.alertas a
        left join public.carros c on c.id = a.carro_id
        left join public.hospitales h on h.id = a.hospital_id
        where a.id = ${alerta_id}::uuid
        limit 1
      `
      if (alertas.length > 0) break
      console.log(`[send-push] intento ${intento}: alerta no visible aún, reintentando...`)
      await new Promise(r => setTimeout(r, 500))
    }
    if (alertas.length === 0) {
      console.log(`[send-push] alerta ${alerta_id} NO encontrada tras 3 intentos`)
      return resp({ ok: false, error: 'Alerta no encontrada' }, 404)
    }
    const a = alertas[0]
    const alerta = {
      id: a.id, tipo: a.tipo, mensaje: a.mensaje, severidad: a.severidad,
      creado_en: a.creado_en, hospital_id: a.hospital_id,
      carro_id: a.carro_id, equipo_id: a.equipo_id,
      carro: a.carro_id ? {
        codigo: a.c_codigo, nombre: a.c_nombre,
        ubicacion: a.c_ubicacion, servicio_id: a.c_servicio_id,
      } : null,
      hospital: { nombre: a.h_nombre, color_primario: a.h_color },
    }

    // 2) Destinatarios
    const destinatariosIds = await calcularDestinatarios(alerta)
    if (destinatariosIds.length === 0) {
      return resp({ ok: true, mensaje: 'Sin destinatarios' })
    }

    // 3) Suscripciones push de los destinatarios
    //    Iteramos por usuario para evitar problemas con arrays UUID en postgres.js
    const subs: any[] = []
    for (const userId of destinatariosIds) {
      const filasU = await sql`
        select id, usuario_id, endpoint, p256dh, auth
        from public.web_push_subscriptions
        where usuario_id = ${userId}::uuid
      `
      for (const f of filasU) subs.push(f)
    }
    if (subs.length === 0) {
      return resp({ ok: true, mensaje: 'Sin suscripciones push' })
    }

    // 4) VAPID keys (también via direct postgres)
    const vapid = await cargarVapid()
    if (!vapid) return resp({ ok: false, error: 'VAPID no configurado' }, 500)

    // 5) Payload
    const payload = construirPayload(alerta)

    // 6) Envío
    let enviados = 0
    const invalidas: string[] = []
    for (const sub of subs) {
      try {
        const r = await enviarPush(sub as any, payload, vapid)
        if (r.ok) {
          enviados++
        } else if (r.status === 404 || r.status === 410) {
          invalidas.push(sub.id)
          console.log(`[send-push] sub ${sub.id} expirada (${r.status}), eliminando`)
        } else {
          console.error(`[send-push] error ${r.status} para sub ${sub.id}: ${r.body}`)
        }
      } catch (err: any) {
        console.error(`[send-push] excepción: ${err.message}`)
      }
    }

    // 7) Limpiar suscripciones muertas
    for (const subId of invalidas) {
      await sql`delete from public.web_push_subscriptions where id = ${subId}::uuid`
    }

    console.log(`[send-push] ✓ ${enviados}/${subs.length} push enviados para alerta ${alerta_id}`)
    return resp({ ok: true, enviados, total: subs.length, eliminadas: invalidas.length })

  } catch (err: any) {
    console.error('[send-push] ERROR:', err)
    return resp({ ok: false, error: err.message }, 500)
  }
})

// ============================================================================
// Destinatarios
// ============================================================================
async function calcularDestinatarios(alerta: any): Promise<string[]> {
  const servicioId: string | null = alerta.carro?.servicio_id ?? null
  const filas = await sql`
    select id from public.perfiles
    where activo = true
      and (
        (rol in ('administrador','calidad') and hospital_id = ${alerta.hospital_id}::uuid)
        or (rol = 'supervisor' and hospital_id = ${alerta.hospital_id}::uuid
            and (${servicioId}::uuid is null or servicio_id = ${servicioId}::uuid))
        or rol = 'superadmin'
      )
  `
  return filas.map((f: any) => f.id)
}

// ============================================================================
// Payload del push
// ============================================================================
function construirPayload(alerta: any): Uint8Array {
  // El RPC fn_alerta_full devuelve carro y hospital embebidos como objetos
  const carro = alerta.carro
  const hospital = alerta.hospital
  const tipoLabel = labelTipo(alerta.tipo)
  const icono = iconoTipo(alerta.tipo, alerta.severidad)

  const titulo = carro
    ? `${icono} ${tipoLabel} · ${carro.codigo}`
    : `${icono} ${tipoLabel}`
  const cuerpo = alerta.mensaje?.slice(0, 200) || 'Nueva alerta'

  const data = {
    title: titulo,
    body:  cuerpo,
    tag:   `alerta-${alerta.id}`,
    url:   `${APP_URL}/admin`,
    hospital: hospital?.nombre || '',
    severidad: alerta.severidad,
    alerta_id: alerta.id,
  }
  return new TextEncoder().encode(JSON.stringify(data))
}

function labelTipo(tipo: string): string {
  const m: Record<string, string> = {
    carro_no_operativo: 'Carro no operativo',
    equipo_mantenimiento_vencido: 'Mantenimiento vencido',
    equipo_calibracion_vencida: 'Calibración vencida',
    material_caducado: 'Material caducado',
    control_vencido: 'Control vencido',
  }
  return m[tipo] || tipo?.replace(/_/g, ' ') || 'Alerta'
}

function iconoTipo(tipo: string, severidad: string): string {
  if (tipo === 'carro_no_operativo') return '🚨'
  if (severidad === 'critica') return '🚨'
  if (severidad === 'alta') return '⚠️'
  return '🔔'
}

// ============================================================================
// VAPID keys desde private.app_secrets
// ============================================================================
async function cargarVapid(): Promise<{ publicKey: Uint8Array; privateD: Uint8Array; subject: string } | null> {
  // Lectura directa de private.app_secrets via postgres (bypass PostgREST).
  const filas = await sql`
    select key, value from private.app_secrets
    where key in ('vapid_public_key', 'vapid_private_key', 'vapid_subject')
  `
  const m: Record<string, string> = {}
  for (const r of filas) m[r.key as string] = r.value as string

  if (!m.vapid_public_key || !m.vapid_private_key || !m.vapid_subject) return null
  return {
    publicKey: b64urlDecode(m.vapid_public_key),
    privateD:  b64urlDecode(m.vapid_private_key),
    subject:   m.vapid_subject,
  }
}

// ============================================================================
// Envío de un push
// ============================================================================
async function enviarPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: Uint8Array,
  vapid: { publicKey: Uint8Array; privateD: Uint8Array; subject: string },
): Promise<{ ok: boolean; status: number; body?: string }> {
  // 1) Encriptar payload
  const cipher = await encryptPayload(
    payload,
    b64urlDecode(sub.p256dh),
    b64urlDecode(sub.auth),
  )

  // 2) JWT VAPID firmado con la clave privada
  const audience = new URL(sub.endpoint).origin
  const jwt = await vapidJwt(audience, vapid.subject, vapid.publicKey, vapid.privateD)
  const vapidPubB64 = b64urlEncode(vapid.publicKey)

  // 3) POST al endpoint
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'high',
      'Authorization': `vapid t=${jwt}, k=${vapidPubB64}`,
    },
    body: cipher,
  })

  if (res.ok) return { ok: true, status: res.status }
  const body = await res.text().catch(() => '')
  return { ok: false, status: res.status, body }
}

// ============================================================================
// Web Push encryption (RFC 8291 - aes128gcm)
// ============================================================================
async function encryptPayload(
  payload: Uint8Array,
  uaPublicRaw: Uint8Array,    // 65 bytes uncompressed P-256
  authSecret: Uint8Array,     // 16 bytes
): Promise<Uint8Array> {
  // 1) Generar par efímero P-256
  const local = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  ) as CryptoKeyPair
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))

  // 2) Importar pública del UA
  const uaPub = await crypto.subtle.importKey(
    'raw', uaPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, [],
  )

  // 3) Shared secret
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPub }, local.privateKey, 256),
  )

  // 4) PRK_key = HKDF(authSecret, ecdh, "WebPush: info\0" || uaPub || localPub, 32)
  const enc = new TextEncoder()
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublicRaw, localPubRaw)
  const prk = await hkdf(authSecret, ecdh, keyInfo, 32)

  // 5) Salt aleatorio (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 6) CEK = HKDF(salt, prk, "Content-Encoding: aes128gcm\0", 16)
  const cek   = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16)

  // 7) Nonce = HKDF(salt, prk, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12)

  // 8) Plaintext = payload || 0x02 (delimiter de último record)
  const plaintext = new Uint8Array(payload.length + 1)
  plaintext.set(payload, 0)
  plaintext[payload.length] = 0x02

  // 9) AES-GCM encrypt
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, plaintext),
  )

  // 10) Body: salt(16) || rs(4 BE) || idlen(1) || keyid(idlen) || ciphertext
  //     rs = 4096 (record size); idlen = 65 (P-256 raw pub)
  const header = new Uint8Array(16 + 4 + 1 + 65)
  header.set(salt, 0)
  // rs = 4096 -> 0x00 0x00 0x10 0x00
  header[16] = 0x00; header[17] = 0x00; header[18] = 0x10; header[19] = 0x00
  header[20] = 65
  header.set(localPubRaw, 21)

  return concat(header, ciphertext)
}

// ============================================================================
// VAPID JWT (RFC 8292)
// ============================================================================
async function vapidJwt(
  audience: string,
  subject: string,
  pubRaw: Uint8Array,    // 65 bytes uncompressed
  privateD: Uint8Array,  // 32 bytes
): Promise<string> {
  const header  = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h
    sub: subject,
  }
  const enc = new TextEncoder()
  const headerB64  = b64urlEncode(enc.encode(JSON.stringify(header)))
  const payloadB64 = b64urlEncode(enc.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  // Web Crypto necesita JWK completo para importar la privada
  // Extraemos x,y de la pública uncompressed: 0x04 || x(32) || y(32)
  const x = pubRaw.slice(1, 33)
  const y = pubRaw.slice(33, 65)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(x),
    y: b64urlEncode(y),
    d: b64urlEncode(privateD),
    ext: true,
  }
  const privateKey = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(signingInput)),
  )
  return `${signingInput}.${b64urlEncode(signature)}`
}

// ============================================================================
// HKDF (HMAC-SHA256, single block — suficiente porque salida ≤ 32 bytes)
// ============================================================================
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  if (length > 32) throw new Error('hkdf length > 32 no soportado')
  const saltKey = await crypto.subtle.importKey(
    'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm))
  const prkKey = await crypto.subtle.importKey(
    'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  // T(1) = HMAC(prk, info || 0x01)
  const t1Input = new Uint8Array(info.length + 1)
  t1Input.set(info, 0)
  t1Input[info.length] = 1
  const t1 = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, t1Input))
  return t1.slice(0, length)
}

// ============================================================================
// Utilidades
// ============================================================================
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrs) { out.set(a, off); off += a.length }
  return out
}

function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64urlEncode(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function resp(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

// lib/push-client.ts
// Helpers de cliente para gestionar la suscripción Web Push del usuario.
// Registra el service worker, pide permiso al navegador, suscribe vía
// PushManager y guarda la suscripción en BD (tabla web_push_subscriptions).

import { createClient } from '@/lib/supabase'

export const PUSH_SOPORTADO =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

/** Estado del permiso (sin pedirlo). */
export function permisoActual(): NotificationPermission | 'unsupported' {
  if (!PUSH_SOPORTADO) return 'unsupported'
  return Notification.permission
}

/** Convierte la clave VAPID base64url -> ArrayBuffer (formato que pide subscribe). */
function vapidKeyToBuffer(key: string): ArrayBuffer {
  const padding = '='.repeat((4 - (key.length % 4)) % 4)
  const base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

/** Registra (o reusa) el service worker en /sw.js. */
export async function registrarSW(): Promise<ServiceWorkerRegistration> {
  if (!PUSH_SOPORTADO) throw new Error('Push no soportado en este navegador')
  // Si ya hay uno, lo reusa
  const existente = await navigator.serviceWorker.getRegistration('/')
  if (existente) return existente
  return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

/** ¿Está el usuario actual suscrito a push en este navegador? */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!PUSH_SOPORTADO) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) return null
  return await reg.pushManager.getSubscription()
}

/** Pide permiso (si hace falta), suscribe y guarda en BD. */
export async function activarPush(usuarioId: string): Promise<{ ok: boolean; error?: string }> {
  if (!PUSH_SOPORTADO) return { ok: false, error: 'Push no soportado' }

  const vapidPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPub) return { ok: false, error: 'VAPID public key no configurada' }

  // 1) Permiso
  let permiso = Notification.permission
  if (permiso === 'default') {
    permiso = await Notification.requestPermission()
  }
  if (permiso !== 'granted') {
    return { ok: false, error: 'Permiso denegado' }
  }

  // 2) Service worker
  const reg = await registrarSW()
  await navigator.serviceWorker.ready

  // 3) Suscribir
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyToBuffer(vapidPub),
    })
  }

  // 4) Extraer keys p256dh/auth y guardar en BD
  const json = sub.toJSON() as any
  const p256dh = json.keys?.p256dh
  const auth   = json.keys?.auth
  if (!p256dh || !auth) return { ok: false, error: 'Suscripción sin claves' }

  const supabase = createClient()
  const { error } = await supabase.from('web_push_subscriptions').upsert(
    {
      usuario_id: usuarioId,
      endpoint:   sub.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 200),
      ultima_uso: new Date().toISOString(),
    },
    { onConflict: 'usuario_id,endpoint' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Cancela la suscripción del navegador y la borra de BD. */
export async function desactivarPush(usuarioId: string): Promise<{ ok: boolean; error?: string }> {
  if (!PUSH_SOPORTADO) return { ok: false, error: 'Push no soportado' }
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = reg ? await reg.pushManager.getSubscription() : null

  const supabase = createClient()
  if (sub) {
    await supabase.from('web_push_subscriptions')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return { ok: true }
}

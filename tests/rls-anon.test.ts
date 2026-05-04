/**
 * Tests RLS — el cliente anónimo (sin login) NO debe poder leer datos
 * sensibles. Simula a un atacante con la anon key pública.
 *
 * Si esta suite falla, hay una FUGA RLS abierta en producción.
 *
 * Apuntan a astor-dev (.env.local) — NO modifican datos.
 */

import { describe, it, expect } from 'vitest'
import { anonClient } from './helpers'

describe('RLS — cliente anon (sin login)', () => {
  const supabase = anonClient()

  it('NO puede leer perfiles', async () => {
    const { data, error } = await supabase.from('perfiles').select('id, email').limit(5)
    // RLS debe filtrar TODO → o devuelve [] o devuelve error
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer carros', async () => {
    const { data } = await supabase.from('carros').select('id, codigo, hospital_id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer cajones', async () => {
    const { data } = await supabase.from('cajones').select('id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer materiales', async () => {
    const { data } = await supabase.from('materiales').select('id, nombre').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer desfibriladores', async () => {
    const { data } = await supabase.from('desfibriladores').select('id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer equipos', async () => {
    const { data } = await supabase.from('equipos').select('id, hospital_id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer servicios', async () => {
    const { data } = await supabase.from('servicios').select('id, nombre').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer inspecciones', async () => {
    const { data } = await supabase.from('inspecciones').select('id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer items_inspeccion', async () => {
    const { data } = await supabase.from('items_inspeccion').select('id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer alertas', async () => {
    const { data } = await supabase.from('alertas').select('id, mensaje').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer notificaciones', async () => {
    const { data } = await supabase.from('notificaciones').select('id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer log_auditoria', async () => {
    const { data } = await supabase.from('log_auditoria').select('id, accion').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer plantillas', async () => {
    const { data } = await supabase.from('plantillas').select('id, nombre').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('NO puede leer historial_mantenimientos', async () => {
    const { data } = await supabase.from('historial_mantenimientos').select('id').limit(5)
    expect(data ?? []).toEqual([])
  })

  it('SÍ puede leer hospitales activos (necesario para login por slug)', async () => {
    const { data } = await supabase.from('hospitales').select('slug, nombre').limit(5)
    // Esta política es intencional: la pantalla de login lee hospitales por slug
    // sin estar autenticado todavía. Solo expone slug + nombre, no datos críticos.
    // Si fallase, la pantalla [slug]/page.tsx no podría cargar el theming.
    expect(Array.isArray(data)).toBe(true)
  })

  it('NO puede insertar en perfiles', async () => {
    const { error } = await supabase.from('perfiles').insert({
      id: '00000000-0000-0000-0000-000000000099',
      hospital_id: '00000000-0000-0000-0000-000000000001',
      nombre: 'attacker',
      email: 'attacker@evil.com',
      rol: 'superadmin',
      activo: true,
    })
    // Debe haber error (RLS bloquea el INSERT)
    expect(error).not.toBeNull()
  })

  it('NO puede insertar en alertas', async () => {
    const { error } = await supabase.from('alertas').insert({
      hospital_id: '00000000-0000-0000-0000-000000000001',
      tipo: 'sistema',
      severidad: 'critica',
      mensaje: 'attack',
    })
    expect(error).not.toBeNull()
  })

  it('puede crear solicitudes_registro (formulario público)', async () => {
    // El formulario público inserta sin .select() — anon NO puede SELECT
    // (intencional: solo admins ven las solicitudes). Solo verificamos
    // que el INSERT se acepta, no leemos la fila resultante.
    const email = `test-rls-${Date.now()}@example.com`
    const { error } = await supabase.from('solicitudes_registro').insert({
      nombre: 'Test RLS',
      email,
      hospital_nombre: 'Test',
      rol_solicitado: 'auditor',
    })
    expect(error).toBeNull()

    // Cleanup vía service_role
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { serviceClient } = await import('./helpers')
      await serviceClient().from('solicitudes_registro').delete().eq('email', email)
    }
  })

  it('NO puede LEER solicitudes_registro (admin-only)', async () => {
    const { data } = await supabase.from('solicitudes_registro').select('id, email').limit(5)
    expect(data ?? []).toEqual([])
  })
})

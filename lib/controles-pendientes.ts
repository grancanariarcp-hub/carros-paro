/**
 * Controles que se rellenaron sin cobertura y esperan a poder enviarse.
 *
 * El trabajo real ocurre a pie de carro, en pasillos y sótanos donde la wifi
 * del hospital falla. Y desde que el control se guarda en una sola transacción
 * —que es lo correcto—, una caída de red al firmar ya no deja media
 * inspección: no deja ninguna. Quien acaba de revisar cuarenta ítems los
 * pierde enteros y acaba rellenándolo de memoria en el despacho, que destruye
 * justo el valor que la aplicación promete.
 *
 * Aquí el control se guarda en el propio dispositivo en cuanto se firma, y se
 * envía cuando vuelva la red. Se usa IndexedDB y no localStorage porque las
 * fotos pesan y localStorage se queda en unos pocos megas.
 *
 * Lo que NO se guarda aquí son las fotos pendientes de subir: se suben antes
 * de firmar, así que para cuando un control llega a esta cola sus imágenes ya
 * están en el servidor y solo quedan sus URLs.
 */

const BASE = 'astor-pendientes'
const ALMACEN = 'controles'
const VERSION = 1

export interface ControlPendiente {
  id: string
  /** Los mismos argumentos que espera registrar_control. */
  argumentos: Record<string, unknown>
  /** Para poder decir de qué carro es sin abrir el control. */
  carroCodigo: string
  carroId: string
  guardadoEn: number
  intentos: number
  ultimoError?: string
}

function soportado(): boolean {
  return typeof indexedDB !== 'undefined'
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function conAlmacen<T>(
  modo: IDBTransactionMode,
  fn: (almacen: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await abrir()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(ALMACEN, modo)
    const req = fn(tx.objectStore(ALMACEN))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/** Guarda un control para enviarlo más tarde. Devuelve su identificador. */
export async function guardarPendiente(
  argumentos: Record<string, unknown>,
  carro: { id: string; codigo: string },
): Promise<string | null> {
  if (!soportado()) return null

  const pendiente: ControlPendiente = {
    // Sin Math.random: dos controles seguidos en el mismo milisegundo son
    // improbables, pero el identificador del carro los separa igualmente.
    id: `${carro.id}-${Date.now()}`,
    argumentos,
    carroCodigo: carro.codigo,
    carroId: carro.id,
    guardadoEn: Date.now(),
    intentos: 0,
  }

  try {
    await conAlmacen('readwrite', a => a.put(pendiente))
    return pendiente.id
  } catch {
    return null
  }
}

export async function listarPendientes(): Promise<ControlPendiente[]> {
  if (!soportado()) return []
  try {
    const todos = await conAlmacen<ControlPendiente[]>('readonly', a => a.getAll())
    return (todos || []).sort((a, b) => a.guardadoEn - b.guardadoEn)
  } catch {
    return []
  }
}

export async function olvidarPendiente(id: string): Promise<void> {
  if (!soportado()) return
  try { await conAlmacen('readwrite', a => a.delete(id)) } catch { /* da igual */ }
}

/** Anota que un intento falló, para poder mostrar por qué. */
export async function anotarFallo(id: string, motivo: string): Promise<void> {
  if (!soportado()) return
  try {
    const p = await conAlmacen<ControlPendiente>('readonly', a => a.get(id))
    if (!p) return
    p.intentos += 1
    p.ultimoError = motivo
    await conAlmacen('readwrite', a => a.put(p))
  } catch { /* da igual */ }
}

/**
 * Envía los controles pendientes que haya.
 *
 * Devuelve cuántos entraron y cuántos siguen esperando. Se para al primer
 * fallo de red: si no hay cobertura, insistir con los demás solo gasta batería.
 */
export async function enviarPendientes(
  // El constructor de consultas de Supabase es "thenable", no una promesa: se
  // espera igual con await, pero no encaja en el tipo Promise. Se pide lo
  // mínimo que hace falta para poder pasar el cliente tal cual.
  supabase: { rpc: (nombre: string, args: any) => PromiseLike<{ data: any; error: any }> },
): Promise<{ enviados: number; pendientes: number }> {
  const cola = await listarPendientes()
  let enviados = 0

  for (const p of cola) {
    try {
      const { error } = await supabase.rpc('registrar_control', p.argumentos)

      if (!error) {
        await olvidarPendiente(p.id)
        enviados++
        continue
      }

      // Un rechazo de la base no se arregla reintentando: el control es
      // inválido o el permiso no está. Se conserva para que alguien lo vea,
      // pero no se insiste en bucle.
      await anotarFallo(p.id, error.message)
      if (error.message?.match(/fetch|network|conexi/i)) break
    } catch (e: any) {
      await anotarFallo(p.id, e?.message ?? 'sin conexion')
      break
    }
  }

  return { enviados, pendientes: (await listarPendientes()).length }
}

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Acceso a las evidencias guardadas: firmas, precintos y fotos de incidencias.
 *
 * Estos archivos se guardaban en un almacén marcado como público, y un almacén
 * público se salta las políticas de acceso: la firma manuscrita de cualquier
 * inspección se descargaba con solo tener la URL, sin cuenta y sin dejar
 * rastro. Una firma identifica por nombre a una persona concreta, así que eso
 * era una fuga de datos personales, no un detalle de configuración.
 *
 * Ahora el almacén es privado y las imágenes se piden con un enlace firmado que
 * caduca. Quien no tenga sesión no las ve, y quien la tenga solo ve las de su
 * hospital, que es lo que ya decían las políticas y el almacén público hacía
 * inútil.
 *
 * En la base siguen guardadas las URL antiguas, con forma de enlace público.
 * De ahí se saca la ruta: así los informes de hace meses siguen mostrando su
 * firma en vez de un hueco.
 */

/** Cuánto vive un enlace: suficiente para ver o imprimir, no para repartir. */
const MINUTOS_DE_VIDA = 60

export interface RutaGuardada {
  bucket: string
  ruta: string
}

/**
 * Saca bucket y ruta de una URL guardada.
 *
 * Acepta las tres formas que hay en la base: el enlace público de siempre, uno
 * ya firmado, y una ruta suelta por si alguna vez se guarda así.
 */
export function rutaDeEvidencia(url: string | null | undefined): RutaGuardada | null {
  if (!url) return null

  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/)
  if (m) return { bucket: m[1], ruta: decodeURIComponent(m[2]) }

  // Una ruta suelta, sin dominio. Se asume el almacén de evidencias.
  if (!url.startsWith('http')) return { bucket: 'evidencias', ruta: url }

  return null
}

/**
 * Convierte una URL guardada en una que se pueda mostrar ahora mismo.
 *
 * Si algo falla devuelve la original en vez de nada: una imagen que quizá no
 * carga es mejor que una ficha rota, y el resto de la pantalla sigue sirviendo.
 */
export async function urlVisible(
  supabase: SupabaseClient,
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null

  const destino = rutaDeEvidencia(url)
  if (!destino) return url

  const { data, error } = await supabase.storage
    .from(destino.bucket)
    .createSignedUrl(destino.ruta, MINUTOS_DE_VIDA * 60)

  if (error || !data?.signedUrl) {
    console.warn('[evidencias] no se pudo firmar el enlace:', error?.message)
    return url
  }
  return data.signedUrl
}

/**
 * Firma varias de una vez.
 *
 * Los informes muestran decenas de fotos; pedirlas de una en una son decenas
 * de viajes al servidor y el PDF tarda en aparecer.
 */
export async function urlsVisibles(
  supabase: SupabaseClient,
  urls: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>()

  // Se agrupan por almacén: la API firma en lote, pero de un bucket cada vez.
  const porBucket = new Map<string, { ruta: string; original: string }[]>()
  for (const u of urls) {
    if (!u) continue
    const d = rutaDeEvidencia(u)
    if (!d) continue
    const lista = porBucket.get(d.bucket) ?? []
    lista.push({ ruta: d.ruta, original: u })
    porBucket.set(d.bucket, lista)
  }

  for (const [bucket, entradas] of porBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(entradas.map(e => e.ruta), MINUTOS_DE_VIDA * 60)

    if (error || !data) {
      // Se dejan las originales: la pantalla se dibuja igual.
      for (const e of entradas) resultado.set(e.original, e.original)
      continue
    }
    data.forEach((firmada, i) => {
      const original = entradas[i].original
      resultado.set(original, firmada.signedUrl ?? original)
    })
  }

  return resultado
}

'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname, useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'
import { compressLogo, ratioCompresion } from '@/lib/image-utils'

/**
 * Gestor de logos institucionales para un hospital. Solo accesible al superadmin.
 *
 * Sube:
 *   - logo_url (logo del hospital — aparece en la topbar y en el dashboard)
 *   - informe_logo_principal_url (primer logo del encabezado de informes)
 *   - informe_logo_secundario_url (segundo logo)
 *
 * Storage: bucket 'logos', path 'hospital-{id}/{nombre}.{ext}'.
 * Política RLS: solo superadmin puede insertar/actualizar/borrar (lectura pública).
 */

const SLOTS = [
  {
    key: 'logo_url' as const,
    tabla: 'hospitales' as const,
    nombreArchivo: 'hospital-logo',
    titulo: 'Logo del hospital',
    descripcion: 'Aparece en la topbar y en la pantalla de login del hospital. Recomendado: PNG transparente, 200×60px aprox.',
  },
  {
    key: 'informe_logo_principal_url' as const,
    tabla: 'hospital_config' as const,
    nombreArchivo: 'informe-principal',
    titulo: 'Logo principal de informes',
    descripcion: 'Primer logo del encabezado oficial de los PDFs (ej. logo del Servicio de Salud). Aparece en todos los informes generados.',
  },
  {
    key: 'informe_logo_secundario_url' as const,
    tabla: 'hospital_config' as const,
    nombreArchivo: 'informe-secundario',
    titulo: 'Logo secundario de informes',
    descripcion: 'Segundo logo del encabezado (ej. Gobierno autonómico, Fundación). Opcional — déjalo vacío si no aplica.',
  },
]

type SlotKey = (typeof SLOTS)[number]['key']

export default function HospitalLogosPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [subiendo, setSubiendo] = useState<SlotKey | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const hospitalId = params.id as string
  const supabase = createClient()
  const fileRefs = useRef<Record<SlotKey, HTMLInputElement | null>>({} as any)

  useEffect(() => { cargar() }, [hospitalId])

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || p.rol !== 'superadmin') {
      toast.error('Solo el superadmin gestiona logos')
      router.push(rutaPadre(pathname))
      return
    }
    setPerfil(p)

    const { data: h } = await supabase.from('hospitales').select('*').eq('id', hospitalId).single()
    if (!h) { toast.error('Hospital no encontrado'); router.push('/superadmin'); return }
    setHospital(h)

    const { data: c } = await supabase.from('hospital_config')
      .select('*').eq('hospital_id', hospitalId).maybeSingle()
    setConfig(c)

    setLoading(false)
  }

  async function handleArchivo(slot: SlotKey, file: File) {
    if (!file) return
    const slotInfo = SLOTS.find(s => s.key === slot)!

    // Validar tamaño (10 MB para el original — luego se comprime)
    if (file.size > 10_000_000) {
      toast.error('El archivo no puede pesar más de 10 MB')
      return
    }
    if (!/^image\//.test(file.type)) {
      toast.error('Sube un archivo de imagen (PNG, JPG, SVG, WebP)')
      return
    }

    setSubiendo(slot)
    try {
      // Comprimir antes de subir (max 400px, WebP si soportado).
      // SVG se devuelve sin tocar (vector ya óptimo).
      const original = file
      const archivo = await compressLogo(file)
      if (archivo.size !== original.size) {
        console.log(`[logos] ${slot}: ${ratioCompresion(original.size, archivo.size)}`)
      }

      const ext = archivo.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `hospital-${hospitalId}/${slotInfo.nombreArchivo}.${ext}`

      // Subir (con upsert para que sobrescriba si ya existe)
      const { error: upErr } = await supabase.storage
        .from('logos')
        .upload(path, archivo, { upsert: true, contentType: archivo.type })
      if (upErr) throw upErr

      // URL pública
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
      // Cache-buster: añadir timestamp para que el navegador no muestre la versión cacheada
      const urlConCache = `${publicUrl}?v=${Date.now()}`

      // Actualizar BD según la tabla del slot
      if (slotInfo.tabla === 'hospitales') {
        const { error } = await supabase.from('hospitales')
          .update({ [slot]: urlConCache }).eq('id', hospitalId)
        if (error) throw error
        setHospital((h: any) => ({ ...h, [slot]: urlConCache }))
      } else {
        // hospital_config — upsert por hospital_id
        const { error } = await supabase.from('hospital_config').upsert(
          {
            hospital_id: hospitalId,
            [slot]: urlConCache,
            actualizado_en: new Date().toISOString(),
          },
          { onConflict: 'hospital_id' }
        )
        if (error) throw error
        setConfig((c: any) => ({ ...(c || { hospital_id: hospitalId }), [slot]: urlConCache }))
      }

      toast.success(`${slotInfo.titulo} actualizado`)
    } catch (err: any) {
      toast.error('Error subiendo logo: ' + err.message)
    } finally {
      setSubiendo(null)
    }
  }

  async function eliminar(slot: SlotKey) {
    const slotInfo = SLOTS.find(s => s.key === slot)!
    if (!confirm(`¿Quitar el ${slotInfo.titulo.toLowerCase()}? Los informes ya generados no se modifican.`)) return

    if (slotInfo.tabla === 'hospitales') {
      const { error } = await supabase.from('hospitales')
        .update({ [slot]: null }).eq('id', hospitalId)
      if (error) { toast.error(error.message); return }
      setHospital((h: any) => ({ ...h, [slot]: null }))
    } else {
      const { error } = await supabase.from('hospital_config')
        .update({ [slot]: null }).eq('hospital_id', hospitalId)
      if (error) { toast.error(error.message); return }
      setConfig((c: any) => ({ ...c, [slot]: null }))
    }
    toast.success(`${slotInfo.titulo} eliminado`)
  }

  function urlActual(slot: SlotKey): string | null {
    const slotInfo = SLOTS.find(s => s.key === slot)!
    if (slotInfo.tabla === 'hospitales') return hospital?.[slot] ?? null
    return config?.[slot] ?? null
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando…</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))}
          className="text-blue-700 text-sm font-medium flex-shrink-0">← Volver</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs text-gray-400 leading-none">{hospital?.nombre}</div>
          <div className="font-semibold text-sm">Logos institucionales</div>
        </div>
        <div className="w-12 flex-shrink-0" />
      </div>

      <div className="content">

        <div className="card bg-blue-50 border-blue-100 text-xs text-blue-800">
          Subes los logos UNA vez. Aparecen automáticamente en la topbar del hospital,
          la pantalla de login y el encabezado de TODOS los informes generados desde
          la app. Los administradores del hospital configuran luego los textos.
        </div>

        {SLOTS.map(slot => {
          const url = urlActual(slot.key)
          return (
            <div key={slot.key} className="card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{slot.titulo}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{slot.descripcion}</div>
                </div>
                {url && (
                  <button onClick={() => eliminar(slot.key)}
                    className="text-xs text-red-600 hover:underline flex-shrink-0">
                    Quitar
                  </button>
                )}
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-xl p-4 mb-3 flex items-center justify-center min-h-[100px]">
                {url ? (
                  <img src={url} alt={slot.titulo}
                    className="max-h-24 max-w-full object-contain"
                    crossOrigin="anonymous" />
                ) : (
                  <div className="text-xs text-gray-400 text-center">
                    Sin logo configurado
                  </div>
                )}
              </div>

              <input
                ref={el => { fileRefs.current[slot.key] = el }}
                type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleArchivo(slot.key, file)
                  if (e.target) e.target.value = ''  // permite re-subir el mismo archivo
                }} />
              <button
                type="button"
                onClick={() => fileRefs.current[slot.key]?.click()}
                disabled={subiendo === slot.key}
                className="btn-secondary w-full disabled:opacity-50">
                {subiendo === slot.key
                  ? 'Subiendo…'
                  : url ? 'Reemplazar logo' : 'Subir logo'}
              </button>
            </div>
          )
        })}

        <div className="text-xs text-gray-400 mt-2 text-center">
          Formatos admitidos: PNG, JPG, SVG, WebP. Tamaño máximo: 2 MB. Se recomiendan
          fondos transparentes (PNG) para que se integren mejor con el color primario.
        </div>
      </div>
    </div>
  )
}

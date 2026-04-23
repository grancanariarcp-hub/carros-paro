'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { estadoColor, formatFecha, formatFechaHora } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Carro, Inspeccion, Perfil } from '@/lib/types'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'

export default function MenuCarroPage() {
  const [carro, setCarro] = useState<Carro|null>(null)
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([])
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [loading, setLoading] = useState(true)
  const [vencimientosAlert, setVencimientosAlert] = useState(0)
  const [editandoCenso, setEditandoCenso] = useState(false)
  const [numeroCenso, setNumeroCenso] = useState('')
  const [guardandoCenso, setGuardandoCenso] = useState(false)
  const [escaneando, setEscaneando] = useState(false)
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    setPerfil(p)

    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('id', id).single()
    if (!c) { router.back(); return }
    setCarro(c)
    setNumeroCenso((c as any).numero_censo || '')

    const { data: ins } = await supabase.from('inspecciones')
      .select('*, perfiles(nombre)')
      .eq('carro_id', id)
      .order('fecha', { ascending: false })
      .limit(5)
    setInspecciones(ins || [])

    const { data: cajs } = await supabase.from('cajones')
      .select('materiales(*)')
      .eq('carro_id', id)
      .eq('activo', true)
    let alertas = 0
    for (const caj of (cajs || [])) {
      for (const mat of ((caj as any).materiales || [])) {
        if (mat.activo && mat.tiene_vencimiento && mat.fecha_vencimiento) {
          const dias = Math.ceil((new Date(mat.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          if (dias <= 30) alertas++
        }
      }
    }
    setVencimientosAlert(alertas)
    setLoading(false)
  }

  async function guardarCenso() {
    setGuardandoCenso(true)
    const { error } = await supabase.from('carros').update({
      numero_censo: numeroCenso || null,
      codigo_barras_censo: numeroCenso || null,
    }).eq('id', id)
    if (error) { toast.error('Error al guardar'); setGuardandoCenso(false); return }
    toast.success('Número de censo actualizado')
    setCarro(prev => prev ? { ...prev, numero_censo: numeroCenso } as any : prev)
    setEditandoCenso(false)
    setGuardandoCenso(false)
  }

  function handleEscaneo(codigo: string) {
    setEscaneando(false)
    setNumeroCenso(codigo)
    setEditandoCenso(true)
    toast.success('Código leído: ' + codigo)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>
  if (!carro) return null

  const e = estadoColor(carro.estado)
  const puedeEditar = perfil?.rol === 'administrador' || perfil?.rol === 'supervisor' || perfil?.rol === 'superadmin'

  return (
    <div className="page">
      {escaneando && (
        <EscanerCodigoBarras
          onResult={handleEscaneo}
          onClose={() => setEscaneando(false)}
        />
      )}

      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">{carro.codigo}</span>
      </div>

      <div className="content">
        {/* Info del carro */}
        <div className="card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-semibold text-base">{carro.codigo}</div>
              <div className="text-sm text-gray-500">{carro.nombre}</div>
            </div>
            <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="label">Servicio</div>
              <div className="font-medium">{(carro.servicios as any)?.nombre || '—'}</div>
            </div>
            <div>
              <div className="label">Ubicación</div>
              <div className="font-medium">{carro.ubicacion || '—'}</div>
            </div>
            <div>
              <div className="label">Último control</div>
              <div className="font-medium">{formatFechaHora(carro.ultimo_control) || '—'}</div>
            </div>
            <div>
              <div className="label">Próximo control</div>
              <div className="font-medium">{formatFecha(carro.proximo_control) || '—'}</div>
            </div>
          </div>
          {carro.ultimo_tipo_control && (
            <div className="mt-2 pt-2 border-t border-gray-50">
              <span className="text-xs text-gray-400">Tipo anterior: </span>
              <span className="text-xs font-medium">{carro.ultimo_tipo_control.replace('_',' ')}</span>
            </div>
          )}
        </div>

        {/* Número de censo del carro */}
        {puedeEditar && (
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Número de censo</div>
              {!editandoCenso && (
                <button
                  onClick={() => setEditandoCenso(true)}
                  className="text-xs text-blue-600 font-semibold">
                  {(carro as any).numero_censo ? 'Editar' : 'Añadir'}
                </button>
              )}
            </div>

            {!editandoCenso ? (
              <div className="flex items-center justify-between">
                <div>
                  {(carro as any).numero_censo ? (
                    <div className="font-semibold text-sm">{(carro as any).numero_censo}</div>
                  ) : (
                    <div className="text-xs text-gray-400">Sin número de censo asignado</div>
                  )}
                </div>
                <button
                  onClick={() => setEscaneando(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold active:opacity-80">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" strokeWidth={2}/>
                    <rect x="14" y="3" width="7" height="7" strokeWidth={2}/>
                    <rect x="3" y="14" width="7" height="7" strokeWidth={2}/>
                    <rect x="14" y="14" width="3" height="3" strokeWidth={2}/>
                  </svg>
                  Escanear
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Escribe o escanea el número de censo"
                    value={numeroCenso}
                    onChange={e => setNumeroCenso(e.target.value)}
                    autoFocus
                  />
                  <button
                    onClick={() => setEscaneando(true)}
                    className="flex-shrink-0 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold active:opacity-80">
                    📷
                  </button>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1 py-2 text-xs" onClick={guardarCenso} disabled={guardandoCenso}>
                    {guardandoCenso ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button className="btn-secondary flex-1 py-2 text-xs" onClick={() => { setEditandoCenso(false); setNumeroCenso((carro as any).numero_censo || '') }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="section-title">Tipo de control</div>

        <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(`/carro/${id}/control/mensual`)}>
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2}/><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2}/><line x1="3" y1="10" x2="21" y2="10" strokeWidth={2}/></svg>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Control mensual</div>
            <div className="text-xs text-gray-400">Próximo: {formatFecha(carro.proximo_control)}</div>
          </div>
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
        </button>

        <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(`/carro/${id}/control/post_uso`)}>
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeWidth={2}/><polyline points="22 4 12 14.01 9 11.01" strokeWidth={2}/></svg>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Control post-utilización</div>
            <div className="text-xs text-gray-400">Después de usar el carro</div>
          </div>
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
        </button>

        {(perfil?.rol === 'supervisor' || perfil?.rol === 'administrador') && (
          <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(`/carro/${id}/control/extra`)}>
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><line x1="12" y1="8" x2="12" y2="16" strokeWidth={2}/><line x1="8" y1="12" x2="16" y2="12" strokeWidth={2}/></svg>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Control extra</div>
              <div className="text-xs text-gray-400">Control adicional programado</div>
            </div>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
          </button>
        )}

        <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(`/carro/${id}/vencimientos`)}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${vencimientosAlert > 0 ? 'bg-amber-100' : 'bg-green-100'}`}>
            <svg className={`w-5 h-5 ${vencimientosAlert > 0 ? 'text-amber-700' : 'text-green-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/>
              <line x1="16" y1="2" x2="16" y2="6" strokeWidth={2}/>
              <line x1="8" y1="2" x2="8" y2="6" strokeWidth={2}/>
              <line x1="3" y1="10" x2="21" y2="10" strokeWidth={2}/>
              <line x1="8" y1="14" x2="16" y2="14" strokeWidth={2}/>
              <line x1="8" y1="18" x2="12" y2="18" strokeWidth={2}/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Actualizar vencimientos</div>
            <div className="text-xs text-gray-400">
              {vencimientosAlert > 0
                ? `${vencimientosAlert} material${vencimientosAlert !== 1 ? 'es' : ''} vencido/s o próximo/s`
                : 'Todos los vencimientos al día'}
            </div>
          </div>
          {vencimientosAlert > 0 && (
            <span className="badge bg-amber-100 text-amber-800 text-xs">{vencimientosAlert}</span>
          )}
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
        </button>

        <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(`/carro/${id}/historial`)}>
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 20h9" strokeWidth={2}/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeWidth={2}/></svg>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Ver historial</div>
            <div className="text-xs text-gray-400">{inspecciones.length} controles registrados</div>
          </div>
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
        </button>

        <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(`/carro/${id}/qr`)}>
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" strokeWidth={2}/>
              <rect x="14" y="3" width="7" height="7" strokeWidth={2}/>
              <rect x="3" y="14" width="7" height="7" strokeWidth={2}/>
              <rect x="14" y="14" width="3" height="3" strokeWidth={2}/>
              <line x1="19" y1="14" x2="21" y2="14" strokeWidth={2}/>
              <line x1="19" y1="17" x2="21" y2="17" strokeWidth={2}/>
              <line x1="14" y1="19" x2="14" y2="21" strokeWidth={2}/>
              <line x1="17" y1="19" x2="21" y2="21" strokeWidth={2}/>
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Ver QR / Imprimir etiqueta</div>
            <div className="text-xs text-gray-400">Etiqueta 5×5 cm lista para imprimir</div>
          </div>
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
        </button>

        {(perfil?.rol === 'supervisor' || perfil?.rol === 'administrador') && (
          <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(`/admin/carro/${id}/materiales`)}>
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 11l3 3L22 4" strokeWidth={2}/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeWidth={2}/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Gestionar materiales</div>
              <div className="text-xs text-gray-400">Activar, desactivar o editar materiales</div>
            </div>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
          </button>
        )}
      </div>
    </div>
  )
}

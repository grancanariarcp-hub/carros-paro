'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { estadoColor, formatFecha, formatFechaHora } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Material {
  id: string
  nombre: string
  cantidad_requerida: number
  tiene_vencimiento: boolean
  fecha_vencimiento: string | null
  activo: boolean
  tipo_falla: string
}

interface Cajon {
  id: string
  nombre: string
  orden: number
  materiales: Material[]
}

function colorVto(fecha: string | null): string {
  if (!fecha) return 'bg-gray-100 text-gray-400'
  const dias = Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return 'bg-red-100 text-red-700 border border-red-300'
  if (dias <= 7) return 'bg-red-100 text-red-700 border border-red-300'
  if (dias <= 30) return 'bg-amber-100 text-amber-700 border border-amber-300'
  return 'bg-green-100 text-green-700 border border-green-300'
}

function labelVto(fecha: string | null): string {
  if (!fecha) return 'Sin fecha'
  const dias = Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return `Vencido`
  if (dias === 0) return 'Vence hoy'
  if (dias <= 30) return `${dias}d`
  return new Date(fecha).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

export default function QRPage() {
  const [carro, setCarro] = useState<any>(null)
  const [cajones, setCajones] = useState<Cajon[]>([])
  const [desf, setDesf] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [qrUrl, setQrUrl] = useState('')
  const [perfil, setPerfil] = useState<any>(null)
  const [mostrarLogin, setMostrarLogin] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginLoading, setLoginLoading] = useState(false)
  const [appUrl, setAppUrl] = useState('')
  const [cajonesExpandidos, setCajonesExpandidos] = useState<Record<string, boolean>>({})
  const router = useRouter()
  const params = useParams()
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [carroId])

  async function cargarDatos() {
    const url = window.location.origin
    setAppUrl(url)

    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('id', carroId).single()
    setCarro(c)

    const { data: cajs } = await supabase.from('cajones')
      .select('*, materiales(*)')
      .eq('carro_id', carroId)
      .eq('activo', true)
      .order('orden')

    const cajonesData = (cajs || []).map((caj: any) => ({
      ...caj,
      materiales: (caj.materiales || [])
        .filter((m: any) => m.activo)
        .sort((a: any, b: any) => a.orden - b.orden)
    }))
    setCajones(cajonesData)

    const expandidos: Record<string, boolean> = {}
    cajonesData.forEach((c: any, i: number) => { expandidos[c.id] = i === 0 })
    setCajonesExpandidos(expandidos)

    const { data: d } = await supabase.from('desfibriladores')
      .select('*').eq('carro_id', carroId).eq('activo', true).single()
    setDesf(d)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      if (p?.activo) setPerfil(p)
    }

    const carroUrl = `${url}/carro/${carroId}/qr`
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(carroUrl)}&bgcolor=ffffff&color=1d4ed8&margin=10`)
    setLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email, password: loginForm.password
      })
      if (error) throw error
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', data.user.id).single()
      if (!p?.activo) throw new Error('Tu cuenta no está aprobada')
      setPerfil(p)
      setMostrarLogin(false)
      toast.success(`Bienvenido/a ${p.nombre}`)
    } catch (err: any) {
      toast.error(err.message || 'Error al ingresar')
    } finally {
      setLoginLoading(false)
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    setPerfil(null)
    toast.success('Sesión cerrada')
  }

  function irAPanel() {
    if (perfil.rol === 'administrador') router.push('/admin')
    else if (perfil.rol === 'supervisor') router.push('/supervisor')
    else router.push('/auditor')
  }

  function toggleCajon(id: string) {
    setCajonesExpandidos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function generarPDF() {
    const carroUrl = `${appUrl}/carro/${carroId}/qr`
    const contenido = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; }
.etiqueta { width:5cm; height:5cm; border:2px solid #1d4ed8; border-radius:8px; padding:5px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; }
.hospital { font-size:6px; color:#1d4ed8; font-weight:bold; text-align:center; line-height:1.3; }
.qr-img { width:2cm; height:2cm; }
.codigo { font-size:11px; font-weight:bold; color:#1d4ed8; text-align:center; letter-spacing:1px; }
.info { font-size:6px; color:#334155; text-align:center; line-height:1.5; }
@media print { @page { margin:1cm; size:A4; } body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
</style></head><body>
<div class="etiqueta">
  <div class="hospital">H.U. Gran Canaria · Doctor Negrín</div>
  <img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(carroUrl)}&bgcolor=ffffff&color=1d4ed8&margin=5" />
  <div class="codigo">${carro?.codigo || ''}</div>
  <div class="info">${carro?.nombre || ''}<br>${(carro?.servicios as any)?.nombre || ''}<br>${carro?.ubicacion || ''}<br>${carro?.responsable ? 'Resp: ' + carro.responsable : ''}</div>
</div>
</body></html>`
    const v = window.open('', '_blank')
    if (v) { v.document.write(contenido); v.document.close(); v.onload = () => v.print() }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Cargando...</div></div>
  if (!carro) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-sm">Carro no encontrado</div></div>

  const e = estadoColor(carro.estado)
  const vencidosCount = cajones.reduce((acc, c) => acc + c.materiales.filter(m => {
    if (!m.tiene_vencimiento || !m.fecha_vencimiento) return false
    return new Date(m.fecha_vencimiento) <= new Date()
  }).length, 0)

  return (
    <div className="page">
      <div className="topbar">
        <div className="flex-1">
          <div style={{fontSize:'10px', color:'#94a3b8'}}>H.U. Gran Canaria Doctor Negrín</div>
          <div style={{fontSize:'13px', fontWeight:'600', color:'#1e293b'}}>Auditor Carros de Parada</div>
        </div>
        {perfil ? (
          <div className="flex items-center gap-2">
            <div style={{fontSize:'11px', color:'#64748b', textAlign:'right'}}>
              <div style={{fontWeight:'500'}}>{perfil.nombre}</div>
              <div style={{fontSize:'10px', color:'#94a3b8'}}>{perfil.rol}</div>
            </div>
            <button onClick={irAPanel}
              style={{fontSize:'11px', padding:'4px 8px', borderRadius:'8px', border:'1px solid #bfdbfe', background:'#EFF6FF', cursor:'pointer', color:'#1d4ed8', fontWeight:'500'}}>
              Mi panel
            </button>
            <button onClick={cerrarSesion}
              style={{fontSize:'11px', padding:'4px 8px', borderRadius:'8px', border:'1px solid #e2e8f0', background:'white', cursor:'pointer', color:'#64748b'}}>
              Salir
            </button>
          </div>
        ) : (
          <button onClick={() => setMostrarLogin(!mostrarLogin)}
            style={{fontSize:'12px', padding:'6px 12px', borderRadius:'8px', background:'#1d4ed8', color:'white', border:'none', cursor:'pointer', fontWeight:'500'}}>
            {mostrarLogin ? 'Cancelar' : 'Identificarse'}
          </button>
        )}
      </div>

      <div className="content">

        {/* Info carro — siempre visible */}
        <div className="card">
          <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'12px'}}>
            <div>
              <div style={{fontSize:'20px', fontWeight:'700', color:'#1d4ed8'}}>{carro.codigo}</div>
              <div style={{fontSize:'13px', color:'#64748b', marginTop:'2px'}}>{carro.nombre}</div>
            </div>
            <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px'}}>
            <div><div className="label">Servicio</div><div className="val">{(carro.servicios as any)?.nombre || '—'}</div></div>
            <div><div className="label">Ubicación</div><div className="val">{carro.ubicacion || '—'}</div></div>
            <div><div className="label">Responsable</div><div className="val">{carro.responsable || '—'}</div></div>
            <div><div className="label">Último control</div><div className="val">{formatFechaHora(carro.ultimo_control) || '—'}</div></div>
            <div><div className="label">Próximo control</div><div className="val">{formatFecha(carro.proximo_control) || '—'}</div></div>
            <div><div className="label">Frecuencia</div><div className="val">{carro.frecuencia_control || '—'}</div></div>
          </div>
          {vencidosCount > 0 && (
            <div style={{marginTop:'10px', padding:'8px', background:'#FEF2F2', borderRadius:'8px', fontSize:'12px', color:'#991B1B', fontWeight:'500'}}>
              ⚠️ {vencidosCount} material{vencidosCount !== 1 ? 'es' : ''} con vencimiento vencido o próximo
            </div>
          )}
        </div>

        {/* Botón imprimir — siempre visible */}
        <button onClick={generarPDF} className="btn-primary">
          Imprimir etiqueta QR (5×5 cm)
        </button>

        {/* Login */}
        {mostrarLogin && !perfil && (
          <div className="card border-blue-200" style={{background:'#EFF6FF'}}>
            <div className="section-title mb-3">Identificarse</div>
            <form onSubmit={handleLogin} style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              <div><label className="label">Email</label>
                <input className="input" type="email" placeholder="usuario@hospital.com"
                  value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required /></div>
              <div><label className="label">Contraseña</label>
                <input className="input" type="password" placeholder="••••••••"
                  value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required /></div>
              <button type="submit" className="btn-primary" disabled={loginLoading}>
                {loginLoading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          </div>
        )}

        {/* Acciones si hay sesión */}
        {perfil && (
          <div className="card">
            <div className="section-title mb-3">Realizar control</div>
            <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
              <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                onClick={() => router.push(`/carro/${carroId}/control/mensual`)}>
                <div style={{width:'34px', height:'34px', borderRadius:'10px', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg style={{width:'16px', height:'16px'}} fill="none" stroke="#1d4ed8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2}/><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2}/><line x1="3" y1="10" x2="21" y2="10" strokeWidth={2}/></svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'600', fontSize:'13px'}}>Control mensual</div>
                  <div style={{fontSize:'11px', color:'#94a3b8'}}>Próximo: {formatFecha(carro.proximo_control)}</div>
                </div>
              </button>

              <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                onClick={() => router.push(`/carro/${carroId}/control/post_uso`)}>
                <div style={{width:'34px', height:'34px', borderRadius:'10px', background:'#FFFBEB', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg style={{width:'16px', height:'16px'}} fill="none" stroke="#d97706" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeWidth={2}/><polyline points="22 4 12 14.01 9 11.01" strokeWidth={2}/></svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'600', fontSize:'13px'}}>Control post-utilización</div>
                  <div style={{fontSize:'11px', color:'#94a3b8'}}>Después de usar el carro</div>
                </div>
              </button>

              {(perfil.rol === 'supervisor' || perfil.rol === 'administrador') && (
                <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                  onClick={() => router.push(`/carro/${carroId}/control/extra`)}>
                  <div style={{width:'34px', height:'34px', borderRadius:'10px', background:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                    <svg style={{width:'16px', height:'16px'}} fill="none" stroke="#7c3aed" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><line x1="12" y1="8" x2="12" y2="16" strokeWidth={2}/><line x1="8" y1="12" x2="16" y2="12" strokeWidth={2}/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:'600', fontSize:'13px'}}>Control extra</div>
                    <div style={{fontSize:'11px', color:'#94a3b8'}}>Control adicional programado</div>
                  </div>
                </button>
              )}

              <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                onClick={() => router.push(`/carro/${carroId}`)}>
                <div style={{width:'34px', height:'34px', borderRadius:'10px', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg style={{width:'16px', height:'16px'}} fill="none" stroke="#64748b" viewBox="0 0 24 24"><path d="M3 12l9-9 9 9"/><path d="M9 21V12h6v9"/></svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'600', fontSize:'13px'}}>Menú completo del carro</div>
                  <div style={{fontSize:'11px', color:'#94a3b8'}}>Vencimientos, historial y más</div>
                </div>
              </button>

              <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                onClick={irAPanel}>
                <div style={{width:'34px', height:'34px', borderRadius:'10px', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg style={{width:'16px', height:'16px'}} fill="none" stroke="#1d4ed8" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" strokeWidth={2}/><rect x="14" y="3" width="7" height="7" strokeWidth={2}/><rect x="3" y="14" width="7" height="7" strokeWidth={2}/><rect x="14" y="14" width="7" height="7" strokeWidth={2}/></svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:'600', fontSize:'13px'}}>Ir a mi panel</div>
                  <div style={{fontSize:'11px', color:'#94a3b8'}}>Dashboard de {perfil.rol}</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* DESFIBRILADOR — siempre visible */}
        {desf && (
          <div className="card">
            <div style={{fontWeight:'600', fontSize:'13px', marginBottom:'10px', color:'#1e293b'}}>Desfibrilador</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', fontSize:'12px'}}>
              <div><div className="label">Marca</div><div className="val">{desf.marca || '—'}</div></div>
              <div><div className="label">Modelo</div><div className="val">{desf.modelo || '—'}</div></div>
              <div><div className="label">N° censo</div><div className="val">{desf.numero_censo || '—'}</div></div>
              <div><div className="label">Último mantenimiento</div><div className="val">{formatFecha(desf.fecha_ultimo_mantenimiento) || '—'}</div></div>
              <div style={{gridColumn:'1/-1'}}><div className="label">Próximo mantenimiento</div><div className="val">{formatFecha(desf.fecha_mantenimiento) || '—'}</div></div>
            </div>
          </div>
        )}

        {/* CAJONES Y MATERIALES — siempre visible */}
        <div style={{fontSize:'11px', fontWeight:'700', color:'#94a3b8', letterSpacing:'.06em', textTransform:'uppercase', padding:'4px 0 2px'}}>
          Contenido del carro
        </div>

        {cajones.map(cajon => (
          <div key={cajon.id} className="card" style={{padding:'12px 14px'}}>
            <button onClick={() => toggleCajon(cajon.id)}
              style={{width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:'none', border:'none', cursor:'pointer', padding:0}}>
              <div style={{fontSize:'13px', fontWeight:'600', color:'#1e293b'}}>{cajon.nombre}</div>
              <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                <span style={{fontSize:'11px', color:'#94a3b8'}}>{cajon.materiales.length} items</span>
                <span style={{fontSize:'12px', color:'#94a3b8'}}>{cajonesExpandidos[cajon.id] ? '▲' : '▼'}</span>
              </div>
            </button>

            {cajonesExpandidos[cajon.id] && (
              <div style={{marginTop:'10px'}}>
                <div style={{display:'grid', gridTemplateColumns:'1fr 36px 72px', gap:'4px', marginBottom:'6px', padding:'0 2px'}}>
                  <div style={{fontSize:'10px', color:'#94a3b8', fontWeight:'700'}}>Material</div>
                  <div style={{fontSize:'10px', color:'#94a3b8', textAlign:'center'}}>Cant</div>
                  <div style={{fontSize:'10px', color:'#94a3b8', textAlign:'center'}}>Vencimiento</div>
                </div>
                {cajon.materiales.map(mat => (
                  <div key={mat.id} style={{display:'grid', gridTemplateColumns:'1fr 36px 72px', gap:'4px', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #f8fafc'}}>
                    <div>
                      <div style={{fontSize:'12px', color:'#1e293b', fontWeight:'500', lineHeight:'1.3'}}>{mat.nombre}</div>
                      <div style={{fontSize:'10px', color: mat.tipo_falla === 'grave' ? '#dc2626' : mat.tipo_falla === 'menor' ? '#d97706' : '#94a3b8', marginTop:'1px'}}>
                        {mat.tipo_falla === 'grave' ? '● Fallo grave' : mat.tipo_falla === 'menor' ? '● Fallo menor' : ''}
                      </div>
                    </div>
                    <div style={{fontSize:'12px', color:'#1e293b', textAlign:'center', fontWeight:'500'}}>×{mat.cantidad_requerida}</div>
                    <div style={{textAlign:'center'}}>
                      {mat.tiene_vencimiento ? (
                        <span style={{fontSize:'10px', fontWeight:'600', padding:'2px 6px', borderRadius:'6px'}}
                          className={colorVto(mat.fecha_vencimiento)}>
                          {labelVto(mat.fecha_vencimiento)}
                        </span>
                      ) : (
                        <span style={{fontSize:'10px', color:'#cbd5e1'}}>—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* QR */}
        <div className="card" style={{textAlign:'center'}}>
          <div className="section-title mb-3">Código QR de este carro</div>
          {qrUrl && <img src={qrUrl} alt="QR" style={{width:'160px', height:'160px', margin:'0 auto 8px', display:'block', borderRadius:'8px'}} />}
          <div style={{fontSize:'11px', color:'#94a3b8'}}>Escanear para acceder a este carro</div>
        </div>

        {/* Invitación identificarse */}
        {!perfil && !mostrarLogin && (
          <div className="card" style={{background:'#F0FDF4', border:'1px solid #BBF7D0', textAlign:'center', padding:'16px'}}>
            <div style={{fontSize:'13px', color:'#166534', fontWeight:'500', marginBottom:'4px'}}>¿Eres personal del hospital?</div>
            <div style={{fontSize:'12px', color:'#15803d', marginBottom:'10px'}}>Identificate para realizar controles</div>
            <button onClick={() => setMostrarLogin(true)}
              style={{fontSize:'13px', padding:'7px 18px', borderRadius:'8px', background:'#16a34a', color:'white', border:'none', cursor:'pointer', fontWeight:'500'}}>
              Identificarse
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

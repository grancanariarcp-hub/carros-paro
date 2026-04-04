'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { estadoColor, formatFecha, formatFechaHora } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function QRPage() {
  const [carro, setCarro] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [qrUrl, setQrUrl] = useState('')
  const [perfil, setPerfil] = useState<any>(null)
  const [mostrarLogin, setMostrarLogin] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginLoading, setLoginLoading] = useState(false)
  const [appUrl, setAppUrl] = useState('')
  const router = useRouter()
  const params = useParams()
  const carroId = params.id as string
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [carroId])

  async function cargarDatos() {
    setAppUrl(window.location.origin)

    // Cargar datos del carro (público, sin autenticación)
    const { data: c } = await supabase.from('carros')
      .select('*, servicios(nombre)').eq('id', carroId).single()
    setCarro(c)

    // Verificar si hay sesión activa
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      if (p?.activo) setPerfil(p)
    }

    // Generar QR
    const carroUrl = `${window.location.origin}/carro/${carroId}`
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(carroUrl)}&bgcolor=ffffff&color=1d4ed8&margin=10`)
    setLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password
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

  function irAControl(tipo: string) {
    router.push(`/carro/${carroId}/control/${tipo}`)
  }

  function generarPDF() {
    const carroUrl = `${appUrl}/carro/${carroId}`
    const contenido = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: white; }
  .etiqueta {
    width: 5cm; height: 5cm;
    border: 2px solid #1d4ed8;
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    page-break-inside: avoid;
  }
  .hospital { font-size: 6px; color: #1d4ed8; font-weight: bold; text-align: center; line-height: 1.3; }
  .qr-img { width: 2.2cm; height: 2.2cm; }
  .codigo { font-size: 10px; font-weight: bold; color: #1d4ed8; text-align: center; }
  .info { font-size: 6px; color: #444; text-align: center; line-height: 1.4; }
  .footer { font-size: 5px; color: #aaa; text-align: center; }
  @media print {
    @page { margin: 1cm; size: A4; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="etiqueta">
  <div class="hospital">H.U. Gran Canaria<br>Doctor Negrín</div>
  <img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(carroUrl)}&bgcolor=ffffff&color=1d4ed8&margin=5" />
  <div class="codigo">${carro?.codigo || ''}</div>
  <div class="info">
    ${carro?.nombre || ''}<br>
    ${(carro?.servicios as any)?.nombre || ''}<br>
    ${carro?.ubicacion || ''}<br>
    ${carro?.responsable ? 'Resp: ' + carro.responsable : ''}
  </div>
  <div class="footer">GranCanariaRCP · Dr. Lübbe</div>
</div>
</body>
</html>`

    const ventana = window.open('', '_blank')
    if (ventana) {
      ventana.document.write(contenido)
      ventana.document.close()
      ventana.onload = () => { ventana.print() }
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  if (!carro) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Carro no encontrado</div>
    </div>
  )

  const e = estadoColor(carro.estado)

  return (
    <div className="page">
      {/* Topbar */}
      <div className="topbar">
        <div className="flex-1">
          <div style={{fontSize:'10px', color:'#94a3b8'}}>H.U. Gran Canaria Doctor Negrín</div>
          <div style={{fontSize:'13px', fontWeight:'600', color:'#1e293b'}}>Auditor Carros de Parada</div>
        </div>
        {perfil ? (
          <div className="flex items-center gap-2">
            <div style={{fontSize:'11px', color:'#64748b', textAlign:'right'}}>
              <div style={{fontWeight:'500'}}>{perfil.nombre}</div>
              <div style={{fontSize:'10px'}}>{perfil.rol}</div>
            </div>
            <button onClick={cerrarSesion}
              style={{fontSize:'11px', padding:'4px 8px', borderRadius:'8px', border:'1px solid #e2e8f0', background:'white', cursor:'pointer', color:'#64748b'}}>
              Salir
            </button>
          </div>
        ) : (
          <button onClick={() => setMostrarLogin(!mostrarLogin)}
            style={{fontSize:'12px', padding:'6px 12px', borderRadius:'8px', background:'#1d4ed8', color:'white', border:'none', cursor:'pointer', fontWeight:'500'}}>
            Identificarse
          </button>
        )}
      </div>

      <div className="content">

        {/* Login inline */}
        {mostrarLogin && !perfil && (
          <div className="card border-blue-200" style={{background:'#EFF6FF'}}>
            <div className="section-title mb-3">Identificarse</div>
            <form onSubmit={handleLogin} style={{display:'flex', flexDirection:'column', gap:'10px'}}>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="usuario@hospital.com"
                  value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required />
              </div>
              <div>
                <label className="label">Contraseña</label>
                <input className="input" type="password" placeholder="••••••••"
                  value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
              </div>
              <button type="submit" className="btn-primary" disabled={loginLoading}>
                {loginLoading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </form>
          </div>
        )}

        {/* Estado del carro — visible para todos */}
        <div className="card">
          <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'12px'}}>
            <div>
              <div style={{fontSize:'20px', fontWeight:'700', color:'#1d4ed8'}}>{carro.codigo}</div>
              <div style={{fontSize:'13px', color:'#64748b', marginTop:'2px'}}>{carro.nombre}</div>
            </div>
            <span className={`badge ${e.bg} ${e.text}`} style={{fontSize:'12px', padding:'4px 12px'}}>{e.label}</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', fontSize:'13px'}}>
            <div><div className="label">Servicio</div><div className="val">{(carro.servicios as any)?.nombre || '—'}</div></div>
            <div><div className="label">Ubicación</div><div className="val">{carro.ubicacion || '—'}</div></div>
            <div><div className="label">Responsable</div><div className="val">{carro.responsable || '—'}</div></div>
            <div><div className="label">Último control</div><div className="val">{formatFechaHora(carro.ultimo_control) || '—'}</div></div>
            <div><div className="label">Próximo control</div><div className="val">{formatFecha(carro.proximo_control) || '—'}</div></div>
            <div><div className="label">Frecuencia</div><div className="val">{carro.frecuencia_control || '—'}</div></div>
          </div>
        </div>

        {/* QR */}
        <div className="card" style={{textAlign:'center'}}>
          <div className="section-title mb-3">Código QR de este carro</div>
          {qrUrl && <img src={qrUrl} alt="QR" style={{width:'180px', height:'180px', margin:'0 auto 12px', display:'block', borderRadius:'8px'}} />}
          <div style={{fontSize:'11px', color:'#94a3b8', marginBottom:'12px'}}>Escaneá para acceder directamente a este carro</div>
          <button onClick={generarPDF} className="btn-primary">
            Imprimir etiqueta QR (5×5 cm)
          </button>
        </div>

        {/* Acciones si hay sesión */}
        {perfil && (
          <div className="card">
            <div className="section-title mb-3">Realizar control — {carro.codigo}</div>
            <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
              <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                onClick={() => irAControl('mensual')}>
                <div style={{width:'36px', height:'36px', borderRadius:'10px', background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg style={{width:'18px', height:'18px', color:'#1d4ed8'}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2}/><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2}/><line x1="3" y1="10" x2="21" y2="10" strokeWidth={2}/></svg>
                </div>
                <div>
                  <div style={{fontWeight:'600', fontSize:'14px'}}>Control mensual</div>
                  <div style={{fontSize:'11px', color:'#94a3b8'}}>Próximo: {formatFecha(carro.proximo_control)}</div>
                </div>
              </button>
              <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                onClick={() => irAControl('post_uso')}>
                <div style={{width:'36px', height:'36px', borderRadius:'10px', background:'#FFFBEB', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg style={{width:'18px', height:'18px', color:'#d97706'}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeWidth={2}/><polyline points="22 4 12 14.01 9 11.01" strokeWidth={2}/></svg>
                </div>
                <div>
                  <div style={{fontWeight:'600', fontSize:'14px'}}>Control post-utilización</div>
                  <div style={{fontSize:'11px', color:'#94a3b8'}}>Después de usar el carro</div>
                </div>
              </button>
              {(perfil.rol === 'supervisor' || perfil.rol === 'administrador') && (
                <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                  onClick={() => irAControl('extra')}>
                  <div style={{width:'36px', height:'36px', borderRadius:'10px', background:'#F5F3FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                    <svg style={{width:'18px', height:'18px', color:'#7c3aed'}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><line x1="12" y1="8" x2="12" y2="16" strokeWidth={2}/><line x1="8" y1="12" x2="16" y2="12" strokeWidth={2}/></svg>
                  </div>
                  <div>
                    <div style={{fontWeight:'600', fontSize:'14px'}}>Control extra</div>
                    <div style={{fontSize:'11px', color:'#94a3b8'}}>Control adicional programado</div>
                  </div>
                </button>
              )}
              <button className="btn-secondary" style={{textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}}
                onClick={() => router.push(`/carro/${carroId}/historial`)}>
                <div style={{width:'36px', height:'36px', borderRadius:'10px', background:'#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg style={{width:'18px', height:'18px', color:'#64748b'}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 20h9" strokeWidth={2}/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeWidth={2}/></svg>
                </div>
                <div>
                  <div style={{fontWeight:'600', fontSize:'14px'}}>Ver historial</div>
                  <div style={{fontSize:'11px', color:'#94a3b8'}}>Auditorías anteriores</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Si no hay sesión, mostrar instrucción */}
        {!perfil && !mostrarLogin && (
          <div className="card" style={{background:'#F0FDF4', border:'1px solid #BBF7D0', textAlign:'center', padding:'20px'}}>
            <div style={{fontSize:'13px', color:'#166534', fontWeight:'500', marginBottom:'6px'}}>
              ¿Eres personal del hospital?
            </div>
            <div style={{fontSize:'12px', color:'#15803d', marginBottom:'12px'}}>
              Identificate para realizar un control o ver el historial completo
            </div>
            <button onClick={() => setMostrarLogin(true)} className="btn-primary" style={{width:'auto', padding:'8px 20px', margin:'0 auto', display:'inline-block'}}>
              Identificarse
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{textAlign:'center', padding:'8px 0 4px'}}>
          <div style={{fontSize:'11px', color:'#cbd5e1'}}>GranCanariaRCP</div>
          <div style={{fontSize:'10px', color:'#e2e8f0', fontStyle:'italic'}}>Dr. Lübbe</div>
        </div>
      </div>
    </div>
  )
}

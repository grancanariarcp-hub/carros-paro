'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'

export default function LoginHospitalPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [hospital, setHospital] = useState<any>(null)
  const [cargando, setCargando] = useState(true)
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const supabase = createClient()

  useEffect(() => { cargarHospital() }, [slug])

  async function cargarHospital() {
    const { data, error } = await supabase
      .from('hospitales')
      .select('*')
      .eq('slug', slug)
      .eq('activo', true)
      .single()

    if (error || !data) {
      router.push('/')
      return
    }
    setHospital(data)
    setCargando(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('*, hospitales(slug)')
        .eq('id', data.user.id)
        .single()

      if (perfilError || !perfil) throw new Error('Perfil no encontrado')
      if (!perfil.activo) throw new Error('Tu cuenta aún no fue aprobada. Contacta al administrador.')

      // Verificar que el usuario pertenece a este hospital
      if (perfil.hospital_id !== hospital.id) {
        await supabase.auth.signOut()
        throw new Error('No tienes acceso a este centro. Verifica la URL.')
      }

      // Redirigir según rol
      if (perfil.rol === 'superadmin') router.push('/superadmin')
      else if (perfil.rol === 'administrador') router.push('/admin')
      else if (perfil.rol === 'supervisor') router.push('/supervisor')
      else router.push('/auditor')

    } catch (err: any) {
      toast.error(err.message || 'Error al ingresar')
    } finally {
      setLoading(false)
    }
  }

  if (cargando) return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#080c14'}}>
      <div style={{color:'#4b5563', fontSize:'0.85rem'}}>Cargando...</div>
    </div>
  )

  const colorPrimario = hospital?.color_primario || '#1d4ed8'

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Inter', sans-serif",
      background: '#f9fafb',
    }}>

      {/* Panel izquierdo — solo desktop */}
      <div style={{
        display: 'none',
        width: '45%',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '3rem 2.5rem',
        background: `linear-gradient(135deg, ${colorPrimario} 0%, #172554 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }} className="login-left-panel">

        {/* Cuadrícula de fondo */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}/>

        <div style={{position:'relative', zIndex:1}}>
          {/* Logo del hospital */}
          {hospital?.logo_url ? (
            <img src={hospital.logo_url} alt={hospital.nombre}
              style={{height:'52px', objectFit:'contain', marginBottom:'2.5rem', filter:'brightness(0) invert(1)'}}/>
          ) : (
            <div style={{marginBottom:'2.5rem'}}>
              <svg width="52" height="52" viewBox="0 0 80 80" fill="none">
                <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                  fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2.5"/>
                <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
          )}

          <h2 style={{
            fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)',
            fontWeight: 800,
            color: 'white',
            lineHeight: 1.2,
            marginBottom: '0.75rem',
            fontFamily: "'Inter', sans-serif",
          }}>{hospital?.nombre}</h2>

          <p style={{fontSize:'0.9rem', color:'rgba(255,255,255,0.55)', lineHeight:1.7, marginBottom:'2.5rem', fontWeight:300}}>
            Plataforma de gestión y auditoría de material crítico hospitalario
          </p>

          {/* Features */}
          {[
            'Control mensual y post-utilización',
            'Alertas automáticas de vencimientos',
            'Informes PDF con trazabilidad ISO',
            'Acceso QR y NFC por carro',
          ].map((f, i) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.75rem'}}>
              <div style={{width:'5px', height:'5px', borderRadius:'50%', background:'rgba(255,255,255,0.4)', flexShrink:0}}/>
              <span style={{fontSize:'0.82rem', color:'rgba(255,255,255,0.55)', fontWeight:400}}>{f}</span>
            </div>
          ))}
        </div>

        <div style={{position:'relative', zIndex:1}}>
          <p style={{fontSize:'0.68rem', color:'rgba(255,255,255,0.2)', letterSpacing:'0.1em'}}>
            Desarrollado por CRITIC SL — Servicios Médicos
          </p>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        background: 'white',
      }}>

        {/* Header móvil */}
        <div className="login-mobile-top" style={{
          width: '100%',
          maxWidth: '400px',
          marginBottom: '2rem',
          textAlign: 'center',
        }}>
          {hospital?.logo_url ? (
            <img src={hospital.logo_url} alt={hospital.nombre}
              style={{height:'44px', objectFit:'contain', marginBottom:'0.875rem'}}/>
          ) : (
            <div style={{marginBottom:'0.875rem', display:'flex', justifyContent:'center'}}>
              <div style={{
                width:'48px', height:'48px', borderRadius:'12px',
                background: colorPrimario,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <svg width="26" height="26" viewBox="0 0 80 80" fill="none">
                  <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                    fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2.5"/>
                  <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
            </div>
          )}
          <div style={{fontSize:'0.75rem', color:'#9ca3af', letterSpacing:'0.05em'}}>{hospital?.nombre}</div>
        </div>

        {/* Formulario */}
        <div style={{width:'100%', maxWidth:'380px'}}>

          <h2 style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: '#111827',
            marginBottom: '0.3rem',
            lineHeight: 1.2,
          }}>Iniciar sesión</h2>
          <p style={{fontSize:'0.82rem', color:'#9ca3af', marginBottom:'1.75rem', fontWeight:400}}>
            Accede con tu cuenta institucional
          </p>

          <form onSubmit={handleLogin} style={{display:'flex', flexDirection:'column', gap:'1rem'}}>
            <div>
              <label style={{display:'block', fontSize:'0.72rem', fontWeight:600, color:'#374151', marginBottom:'0.35rem', letterSpacing:'0.03em'}}>
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="usuario@hospital.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width:'100%', padding:'0.7rem 0.875rem',
                  border:'1.5px solid #e5e7eb', borderRadius:'8px',
                  fontSize:'0.85rem', fontFamily:"'Inter', sans-serif",
                  color:'#111827', outline:'none', transition:'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = colorPrimario}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            <div>
              <label style={{display:'block', fontSize:'0.72rem', fontWeight:600, color:'#374151', marginBottom:'0.35rem', letterSpacing:'0.03em'}}>
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width:'100%', padding:'0.7rem 0.875rem',
                  border:'1.5px solid #e5e7eb', borderRadius:'8px',
                  fontSize:'0.85rem', fontFamily:"'Inter', sans-serif",
                  color:'#111827', outline:'none', transition:'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = colorPrimario}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width:'100%', padding:'0.8rem',
                background: loading ? '#9ca3af' : colorPrimario,
                color:'white', fontWeight:700, fontSize:'0.85rem',
                border:'none', borderRadius:'8px', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily:"'Inter', sans-serif", letterSpacing:'0.03em',
                transition:'all 0.15s', marginTop:'0.25rem',
              }}
            >
              {loading ? 'Ingresando...' : 'Ingresar al sistema'}
            </button>
          </form>

          <div style={{
            marginTop:'1.5rem', padding:'1rem', background:'#f9fafb',
            border:'1px solid #e5e7eb', borderRadius:'8px',
          }}>
            <p style={{fontSize:'0.72rem', fontWeight:600, color:'#374151', marginBottom:'0.2rem'}}>
              ¿Necesitas acceso?
            </p>
            <p style={{fontSize:'0.72rem', color:'#9ca3af', lineHeight:1.6}}>
              Solicita al administrador de tu centro que cree tu cuenta de usuario.
            </p>
          </div>

          <p style={{
            textAlign:'center', fontSize:'0.65rem', color:'#d1d5db',
            marginTop:'2rem', letterSpacing:'0.05em',
          }}>
            Desarrollado por <strong style={{color:'#9ca3af'}}>CRITIC SL</strong>
          </p>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-top { display: none !important; }
        }
      `}</style>
    </div>
  )
}

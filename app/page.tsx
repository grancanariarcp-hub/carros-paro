'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      if (perfilError || !perfil) throw new Error('Perfil no encontrado')
      if (!perfil.activo) throw new Error('Tu cuenta aún no fue aprobada. Contactá al administrador.')
      if (perfil.rol === 'administrador') router.push('/admin')
      else if (perfil.rol === 'supervisor') router.push('/supervisor')
      else router.push('/auditor')
    } catch (err: any) {
      toast.error(err.message || 'Error al ingresar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">

      {/* Panel izquierdo — solo visible en tablet/escritorio */}
      <div className="login-panel-left">
        <div className="login-panel-left-inner">
          {/* Ícono PCR grande */}
          <div className="login-icon-big">
            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Corazón */}
              <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2.5"/>
              {/* Traza ECG / onda RCP */}
              <polyline
                points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <h2 className="login-panel-title">Auditor Carros<br/>de Parada</h2>
          <p className="login-panel-sub">Sistema de gestión y auditoría<br/>de carros de parada cardíaca</p>
          <div className="login-panel-features">
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Control mensual y post-utilización
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Alertas automáticas de vencimientos
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Informes PDF con trazabilidad ISO
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Acceso QR y NFC por carro
            </div>
          </div>
        </div>
        <div className="login-panel-footer">
          <p>GranCanariaRCP · Dr. Lübbe</p>
          <p>Basado en ERC 2025 / AHA 2023 / ILCOR 2024</p>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="login-panel-right">
        <div className="login-form-container">

          {/* Header móvil — solo visible en móvil */}
          <div className="login-mobile-header">
            <div className="login-mobile-icon">
              <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                  fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2.5"/>
                <polyline
                  points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <h1 className="login-mobile-title">Auditor Carros de Parada</h1>
            <p className="login-mobile-sub">Hospital Universitario de Gran Canaria Doctor Negrín</p>
          </div>

          {/* Formulario */}
          <div className="login-form-inner">
            <div className="login-form-heading">
              <h2>Iniciar sesión</h2>
              <p>Accede con tu cuenta institucional</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div>
                <label className="label">Correo electrónico</label>
                <input
                  className="input"
                  type="email"
                  placeholder="usuario@hospital.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Contraseña</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <span className="login-loading">
                    <svg className="login-spinner" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                    Ingresando...
                  </span>
                ) : 'Ingresar al sistema'}
              </button>
            </form>

            <div className="login-help">
              <p className="login-help-title">¿Necesitas acceso?</p>
              <p className="login-help-text">Solicita al administrador del sistema que cree tu cuenta de usuario.</p>
            </div>

            <div className="login-hospital">
              <div className="login-hospital-logo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <div>
                <p className="login-hospital-name">Hospital Universitario de Gran Canaria</p>
                <p className="login-hospital-sub">Doctor Negrín</p>
              </div>
            </div>
          </div>

          <div className="login-footer">
            Desarrollado por <strong>GranCanariaRCP</strong> · Dr. Lübbe
          </div>
        </div>
      </div>

    </div>
  )
}

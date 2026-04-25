'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'

type Vista = 'login' | 'escaner' | 'registro'

export default function LoginPage() {
  const [vista, setVista] = useState<Vista>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [escaneando, setEscaneando] = useState(false)
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)

  // Campo de texto para lector físico de código de barras (PC)
  const [codigoFisico, setCodigoFisico] = useState('')
  const codigoRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const supabase = createClient()

  // ================================================================
  // Login con email/contraseña
  // ================================================================
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await navegarSegunRol(data.user.id)
    } catch (err: any) {
      toast.error(err.message || 'Error al ingresar')
    } finally {
      setLoading(false)
    }
  }

  // ================================================================
  // Login por código de empleado (QR / barras / lector físico)
  // ================================================================
  async function loginPorCodigo(codigo: string) {
    const codigoLimpio = codigo.trim()
    if (!codigoLimpio) return
    setEscaneando(false)
    setBuscandoCodigo(true)

    try {
      // Buscar perfil por codigo_empleado
      const { data: perfil, error } = await supabase
        .from('perfiles')
        .select('id, nombre, email, rol, activo, hospital_id')
        .eq('codigo_empleado', codigoLimpio)
        .single()

      if (error || !perfil) {
        toast.error('Código no reconocido. Usa usuario y contraseña.')
        setBuscandoCodigo(false)
        setCodigoFisico('')
        return
      }

      if (!perfil.activo) {
        toast.error('Tu cuenta aún no está activa. Contacta al administrador.')
        setBuscandoCodigo(false)
        setCodigoFisico('')
        return
      }

      // Iniciar sesión usando la función RPC que autentica por código
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('login_por_codigo_empleado', { p_codigo: codigoLimpio })

      if (tokenError || !tokenData) {
        // Fallback: si la RPC no existe aún, mostrar mensaje claro
        toast.error(`Bienvenido ${perfil.nombre}. Configura la RPC de login para activar este método.`)
        setBuscandoCodigo(false)
        setCodigoFisico('')
        return
      }

      // Establecer sesión con el token devuelto por la RPC
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
      })

      if (sessionError) throw sessionError

      toast.success(`Bienvenido, ${perfil.nombre}`)
      await navegarSegunRol(perfil.id)
    } catch (err: any) {
      toast.error(err.message || 'Error al identificar')
    } finally {
      setBuscandoCodigo(false)
      setCodigoFisico('')
    }
  }

  // Lector físico: captura cuando el lector escribe el código y pulsa Enter
  function handleCodigoFisicoKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && codigoFisico.trim()) {
      loginPorCodigo(codigoFisico)
    }
  }

  async function navegarSegunRol(userId: string) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('rol, activo')
      .eq('id', userId)
      .single()
    if (!perfil || !perfil.activo) throw new Error('Tu cuenta aún no fue aprobada.')
    if (perfil.rol === 'superadmin') router.push('/superadmin')
    else if (perfil.rol === 'administrador') router.push('/admin')
    else if (perfil.rol === 'supervisor') router.push('/supervisor')
    else router.push('/auditor')
  }

  // ================================================================
  // Render
  // ================================================================
  return (
    <div className="login-page">

      {/* Escáner de cámara */}
      {escaneando && (
        <EscanerCodigoBarras
          onResult={loginPorCodigo}
          onClose={() => setEscaneando(false)}
        />
      )}

      {/* Overlay buscando código */}
      {buscandoCodigo && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-sm font-semibold text-gray-700">Identificando...</div>
          </div>
        </div>
      )}

      {/* Panel izquierdo */}
      <div className="login-panel-left">
        <div className="login-panel-left-inner">
          <div className="login-icon-big">
            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2.5"/>
              <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <h2 className="login-panel-title">Auditor de<br/>Equipamiento Médico</h2>
          <p className="login-panel-sub">Sistema de gestión y auditoría<br/>de material hospitalario</p>
          <div className="login-panel-features">
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Controles personalizables por centro
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Alertas automáticas de vencimientos y mantenimientos
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Informes PDF con trazabilidad ISO personalizables
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Acceso por QR y NFC
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Firma digital en cada control
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Inventario de equipos con historial de mantenimientos
            </div>
            <div className="login-feature">
              <span className="login-feature-dot"></span>
              Multi-hospital con identidad visual propia
            </div>
          </div>
        </div>
        <div className="login-panel-footer">
          <p>CRITIC SL — Servicios Médicos</p>
          <p>astormanager.com</p>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="login-panel-right">
        <div className="login-form-container">

          {/* Header móvil */}
          <div className="login-mobile-header">
            <div className="login-mobile-icon">
              <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z"
                  fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2.5"/>
                <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40"
                  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <h1 className="login-mobile-title">ÁSTOR</h1>
            <p className="login-mobile-sub">Gestión y auditoría de material hospitalario</p>
          </div>

          <div className="login-form-inner">

            {/* ====================================================
                VISTA: LOGIN
            ==================================================== */}
            {vista === 'login' && (
              <>
                <div className="login-form-heading">
                  <h2>Iniciar sesión</h2>
                  <p>Accede con tu cuenta institucional</p>
                </div>

                {/* Botón escanear QR — prominente */}
                <button
                  type="button"
                  onClick={() => setEscaneando(true)}
                  className="w-full flex items-center justify-center gap-3 py-3.5 mb-4 rounded-xl font-semibold text-sm transition-colors"
                  style={{ background: '#1d4ed8', color: 'white' }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" strokeWidth={2}/>
                    <rect x="14" y="3" width="7" height="7" strokeWidth={2}/>
                    <rect x="3" y="14" width="7" height="7" strokeWidth={2}/>
                    <rect x="14" y="14" width="3" height="3" strokeWidth={2}/>
                  </svg>
                  Escanear QR / código de empleado
                </button>

                {/* Campo para lector físico (PC) */}
                <div className="mb-4">
                  <label className="label text-xs text-gray-400">
                    Lector físico de código de barras (PC)
                  </label>
                  <input
                    ref={codigoRef}
                    type="text"
                    className="input text-sm"
                    placeholder="Pasa la tarjeta por el lector..."
                    value={codigoFisico}
                    onChange={e => setCodigoFisico(e.target.value)}
                    onKeyDown={handleCodigoFisicoKeyDown}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    El lector escribe el código y pulsa Enter automáticamente.
                  </p>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gray-200"></div>
                  <span className="text-xs text-gray-400 font-medium">o con usuario y contraseña</span>
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                  <div>
                    <label className="label">Correo electrónico</label>
                    <input className="input" type="email" placeholder="usuario@hospital.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      required autoComplete="email" />
                  </div>
                  <div>
                    <label className="label">Contraseña</label>
                    <input className="input" type="password" placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
                      required autoComplete="current-password" />
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

                {/* Solicitar acceso */}
                <button
                  type="button"
                  onClick={() => setVista('registro')}
                  className="w-full mt-3 py-2.5 text-sm font-medium text-blue-700 border border-blue-200 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors">
                  Solicitar acceso al sistema
                </button>

                <div className="login-hospital mt-4">
                  <div className="login-hospital-logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p className="login-hospital-name">ÁSTOR by CRITIC SL</p>
                    <p className="login-hospital-sub" style={{ textAlign: 'center' }}>Gestión y auditoría de material hospitalario</p>
                  </div>
                </div>
              </>
            )}

            {/* ====================================================
                VISTA: SOLICITUD DE REGISTRO
            ==================================================== */}
            {vista === 'registro' && (
              <FormularioRegistro onVolver={() => setVista('login')} />
            )}

          </div>

          <div className="login-footer">
            Desarrollado por <strong>CRITIC SL</strong> — Servicios Médicos
          </div>
        </div>
      </div>
    </div>
  )
}

// ================================================================
// Formulario de solicitud de registro
// ================================================================
function FormularioRegistro({ onVolver }: { onVolver: () => void }) {
  const [form, setForm] = useState({
    nombre: '', email: '', hospital_nombre: '', rol: 'auditor', mensaje: '',
  })
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const supabase = createClient()

  async function enviarSolicitud(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.email.trim() || !form.hospital_nombre.trim()) {
      toast.error('Rellena todos los campos obligatorios')
      return
    }
    setEnviando(true)
    try {
      // Guardar solicitud en la tabla solicitudes_registro
      const { error } = await supabase.from('solicitudes_registro').insert({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        hospital_nombre: form.hospital_nombre.trim(),
        rol_solicitado: form.rol,
        mensaje: form.mensaje.trim() || null,
        estado: 'pendiente',
      })
      if (error) throw error

      // Notificar a todos los superadmins
      const { data: superadmins } = await supabase
        .from('perfiles')
        .select('id, hospital_id')
        .eq('rol', 'superadmin')
        .eq('activo', true)

      if (superadmins && superadmins.length > 0) {
        await supabase.from('notificaciones').insert(
          superadmins.map(sa => ({
            hospital_id: sa.hospital_id,
            usuario_id: sa.id,
            tipo: 'usuario_creado',
            titulo: `Solicitud de acceso: ${form.nombre}`,
            mensaje: `${form.nombre} (${form.email}) solicita acceso como ${form.rol} en ${form.hospital_nombre}.`,
            leida: false,
            accion_url: '/superadmin',
          }))
        )
      }

      setEnviado(true)
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar la solicitud')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-4">✅</div>
        <h3 className="font-bold text-lg text-gray-800 mb-2">Solicitud enviada</h3>
        <p className="text-sm text-gray-500 mb-6">
          El administrador de tu centro recibirá tu solicitud y te notificará cuando tu cuenta esté activa.
        </p>
        <button onClick={onVolver} className="btn-primary">
          Volver al login
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="login-form-heading">
        <h2>Solicitar acceso</h2>
        <p>Tu solicitud llegará al administrador del sistema</p>
      </div>

      <form onSubmit={enviarSolicitud} className="login-form">
        <div>
          <label className="label">Nombre completo *</label>
          <input className="input" type="text" placeholder="Tu nombre y apellidos"
            value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Correo electrónico *</label>
          <input className="input" type="email" placeholder="tu@hospital.com"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Centro / Hospital *</label>
          <input className="input" type="text" placeholder="Nombre de tu centro de trabajo"
            value={form.hospital_nombre} onChange={e => setForm(f => ({ ...f, hospital_nombre: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Rol solicitado</label>
          <select className="input" value={form.rol}
            onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
            <option value="auditor">Auditor</option>
            <option value="tecnico">Técnico de mantenimiento</option>
            <option value="supervisor">Supervisor de calidad</option>
            <option value="readonly">Solo lectura</option>
          </select>
        </div>
        <div>
          <label className="label">Mensaje adicional <span className="text-gray-400">(opcional)</span></label>
          <textarea className="input resize-none" rows={2}
            placeholder="Indica el motivo de tu solicitud o cualquier información relevante..."
            value={form.mensaje} onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))} />
        </div>

        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </form>

      <button type="button" onClick={onVolver}
        className="w-full mt-3 py-2 text-sm text-gray-500 font-medium">
        ← Volver al login
      </button>
    </>
  )
}

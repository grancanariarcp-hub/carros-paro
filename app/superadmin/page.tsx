'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import VersionApp from '@/components/VersionApp'
import BotonResetPassword from '@/components/BotonResetPassword'
import ServiciosDelHospital from '@/components/ServiciosDelHospital'

// =====================================================================
// Tipos
// =====================================================================
type Tab = 'hospitales' | 'nuevo_hospital' | 'usuarios' | 'solicitudes'

interface HospitalStats {
  id: string
  nombre: string
  color_primario: string
  logo_url: string | null
  activo: boolean
  plan: string
  slug: string
  email_admin: string | null
  max_carros: number
  max_usuarios: number
  // Métricas
  totalCarros: number
  carrosOperativos: number
  carrosNoOperativos: number
  carrosCondicionales: number
  totalAlertas: number
  alertasCriticas: number
  equiposMantVencido: number
  usuariosActivos: number
  cumplimiento: number // % controles a tiempo últimos 30 días
  ultimoControl: string | null
}

const ROLES_SUPERADMIN = [
  { value: 'administrador', label: 'Administrador' },
  { value: 'supervisor',    label: 'Supervisor' },
  { value: 'auditor',       label: 'Auditor' },
  { value: 'tecnico',       label: 'Técnico' },
  { value: 'readonly',      label: 'Solo lectura' },
]

const planColor: Record<string, string> = {
  basico: '#6b7280', estandar: '#2563eb',
  hospital: '#7c3aed', enterprise: '#dc2626',
}
const planLabel: Record<string, string> = {
  basico: 'Básico', estandar: 'Estándar',
  hospital: 'Hospital', enterprise: 'Enterprise',
}

function planLimites(plan: string) {
  switch (plan) {
    case 'basico':     return { max_carros: 15,  max_usuarios: 5 }
    case 'estandar':   return { max_carros: 40,  max_usuarios: 15 }
    case 'hospital':   return { max_carros: 100, max_usuarios: 30 }
    case 'enterprise': return { max_carros: 999, max_usuarios: 999 }
    default:           return { max_carros: 15,  max_usuarios: 5 }
  }
}

function semaforo(stats: HospitalStats): 'verde' | 'amarillo' | 'rojo' {
  if (!stats.activo) return 'rojo'
  if (stats.carrosNoOperativos > 0 || stats.alertasCriticas > 0 || stats.equiposMantVencido > 2) return 'rojo'
  if (stats.carrosCondicionales > 0 || stats.totalAlertas > 0 || stats.cumplimiento < 80) return 'amarillo'
  return 'verde'
}

// Los estilos de este panel viven ahora en app/globals.css como clases .sa-*.
// Estaban en un objeto de estilos inline, que no admite media queries: nada
// podía adaptarse al tamaño de pantalla, y cualquier retoque había que
// repetirlo en las once llamadas.

// =====================================================================
// Componente principal
// =====================================================================
export default function SuperAdminPage() {
  const [tab, setTab]                   = useState<Tab>('hospitales')
  const [perfil, setPerfil]             = useState<any>(null)
  const [hospitalesStats, setHospitalesStats] = useState<HospitalStats[]>([])
  const [usuarios, setUsuarios]         = useState<any[]>([])
  const [solicitudes, setSolicitudes]   = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [cargandoStats, setCargandoStats] = useState(false)
  const [hospitalDetalle, setHospitalDetalle] = useState<string | null>(null)
  const [editandoHospital, setEditandoHospital] = useState<any>(null)
  const [guardando, setGuardando]       = useState(false)
  const [modalUsuario, setModalUsuario] = useState<any>(null)
  const [formUsuario, setFormUsuario]   = useState({ nombre: '', email: '', rol: 'auditor', hospital_id: '', servicio_id: '', activo: true, codigo_empleado: '', recibir_alertas: false })
  const [formHospital, setFormHospital] = useState({ nombre: '', slug: '', email_admin: '', telefono: '', plan: 'basico', max_carros: 15, max_usuarios: 5, color_primario: '#1d4ed8', pais: 'España' })
  const [filtroHospital, setFiltroHospital] = useState('todos')
  const [busquedaUsuario, setBusquedaUsuario] = useState('')
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarTodo() }, [])

  // ================================================================
  // Carga de datos
  // ================================================================
  async function cargarTodo() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || p.rol !== 'superadmin') { router.push('/'); return }
    setPerfil(p)
    await Promise.all([cargarHospitalesConStats(), cargarUsuarios(), cargarSolicitudes()])
    setLoading(false)
  }

  async function cargarHospitalesConStats() {
    setCargandoStats(true)
    const { data: hospitales } = await supabase.from('hospitales')
      .select('*').order('creado_en', { ascending: false })

    const stats: HospitalStats[] = []
    const hace30dias = new Date(Date.now() - 30 * 86400000).toISOString()
    const hoy = new Date()

    for (const h of (hospitales || [])) {
      const [
        { data: carros },
        { data: alertas },
        { data: equipos },
        { data: usuarios },
        { data: inspecciones },
      ] = await Promise.all([
        supabase.from('carros').select('id, estado, proximo_control').eq('hospital_id', h.id).eq('activo', true),
        supabase.from('alertas').select('id, severidad').eq('hospital_id', h.id).eq('resuelta', false),
        supabase.from('equipos').select('fecha_proximo_mantenimiento').eq('hospital_id', h.id).eq('activo', true),
        supabase.from('perfiles').select('id').eq('hospital_id', h.id).eq('activo', true),
        supabase.from('inspecciones').select('id, fecha, carro_id')
          .gte('fecha', hace30dias).order('fecha', { ascending: false }).limit(1),
      ])

      const totalCarros = carros?.length || 0
      const carrosOperativos = carros?.filter(c => c.estado === 'operativo').length || 0
      const carrosNoOperativos = carros?.filter(c => c.estado === 'no_operativo').length || 0
      const carrosCondicionales = carros?.filter(c => c.estado === 'condicional').length || 0

      // Cumplimiento: % carros con control al día
      const carrosAlDia = carros?.filter(c => {
        if (!c.proximo_control) return false
        return new Date(c.proximo_control) >= hoy
      }).length || 0
      const cumplimiento = totalCarros > 0 ? Math.round((carrosAlDia / totalCarros) * 100) : 100

      const equiposMantVencido = equipos?.filter(e =>
        e.fecha_proximo_mantenimiento && new Date(e.fecha_proximo_mantenimiento) < hoy
      ).length || 0

      stats.push({
        id: h.id,
        nombre: h.nombre,
        color_primario: h.color_primario || '#1d4ed8',
        logo_url: h.logo_url,
        activo: h.activo,
        plan: h.plan,
        slug: h.slug,
        email_admin: h.email_admin,
        max_carros: h.max_carros,
        max_usuarios: h.max_usuarios,
        totalCarros,
        carrosOperativos,
        carrosNoOperativos,
        carrosCondicionales,
        totalAlertas: alertas?.length || 0,
        alertasCriticas: alertas?.filter(a => ['critica', 'alta'].includes(a.severidad)).length || 0,
        equiposMantVencido,
        usuariosActivos: usuarios?.length || 0,
        cumplimiento,
        ultimoControl: inspecciones?.[0]?.fecha || null,
      })
    }

    setHospitalesStats(stats)
    setCargandoStats(false)
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('perfiles')
      .select('*, hospitales(nombre)').order('creado_en', { ascending: false })
    setUsuarios(data || [])
  }

  async function cargarSolicitudes() {
    const { data } = await supabase.from('solicitudes_registro')
      .select('*').eq('estado', 'pendiente').order('creado_en', { ascending: false })
    setSolicitudes(data || [])
  }

  // ================================================================
  // Hospitales
  // ================================================================
  async function crearHospital() {
    if (!formHospital.nombre || !formHospital.slug || !formHospital.email_admin) {
      toast.error('Completa nombre, slug y email'); return
    }
    setGuardando(true)
    const { error } = await supabase.from('hospitales').insert({ ...formHospital, activo: false })
    if (error) { toast.error(error.message); setGuardando(false); return }
    toast.success(`Hospital "${formHospital.nombre}" creado`)
    setFormHospital({ nombre: '', slug: '', email_admin: '', telefono: '', plan: 'basico', max_carros: 15, max_usuarios: 5, color_primario: '#1d4ed8', pais: 'España' })
    setTab('hospitales')
    await cargarHospitalesConStats()
    setGuardando(false)
  }

  async function toggleActivo(h: HospitalStats) {
    await supabase.from('hospitales').update({ activo: !h.activo }).eq('id', h.id)
    toast.success(h.activo ? 'Hospital desactivado' : 'Hospital activado')
    await cargarHospitalesConStats()
  }

  async function guardarEdicionHospital() {
    if (!editandoHospital) return
    setGuardando(true)
    const { error } = await supabase.from('hospitales').update({
      nombre: editandoHospital.nombre, email_admin: editandoHospital.email_admin,
      telefono: editandoHospital.telefono, plan: editandoHospital.plan,
      max_carros: editandoHospital.max_carros, max_usuarios: editandoHospital.max_usuarios,
      color_primario: editandoHospital.color_primario,
    }).eq('id', editandoHospital.id)
    if (error) { toast.error('Error al guardar'); setGuardando(false); return }
    toast.success('Hospital actualizado')
    setEditandoHospital(null)
    await cargarHospitalesConStats()
    setGuardando(false)
  }

  async function subirLogo(file: File, hospitalId: string) {
    setSubiendoLogo(true)
    const ext = file.name.split('.').pop()
    const nombre = `${hospitalId}.${ext}`
    await supabase.storage.from('logos').remove([nombre])
    await supabase.storage.from('logos').upload(nombre, file, { upsert: true, contentType: file.type })
    const { data: url } = supabase.storage.from('logos').getPublicUrl(nombre)
    await supabase.from('hospitales').update({ logo_url: url.publicUrl + '?t=' + Date.now() }).eq('id', hospitalId)
    setEditandoHospital((p: any) => ({ ...p, logo_url: url.publicUrl }))
    toast.success('Logo actualizado')
    await cargarHospitalesConStats()
    setSubiendoLogo(false)
  }

  // ================================================================
  // Usuarios
  // ================================================================
  async function crearUsuario() {
    if (!formUsuario.nombre || !formUsuario.email || !formUsuario.hospital_id) {
      toast.error('Nombre, email y hospital son obligatorios'); return
    }
    setGuardando(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formUsuario.email,
        password: Math.random().toString(36).slice(-10) + 'A1!',
        options: { data: { nombre: formUsuario.nombre } }
      })
      if (authError) throw authError
      if (!authData.user) throw new Error('No se pudo crear el usuario')

      await supabase.from('perfiles').insert({
        id: authData.user.id, nombre: formUsuario.nombre, email: formUsuario.email,
        rol: formUsuario.rol, hospital_id: formUsuario.hospital_id,
        servicio_id: formUsuario.servicio_id || null, activo: formUsuario.activo,
        codigo_empleado: formUsuario.codigo_empleado?.trim() || null,
      })
      toast.success(`Usuario "${formUsuario.nombre}" creado`)
      setModalUsuario(null)
      setFormUsuario({ nombre: '', email: '', rol: 'auditor', hospital_id: '', servicio_id: '', activo: true, codigo_empleado: '', recibir_alertas: false })
      await cargarUsuarios()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario')
    } finally {
      setGuardando(false)
    }
  }

  async function actualizarUsuario() {
    if (!modalUsuario?.id) return
    setGuardando(true)
    await supabase.from('perfiles').update({
      nombre: formUsuario.nombre, rol: formUsuario.rol,
      hospital_id: formUsuario.hospital_id, servicio_id: formUsuario.servicio_id || null,
      activo: formUsuario.activo, codigo_empleado: formUsuario.codigo_empleado?.trim() || null,
      recibir_alertas: formUsuario.recibir_alertas,
    }).eq('id', modalUsuario.id)
    toast.success('Usuario actualizado')
    setModalUsuario(null)
    await cargarUsuarios()
    setGuardando(false)
  }

  async function toggleUsuarioActivo(u: any) {
    await supabase.from('perfiles').update({ activo: !u.activo }).eq('id', u.id)
    toast.success(u.activo ? 'Usuario desactivado' : 'Usuario activado')
    await cargarUsuarios()
  }

  /**
   * Activa o desactiva los avisos desde la propia campana del listado.
   *
   * Era solo un indicador y la gente pincha en ella —es lo natural—, así que
   * obligar a entrar en "Editar" para algo que se cambia de un vistazo era
   * fricción sin motivo. Se comprueba el error: si la política RLS rechazara
   * el cambio, la campana volvería a su sitio sin decir nada.
   */
  async function toggleAvisos(u: any) {
    const { error } = await supabase.from('perfiles')
      .update({ recibir_alertas: !u.recibir_alertas }).eq('id', u.id)

    if (error) {
      // El error de Postgres es el nombre de la restricción, que no le dice
      // nada a nadie. Se traduce a lo que hay que hacer: un supervisor sin
      // servicio asignado incumple perfiles_servicio_coherente, así que
      // CUALQUIER cambio en su ficha falla hasta que se le asigne uno.
      const falta = error.message.includes('perfiles_servicio_coherente')
      toast.error(falta
        ? `${u.nombre} es supervisor y no tiene servicio asignado. Pulsa "Editar" y elígele uno; hasta entonces su ficha no se puede modificar.`
        : 'No se pudo cambiar: ' + error.message)
      return
    }
    toast.success(u.recibir_alertas
      ? `${u.nombre} ya no recibirá avisos`
      : `${u.nombre} recibirá los avisos`)
    await cargarUsuarios()
  }

  async function gestionarSolicitud(id: string, estado: 'aprobada' | 'rechazada') {
    await supabase.from('solicitudes_registro').update({
      estado, gestionado_por: perfil?.id, gestionado_en: new Date().toISOString(),
    }).eq('id', id)
    toast.success(estado === 'aprobada' ? 'Aprobada' : 'Rechazada')
    await cargarSolicitudes()
  }

  // ================================================================
  // Filtros
  // ================================================================
  const usuariosFiltrados = usuarios.filter(u => {
    const matchH = filtroHospital === 'todos' || u.hospital_id === filtroHospital
    const matchB = !busquedaUsuario ||
      u.nombre?.toLowerCase().includes(busquedaUsuario.toLowerCase()) ||
      u.email?.toLowerCase().includes(busquedaUsuario.toLowerCase())
    return matchH && matchB
  })

  // Resumen global
  const globalStats = {
    hospitales: hospitalesStats.length,
    activos: hospitalesStats.filter(h => h.activo).length,
    carros: hospitalesStats.reduce((a, h) => a + h.totalCarros, 0),
    alertas: hospitalesStats.reduce((a, h) => a + h.totalAlertas, 0),
    noOperativos: hospitalesStats.reduce((a, h) => a + h.carrosNoOperativos, 0),
    mantVencido: hospitalesStats.reduce((a, h) => a + h.equiposMantVencido, 0),
    usuarios: usuarios.length,
  }

  const cerrarSesion = async () => { await supabase.auth.signOut(); router.push('/') }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Cargando panel ÁSTOR...</div>
    </div>
  )

  return (
    <div className="sa-page">
      {/* Topbar */}
      <div className="sa-topbar">
        {/* La barra mide 56px fijos: en vez de desbordar, lo prescindible
            (subtítulo y nombre de usuario) se recorta con puntos suspensivos. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', minWidth: 0 }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', letterSpacing: '0.08em', flexShrink: 0 }}>ÁSTOR</span>
          <span style={{ fontSize: '0.6rem', color: '#9ca3af', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Superadmin · CRITIC SL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.5rem, 2vw, 1rem)', minWidth: 0, flexShrink: 0 }}>
          <button onClick={() => router.push('/perfil')} style={{ fontSize: '0.78rem', color: '#d1d5db', background: 'transparent', border: 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '9rem' }}>{perfil?.nombre}</button>
          <VersionApp tono="oscuro" />
          {/* La pantalla de auditoría muestra TODOS los hospitales cuando entra
              un superadmin, pero solo estaba enlazada desde el panel de
              administrador de hospital: desde aquí no había forma de llegar. */}
          <button onClick={() => router.push('/admin/auditoria')} title="Registro de auditoría"
            style={{ fontSize: '0.72rem', color: '#9ca3af', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '5px', padding: '0.35rem 0.6rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            🔍 Auditoría
          </button>
          <button onClick={cerrarSesion} style={{ fontSize: '0.72rem', color: '#6b7280', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '5px', padding: '0.35rem 0.75rem', cursor: 'pointer' }}>Salir</button>
        </div>
      </div>

      <div className="sa-body">

        {/* Resumen global */}
        <div className="metrics-grid" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'Hospitales', value: globalStats.hospitales, color: '#111827' },
            { label: 'Activos', value: globalStats.activos, color: '#16a34a' },
            { label: 'Carros', value: globalStats.carros, color: '#1d4ed8' },
            { label: 'No operativos', value: globalStats.noOperativos, color: globalStats.noOperativos > 0 ? '#dc2626' : '#6b7280' },
            { label: 'Alertas', value: globalStats.alertas, color: globalStats.alertas > 0 ? '#d97706' : '#6b7280' },
            { label: 'Mant. vencido', value: globalStats.mantVencido, color: globalStats.mantVencido > 0 ? '#dc2626' : '#6b7280' },
            { label: 'Usuarios', value: globalStats.usuarios, color: '#7c3aed' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        {/* Las 4 pestañas suman ~480px: en móvil desbordaban y arrastraban
            la página entera en horizontal. Ahora se desplazan sobre sí
            mismas y en PC siguen viéndose igual (maxWidth fit-content). */}
        <div style={{ display: 'flex', marginBottom: '1.5rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '4px', width: 'fit-content', maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', gap: '2px' }}>
          {([
            ['hospitales', `Hospitales (${hospitalesStats.length})`],
            ['nuevo_hospital', '+ Nuevo hospital'],
            ['usuarios', `Usuarios (${usuarios.length})`],
            ['solicitudes', `Solicitudes${solicitudes.length > 0 ? ` (${solicitudes.length})` : ''}`],
          ] as const).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t as Tab)} style={{
              padding: '0.45rem 1rem', borderRadius: '5px', border: 'none', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: 600, fontFamily: "'Inter', sans-serif",
              whiteSpace: 'nowrap', flexShrink: 0,
              background: tab === t ? '#111827' : 'transparent',
              color: tab === t ? 'white' : '#6b7280',
            }}>{l}</button>
          ))}
        </div>

        {/* ============ TAB HOSPITALES ============ */}
        {tab === 'hospitales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {cargandoStats && (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                Cargando estadísticas...
              </div>
            )}
            {hospitalesStats.map(h => {
              const color = semaforo(h)
              const colorBorde = color === 'verde' ? '#16a34a' : color === 'amarillo' ? '#d97706' : '#dc2626'
              const colorFondo = color === 'verde' ? '#f0fdf4' : color === 'amarillo' ? '#fffbeb' : '#fef2f2'
              const isOpen = hospitalDetalle === h.id

              return (
                <div key={h.id} style={{ background: 'white', border: `1px solid #e5e7eb`, borderRadius: '12px', overflow: 'hidden' }}>
                  {/* Cabecera del hospital */}
                  <div style={{ padding: 'clamp(0.875rem, 3vw, 1.25rem) clamp(0.875rem, 3vw, 1.5rem)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '1rem', alignItems: 'center', borderLeft: `4px solid ${colorBorde}`, background: isOpen ? '#fafafa' : 'white', cursor: 'pointer' }}
                    onClick={() => setHospitalDetalle(isOpen ? null : h.id)}>
                    {/* minWidth:0 permite que este bloque encoja por debajo de
                        su contenido; sin él, el nombre del hospital empuja la
                        tarjeta y desborda la pantalla en móvil. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.5rem, 2vw, 1rem)', minWidth: 0 }}>
                      {/* Semáforo */}
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: colorBorde, flexShrink: 0, boxShadow: `0 0 8px ${colorBorde}60` }}></div>
                      {h.logo_url
                        ? <img src={h.logo_url} alt={h.nombre} style={{ height: '28px', objectFit: 'contain', flexShrink: 0 }} />
                        : <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: h.color_primario, flexShrink: 0 }}></div>}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>{h.nombre}</span>
                          <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '3px', background: planColor[h.plan] + '15', color: planColor[h.plan] }}>{planLabel[h.plan]}</span>
                          <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '3px', background: h.activo ? '#dcfce7' : '#fee2e2', color: h.activo ? '#16a34a' : '#dc2626' }}>{h.activo ? 'Activo' : 'Inactivo'}</span>
                        </div>
                        {/* Mini métricas */}
                        {/* Seis métricas en una línea suman ~600px: sin
                            flexWrap desbordaban la pantalla entera. */}
                        <div style={{ display: 'flex', gap: '0.35rem 1rem', fontSize: '0.72rem', color: '#6b7280', flexWrap: 'wrap' }}>
                          <span>🟢 {h.carrosOperativos}/{h.totalCarros} carros</span>
                          {h.carrosNoOperativos > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>🔴 {h.carrosNoOperativos} no op.</span>}
                          {h.totalAlertas > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}>⚠️ {h.totalAlertas} alertas</span>}
                          {h.equiposMantVencido > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>🔧 {h.equiposMantVencido} mant.</span>}
                          <span>👥 {h.usuariosActivos} usuarios</span>
                          <span style={{ color: h.cumplimiento >= 80 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>📋 {h.cumplimiento}% cumpl.</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Panel detalle expandible */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid #e5e7eb', padding: '1.5rem' }}>

                      {/* KPIs detalle */}
                      <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                        {[
                          { label: 'Operativos', value: h.carrosOperativos, color: '#16a34a', bg: '#f0fdf4' },
                          { label: 'Condicionales', value: h.carrosCondicionales, color: '#d97706', bg: '#fffbeb' },
                          { label: 'No operativos', value: h.carrosNoOperativos, color: '#dc2626', bg: '#fef2f2' },
                          { label: 'Alertas', value: h.totalAlertas, color: h.totalAlertas > 0 ? '#d97706' : '#6b7280', bg: '#f9fafb' },
                          { label: 'Mant. vencido', value: h.equiposMantVencido, color: h.equiposMantVencido > 0 ? '#dc2626' : '#6b7280', bg: '#f9fafb' },
                          { label: 'Cumplimiento', value: `${h.cumplimiento}%`, color: h.cumplimiento >= 80 ? '#16a34a' : '#dc2626', bg: '#f9fafb' },
                        ].map((kpi, i) => (
                          <div key={i} style={{ background: kpi.bg, borderRadius: '8px', padding: '0.875rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                            <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '2px', fontWeight: 600 }}>{kpi.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Servicios del hospital */}
                      <div style={{ marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
                        <ServiciosDelHospital hospitalId={h.id} hospitalNombre={h.nombre} />
                      </div>

                      {/* Barra de cumplimiento */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                          <span>Cumplimiento de controles</span>
                          <span style={{ color: h.cumplimiento >= 80 ? '#16a34a' : '#dc2626' }}>{h.cumplimiento}%</span>
                        </div>
                        <div style={{ background: '#e5e7eb', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
                          <div style={{ background: h.cumplimiento >= 80 ? '#16a34a' : h.cumplimiento >= 60 ? '#d97706' : '#dc2626', height: '100%', width: `${h.cumplimiento}%`, borderRadius: '99px', transition: 'width 0.5s' }}></div>
                        </div>
                      </div>

                      {/* Acciones */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={() => setEditandoHospital({ ...h })} className="sa-btn sa-btn-sec">✏️ Editar</button>
                        <button onClick={() => router.push(`/superadmin/hospital/${h.id}/logos`)} className="sa-btn sa-btn-sec">🎨 Logos</button>
                        <button onClick={() => { setFiltroHospital(h.id); setTab('usuarios') }} className="sa-btn sa-btn-sec">👥 Ver usuarios</button>
                        <button onClick={() => toggleActivo(h)} className="sa-btn sa-btn-sec" style={{ color: h.activo ? '#dc2626' : '#16a34a', background: h.activo ? '#fef2f2' : '#f0fdf4', border: `1px solid ${h.activo ? '#fecaca' : '#bbf7d0'}` }}>
                          {h.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>

                      {/* Editor inline */}
                      {editandoHospital?.id === h.id && (
                        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            {editandoHospital.logo_url && <img src={editandoHospital.logo_url} alt="logo" style={{ height: '36px', objectFit: 'contain', maxWidth: '100%' }} />}
                            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                              onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f, editandoHospital.id) }} />
                            <button onClick={() => fileInputRef.current?.click()} disabled={subiendoLogo} className="sa-btn sa-btn-pri">
                              {subiendoLogo ? 'Subiendo...' : editandoHospital.logo_url ? 'Cambiar logo' : 'Subir logo'}
                            </button>
                          </div>
                          <div className="form-grid" style={{ marginBottom: '1rem' }}>
                            {[['Nombre', 'nombre', 'text'], ['Email admin', 'email_admin', 'email'], ['Teléfono', 'telefono', 'tel'], ['Color primario', 'color_primario', 'color']].map(([l, f, t]) => (
                              <div key={f}>
                                <label className="sa-label">{l}</label>
                                <input type={t} value={editandoHospital[f] || ''} onChange={e => setEditandoHospital({ ...editandoHospital, [f]: e.target.value })} className="sa-input" />
                              </div>
                            ))}
                            <div>
                              <label className="sa-label">Plan</label>
                              <select value={editandoHospital.plan} onChange={e => { const l = planLimites(e.target.value); setEditandoHospital({ ...editandoHospital, plan: e.target.value, ...l }) }} className="sa-input" style={{ background: 'white' }}>
                                <option value="basico">Básico</option><option value="estandar">Estándar</option>
                                <option value="hospital">Hospital</option><option value="enterprise">Enterprise</option>
                              </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                              <div><label className="sa-label">Máx. carros</label><input type="number" value={editandoHospital.max_carros} onChange={e => setEditandoHospital({ ...editandoHospital, max_carros: +e.target.value })} className="sa-input" /></div>
                              <div><label className="sa-label">Máx. usuarios</label><input type="number" value={editandoHospital.max_usuarios} onChange={e => setEditandoHospital({ ...editandoHospital, max_usuarios: +e.target.value })} className="sa-input" /></div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button onClick={guardarEdicionHospital} disabled={guardando} className="sa-btn sa-btn-pri">{guardando ? 'Guardando...' : 'Guardar'}</button>
                            <button onClick={() => setEditandoHospital(null)} className="sa-btn sa-btn-sec">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ============ TAB NUEVO HOSPITAL ============ */}
        {tab === 'nuevo_hospital' && (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem', maxWidth: '680px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>Nuevo hospital</h2>
            <div className="form-grid">
              {[['Nombre *', 'nombre', 'text', 'Hospital Universitario...'], ['Slug URL *', 'slug', 'text', 'hospital-nombre'], ['Email administrador *', 'email_admin', 'email', 'admin@hospital.es'], ['Teléfono', 'telefono', 'tel', '+34 900 000 000'], ['País', 'pais', 'text', 'España'], ['Color primario', 'color_primario', 'color', '']].map(([l, f, t, p]) => (
                <div key={f}>
                  <label className="sa-label">{l}</label>
                  <input type={t} placeholder={p} value={(formHospital as any)[f]} onChange={e => setFormHospital(prev => ({ ...prev, [f]: e.target.value }))} className="sa-input" />
                </div>
              ))}
              <div style={{ gridColumn: '1/-1' }}>
                <label className="sa-label">Plan</label>
                <select value={formHospital.plan} onChange={e => { const l = planLimites(e.target.value); setFormHospital(p => ({ ...p, plan: e.target.value, ...l })) }} className="sa-input" style={{ background: 'white' }}>
                  <option value="basico">Básico — 15 carros, 5 usuarios — 600 €/año</option>
                  <option value="estandar">Estándar — 40 carros, 15 usuarios — 1.500 €/año</option>
                  <option value="hospital">Hospital — 100 carros, 30 usuarios — 3.000 €/año</option>
                  <option value="enterprise">Enterprise — ilimitado — a medida</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button onClick={crearHospital} disabled={guardando} className="sa-btn sa-btn-pri">{guardando ? 'Creando...' : 'Crear hospital'}</button>
              <button onClick={() => setTab('hospitales')} className="sa-btn sa-btn-sec">Cancelar</button>
            </div>
          </div>
        )}

        {/* ============ TAB USUARIOS ============ */}
        {tab === 'usuarios' && (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Anchos fluidos (flex-basis) en vez de fijos: en móvil se
                  estiran al ancho disponible y en PC mantienen su tamaño. */}
              <input placeholder="Buscar por nombre o email..." value={busquedaUsuario} onChange={e => setBusquedaUsuario(e.target.value)} className="sa-input" style={{ flex: '1 1 15rem', minWidth: 0 }} />
              <select value={filtroHospital} onChange={e => setFiltroHospital(e.target.value)} className="sa-input" style={{ flex: '1 1 13rem', minWidth: 0, background: 'white' }}>
                <option value="todos">Todos los hospitales</option>
                {hospitalesStats.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
              </select>
              <button onClick={() => { setModalUsuario('nuevo'); setFormUsuario({ nombre: '', email: '', rol: 'auditor', hospital_id: filtroHospital !== 'todos' ? filtroHospital : '', servicio_id: '', activo: true, codigo_empleado: '', recibir_alertas: false }) }} className="sa-btn sa-btn-pri">
                + Nuevo usuario
              </button>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{usuariosFiltrados.length} usuarios</span>
            </div>
            {/* overflowX en lugar de hidden: con 6 columnas, en móvil se
                recortaban "Estado" y "Acciones" y los botones Editar /
                Desactivar quedaban inalcanzables. */}
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}>
              <table style={{ width: '100%', minWidth: '46rem', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f3f4f6', background: '#fafafa' }}>
                    {['Nombre', 'Email', 'Hospital', 'Rol', 'Estado', 'Avisos', 'Acciones'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: '#111827' }}>
                        {u.nombre}
                        {u.codigo_empleado && <span style={{ marginLeft: '4px', fontSize: '0.65rem', color: '#6366f1' }} title={`QR: ${u.codigo_empleado}`}>🆔</span>}
                      </td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{u.email}</td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{(u.hospitales as any)?.nombre || '—'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f3f4f6', color: '#374151' }}>{u.rol}</span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: u.activo ? '#dcfce7' : '#fee2e2', color: u.activo ? '#16a34a' : '#dc2626' }}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      {/* Quién se enteraría de un carro no operativo. Sin esta
                          columna había que abrir ficha por ficha, y así nadie
                          reparó en que casi ningún usuario lo tenía activado. */}
                      <td style={{ padding: '0.75rem' }}>
                        <button
                          onClick={() => toggleAvisos(u)}
                          title={u.recibir_alertas
                            ? `${u.nombre} recibe los avisos — pulsa para desactivar`
                            : `${u.nombre} NO recibe avisos — pulsa para activar`}
                          style={{
                            fontSize: '1rem', lineHeight: 1, cursor: 'pointer',
                            background: 'transparent', border: 'none', padding: '0.25rem',
                            opacity: u.recibir_alertas ? 1 : 0.35,
                          }}>
                          {u.recibir_alertas ? '🔔' : '🔕'}
                        </button>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => { setModalUsuario(u); setFormUsuario({ nombre: u.nombre, email: u.email, rol: u.rol, hospital_id: u.hospital_id || '', servicio_id: u.servicio_id || '', activo: u.activo, codigo_empleado: u.codigo_empleado || '', recibir_alertas: !!u.recibir_alertas }) }}
                            className="sa-btn sa-btn-sec sa-btn-mini">Editar</button>
                          <button onClick={() => toggleUsuarioActivo(u)}
                            className="sa-btn sa-btn-sec sa-btn-mini" style={{ color: u.activo ? '#dc2626' : '#16a34a' }}>
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usuariosFiltrados.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin usuarios</div>
              )}
            </div>
          </>
        )}

        {/* ============ TAB SOLICITUDES ============ */}
        {tab === 'solicitudes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {solicitudes.length === 0 && (
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                No hay solicitudes pendientes ✓
              </div>
            )}
            {solicitudes.map(s => (
              <div key={s.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1.25rem 1.5rem', borderLeft: '4px solid #d97706' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>{s.nombre}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{s.email}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Centro: <strong>{s.hospital_nombre}</strong></div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Rol: <strong>{s.rol_solicitado}</strong></div>
                    {s.mensaje && <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '4px' }}>"{s.mensaje}"</div>}
                    <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '4px' }}>{new Date(s.creado_en).toLocaleString('es-ES')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button onClick={() => gestionarSolicitud(s.id, 'aprobada')} className="sa-btn sa-btn-pri" style={{ background: '#16a34a', fontSize: '0.75rem' }}>Aprobar</button>
                    <button onClick={() => gestionarSolicitud(s.id, 'rechazada')} className="sa-btn sa-btn-sec" style={{ color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.75rem' }}>Rechazar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal usuario */}
      {modalUsuario && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setModalUsuario(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>
              {modalUsuario === 'nuevo' ? 'Crear usuario' : `Editar: ${modalUsuario.nombre}`}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div><label className="sa-label">Nombre completo *</label><input type="text" value={formUsuario.nombre} onChange={e => setFormUsuario(f => ({ ...f, nombre: e.target.value }))} className="sa-input" /></div>
              {modalUsuario === 'nuevo' && <div><label className="sa-label">Email *</label><input type="email" value={formUsuario.email} onChange={e => setFormUsuario(f => ({ ...f, email: e.target.value }))} className="sa-input" /></div>}
              <div>
                <label className="sa-label">Hospital *</label>
                <select value={formUsuario.hospital_id} onChange={e => setFormUsuario(f => ({ ...f, hospital_id: e.target.value }))} className="sa-input" style={{ background: 'white' }}>
                  <option value="">Seleccionar hospital...</option>
                  {hospitalesStats.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="sa-label">Rol</label>
                <select value={formUsuario.rol} onChange={e => setFormUsuario(f => ({ ...f, rol: e.target.value }))} className="sa-input" style={{ background: 'white' }}>
                  {ROLES_SUPERADMIN.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="sa-label">Código de empleado <span style={{ color: '#9ca3af', fontWeight: 400 }}>(QR / código de barras)</span></label>
                <input className="sa-input" placeholder="Código asignado por RRHH" value={formUsuario.codigo_empleado || ''} onChange={e => setFormUsuario(f => ({ ...f, codigo_empleado: e.target.value }))} />
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>Permite acceder escaneando la tarjeta de empleado</div>
              </div>
              {/* Viene desactivado de fábrica, así que un usuario nuevo no
                  recibe nada hasta que alguien se lo enciende aquí. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px' }}>
                <input type="checkbox" checked={formUsuario.recibir_alertas} onChange={e => setFormUsuario(f => ({ ...f, recibir_alertas: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>Recibir avisos de alertas</div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Email y notificación cuando un carro queda no operativo</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px' }}>
                <input type="checkbox" checked={formUsuario.activo} onChange={e => setFormUsuario(f => ({ ...f, activo: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>Usuario activo</div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Si está inactivo no podrá acceder</div>
                </div>
              </div>
            </div>
            {/* Solo al editar: en "nuevo" todavía no existe la cuenta. */}
            {modalUsuario !== 'nuevo' && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#374151', marginBottom: '0.35rem' }}>
                  Acceso
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.6rem', lineHeight: 1.5 }}>
                  Genera un enlace para que elija una contraseña nueva. Tú no la verás:
                  su firma en los controles sigue siendo prueba de que firmó él.
                </div>
                <BotonResetPassword
                  usuarioId={modalUsuario.id}
                  usuarioNombre={modalUsuario.nombre}
                  className="sa-btn sa-btn-sec"
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button onClick={modalUsuario === 'nuevo' ? crearUsuario : actualizarUsuario} disabled={guardando} className="sa-btn sa-btn-pri">
                {guardando ? 'Guardando...' : modalUsuario === 'nuevo' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
              <button onClick={() => setModalUsuario(null)} className="sa-btn sa-btn-sec">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

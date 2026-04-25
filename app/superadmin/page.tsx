'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

type Tab = 'hospitales' | 'nuevo_hospital' | 'usuarios' | 'solicitudes'

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

const S = {
  page:    { minHeight: '100vh', background: '#f9fafb', fontFamily: "'Inter', sans-serif" } as React.CSSProperties,
  topbar:  { background: '#080c14', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 2rem', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 } as React.CSSProperties,
  body:    { maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' } as React.CSSProperties,
  card:    { background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1.25rem 1.5rem' } as React.CSSProperties,
  input:   { width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '6px', fontSize: '0.8rem', fontFamily: "'Inter', sans-serif", color: '#111827', outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
  label:   { display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem', letterSpacing: '0.03em' } as React.CSSProperties,
  btnPri:  { padding: '0.6rem 1.25rem', background: '#111827', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif" } as React.CSSProperties,
  btnSec:  { padding: '0.6rem 1.25rem', background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" } as React.CSSProperties,
}

export default function SuperAdminPage() {
  const [tab, setTab]               = useState<Tab>('hospitales')
  const [perfil, setPerfil]         = useState<any>(null)
  const [hospitales, setHospitales] = useState<any[]>([])
  const [usuarios, setUsuarios]     = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [editando, setEditando]     = useState<any>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [guardando, setGuardando]   = useState(false)
  const [filtroHospital, setFiltroHospital] = useState('todos')
  const [busquedaUsuario, setBusquedaUsuario] = useState('')
  const [modalUsuario, setModalUsuario] = useState<any>(null)  // null | 'nuevo' | usuario existente
  const [formUsuario, setFormUsuario] = useState({
    nombre: '', email: '', rol: 'auditor', hospital_id: '', servicio_id: '', activo: true, codigo_empleado: '',
  })
  const [formHospital, setFormHospital] = useState({
    nombre: '', slug: '', email_admin: '', telefono: '',
    plan: 'basico', max_carros: 15, max_usuarios: 5,
    color_primario: '#1d4ed8', pais: 'España',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarTodo() }, [])

  async function cargarTodo() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || p.rol !== 'superadmin') { router.push('/'); return }
    setPerfil(p)
    await Promise.all([cargarHospitales(), cargarUsuarios(), cargarSolicitudes()])
    setLoading(false)
  }

  async function cargarHospitales() {
    const { data } = await supabase.from('hospitales').select('*').order('creado_en', { ascending: false })
    setHospitales(data || [])
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('perfiles')
      .select('*, hospitales(nombre)')
      .order('creado_en', { ascending: false })
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
      toast.error('Completa nombre, slug y email del administrador'); return
    }
    setGuardando(true)
    const { error } = await supabase.from('hospitales').insert({ ...formHospital, activo: false })
    if (error) { toast.error(error.message); setGuardando(false); return }
    toast.success(`Hospital "${formHospital.nombre}" creado`)
    setFormHospital({ nombre: '', slug: '', email_admin: '', telefono: '', plan: 'basico', max_carros: 15, max_usuarios: 5, color_primario: '#1d4ed8', pais: 'España' })
    setTab('hospitales')
    await cargarHospitales()
    setGuardando(false)
  }

  async function toggleActivo(h: any) {
    await supabase.from('hospitales').update({ activo: !h.activo, activado_en: !h.activo ? new Date().toISOString() : null }).eq('id', h.id)
    toast.success(h.activo ? 'Hospital desactivado' : 'Hospital activado')
    await cargarHospitales()
  }

  async function guardarEdicionHospital() {
    setGuardando(true)
    const { error } = await supabase.from('hospitales').update({
      nombre: editando.nombre, email_admin: editando.email_admin,
      telefono: editando.telefono, plan: editando.plan,
      max_carros: editando.max_carros, max_usuarios: editando.max_usuarios,
      color_primario: editando.color_primario,
    }).eq('id', editando.id)
    if (error) { toast.error('Error al guardar'); setGuardando(false); return }
    toast.success('Hospital actualizado')
    setEditando(null)
    await cargarHospitales()
    setGuardando(false)
  }

  async function subirLogo(file: File, hospitalId: string) {
    setSubiendoLogo(true)
    const ext = file.name.split('.').pop()
    const nombre = `${hospitalId}.${ext}`
    await supabase.storage.from('logos').remove([nombre])
    const { error } = await supabase.storage.from('logos').upload(nombre, file, { upsert: true, contentType: file.type })
    if (error) { toast.error('Error al subir logo'); setSubiendoLogo(false); return }
    const { data: url } = supabase.storage.from('logos').getPublicUrl(nombre)
    await supabase.from('hospitales').update({ logo_url: url.publicUrl + '?t=' + Date.now() }).eq('id', hospitalId)
    setEditando((p: any) => ({ ...p, logo_url: url.publicUrl }))
    toast.success('Logo actualizado')
    await cargarHospitales()
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
      // Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: formUsuario.email,
        password: Math.random().toString(36).slice(-10) + 'A1!',
        email_confirm: true,
      })
      if (authError) throw authError

      // Crear perfil
      const { error: perfilError } = await supabase.from('perfiles').insert({
        id: authData.user.id,
        nombre: formUsuario.nombre,
        email: formUsuario.email,
        rol: formUsuario.rol,
        hospital_id: formUsuario.hospital_id,
        servicio_id: formUsuario.servicio_id || null,
        activo: formUsuario.activo,
        codigo_empleado: formUsuario.codigo_empleado?.trim() || null,
      })
      if (perfilError) throw perfilError

      toast.success(`Usuario "${formUsuario.nombre}" creado. Se enviará un email para que establezca su contraseña.`)
      setModalUsuario(null)
      setFormUsuario({ nombre: '', email: '', rol: 'auditor', hospital_id: '', servicio_id: '', activo: true })
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
    const { error } = await supabase.from('perfiles').update({
      nombre: formUsuario.nombre,
      rol: formUsuario.rol,
      hospital_id: formUsuario.hospital_id,
      servicio_id: formUsuario.servicio_id || null,
      activo: formUsuario.activo,
      codigo_empleado: formUsuario.codigo_empleado?.trim() || null,
    }).eq('id', modalUsuario.id)
    if (error) { toast.error('Error al actualizar'); setGuardando(false); return }
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

  // ================================================================
  // Solicitudes de registro
  // ================================================================
  async function gestionarSolicitud(id: string, estado: 'aprobada' | 'rechazada') {
    await supabase.from('solicitudes_registro').update({
      estado, gestionado_por: perfil?.id, gestionado_en: new Date().toISOString(),
    }).eq('id', id)
    toast.success(estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada')
    await cargarSolicitudes()
  }

  // ================================================================
  // Filtros
  // ================================================================
  const usuariosFiltrados = usuarios.filter(u => {
    const matchHospital = filtroHospital === 'todos' || u.hospital_id === filtroHospital
    const matchBusqueda = !busquedaUsuario ||
      u.nombre?.toLowerCase().includes(busquedaUsuario.toLowerCase()) ||
      u.email?.toLowerCase().includes(busquedaUsuario.toLowerCase())
    return matchHospital && matchBusqueda
  })

  const cerrarSesion = async () => { await supabase.auth.signOut(); router.push('/') }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Cargando panel ÁSTOR...</div>
    </div>
  )

  return (
    <div style={S.page}>
      {/* Topbar */}
      <div style={S.topbar}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', letterSpacing: '0.08em' }}>ÁSTOR</span>
          <span style={{ fontSize: '0.6rem', color: '#9ca3af', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 500 }}>Superadmin · CRITIC SL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.78rem', color: '#d1d5db' }}>{perfil?.nombre}</span>
          <button onClick={cerrarSesion} style={{ fontSize: '0.72rem', color: '#6b7280', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '5px', padding: '0.35rem 0.75rem', cursor: 'pointer' }}>Salir</button>
        </div>
      </div>

      <div style={S.body}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Hospitales', value: hospitales.length, color: '#111827' },
            { label: 'Activos', value: hospitales.filter(h => h.activo).length, color: '#16a34a' },
            { label: 'Usuarios totales', value: usuarios.length, color: '#1d4ed8' },
            { label: 'Solicitudes pendientes', value: solicitudes.length, color: solicitudes.length > 0 ? '#d97706' : '#6b7280' },
          ].map((s, i) => (
            <div key={i} style={S.card}>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{s.label}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: '1.5rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '4px', width: 'fit-content', gap: '2px' }}>
          {([
            ['hospitales', 'Hospitales'],
            ['nuevo_hospital', '+ Nuevo hospital'],
            ['usuarios', `Usuarios (${usuarios.length})`],
            ['solicitudes', `Solicitudes${solicitudes.length > 0 ? ` (${solicitudes.length})` : ''}`],
          ] as const).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t as Tab)} style={{
              padding: '0.45rem 1rem', borderRadius: '5px', border: 'none', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: 600, fontFamily: "'Inter', sans-serif",
              background: tab === t ? '#111827' : 'transparent',
              color: tab === t ? 'white' : '#6b7280',
            }}>{l}</button>
          ))}
        </div>

        {/* ============ TAB HOSPITALES ============ */}
        {tab === 'hospitales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {hospitales.map(h => (
              <div key={h.id}>
                <div style={{ ...S.card, borderRadius: editando?.id === h.id ? '10px 10px 0 0' : '10px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {h.logo_url
                      ? <img src={h.logo_url} alt={h.nombre} style={{ height: '32px', width: '48px', objectFit: 'contain', flexShrink: 0 }} />
                      : <div style={{ width: '4px', height: '40px', borderRadius: '2px', background: h.color_primario, flexShrink: 0 }} />}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '3px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>{h.nombre}</span>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '3px', background: planColor[h.plan] + '15', color: planColor[h.plan], border: `1px solid ${planColor[h.plan]}30` }}>{planLabel[h.plan]}</span>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '3px', background: h.activo ? '#dcfce7' : '#fee2e2', color: h.activo ? '#16a34a' : '#dc2626' }}>{h.activo ? 'Activo' : 'Inactivo'}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                        {h.slug} · {h.email_admin} · {h.max_carros} carros · {h.max_usuarios} usuarios
                        <span style={{ marginLeft: '8px', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => { setFiltroHospital(h.id); setTab('usuarios') }}>
                          ver usuarios →
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setEditando(editando?.id === h.id ? null : { ...h })} style={S.btnSec}>{editando?.id === h.id ? 'Cerrar' : 'Editar'}</button>
                    <button onClick={() => toggleActivo(h)} style={{ ...S.btnSec, color: h.activo ? '#dc2626' : '#16a34a', background: h.activo ? '#fef2f2' : '#f0fdf4', border: `1px solid ${h.activo ? '#fecaca' : '#bbf7d0'}` }}>{h.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </div>

                {editando?.id === h.id && (
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                      {editando.logo_url && <img src={editando.logo_url} alt="logo" style={{ height: '40px', objectFit: 'contain' }} />}
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f, editando.id) }} />
                      <button onClick={() => fileInputRef.current?.click()} disabled={subiendoLogo} style={S.btnPri}>
                        {subiendoLogo ? 'Subiendo...' : editando.logo_url ? 'Cambiar logo' : 'Subir logo'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      {[['Nombre', 'nombre', 'text'], ['Email admin', 'email_admin', 'email'], ['Teléfono', 'telefono', 'tel'], ['Color primario', 'color_primario', 'color']].map(([l, f, t]) => (
                        <div key={f}>
                          <label style={S.label}>{l}</label>
                          <input type={t} value={editando[f] || ''} onChange={e => setEditando({ ...editando, [f]: e.target.value })} style={S.input} />
                        </div>
                      ))}
                      <div>
                        <label style={S.label}>Plan</label>
                        <select value={editando.plan} onChange={e => { const l = planLimites(e.target.value); setEditando({ ...editando, plan: e.target.value, ...l }) }} style={{ ...S.input, background: 'white' }}>
                          <option value="basico">Básico</option><option value="estandar">Estándar</option>
                          <option value="hospital">Hospital</option><option value="enterprise">Enterprise</option>
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div><label style={S.label}>Máx. carros</label><input type="number" value={editando.max_carros} onChange={e => setEditando({ ...editando, max_carros: +e.target.value })} style={S.input} /></div>
                        <div><label style={S.label}>Máx. usuarios</label><input type="number" value={editando.max_usuarios} onChange={e => setEditando({ ...editando, max_usuarios: +e.target.value })} style={S.input} /></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={guardarEdicionHospital} disabled={guardando} style={S.btnPri}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                      <button onClick={() => setEditando(null)} style={S.btnSec}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ============ TAB NUEVO HOSPITAL ============ */}
        {tab === 'nuevo_hospital' && (
          <div style={{ ...S.card, maxWidth: '680px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>Nuevo hospital</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[['Nombre *', 'nombre', 'text', 'Hospital Universitario...'], ['Slug URL *', 'slug', 'text', 'hospital-nombre'], ['Email administrador *', 'email_admin', 'email', 'admin@hospital.es'], ['Teléfono', 'telefono', 'tel', '+34 900 000 000'], ['País', 'pais', 'text', 'España'], ['Color primario', 'color_primario', 'color', '']].map(([l, f, t, p]) => (
                <div key={f}>
                  <label style={S.label}>{l}</label>
                  <input type={t} placeholder={p} value={(formHospital as any)[f]}
                    onChange={e => setFormHospital(prev => ({ ...prev, [f]: e.target.value }))} style={S.input} />
                </div>
              ))}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Plan</label>
                <select value={formHospital.plan} onChange={e => { const l = planLimites(e.target.value); setFormHospital(p => ({ ...p, plan: e.target.value, ...l })) }} style={{ ...S.input, background: 'white' }}>
                  <option value="basico">Básico — 15 carros, 5 usuarios — 600 €/año</option>
                  <option value="estandar">Estándar — 40 carros, 15 usuarios — 1.500 €/año</option>
                  <option value="hospital">Hospital — 100 carros, 30 usuarios — 3.000 €/año</option>
                  <option value="enterprise">Enterprise — ilimitado — a medida</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={crearHospital} disabled={guardando} style={S.btnPri}>{guardando ? 'Creando...' : 'Crear hospital'}</button>
              <button onClick={() => setTab('hospitales')} style={S.btnSec}>Cancelar</button>
            </div>
          </div>
        )}

        {/* ============ TAB USUARIOS ============ */}
        {tab === 'usuarios' && (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="Buscar por nombre o email..." value={busquedaUsuario}
                onChange={e => setBusquedaUsuario(e.target.value)}
                style={{ ...S.input, width: '260px' }} />
              <select value={filtroHospital} onChange={e => setFiltroHospital(e.target.value)}
                style={{ ...S.input, width: '220px', background: 'white' }}>
                <option value="todos">Todos los hospitales</option>
                {hospitales.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
              </select>
              <button onClick={() => { setModalUsuario('nuevo'); setFormUsuario({ nombre: '', email: '', rol: 'auditor', hospital_id: filtroHospital !== 'todos' ? filtroHospital : '', servicio_id: '', activo: true, codigo_empleado: '' }) }} style={S.btnPri}>
                + Nuevo usuario
              </button>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{usuariosFiltrados.length} usuarios</span>
            </div>

            <div style={S.card}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                    {['Nombre', 'Email', 'Hospital', 'Rol', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: '#111827' }}>{u.nombre}</td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{u.email}</td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{(u.hospitales as any)?.nombre || '—'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f3f4f6', color: '#374151' }}>{u.rol}</span>
                        {u.codigo_empleado && <span style={{ marginLeft: '4px', fontSize: '0.65rem', color: '#6366f1' }} title={`Código QR: ${u.codigo_empleado}`}>🆔</span>}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: u.activo ? '#dcfce7' : '#fee2e2', color: u.activo ? '#16a34a' : '#dc2626' }}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => { setModalUsuario(u); setFormUsuario({ nombre: u.nombre, email: u.email, rol: u.rol, hospital_id: u.hospital_id || '', servicio_id: u.servicio_id || '', activo: u.activo, codigo_empleado: u.codigo_empleado || '' }) }}
                            style={{ ...S.btnSec, padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}>Editar</button>
                          <button onClick={() => toggleUsuarioActivo(u)}
                            style={{ ...S.btnSec, padding: '0.3rem 0.6rem', fontSize: '0.7rem', color: u.activo ? '#dc2626' : '#16a34a' }}>
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
              <div style={{ ...S.card, textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                No hay solicitudes pendientes ✓
              </div>
            )}
            {solicitudes.map(s => (
              <div key={s.id} style={{ ...S.card, borderLeft: '4px solid #d97706' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827', marginBottom: '4px' }}>{s.nombre}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '2px' }}>{s.email}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '2px' }}>Centro: <strong>{s.hospital_nombre}</strong></div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '4px' }}>Rol solicitado: <strong>{s.rol_solicitado}</strong></div>
                    {s.mensaje && <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>"{s.mensaje}"</div>}
                    <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '4px' }}>
                      {new Date(s.creado_en).toLocaleString('es-ES')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button onClick={() => gestionarSolicitud(s.id, 'aprobada')}
                      style={{ ...S.btnPri, background: '#16a34a', fontSize: '0.75rem' }}>
                      Aprobar
                    </button>
                    <button onClick={() => gestionarSolicitud(s.id, 'rechazada')}
                      style={{ ...S.btnSec, color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.75rem' }}>
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal usuario (nuevo o editar) */}
      {modalUsuario && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setModalUsuario(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', marginBottom: '1.5rem' }}>
              {modalUsuario === 'nuevo' ? 'Crear usuario' : `Editar: ${modalUsuario.nombre}`}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div><label style={S.label}>Nombre completo *</label><input type="text" value={formUsuario.nombre} onChange={e => setFormUsuario(f => ({ ...f, nombre: e.target.value }))} style={S.input} /></div>
              {modalUsuario === 'nuevo' && <div><label style={S.label}>Email *</label><input type="email" value={formUsuario.email} onChange={e => setFormUsuario(f => ({ ...f, email: e.target.value }))} style={S.input} /></div>}
              <div>
                <label style={S.label}>Hospital *</label>
                <select value={formUsuario.hospital_id} onChange={e => setFormUsuario(f => ({ ...f, hospital_id: e.target.value }))} style={{ ...S.input, background: 'white' }}>
                  <option value="">Seleccionar hospital...</option>
                  {hospitales.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Rol</label>
                <select value={formUsuario.rol} onChange={e => setFormUsuario(f => ({ ...f, rol: e.target.value }))} style={{ ...S.input, background: 'white' }}>
                  {ROLES_SUPERADMIN.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Código de empleado <span style={{ color: '#9ca3af', fontWeight: 400 }}>(QR / código de barras)</span></label>
                <input style={S.input} placeholder="Código asignado por RRHH"
                  value={formUsuario.codigo_empleado || ''}
                  onChange={e => setFormUsuario(f => ({ ...f, codigo_empleado: e.target.value }))} />
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>Permite al usuario acceder escaneando su tarjeta de empleado</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px' }}>
                <input type="checkbox" checked={formUsuario.activo} onChange={e => setFormUsuario(f => ({ ...f, activo: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>Usuario activo</div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Si está inactivo no podrá acceder al sistema</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={modalUsuario === 'nuevo' ? crearUsuario : actualizarUsuario} disabled={guardando} style={S.btnPri}>
                {guardando ? 'Guardando...' : modalUsuario === 'nuevo' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
              <button onClick={() => setModalUsuario(null)} style={S.btnSec}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

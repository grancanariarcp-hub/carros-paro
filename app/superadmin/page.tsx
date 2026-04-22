'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function SuperAdminPage() {
  const [hospitales, setHospitales] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'hospitales'|'nuevo'>('hospitales')
  const [editando, setEditando] = useState<any>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [form, setForm] = useState({
    nombre: '', slug: '', email_admin: '', telefono: '',
    plan: 'basico', max_carros: 15, max_usuarios: 5,
    color_primario: '#1d4ed8', pais: 'España',
  })
  const [guardando, setGuardando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || p.rol !== 'superadmin') { router.push('/'); return }
    setPerfil(p)
    await cargarHospitales()
    setLoading(false)
  }

  async function cargarHospitales() {
    const { data } = await supabase.from('hospitales')
      .select('*').order('creado_en', { ascending: false })
    setHospitales(data || [])
  }

  function planLimites(plan: string) {
    switch(plan) {
      case 'basico':     return { max_carros: 15, max_usuarios: 5 }
      case 'estandar':   return { max_carros: 40, max_usuarios: 15 }
      case 'hospital':   return { max_carros: 100, max_usuarios: 30 }
      case 'enterprise': return { max_carros: 999, max_usuarios: 999 }
      default:           return { max_carros: 15, max_usuarios: 5 }
    }
  }

  function handlePlanChange(plan: string) {
    const limites = planLimites(plan)
    setForm(prev => ({ ...prev, plan, ...limites }))
  }

  async function subirLogo(file: File, hospitalId: string) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      toast.error('Solo se permiten imágenes PNG, JPG, SVG o WEBP')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('El logo no puede superar 2MB')
      return
    }
    setSubiendoLogo(true)
    try {
      const extension = file.name.split('.').pop()
      const nombreArchivo = `${hospitalId}.${extension}`

      // Eliminar logo anterior si existe
      await supabase.storage.from('logos').remove([nombreArchivo])

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(nombreArchivo, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(nombreArchivo)
      const logoUrl = urlData.publicUrl + '?t=' + Date.now() // cache buster

      const { error: updateError } = await supabase.from('hospitales')
        .update({ logo_url: logoUrl }).eq('id', hospitalId)

      if (updateError) throw updateError

      setEditando((prev: any) => ({ ...prev, logo_url: logoUrl }))
      toast.success('Logo subido correctamente')
      await cargarHospitales()
    } catch (err: any) {
      toast.error('Error al subir el logo: ' + err.message)
    } finally {
      setSubiendoLogo(false)
    }
  }

  async function eliminarLogo(hospitalId: string, logoUrl: string) {
    try {
      const nombreArchivo = logoUrl.split('/logos/')[1]?.split('?')[0]
      if (nombreArchivo) {
        await supabase.storage.from('logos').remove([nombreArchivo])
      }
      await supabase.from('hospitales').update({ logo_url: null }).eq('id', hospitalId)
      setEditando((prev: any) => ({ ...prev, logo_url: null }))
      toast.success('Logo eliminado')
      await cargarHospitales()
    } catch (err: any) {
      toast.error('Error al eliminar el logo')
    }
  }

  async function crearHospital() {
    if (!form.nombre || !form.slug || !form.email_admin) {
      toast.error('Completa nombre, slug y email del administrador')
      return
    }
    setGuardando(true)
    try {
      const { error } = await supabase.from('hospitales').insert({
        ...form,
        activo: false,
      })
      if (error) throw error
      toast.success(`Hospital "${form.nombre}" creado correctamente`)
      setForm({ nombre:'', slug:'', email_admin:'', telefono:'', plan:'basico', max_carros:15, max_usuarios:5, color_primario:'#1d4ed8', pais:'España' })
      setTab('hospitales')
      await cargarHospitales()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear el hospital')
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(hospital: any) {
    const { error } = await supabase.from('hospitales')
      .update({
        activo: !hospital.activo,
        activado_en: !hospital.activo ? new Date().toISOString() : null
      })
      .eq('id', hospital.id)
    if (error) { toast.error('Error'); return }
    toast.success(hospital.activo ? 'Hospital desactivado' : 'Hospital activado')
    await cargarHospitales()
  }

  async function guardarEdicion() {
    if (!editando) return
    setGuardando(true)
    const { error } = await supabase.from('hospitales').update({
      nombre: editando.nombre,
      email_admin: editando.email_admin,
      telefono: editando.telefono,
      plan: editando.plan,
      max_carros: editando.max_carros,
      max_usuarios: editando.max_usuarios,
      color_primario: editando.color_primario,
    }).eq('id', editando.id)
    if (error) { toast.error('Error al guardar'); setGuardando(false); return }
    toast.success('Hospital actualizado')
    setEditando(null)
    await cargarHospitales()
    setGuardando(false)
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const planColor: Record<string, string> = {
    basico: '#6b7280', estandar: '#2563eb',
    hospital: '#7c3aed', enterprise: '#dc2626',
  }
  const planLabel: Record<string, string> = {
    basico: 'Básico', estandar: 'Estándar',
    hospital: 'Hospital', enterprise: 'Enterprise',
  }

  if (loading) return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f9fafb'}}>
      <div style={{color:'#9ca3af', fontSize:'0.85rem'}}>Cargando panel ÁSTOR...</div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh', background:'#f9fafb', fontFamily:"'Inter', sans-serif"}}>

      {/* Topbar */}
      <div style={{
        background:'#080c14', borderBottom:'1px solid rgba(255,255,255,0.06)',
        padding:'0 2rem', height:'56px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:50,
      }}>
        <div style={{display:'flex', alignItems:'baseline', gap:'0.75rem'}}>
          <span style={{fontSize:'1.1rem', fontWeight:800, color:'white', letterSpacing:'0.08em'}}>ÁSTOR</span>
          <span style={{fontSize:'0.6rem', color:'#4b5563', letterSpacing:'0.15em', textTransform:'uppercase', fontWeight:500}}>Superadmin · CRITIC SL</span>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
          <span style={{fontSize:'0.78rem', color:'#6b7280'}}>{perfil?.nombre}</span>
          <button onClick={cerrarSesion} style={{
            fontSize:'0.72rem', color:'#6b7280', background:'transparent',
            border:'1px solid rgba(255,255,255,0.08)', borderRadius:'5px',
            padding:'0.35rem 0.75rem', cursor:'pointer', fontFamily:"'Inter', sans-serif",
          }}>Salir</button>
        </div>
      </div>

      <div style={{maxWidth:'1100px', margin:'0 auto', padding:'2rem 1.5rem'}}>

        {/* Stats */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'2rem'}}>
          {[
            { label:'Hospitales totales', value: hospitales.length, color:'#111827' },
            { label:'Activos', value: hospitales.filter(h=>h.activo).length, color:'#16a34a' },
            { label:'Inactivos', value: hospitales.filter(h=>!h.activo).length, color:'#dc2626' },
            { label:'Enterprise', value: hospitales.filter(h=>h.plan==='enterprise').length, color:'#7c3aed' },
          ].map((s,i) => (
            <div key={i} style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'1.25rem'}}>
              <div style={{fontSize:'0.65rem', fontWeight:600, color:'#9ca3af', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:'0.5rem'}}>{s.label}</div>
              <div style={{fontSize:'1.8rem', fontWeight:800, color:s.color, lineHeight:1}}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:'flex', marginBottom:'1.5rem', background:'white', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'4px', width:'fit-content'}}>
          {([['hospitales','Hospitales'],['nuevo','+ Nuevo hospital']] as const).map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:'0.45rem 1rem', borderRadius:'5px', border:'none', cursor:'pointer',
              fontSize:'0.78rem', fontWeight:600, fontFamily:"'Inter', sans-serif",
              background: tab===t ? '#111827' : 'transparent',
              color: tab===t ? 'white' : '#6b7280',
              transition:'all 0.15s',
            }}>{l}</button>
          ))}
        </div>

        {/* TAB HOSPITALES */}
        {tab === 'hospitales' && (
          <div style={{display:'flex', flexDirection:'column', gap:'0.75rem'}}>
            {hospitales.map(h => (
              <div key={h.id}>
                <div style={{
                  background:'white', border:'1px solid #e5e7eb', borderRadius: editando?.id === h.id ? '10px 10px 0 0' : '10px',
                  padding:'1.25rem 1.5rem',
                  display:'grid', gridTemplateColumns:'1fr auto',
                  gap:'1rem', alignItems:'center',
                }}>
                  <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
                    {/* Logo o indicador de color */}
                    {h.logo_url ? (
                      <img src={h.logo_url} alt={h.nombre}
                        style={{height:'32px', width:'48px', objectFit:'contain', flexShrink:0}}/>
                    ) : (
                      <div style={{width:'4px', height:'40px', borderRadius:'2px', background:h.color_primario, flexShrink:0}}/>
                    )}
                    <div>
                      <div style={{display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'3px'}}>
                        <span style={{fontSize:'0.9rem', fontWeight:700, color:'#111827'}}>{h.nombre}</span>
                        <span style={{
                          fontSize:'0.58rem', fontWeight:700, padding:'0.15rem 0.5rem',
                          borderRadius:'3px', letterSpacing:'0.08em', textTransform:'uppercase',
                          background: planColor[h.plan]+'15', color: planColor[h.plan],
                          border:`1px solid ${planColor[h.plan]}30`,
                        }}>{planLabel[h.plan]}</span>
                        <span style={{
                          fontSize:'0.58rem', fontWeight:700, padding:'0.15rem 0.5rem',
                          borderRadius:'3px', letterSpacing:'0.08em', textTransform:'uppercase',
                          background: h.activo ? '#dcfce7' : '#fee2e2',
                          color: h.activo ? '#16a34a' : '#dc2626',
                        }}>{h.activo ? 'Activo' : 'Inactivo'}</span>
                        {h.logo_url && (
                          <span style={{fontSize:'0.58rem', color:'#16a34a', background:'#f0fdf4', border:'1px solid #bbf7d0', padding:'0.15rem 0.5rem', borderRadius:'3px', fontWeight:600}}>
                            Logo ✓
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:'0.72rem', color:'#9ca3af'}}>
                        app.astormanager.com/<strong style={{color:'#6b7280'}}>{h.slug}</strong>
                        {h.email_admin && ` · ${h.email_admin}`}
                        {` · ${h.max_carros} carros · ${h.max_usuarios} usuarios`}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
                    <button onClick={() => setEditando(editando?.id === h.id ? null : {...h})} style={{
                      fontSize:'0.72rem', fontWeight:600, color:'#374151',
                      background:'#f9fafb', border:'1px solid #e5e7eb',
                      borderRadius:'6px', padding:'0.45rem 0.875rem',
                      cursor:'pointer', fontFamily:"'Inter', sans-serif",
                    }}>{editando?.id === h.id ? 'Cerrar' : 'Editar'}</button>
                    <button onClick={() => toggleActivo(h)} style={{
                      fontSize:'0.72rem', fontWeight:600,
                      color: h.activo ? '#dc2626' : '#16a34a',
                      background: h.activo ? '#fef2f2' : '#f0fdf4',
                      border: `1px solid ${h.activo ? '#fecaca' : '#bbf7d0'}`,
                      borderRadius:'6px', padding:'0.45rem 0.875rem',
                      cursor:'pointer', fontFamily:"'Inter', sans-serif",
                    }}>{h.activo ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </div>

                {/* Panel edición inline */}
                {editando?.id === h.id && (
                  <div style={{
                    background:'#f9fafb', border:'1px solid #e5e7eb',
                    borderTop:'none', borderRadius:'0 0 10px 10px',
                    padding:'1.5rem',
                  }}>

                    {/* SECCIÓN LOGO */}
                    <div style={{marginBottom:'1.5rem', paddingBottom:'1.5rem', borderBottom:'1px solid #e5e7eb'}}>
                      <div style={{fontSize:'0.68rem', fontWeight:700, color:'#374151', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'1rem'}}>
                        Logo del hospital
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:'1.25rem'}}>
                        {/* Preview del logo */}
                        <div style={{
                          width:'120px', height:'80px', borderRadius:'8px',
                          border:'1.5px dashed #e5e7eb', background:'white',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          overflow:'hidden', flexShrink:0,
                        }}>
                          {editando.logo_url ? (
                            <img src={editando.logo_url} alt="Logo"
                              style={{maxWidth:'100%', maxHeight:'100%', objectFit:'contain'}}/>
                          ) : (
                            <div style={{textAlign:'center'}}>
                              <svg width="24" height="24" fill="none" stroke="#d1d5db" strokeWidth="1.5" viewBox="0 0 24 24" style={{margin:'0 auto 4px'}}>
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                              <div style={{fontSize:'0.6rem', color:'#d1d5db'}}>Sin logo</div>
                            </div>
                          )}
                        </div>

                        <div style={{flex:1}}>
                          <div style={{fontSize:'0.72rem', color:'#6b7280', marginBottom:'0.75rem', lineHeight:1.6}}>
                            Sube el logo del hospital en formato PNG, JPG o SVG.<br/>
                            Recomendado: fondo transparente, mínimo 200px de ancho. Máximo 2MB.
                          </div>
                          <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap'}}>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              style={{display:'none'}}
                              onChange={e => {
                                const file = e.target.files?.[0]
                                if (file) subirLogo(file, editando.id)
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={subiendoLogo}
                              style={{
                                padding:'0.5rem 1rem', background:'#111827', color:'white',
                                border:'none', borderRadius:'6px', fontSize:'0.75rem',
                                fontWeight:600, cursor:'pointer', fontFamily:"'Inter', sans-serif",
                                opacity: subiendoLogo ? 0.6 : 1,
                              }}
                            >
                              {subiendoLogo ? 'Subiendo...' : editando.logo_url ? 'Cambiar logo' : 'Subir logo'}
                            </button>
                            {editando.logo_url && (
                              <button
                                type="button"
                                onClick={() => eliminarLogo(editando.id, editando.logo_url)}
                                style={{
                                  padding:'0.5rem 1rem', background:'#fef2f2', color:'#dc2626',
                                  border:'1px solid #fecaca', borderRadius:'6px', fontSize:'0.75rem',
                                  fontWeight:600, cursor:'pointer', fontFamily:"'Inter', sans-serif",
                                }}
                              >
                                Eliminar logo
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CAMPOS DE EDICIÓN */}
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem'}}>
                      {[
                        ['Nombre del hospital', 'nombre', 'text'],
                        ['Email administrador', 'email_admin', 'email'],
                        ['Teléfono', 'telefono', 'tel'],
                        ['Color primario', 'color_primario', 'color'],
                      ].map(([label, field, type]) => (
                        <div key={field}>
                          <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem'}}>{label}</label>
                          <input type={type} value={editando[field] || ''} onChange={e => setEditando({...editando, [field]: e.target.value})}
                            style={{width:'100%', padding:'0.6rem 0.75rem', border:'1.5px solid #e5e7eb', borderRadius:'6px', fontSize:'0.8rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none'}}/>
                        </div>
                      ))}
                      <div>
                        <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem'}}>Plan</label>
                        <select value={editando.plan} onChange={e => {
                          const limites = planLimites(e.target.value)
                          setEditando({...editando, plan: e.target.value, ...limites})
                        }} style={{width:'100%', padding:'0.6rem 0.75rem', border:'1.5px solid #e5e7eb', borderRadius:'6px', fontSize:'0.8rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none', background:'white'}}>
                          <option value="basico">Básico — 15 carros, 5 usuarios</option>
                          <option value="estandar">Estándar — 40 carros, 15 usuarios</option>
                          <option value="hospital">Hospital — 100 carros, 30 usuarios</option>
                          <option value="enterprise">Enterprise — ilimitado</option>
                        </select>
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem'}}>
                        <div>
                          <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem'}}>Máx. carros</label>
                          <input type="number" value={editando.max_carros} onChange={e => setEditando({...editando, max_carros: parseInt(e.target.value)})}
                            style={{width:'100%', padding:'0.6rem 0.75rem', border:'1.5px solid #e5e7eb', borderRadius:'6px', fontSize:'0.8rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none'}}/>
                        </div>
                        <div>
                          <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem'}}>Máx. usuarios</label>
                          <input type="number" value={editando.max_usuarios} onChange={e => setEditando({...editando, max_usuarios: parseInt(e.target.value)})}
                            style={{width:'100%', padding:'0.6rem 0.75rem', border:'1.5px solid #e5e7eb', borderRadius:'6px', fontSize:'0.8rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none'}}/>
                        </div>
                      </div>
                    </div>
                    <div style={{display:'flex', gap:'0.5rem'}}>
                      <button onClick={guardarEdicion} disabled={guardando} style={{
                        padding:'0.6rem 1.25rem', background:'#111827', color:'white',
                        border:'none', borderRadius:'6px', fontSize:'0.78rem', fontWeight:700,
                        cursor:'pointer', fontFamily:"'Inter', sans-serif",
                      }}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
                      <button onClick={() => setEditando(null)} style={{
                        padding:'0.6rem 1.25rem', background:'white', color:'#6b7280',
                        border:'1px solid #e5e7eb', borderRadius:'6px', fontSize:'0.78rem',
                        fontWeight:600, cursor:'pointer', fontFamily:"'Inter', sans-serif",
                      }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {hospitales.length === 0 && (
              <div style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'3rem', textAlign:'center', color:'#9ca3af', fontSize:'0.85rem'}}>
                No hay hospitales creados aún
              </div>
            )}
          </div>
        )}

        {/* TAB NUEVO HOSPITAL */}
        {tab === 'nuevo' && (
          <div style={{background:'white', border:'1px solid #e5e7eb', borderRadius:'12px', padding:'2rem', maxWidth:'680px'}}>
            <h2 style={{fontSize:'1rem', fontWeight:700, color:'#111827', marginBottom:'0.25rem'}}>Nuevo hospital</h2>
            <p style={{fontSize:'0.78rem', color:'#9ca3af', marginBottom:'1.75rem'}}>
              Una vez creado puedes subirle el logo y activarlo para que pueda acceder.
            </p>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem'}}>
              {[
                ['Nombre del hospital *', 'nombre', 'text', 'Hospital Universitario...'],
                ['Slug URL *', 'slug', 'text', 'hospital-nombre'],
                ['Email administrador *', 'email_admin', 'email', 'admin@hospital.es'],
                ['Teléfono', 'telefono', 'tel', '+34 900 000 000'],
                ['País', 'pais', 'text', 'España'],
                ['Color primario', 'color_primario', 'color', ''],
              ].map(([label, field, type, placeholder]) => (
                <div key={field}>
                  <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem', letterSpacing:'0.03em'}}>{label}</label>
                  <input type={type} placeholder={placeholder} value={(form as any)[field]}
                    onChange={e => setForm(prev => ({...prev, [field]: e.target.value}))}
                    style={{width:'100%', padding:'0.65rem 0.875rem', border:'1.5px solid #e5e7eb', borderRadius:'7px', fontSize:'0.82rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none'}}/>
                  {field === 'slug' && (
                    <div style={{fontSize:'0.62rem', color:'#9ca3af', marginTop:'3px'}}>
                      app.astormanager.com/<strong>{form.slug || 'hospital-nombre'}</strong>
                    </div>
                  )}
                </div>
              ))}
              <div style={{gridColumn:'1/-1'}}>
                <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem'}}>Plan contratado</label>
                <select value={form.plan} onChange={e => handlePlanChange(e.target.value)}
                  style={{width:'100%', padding:'0.65rem 0.875rem', border:'1.5px solid #e5e7eb', borderRadius:'7px', fontSize:'0.82rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none', background:'white'}}>
                  <option value="basico">Básico — hasta 15 carros, 5 usuarios — 600 €/año</option>
                  <option value="estandar">Estándar — hasta 40 carros, 15 usuarios — 1.500 €/año</option>
                  <option value="hospital">Hospital — hasta 100 carros, 30 usuarios — 3.000 €/año</option>
                  <option value="enterprise">Enterprise — ilimitado — a medida</option>
                </select>
              </div>
              <div>
                <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem'}}>Máx. carros</label>
                <input type="number" value={form.max_carros} onChange={e => setForm(prev => ({...prev, max_carros: parseInt(e.target.value)}))}
                  style={{width:'100%', padding:'0.65rem 0.875rem', border:'1.5px solid #e5e7eb', borderRadius:'7px', fontSize:'0.82rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none'}}/>
              </div>
              <div>
                <label style={{display:'block', fontSize:'0.68rem', fontWeight:600, color:'#374151', marginBottom:'0.3rem'}}>Máx. usuarios</label>
                <input type="number" value={form.max_usuarios} onChange={e => setForm(prev => ({...prev, max_usuarios: parseInt(e.target.value)}))}
                  style={{width:'100%', padding:'0.65rem 0.875rem', border:'1.5px solid #e5e7eb', borderRadius:'7px', fontSize:'0.82rem', fontFamily:"'Inter', sans-serif", color:'#111827', outline:'none'}}/>
              </div>
            </div>

            <div style={{
              marginTop:'1.25rem', padding:'1rem', background:'#f9fafb',
              border:'1px solid #e5e7eb', borderRadius:'8px',
              fontSize:'0.75rem', color:'#6b7280', lineHeight:1.6,
            }}>
              <strong style={{color:'#374151'}}>El hospital se creará en estado inactivo.</strong> Una vez creado podrás subir el logo desde el panel y activarlo para que el administrador del centro pueda acceder.
            </div>

            <div style={{display:'flex', gap:'0.75rem', marginTop:'1.5rem'}}>
              <button onClick={crearHospital} disabled={guardando} style={{
                padding:'0.75rem 1.5rem', background:'#111827', color:'white',
                border:'none', borderRadius:'7px', fontSize:'0.82rem', fontWeight:700,
                cursor:'pointer', fontFamily:"'Inter', sans-serif", letterSpacing:'0.03em',
              }}>{guardando ? 'Creando...' : 'Crear hospital'}</button>
              <button onClick={() => setTab('hospitales')} style={{
                padding:'0.75rem 1.25rem', background:'white', color:'#6b7280',
                border:'1px solid #e5e7eb', borderRadius:'7px', fontSize:'0.82rem',
                fontWeight:600, cursor:'pointer', fontFamily:"'Inter', sans-serif",
              }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

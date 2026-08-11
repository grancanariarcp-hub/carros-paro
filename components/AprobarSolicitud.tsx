'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Aprobar una solicitud de registro dando de alta a la persona de verdad.
 *
 * Antes, "Aprobar" solo marcaba la solicitud como aprobada: no creaba cuenta
 * ni perfil. Como la bandeja solo muestra las pendientes, desaparecía de la
 * vista y quien la había pedido seguía sin poder entrar, sin que nadie tuviera
 * forma de notarlo. Le pasó a dos personas antes de detectarse.
 *
 * Por eso hay que elegir hospital y rol antes de aprobar: la solicitud solo
 * trae el nombre del centro escrito a mano ("Hospital Negrin"), que no basta
 * para asignar a nadie a ninguna parte.
 *
 * El alta la hace la Edge Function, que es quien tiene permiso para crear la
 * cuenta con el correo ya confirmado. Sin confirmar, Supabase no deja iniciar
 * sesión: la persona figuraría como usuario y no podría entrar.
 */
export default function AprobarSolicitud({
  solicitud,
  alAprobar,
}: {
  solicitud: {
    id: string; nombre: string; email: string
    rol_solicitado?: string
    hospital_id?: string | null
    servicio_id?: string | null
    hospital_nombre?: string
  }
  alAprobar: () => void
}) {
  const [abierto, setAbierto]     = useState(false)
  const [hospitales, setHosp]     = useState<any[]>([])
  const [servicios, setServicios] = useState<any[]>([])
  // Las solicitudes nuevas ya traen hospital y servicio elegidos de una lista;
  // solo hay que confirmarlos. Las antiguas solo tienen el centro escrito a
  // mano, y esas siguen necesitando que alguien lo resuelva.
  const [hospitalId, setHospital] = useState(solicitud.hospital_id || '')
  const [rol, setRol]             = useState(solicitud.rol_solicitado || 'auditor')
  const [servicioId, setServicio] = useState(solicitud.servicio_id || '')
  const [enviando, setEnviando]   = useState(false)
  const [enlace, setEnlace]       = useState<string | null>(null)
  const [copiado, setCopiado]     = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!abierto || hospitales.length) return
    supabase.from('hospitales').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setHosp(data || [])
        if (hospitalId) return

        // Solicitud antigua: solo trae el centro escrito a mano. Si encaja con
        // uno real se preselecciona, para no elegir mal a las nueve de la noche.
        const escrito = (solicitud.hospital_nombre || '').toLowerCase()
        const encaja = (data || []).find(h =>
          escrito.includes(h.nombre.toLowerCase()) ||
          h.nombre.toLowerCase().includes(escrito.replace(/^hospital\s+/, '')))
        if (encaja) setHospital(encaja.id)
      })
  }, [abierto])

  useEffect(() => {
    if (!hospitalId) { setServicios([]); return }
    supabase.from('servicios').select('id, nombre')
      .eq('hospital_id', hospitalId).eq('activo', true).is('deleted_at', null).order('nombre')
      .then(({ data }) => setServicios(data || []))
  }, [hospitalId])

  async function aprobar() {
    if (!hospitalId) { toast.error('Elige el hospital'); return }
    if (rol === 'supervisor' && !servicioId) {
      toast.error('Un supervisor necesita un servicio: sin él no vería ningún carro')
      return
    }

    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Sesión expirada, vuelve a entrar'); return }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/aprobar-solicitud`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            solicitud_id: solicitud.id,
            hospital_id: hospitalId,
            rol,
            servicio_id: rol === 'supervisor' ? servicioId : null,
          }),
        }
      )
      const j = await res.json()
      if (!res.ok || !j.ok) { toast.error(j.error || 'No se pudo aprobar'); return }

      toast.success(`${j.nombre} ya puede entrar`)
      if (j.aviso) toast.error(j.aviso)
      setEnlace(j.enlace)
      alAprobar()
    } catch (e: any) {
      toast.error('No se pudo aprobar: ' + e.message)
    } finally {
      setEnviando(false)
    }
  }

  // Una vez aprobada, lo único que queda por hacer es entregar el enlace.
  if (enlace) {
    return (
      <div className="reset-enlace">
        <div className="reset-enlace-titulo">
          {solicitud.nombre} ya tiene acceso
        </div>
        <div className="reset-enlace-ayuda">
          Hazle llegar este enlace para que ponga su contraseña. Caduca en 1 hora
          y solo sirve una vez.
        </div>
        <input className="reset-enlace-campo" readOnly value={enlace}
          onFocus={e => e.currentTarget.select()} />
        <div className="reset-enlace-acciones">
          <button className="sa-btn sa-btn-pri sa-btn-mini"
            onClick={() => {
              navigator.clipboard.writeText(enlace)
              setCopiado(true)
              setTimeout(() => setCopiado(false), 2000)
            }}>
            {copiado ? '✓ Copiado' : 'Copiar enlace'}
          </button>
        </div>
      </div>
    )
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="sa-btn sa-btn-pri"
        style={{ background: '#16a34a', fontSize: '0.75rem' }}>
        Aprobar
      </button>
    )
  }

  return (
    <div className="aprobar-solicitud">
      <div className="aprobar-solicitud-titulo">Dar de alta a {solicitud.nombre}</div>
      <p className="aprobar-solicitud-nota">
        {solicitud.hospital_id
          ? 'Eligió su centro de la lista. Confirma el rol antes de darle acceso.'
          : `El centro que escribió («${solicitud.hospital_nombre || 'sin indicar'}») es texto libre, así que hay que confirmarlo aquí.`}
      </p>

      <label className="sa-label">Hospital *</label>
      <select className="sa-input" value={hospitalId} onChange={e => setHospital(e.target.value)}>
        <option value="">Seleccionar…</option>
        {hospitales.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
      </select>

      <label className="sa-label" style={{ marginTop: '0.6rem' }}>Rol *</label>
      <select className="sa-input" value={rol} onChange={e => setRol(e.target.value)}>
        {['administrador', 'calidad', 'supervisor', 'auditor', 'tecnico', 'readonly']
          .map(r => <option key={r} value={r}>{r}</option>)}
      </select>

      {rol === 'supervisor' && (
        <>
          <label className="sa-label" style={{ marginTop: '0.6rem' }}>Servicio *</label>
          <select className="sa-input" value={servicioId} onChange={e => setServicio(e.target.value)}>
            <option value="">Seleccionar…</option>
            {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <div className="aprobar-solicitud-nota">
            Sin servicio, un supervisor no ve ningún carro.
          </div>
        </>
      )}

      <div className="aprobar-solicitud-botones">
        <button onClick={aprobar} disabled={enviando || !hospitalId}
          className="sa-btn sa-btn-pri sa-btn-mini" style={{ background: '#16a34a' }}>
          {enviando ? 'Dando de alta…' : 'Aprobar y dar de alta'}
        </button>
        <button onClick={() => setAbierto(false)} disabled={enviando}
          className="sa-btn sa-btn-sec sa-btn-mini">
          Cancelar
        </button>
      </div>
    </div>
  )
}

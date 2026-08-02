import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SERVICE_ROLE_KEY')!
Deno.serve(async () => {
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: alertas, error } = await supabase
    .rpc('generar_alertas_pendientes')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let enviados = 0
  let errores = 0

  for (const alerta of (alertas || [])) {
    try {
      const { error: emailError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: alerta.destinatario_email,
      })

      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1d4ed8; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0;">Auditor Carros de Parada</h2>
            <p style="color: #93c5fd; margin: 5px 0 0;">Hospital Universitario de Gran Canaria Doctor Negrín</p>
          </div>
          <div style="padding: 24px; background: #f8fafc;">
            <h3 style="color: #1e293b;">${alerta.asunto}</h3>
            <p style="color: #475569; line-height: 1.6;">${alerta.cuerpo}</p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
              Este es un mensaje automático del sistema de gestión de carros de parada cardíaca.<br>
              Desarrollado por GranCanariaRCP · Dr. Lübbe
            </p>
          </div>
        </div>
      `

      const res = await fetch(`${supabaseUrl}/auth/v1/admin/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          email: alerta.destinatario_email,
          subject: alerta.asunto,
          html: emailBody,
        }),
      })

      if (res.ok) {
        await supabase.from('alertas_email').insert({
          tipo: alerta.tipo,
          referencia_id: alerta.referencia_id,
          destinatario_email: alerta.destinatario_email,
          asunto: alerta.asunto,
          resuelto: false,
        })
        enviados++
      } else {
        errores++
      }
    } catch (e) {
      errores++
    }
  }

  return new Response(
    JSON.stringify({ 
      mensaje: `Proceso completado: ${enviados} emails enviados, ${errores} errores`,
      total_alertas: alertas?.length || 0
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
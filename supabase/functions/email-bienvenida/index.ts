import "jsr:@supabase/functions-js/edge-runtime.d.ts";
 
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
 
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
 
  try {
    const { hospital_id } = await req.json();
    if (!hospital_id) {
      return new Response(JSON.stringify({ error: 'hospital_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
 
    const hospitalRes = await fetch(`${SUPABASE_URL}/rest/v1/hospitales?id=eq.${hospital_id}&select=*`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    });
    const hospitales = await hospitalRes.json();
    const hospital = hospitales[0];
    if (!hospital) {
      return new Response(JSON.stringify({ error: 'Hospital no encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
 
    const planLabel: Record<string, string> = {
      basico: 'Básico', estandar: 'Estándar',
      hospital: 'Hospital', enterprise: 'Enterprise',
    };
 
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ÁSTOR by CRITIC SL <noreply@astormanager.com>',
        reply_to: 'info@gestorguardiasumi.com',
        to: [hospital.email_admin],
        subject: `Bienvenido a ÁSTOR — ${hospital.nombre}`,
        html: `
          <!DOCTYPE html>
          <html lang="es">
          <head><meta charset="UTF-8"></head>
          <body style="font-family:'Inter',sans-serif;background:#f9fafb;margin:0;padding:2rem;">
            <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
 
              <!-- Header -->
              <div style="background:#080c14;padding:2rem;text-align:center;">
                <div style="font-size:1.5rem;font-weight:800;color:white;letter-spacing:0.08em;">ÁSTOR</div>
                <div style="font-size:0.65rem;color:#4b5563;letter-spacing:0.2em;text-transform:uppercase;margin-top:4px;">by CRITIC SL — Servicios Médicos</div>
              </div>
 
              <!-- Body -->
              <div style="padding:2rem;">
                <h2 style="font-size:1.1rem;font-weight:700;color:#111827;margin:0 0 0.5rem;">Bienvenido a ÁSTOR</h2>
                <p style="font-size:0.875rem;color:#6b7280;line-height:1.7;margin:0 0 1.5rem;">
                  Tu centro <strong style="color:#111827;">${hospital.nombre}</strong> ha sido activado en la plataforma ÁSTOR.
                  Ya puedes acceder con tu cuenta de administrador.
                </p>
 
                <!-- Info box -->
                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:1.25rem;margin-bottom:1.5rem;">
                  <div style="font-size:0.7rem;font-weight:700;color:#9ca3af;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.875rem;">Datos de acceso</div>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr>
                      <td style="font-size:0.78rem;color:#6b7280;padding:0.3rem 0;width:40%;">URL de acceso</td>
                      <td style="font-size:0.78rem;font-weight:600;color:#111827;padding:0.3rem 0;">
                        <a href="https://app.astormanager.com/${hospital.slug}" style="color:#2563eb;">app.astormanager.com/${hospital.slug}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:0.78rem;color:#6b7280;padding:0.3rem 0;">Plan contratado</td>
                      <td style="font-size:0.78rem;font-weight:600;color:#111827;padding:0.3rem 0;">${planLabel[hospital.plan] || hospital.plan}</td>
                    </tr>
                    <tr>
                      <td style="font-size:0.78rem;color:#6b7280;padding:0.3rem 0;">Carros disponibles</td>
                      <td style="font-size:0.78rem;font-weight:600;color:#111827;padding:0.3rem 0;">${hospital.max_carros === 999 ? 'Ilimitados' : hospital.max_carros}</td>
                    </tr>
                    <tr>
                      <td style="font-size:0.78rem;color:#6b7280;padding:0.3rem 0;">Usuarios disponibles</td>
                      <td style="font-size:0.78rem;font-weight:600;color:#111827;padding:0.3rem 0;">${hospital.max_usuarios === 999 ? 'Ilimitados' : hospital.max_usuarios}</td>
                    </tr>
                  </table>
                </div>
 
                <!-- CTA -->
                <div style="text-align:center;margin-bottom:1.5rem;">
                  <a href="https://app.astormanager.com/${hospital.slug}"
                     style="display:inline-block;background:#2563eb;color:white;font-weight:700;font-size:0.85rem;padding:0.75rem 1.75rem;border-radius:7px;text-decoration:none;letter-spacing:0.03em;">
                    Acceder a ÁSTOR →
                  </a>
                </div>
 
                <p style="font-size:0.78rem;color:#9ca3af;line-height:1.7;margin:0;">
                  ¿Tienes alguna duda durante la configuración inicial? Escríbenos a
                  <a href="mailto:info@gestorguardiasumi.com" style="color:#2563eb;">info@gestorguardiasumi.com</a>
                  y te ayudamos.
                </p>
              </div>
 
              <!-- Footer -->
              <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:1.25rem 2rem;text-align:center;">
                <div style="font-size:0.65rem;color:#9ca3af;">
                  ÁSTOR · Desarrollado por CRITIC SL — Servicios Médicos<br>
                  <a href="https://www.astormanager.com" style="color:#9ca3af;">www.astormanager.com</a>
                </div>
              </div>
 
            </div>
          </body>
          </html>
        `,
      }),
    });
 
    const emailData = await emailRes.json();
    if (!emailRes.ok) throw new Error(`Error Resend: ${JSON.stringify(emailData)}`);
 
    // Registrar en log
    await fetch(`${SUPABASE_URL}/rest/v1/log_auditoria`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hospital_id,
        accion: 'email_bienvenida_enviado',
        tabla_afectada: 'hospitales',
        registro_id: hospital_id,
        detalle: { email: hospital.email_admin, resend_id: emailData.id },
        resultado: 'exito',
      }),
    });
 
    return new Response(JSON.stringify({ ok: true, email_id: emailData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
 
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
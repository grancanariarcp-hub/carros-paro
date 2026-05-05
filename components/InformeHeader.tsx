/**
 * Encabezado oficial reutilizable para todos los informes en PDF de ÁSTOR.
 *
 * Estructura (formato SCS / Comisiones de Canarias):
 *   ┌──────────┬──────────┬─────────────────────────────────────┐
 *   │ logo P   │ logo S   │ <unidad>                             │
 *   │  (25%)   │  (15%)   │ <comisión>                           │
 *   │          │          │ <TIPO DE DOCUMENTO>                  │
 *   │          │          │ ┌────────┬────────┬────────┐        │
 *   │          │          │ │ Código │ Fecha  │ Página │        │
 *   │          │          │ ├────────┼────────┼────────┤        │
 *   │          │          │ │ XXX-YY │ DD/MM  │ 1 de 1 │        │
 *   │          │          │ └────────┴────────┴────────┘        │
 *   └──────────┴──────────┴─────────────────────────────────────┘
 *
 * Datos:
 *   - hospital            → para el color primario
 *   - hospitalConfig      → unidad, comisión, URLs de logos
 *   - plantillaInforme    → opcional, override por tipo de informe
 *   - tipoDocumento       → ej. "CONTROL DE CARRO DE PARADA"
 *   - codigo              → ej. "INF-CTRL-2026-001" (de generar_codigo_informe)
 *   - fecha               → ISO o ya formateada
 *   - pagina              → ej. "1 de 1"
 */

interface Hospital {
  nombre: string
  color_primario?: string | null
  logo_url?: string | null
}

interface HospitalConfig {
  informe_unidad?: string | null
  informe_comision?: string | null
  informe_logo_principal_url?: string | null
  informe_logo_secundario_url?: string | null
}

interface PlantillaInforme {
  titulo_personalizado?: string | null
  membrete_linea1?: string | null
  membrete_linea2?: string | null
  pie_pagina?: string | null
}

interface Props {
  hospital: Hospital
  hospitalConfig: HospitalConfig | null
  plantillaInforme?: PlantillaInforme | null
  tipoDocumento: string
  codigo: string
  fecha: string                  // ya formateada (DD/MM/YYYY)
  pagina?: string                 // por defecto "1 de 1"
}

function formatFechaSiNecesario(s: string): string {
  // Si ya viene como DD/MM/YYYY, devolver tal cual.
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  // Si es ISO, formatear.
  try {
    return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return s
  }
}

export default function InformeHeader({
  hospital,
  hospitalConfig,
  plantillaInforme,
  tipoDocumento,
  codigo,
  fecha,
  pagina = '1 de 1',
}: Props) {
  const colorPrimario = hospital.color_primario || '#1d4ed8'

  // Línea 1 del membrete: prioriza override por tipo de informe; si no, usa
  // el config del hospital; si no, "Hospital".
  const linea1 = (plantillaInforme?.membrete_linea1?.trim() || hospitalConfig?.informe_unidad?.trim() || hospital.nombre || '').toUpperCase()
  const linea2 = (plantillaInforme?.membrete_linea2?.trim() || hospitalConfig?.informe_comision?.trim() || '').toUpperCase()

  const titulo = (plantillaInforme?.titulo_personalizado?.trim() || tipoDocumento).toUpperCase()

  const logoPrincipal = hospitalConfig?.informe_logo_principal_url
  const logoSecundario = hospitalConfig?.informe_logo_secundario_url

  // Si NO hay logos configurados, todo el ancho disponible va al texto.
  const hayLogoPrincipal = !!logoPrincipal
  const hayLogoSecundario = !!logoSecundario
  const widthPrincipal = hayLogoPrincipal ? '20%' : '0'
  const widthSecundario = hayLogoSecundario ? '15%' : '0'
  const widthTexto = `${100 - (hayLogoPrincipal ? 20 : 0) - (hayLogoSecundario ? 15 : 0)}%`

  return (
    <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      border: '1px solid #ccc',
      marginBottom: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <tbody>
        <tr>
          {hayLogoPrincipal && (
            <td style={{
              width: widthPrincipal,
              padding: '8px',
              border: '1px solid #ccc',
              verticalAlign: 'middle',
              textAlign: 'center',
            }}>
              <img
                src={logoPrincipal!}
                alt="Logo principal"
                crossOrigin="anonymous"
                style={{ maxHeight: '70px', maxWidth: '100%', objectFit: 'contain' }}
              />
            </td>
          )}

          {hayLogoSecundario && (
            <td style={{
              width: widthSecundario,
              padding: '8px',
              border: '1px solid #ccc',
              verticalAlign: 'middle',
              textAlign: 'center',
            }}>
              <img
                src={logoSecundario!}
                alt="Logo secundario"
                crossOrigin="anonymous"
                style={{ maxHeight: '60px', maxWidth: '100%', objectFit: 'contain' }}
              />
            </td>
          )}

          <td style={{
            width: widthTexto,
            padding: '8px',
            border: '1px solid #ccc',
            verticalAlign: 'middle',
          }}>
            {linea1 && (
              <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '3px', lineHeight: 1.3 }}>
                {linea1}
              </div>
            )}
            {linea2 && (
              <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '6px', lineHeight: 1.3 }}>
                {linea2}
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '8px', color: colorPrimario, lineHeight: 1.3 }}>
              {titulo}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ccc' }}>
              <tbody>
                <tr style={{ background: '#dbeafe' }}>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 700, fontSize: '10px', width: '40%' }}>Código</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 700, fontSize: '10px', width: '35%' }}>Fecha</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 700, fontSize: '10px', width: '25%' }}>Página</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontSize: '10px', background: '#fef9c3', fontWeight: 600 }}>{codigo}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontSize: '10px' }}>{formatFechaSiNecesario(fecha)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontSize: '10px' }}>{pagina}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/**
 * Pie de página para PDFs. Recibe el texto desde plantillaInforme.pie_pagina
 * (override por tipo) o hospital_config si lo añadimos en el futuro.
 */
export function InformeFooter({ texto }: { texto?: string | null }) {
  if (!texto?.trim()) return null
  return (
    <div style={{
      marginTop: '20px',
      paddingTop: '8px',
      borderTop: '1px solid #d1d5db',
      fontSize: '9px',
      color: '#6b7280',
      textAlign: 'center',
    }}>
      {texto}
    </div>
  )
}

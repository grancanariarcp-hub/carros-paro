/**
 * Distintivo de versión, para mostrar junto al nombre de usuario.
 *
 * La versión sale de package.json vía next.config.js, así que lo que se ve es
 * exactamente la versión desplegada. Sirve para saber de un vistazo si un
 * usuario tiene la última: cuando alguien reporta un fallo ya corregido, casi
 * siempre es que su navegador sirve una versión cacheada.
 *
 * Se usa `tono="oscuro"` en superadmin, cuya barra superior es oscura.
 */
export default function VersionApp({ tono = 'claro' }: { tono?: 'claro' | 'oscuro' }) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION
  if (!version) return null

  return (
    <span
      className={`version-badge${tono === 'oscuro' ? ' version-badge-oscuro' : ''}`}
      title={`ÁSTOR versión ${version}`}
    >
      V {version}
    </span>
  )
}

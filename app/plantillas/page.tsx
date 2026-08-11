'use client'
// Las dos rutas de plantillas —esta y su gemela— existen porque cada rol entra
// por un sitio distinto. Lo que no tenia sentido era mantener el MISMO codigo
// duplicado byte a byte en las dos: cada cambio habia que hacerlo dos veces y
// acabarian divergiendo sin que nadie lo notase. La pantalla vive ahora en
// components/plantillas/ y aqui solo queda la ruta.
import GestionPlantillas from '@/components/plantillas/GestionPlantillas'

export default function Pagina() {
  return <GestionPlantillas />
}

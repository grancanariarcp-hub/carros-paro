export type Rol = 'administrador' | 'supervisor' | 'auditor'
export type EstadoCarro = 'operativo' | 'condicional' | 'no_operativo' | 'sin_control'
export type TipoControl = 'mensual' | 'semanal' | 'post_uso' | 'extra'
export type ResultadoInspeccion = 'operativo' | 'condicional' | 'no_operativo'
export type TipoFalla = 'menor' | 'grave' | 'ninguno'

export interface Perfil {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  creado_en: string
  aprobado_por?: string
}

export interface Servicio {
  id: string
  nombre: string
  activo: boolean
}

export interface Carro {
  id: string
  codigo: string
  nombre: string
  ubicacion?: string
  servicio_id?: string
  responsable?: string
  frecuencia_control: 'semanal' | 'quincenal' | 'mensual'
  proximo_control?: string
  ultimo_control?: string
  ultimo_tipo_control?: string
  estado: EstadoCarro
  activo: boolean
  creado_en: string
  servicios?: Servicio
}

export interface Cajon {
  id: string
  carro_id: string
  nombre: string
  orden: number
  materiales?: Material[]
}

export interface Material {
  id: string
  cajon_id: string
  nombre: string
  cantidad_requerida: number
  tipo_falla: TipoFalla
  activo: boolean
  orden: number
}

export interface Desfibrilador {
  id: string
  carro_id: string
  numero_censo?: string
  modelo?: string
  fecha_mantenimiento?: string
  activo: boolean
}

export interface Inspeccion {
  id: string
  carro_id: string
  tipo: TipoControl
  resultado?: ResultadoInspeccion
  auditor_id: string
  fecha: string
  observaciones?: string
  numero_censo_desf?: string
  modelo_desf?: string
  fecha_mantenimiento_desf?: string
  alerta_enviada: boolean
  perfiles?: Perfil
  carros?: Carro
}

export interface ItemInspeccion {
  id: string
  inspeccion_id: string
  material_id: string
  cantidad_ok: boolean
  estado_ok: boolean
  tiene_falla: boolean
  tipo_falla?: 'menor' | 'grave'
  descripcion_falla?: string
  foto_url?: string
  fecha_vencimiento?: string
  materiales?: Material
}

export interface Alerta {
  id: string
  carro_id: string
  tipo: string
  mensaje?: string
  resuelta: boolean
  creada_en: string
}

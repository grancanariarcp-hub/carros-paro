export type Rol = 'superadmin' | 'administrador' | 'calidad' | 'supervisor' | 'auditor' | 'tecnico' | 'readonly'
export type EstadoCarro = 'operativo' | 'condicional' | 'no_operativo' | 'sin_control'
export type TipoControl = 'mensual' | 'semanal' | 'quincenal' | 'post_uso' | 'extra'
export type ResultadoInspeccion = 'operativo' | 'condicional' | 'no_operativo'
export type TipoFalla = 'menor' | 'grave' | 'ninguno'
export type TipoCarro = 'parada' | 'via_aerea' | 'trauma' | 'neonatal' | 'otro'

export interface Perfil {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  hospital_id?: string
  servicio_id?: string        // añadido: asignación de supervisor a servicio
  recibir_alertas?: boolean
  email_alertas?: string
  creado_en: string
  aprobado_por?: string
}

export interface Hospital {
  id: string
  slug: string
  nombre: string
  logo_url?: string
  color_primario: string
  plan: string
  max_carros: number
  max_usuarios: number
  activo: boolean
  email_admin?: string
  telefono?: string
  pais?: string
  creado_en: string
  activado_en?: string
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
  operativo?: boolean
  tipo_carro?: TipoCarro
  hospital_id?: string
  numero_censo?: string
  codigo_barras_censo?: string
  marca_desfibrilador?: string
  modelo_desfibrilador?: string
  numero_serie_desfibrilador?: string
  fecha_ultimo_mantenimiento?: string
  fecha_proximo_mantenimiento?: string
  creado_en: string
  creado_por?: string
  servicios?: Servicio
}

export interface Cajon {
  id: string
  carro_id: string
  nombre: string
  orden: number
  activo: boolean
  materiales?: Material[]
}

export interface Material {
  id: string
  cajon_id: string
  nombre: string
  cantidad_requerida: number
  tipo_falla?: TipoFalla
  activo: boolean
  orden: number
  tiene_vencimiento?: boolean
  fecha_vencimiento?: string
  es_equipo?: boolean
  numero_serie?: string
  marca?: string
  modelo?: string
  codigo_barras?: string
  fecha_ultimo_mantenimiento?: string
  fecha_proximo_mantenimiento?: string
}

export interface Desfibrilador {
  id: string
  carro_id: string
  numero_censo?: string
  modelo?: string
  marca?: string
  fecha_mantenimiento?: string
  fecha_ultimo_mantenimiento?: string
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
  alerta_enviada?: boolean
  precinto_retirado?: string
  precinto_colocado?: string
  foto_precinto_retirado?: string
  foto_precinto_colocado?: string
  // Campos de firma digital
  firma_url?: string
  firmante_nombre?: string
  firmante_cargo?: string
  firmado_en?: string
  firmante_usuario_id?: string
  // Relaciones
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
  creado_en: string
  carros?: Carro
}

export interface Notificacion {
  id: string
  hospital_id: string
  usuario_id?: string
  tipo: string
  titulo: string
  mensaje?: string
  leida: boolean
  accion_url?: string
  creado_en: string
}

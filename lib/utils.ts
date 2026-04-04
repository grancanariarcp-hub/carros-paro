import { differenceInDays, parseISO, format, addMonths, addWeeks } from 'date-fns'
import { es } from 'date-fns/locale'

export function colorVencimiento(fecha?: string): 'verde' | 'amarillo' | 'rojo' | null {
  if (!fecha) return null
  const dias = differenceInDays(parseISO(fecha), new Date())
  if (dias < 7) return 'rojo'
  if (dias < 30) return 'amarillo'
  return 'verde'
}

export function classBadgeVto(fecha?: string): string {
  const c = colorVencimiento(fecha)
  if (c === 'rojo') return 'bg-red-100 text-red-800 border border-red-200'
  if (c === 'amarillo') return 'bg-amber-100 text-amber-800 border border-amber-200'
  if (c === 'verde') return 'bg-green-100 text-green-800 border border-green-200'
  return 'bg-gray-100 text-gray-600'
}

export function formatFecha(fecha?: string): string {
  if (!fecha) return '—'
  try { return format(parseISO(fecha), 'dd/MM/yyyy', { locale: es }) }
  catch { return '—' }
}

export function formatFechaHora(fecha?: string): string {
  if (!fecha) return '—'
  try { return format(parseISO(fecha), "dd/MM/yyyy HH:mm", { locale: es }) }
  catch { return '—' }
}

export function proximoControl(tipo: string, desde?: Date): string {
  const base = desde || new Date()
  if (tipo === 'mensual') return addMonths(base, 1).toISOString().split('T')[0]
  if (tipo === 'semanal') return addWeeks(base, 1).toISOString().split('T')[0]
  if (tipo === 'quincenal') return addWeeks(base, 2).toISOString().split('T')[0]
  return base.toISOString().split('T')[0]
}

export function estadoColor(estado?: string) {
  switch (estado) {
    case 'operativo': return { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500', label: 'Operativo' }
    case 'condicional': return { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', label: 'Condicional' }
    case 'no_operativo': return { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500', label: 'No operativo' }
    default: return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', label: 'Sin control' }
  }
}

export function rolLabel(rol?: string) {
  switch (rol) {
    case 'administrador': return { label: 'Administrador', bg: 'bg-purple-100', text: 'text-purple-800' }
    case 'supervisor': return { label: 'Supervisor', bg: 'bg-teal-100', text: 'text-teal-800' }
    case 'auditor': return { label: 'Auditor', bg: 'bg-blue-100', text: 'text-blue-800' }
    default: return { label: rol || '—', bg: 'bg-gray-100', text: 'text-gray-600' }
  }
}

export function diasHastaControl(fecha?: string): number | null {
  if (!fecha) return null
  return differenceInDays(parseISO(fecha), new Date())
}

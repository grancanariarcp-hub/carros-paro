/**
 * Lógica pura de fechas y estados de control.
 *
 * No toca la base de datos, así que corre en milisegundos. Cubre cálculos de
 * los que depende que un carro se revise a tiempo: si `proximoControl` se
 * equivoca, un carro se queda sin control y nadie se entera hasta que hace
 * falta usarlo.
 */

import { describe, it, expect } from 'vitest'
import {
  proximoControl,
  colorVencimiento,
  diasHastaControl,
  formatFecha,
  formatFechaHora,
  estadoColor,
} from '../lib/utils'

describe('proximoControl — cuándo toca el siguiente', () => {
  // Fechas explícitas y no "hoy": un test que depende del día en que se
  // ejecuta falla solo, y siempre en el peor momento.
  const base = new Date('2026-03-15T10:00:00')

  it('mensual suma un mes', () => {
    expect(proximoControl('mensual', base)).toBe('2026-04-15')
  })

  it('semanal suma siete días', () => {
    expect(proximoControl('semanal', base)).toBe('2026-03-22')
  })

  it('quincenal suma dos semanas', () => {
    expect(proximoControl('quincenal', base)).toBe('2026-03-29')
  })

  it('un tipo desconocido no adelanta la fecha', () => {
    // Vale más dejarla como está que inventarse un plazo: así se nota.
    expect(proximoControl('post_uso', base)).toBe('2026-03-15')
    expect(proximoControl('vaya-usted-a-saber', base)).toBe('2026-03-15')
  })

  it('mensual desde un 31 cae en un mes más corto sin desbordar', () => {
    // El 31 de enero + 1 mes no existe en febrero. date-fns lo lleva al 28,
    // que es lo razonable; lo que no puede es saltar a marzo.
    const enero31 = new Date('2026-01-31T10:00:00')
    expect(proximoControl('mensual', enero31)).toBe('2026-02-28')
  })

  it('cruza el cambio de año', () => {
    const dic = new Date('2026-12-20T10:00:00')
    expect(proximoControl('mensual', dic)).toBe('2027-01-20')
  })
})

describe('proximoControl — zona horaria', () => {
  it('a primera hora de la mañana no retrocede un día', () => {
    // La función convierte a UTC con toISOString(). En Canarias (UTC+1 en
    // verano) las 00:30 locales son las 23:30 UTC del día ANTERIOR, así que un
    // control guardado de madrugada podía programarse un día antes de lo
    // debido. Un día de menos no es grave, pero es una incoherencia que
    // aparecería como un carro "vencido" antes de tiempo.
    const madrugada = new Date('2026-06-10T00:30:00')
    const resultado = proximoControl('mensual', madrugada)

    // Lo que importa: el día del mes debe coincidir con el de partida.
    expect(resultado.slice(-2)).toBe('10')
  })
})

describe('colorVencimiento — semáforo de caducidades', () => {
  function enDias(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return d.toISOString()
  }

  it('rojo cuando caduca en menos de 7 días', () => {
    expect(colorVencimiento(enDias(3))).toBe('rojo')
  })

  it('rojo cuando ya caducó', () => {
    expect(colorVencimiento(enDias(-5))).toBe('rojo')
  })

  it('amarillo entre 7 y 30 días', () => {
    expect(colorVencimiento(enDias(20))).toBe('amarillo')
  })

  it('verde a más de 30 días', () => {
    expect(colorVencimiento(enDias(60))).toBe('verde')
  })

  it('sin fecha no pinta nada', () => {
    expect(colorVencimiento(undefined)).toBeNull()
  })
})

describe('diasHastaControl', () => {
  it('devuelve negativo si el control está vencido', () => {
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 3)
    expect(diasHastaControl(ayer.toISOString())).toBeLessThan(0)
  })

  it('devuelve null sin fecha', () => {
    expect(diasHastaControl(undefined)).toBeNull()
  })
})

describe('formato de fechas — no debe romper la pantalla', () => {
  it('una fecha inválida devuelve guion en vez de reventar', () => {
    // Estas funciones se llaman dentro del render. Si lanzan, la pantalla
    // entera se queda en blanco por un dato mal guardado.
    expect(formatFecha('no-es-una-fecha')).toBe('—')
    expect(formatFechaHora('tampoco')).toBe('—')
  })

  it('sin fecha devuelve guion', () => {
    expect(formatFecha(undefined)).toBe('—')
    expect(formatFechaHora(undefined)).toBe('—')
  })

  it('formatea en el orden español', () => {
    expect(formatFecha('2026-03-15')).toBe('15/03/2026')
  })
})

describe('estadoColor — etiquetas de estado', () => {
  it('cubre los tres estados reales', () => {
    expect(estadoColor('operativo').label).toBe('Operativo')
    expect(estadoColor('condicional').label).toBe('Condicional')
    expect(estadoColor('no_operativo').label).toBe('No operativo')
  })

  it('un carro sin control no se muestra como operativo', () => {
    // Importa el matiz: por defecto NO puede parecer que está bien.
    expect(estadoColor(undefined).label).toBe('Sin control')
    expect(estadoColor(undefined).dot).not.toContain('green')
  })
})

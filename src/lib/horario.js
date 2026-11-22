const aMin = (t) => { const [h, m] = String(t || '0:0').split(':'); return (+h || 0) * 60 + (+m || 0) }

export const aInputLocal = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 16)
}

const hayHorario = (ap, ci) => Boolean(ap && ci) && aMin(ap) !== aMin(ci)

/* Minutos que dura abierto el lugar (soporta cierre después de medianoche) */
const duracionAbierto = (ap, ci) => {
  let d = aMin(ci) - aMin(ap)
  if (d <= 0) d += 1440
  return d
}

/* ¿La reserva cabe completa dentro de una ventana de apertura? */
function dentroDeHorario(ini, fin, ap, ci) {
  const dur = duracionAbierto(ap, ci)
  for (const off of [-1, 0]) {
    const d = new Date(ini)
    d.setDate(d.getDate() + off)
    d.setHours(0, 0, 0, 0)
    d.setMinutes(aMin(ap))
    const abre = d
    const cierra = new Date(abre.getTime() + dur * 60000)
    if (ini >= abre && fin <= cierra) return true
  }
  return false
}

/* Devuelve { ini, fin, error }. tipo: 'hora' | 'dia' */
export function calcularRango({ tipo, horas, entrada, fechaDia, apertura, cierre }) {
  const ahora = new Date()
  const limitado = hayHorario(apertura, cierre)
  const horario = `${apertura} – ${cierre}`
  let ini, fin

  if (tipo === 'dia') {
    if (!fechaDia) return { error: 'Elige el día.' }
    const [y, m, d] = fechaDia.split('-').map(Number)
    ini = new Date(y, m - 1, d, 0, 0, 0, 0)
    if (limitado) {
      ini.setMinutes(aMin(apertura))
      fin = new Date(ini.getTime() + duracionAbierto(apertura, cierre) * 60000)
    } else {
      if (ini < ahora && ini.toDateString() === ahora.toDateString()) ini = new Date(ahora)
      fin = new Date(ini.getTime() + 24 * 3600000)
    }
    if (ini < ahora) return { error: `Ese día ya abrió (${horario}). Elige otro día o una tarifa por horas.` }
    return { ini, fin }
  }

  ini = new Date(entrada)
  if (isNaN(ini)) return { error: 'Elige la hora de entrada.' }
  fin = new Date(ini.getTime() + horas * 3600000)
  if (ini < new Date(ahora.getTime() - 60000)) return { error: 'La hora de entrada ya pasó.' }
  if (limitado && !dentroDeHorario(ini, fin, apertura, cierre))
    return { error: `Fuera del horario del lugar (${horario}). La entrada y la salida deben caer dentro de ese horario.` }
  return { ini, fin }
}

/* Primera entrada válida a partir de ahora (redondeada a 5 min) */
export function primeraEntrada(apertura, cierre, horas = 1) {
  const ahora = new Date()
  ahora.setSeconds(0, 0)
  ahora.setMinutes(Math.ceil(ahora.getMinutes() / 5) * 5)
  const prueba = (e) => !calcularRango({ tipo: 'hora', horas, entrada: aInputLocal(e), apertura, cierre }).error
  if (!hayHorario(apertura, cierre) || prueba(ahora)) return ahora
  for (let off = 0; off <= 2; off++) {
    const d = new Date()
    d.setDate(d.getDate() + off)
    d.setHours(0, 0, 0, 0)
    d.setMinutes(aMin(apertura))
    if (d >= new Date() && prueba(d)) return d
  }
  return ahora
}
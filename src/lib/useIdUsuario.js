// Resuelve el idusuario REAL de la cuenta en sesión a partir del correo verificado en `credenciales`.
// Nunca adivina: si no puede identificar la cuenta, devuelve null.
import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useApp } from '../context/AppContext.jsx'

const CACHE = 'ubipark_idusuario'

// escapa % y _ para que ilike compare el texto literal (los correos suelen llevar "_")
const literal = (s) => String(s).trim().replace(/[%_\\]/g, (m) => '\\' + m)

// si una consulta tarda más de `ms`, falla en vez de quedarse colgada
const conLimite = (promesa, ms = 8000) => {
  let t
  const limite = new Promise((_, rechazar) => {
    t = setTimeout(() => rechazar(new Error('Tiempo agotado consultando Supabase')), ms)
  })
  return Promise.race([Promise.resolve(promesa), limite]).finally(() => clearTimeout(t))
}

// el id guardado solo sirve para el MISMO correo, así que nunca se mezcla entre cuentas
const leerCache = (clave) => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null')
    return c && c.clave === String(clave).toLowerCase() ? c.id : null
  } catch { return null }
}
const guardarCache = (clave, id) => {
  try { localStorage.setItem(CACHE, JSON.stringify({ clave: String(clave).toLowerCase(), id })) } catch { /* nada */ }
}

export function useIdUsuario() {
  const { ses } = useApp()
  const clave = [ses?.correo, ses?.email, ses?.usuario].find(Boolean) || null
  const idExplicito = ses?.idusuario || null
  const hayCuenta = !!ses

  const [idUsuario, setIdUsuario] = useState(null)
  const [buscando, setBuscando] = useState(true)

  useEffect(() => {
    if (!hayCuenta) { setIdUsuario(null); setBuscando(false); return }
    let vivo = true

    // 1) Carga instantánea si ya conocemos el id de ESTE correo
    const enCache = clave ? leerCache(clave) : null
    if (enCache) { setIdUsuario(enCache); setBuscando(false) }
    else { setIdUsuario(null); setBuscando(true) }

    // 2) Verificación real contra Supabase
    ;(async () => {
      let id = null
      try {
        if (clave) {
          const k = literal(clave)
          const buscar = async (col) => {
            const { data, error } = await conLimite(
              supabase.from('credenciales').select('idcredencial').ilike(col, k).limit(2)
            )
            if (error) throw error
            return data?.length === 1 ? data[0] : null
          }
          const cred = (await buscar('correo')) || (await buscar('usuario'))
          if (cred) {
            const { data: u, error } = await conLimite(
              supabase.from('usuarios').select('idusuario').eq('idcredencial', cred.idcredencial).maybeSingle()
            )
            if (error) throw error
            id = u?.idusuario ?? null
          }
          if (id) guardarCache(clave, id)
        } else if (idExplicito) {
          id = idExplicito
        }
      } catch (e) {
        console.error('[UbiPark] no se pudo resolver el idusuario', e)
        id = enCache || null   // si falla la red, usa el id ya conocido de este mismo correo
      }
      console.info('[UbiPark] idusuario', { sesion: clave, idusuario: id })
      if (vivo) { setIdUsuario(id); setBuscando(false) }
    })()

    return () => { vivo = false }
  }, [hayCuenta, clave, idExplicito])

  return { idUsuario, buscando, clave }
}

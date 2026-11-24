
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'

import { useNavigate } from 'react-router-dom'
import { DB } from '../lib/db.js'

const Ctx = createContext(null)

export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const navigate = useNavigate()

  const [ses, setSes] = useState(() => DB.get('ses', null))
  const [msg, setMsg] = useState('')
  const timer = useRef(null)

  // NOTIFICACIONES
  const toast = useCallback((m) => {
    setMsg(m)
    clearTimeout(timer.current)

    timer.current = setTimeout(() => {
      setMsg('')
    }, 2600)
  }, [])

  useEffect(() => {
    return () => clearTimeout(timer.current)
  }, [])

  // INICIAR SESIÓN
  const login = (u, role) => {
    const correo = String(
      u.correo || u.email || u.usuario || ''
    ).trim().toLowerCase() || null

    const s = {
      ...u,
      id: u.id,
      idusuario: u.idusuario ?? null,
      nombre: u.nombre,
      tel: u.tel,
      correo,
      role
    }

    DB.set('ses', s)
    setSes(s)

    // Recuperar destino guardado
    const next = sessionStorage.getItem('gp_next')

    // Limpiar destino
    sessionStorage.removeItem('gp_next')

    // REDIRECCIÓN
    if (next) {
      navigate(next, { replace: true })
    } else if (role === 'administrador') {
      navigate('/administrador', { replace: true })
    } else if (role === 'propietario') {
      navigate('/propietario', { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }

  // CERRAR SESIÓN
  const salir = () => {
    DB.remove('ses')
    setSes(null)

    sessionStorage.removeItem('gp_next')

    navigate('/', { replace: true })
  }

  // NAVEGACIÓN SEGÚN EL ROL
  const entrar = (r) => {
    if (ses && ses.role === r) {
      if (r === 'administrador') {
        navigate('/administrador')
      } else if (r === 'propietario') {
        navigate('/propietario')
      } else {
        navigate('/')
      }

      return
    }

    navigate('/acceso?rol=' + r)
  }

  return (
    <Ctx.Provider
      value={{
        ses,
        user: ses,
        login,
        salir,
        entrar,
        toast,
        msg
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

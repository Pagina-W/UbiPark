import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useIdUsuario } from '../lib/useIdUsuario.js'
import { SelectorUbicacion } from '../components/MapaGoogle.jsx'
import PanelPropietario from './propietarioreservas.jsx'
import {
  crearEstacionamiento,
  obtenerEstacionamientosPorPropietario,
  obtenerUbicacion,
  actualizarDatosEstacionamiento,
} from '../services/estacionamientoService.js'
import { supabase } from '../lib/supabase.js'

const TIPOS_BASE = ['Moto', 'Sedán', 'SUV', 'Camioneta']

const vacio = {
  nom: '', est: 'San Luis Potosi', mun: '', loc: '', dir: '', lat: '', lng: '', pph: '', cap: '',
  horaapertura: '08:00', horacierre: '20:00',
  L: '', A: '', H: '', tipos: [], otros: '', extra: '', reg: '',
}

const txt = (v) => (v === null || v === undefined ? '' : String(v))

// si una consulta tarda más de `ms`, falla en vez de quedarse colgada
const conLimite = (promesa, ms = 10000) => {
  let t
  const limite = new Promise((_, rechazar) => {
    t = setTimeout(() => rechazar(new Error('Tiempo agotado consultando tus estacionamientos')), ms)
  })
  return Promise.race([Promise.resolve(promesa), limite]).finally(() => clearTimeout(t))
}

const desdeLugar = (l, u) => ({
  nom: txt(l.nombreestacionamiento),
  est: u?.estado || '',
  mun: u?.municipio || '',
  loc: u?.localidad || '',
  dir: txt(l.direcciontexto),
  lat: txt(l.latitud),
  lng: txt(l.longitud),
  pph: txt(l.precioporhora),
  cap: txt(l.capacidadtotal),
  horaapertura: txt(l.horaapertura || '08:00').slice(0, 5),
  horacierre: txt(l.horacierre || '20:00').slice(0, 5),
  L: txt(l.largo_max),
  A: txt(l.ancho_max),
  H: txt(l.altura_max),
  tipos: txt(l.vehiculospermitidos).split(',').map((s) => s.trim()).filter(Boolean),
  otros: '',
  extra: txt(l.caracteristicas),
  reg: txt(l.reglamento),
})

const foto = (f) => new Promise((resolve) => {
  const i = new Image(), fr = new FileReader()
  fr.onload = () => {
    i.onload = () => {
      const c = document.createElement('canvas'), k = Math.min(1, 800 / i.width)
      c.width = i.width * k
      c.height = i.height * k
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.7))
    }
    i.src = fr.result
  }
  fr.readAsDataURL(f)
})

function FormularioPublicar({ idusuario, onPublicado, toast, existente }) {
  const editando = !!existente
  const [f, setF] = useState(vacio)
  const [archivos, setArchivos] = useState([])
  const [formKey, setFormKey] = useState(0)
  const [opcionesTipos, setOpcionesTipos] = useState(TIPOS_BASE)
  const [publicando, setPublicando] = useState(false)
  const [cargandoDatos, setCargandoDatos] = useState(editando)
  const enCurso = useRef(false)

  useEffect(() => {
    supabase.from('tipovehiculo').select('nombretipo').order('nombretipo').then(({ data }) => {
      if (data?.length) setOpcionesTipos(data.map((t) => t.nombretipo))
    })
  }, [])

  useEffect(() => {
    if (!existente) return
    let vivo = true
    setCargandoDatos(true)
    ;(async () => {
      let u = null
      try { u = await conLimite(obtenerUbicacion(existente.idlocalidad)) } catch (e) { console.warn(e) }
      if (!vivo) return
      setF(desdeLugar(existente, u))
      setArchivos([])
      setFormKey((k) => k + 1)
      setCargandoDatos(false)
    })()
    return () => { vivo = false }
  }, [existente?.idestacionamiento])

  const opcionesVisibles = [...new Set([...opcionesTipos, ...f.tipos])]

  const alternarTipo = (t) =>
    setF((p) => ({ ...p, tipos: p.tipos.includes(t) ? p.tipos.filter((x) => x !== t) : [...p.tipos, t] }))

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const coords = (lat, lng) => setF((p) => ({ ...p, lat: String(lat), lng: String(lng) }))

  const miUbic = () => {
    if (!navigator.geolocation) return toast('Tu navegador no soporta geolocalización.')
    toast('Solicitando ubicación a tu dispositivo...')
    navigator.geolocation.getCurrentPosition(
      (p) => { coords(p.coords.latitude.toFixed(6), p.coords.longitude.toFixed(6)); toast('¡Ubicación obtenida!') },
      (err) => {
        if (err.code === 1) toast('Permiso denegado. Usa el candado junto a la URL para permitir la ubicación.')
        else if (err.code === 2) toast('Ubicación no disponible. Activa el GPS.')
        else if (err.code === 3) toast('Tiempo agotado al consultar el GPS. Intenta de nuevo.')
        else toast('No se pudo obtener la ubicación.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const publicar = async (e) => {
    e.preventDefault()
    if (enCurso.current) return
    if (!idusuario) return toast('Error de usuario: vuelve a iniciar sesión.')
    const otros = f.otros.split(',').map((s) => s.trim()).filter(Boolean)
    const tiposFinal = [...new Set([...f.tipos, ...otros])]
    if (!tiposFinal.length) return toast('Elige al menos un tipo de vehículo.')

    enCurso.current = true
    setPublicando(true)
    try {
      const fotos = await Promise.all(archivos.slice(0, 3).map(foto))
      const datos = {
        nombre: f.nom,
        idusuario,
        estado: f.est,
        municipio: f.mun,
        localidad: f.loc,
        direccion: f.dir,
        latitud: +f.lat || null,
        longitud: +f.lng || null,
        precioporhora: +f.pph,
        capacidadtotal: +f.cap,
        horaapertura: f.horaapertura,
        horacierre: f.horacierre,
        tipos: tiposFinal,
        caracteristicas: f.extra,
        reglamento: f.reg,
        largo_max: +f.L || null,
        ancho_max: +f.A || null,
        altura_max: +f.H || null,
        imagen: fotos[0] || null,
      }

      if (editando) {
        await actualizarDatosEstacionamiento(existente.idestacionamiento, datos)
        setArchivos([])
        toast('¡Datos actualizados!')
      } else {
        await crearEstacionamiento(datos)
        setF(vacio); setArchivos([]); setFormKey((k) => k + 1)
        toast('¡Estacionamiento publicado con éxito!')
      }
      await onPublicado?.()
    } catch (err) {
      toast(err.message)
    } finally {
      enCurso.current = false
      setPublicando(false)
    }
  }

  const lat = parseFloat(f.lat), lng = parseFloat(f.lng)
  const consulta = [f.dir, f.loc, f.mun, f.est].filter(Boolean).join(', ')

  if (cargandoDatos) return <div className="box"><p>Cargando datos de tu estacionamiento…</p></div>

  return (
    <div className="box">
      <h3>{editando ? 'Actualizar datos del estacionamiento' : 'Publicar estacionamiento'}</h3>
      <form key={formKey} onSubmit={publicar}>
        <label>Nombre del estacionamiento</label>
        <input required placeholder="Ej. Garage Privado Centro" value={f.nom} onChange={set('nom')} />
        <div className="g3">
          <div><label>Estado</label><input required={!editando} value={f.est} onChange={set('est')} /></div>
          <div><label>Municipio</label><input required={!editando} value={f.mun} onChange={set('mun')} /></div>
          <div><label>Localidad</label><input required={!editando} value={f.loc} onChange={set('loc')} /></div>
        </div>
        <label>Dirección / referencias</label>
        <input required value={f.dir} onChange={set('dir')} />
        <div className="g2">
          <div><label>Latitud</label><input type="number" step="any" placeholder="21.1783" value={f.lat} onChange={set('lat')} /></div>
          <div><label>Longitud</label><input type="number" step="any" placeholder="-99.1989" value={f.lng} onChange={set('lng')} /></div>
        </div>
        <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={miUbic}>Usar ubicación actual</button>{' '}
        <SelectorUbicacion lat={lat} lng={lng} direccion={consulta} onChange={coords} onError={toast} />

        <div className="g2">
          <div><label>Precio/hora ($)</label><input type="number" required value={f.pph} onChange={set('pph')} /></div>
          <div><label>Capacidad total</label><input type="number" min="1" required value={f.cap} onChange={set('cap')} /></div>
        </div>
        <div className="g2">
          <div><label>Hora de apertura</label><input type="time" required value={f.horaapertura} onChange={set('horaapertura')} /></div>
          <div><label>Hora de cierre</label><input type="time" required value={f.horacierre} onChange={set('horacierre')} /></div>
        </div>
        <div className="g3">
          <div><label>Largo máx (m)</label><input type="number" step=".1" required={!editando} value={f.L} onChange={set('L')} /></div>
          <div><label>Ancho máx (m)</label><input type="number" step=".1" required={!editando} value={f.A} onChange={set('A')} /></div>
          <div><label>Altura máx (m)</label><input type="number" step=".1" required={!editando} value={f.H} onChange={set('H')} /></div>
        </div>
        <label>Vehículos permitidos</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', margin: '6px 0' }}>
          {opcionesVisibles.map((t) => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={f.tipos.includes(t)} onChange={() => alternarTipo(t)} />
              {t}
            </label>
          ))}
        </div>
        <input placeholder="Otros (separados por coma). Ej. Tractocamión, Bicicleta" value={f.otros} onChange={set('otros')} />
        <label>Características (separadas por coma)</label>
        <input placeholder="Techado, Con sombra, Cámaras, Portón eléctrico" value={f.extra} onChange={set('extra')} />
        <label>Reglamento</label>
        <textarea rows={2} placeholder="Ej. No dejar objetos de valor" value={f.reg} onChange={set('reg')} />
        <label>{editando ? 'Cambiar foto (opcional; si no subes nada se conserva la actual)' : 'Fotos del lugar (hasta 3)'}</label>
        <input type="file" accept="image/*" multiple onChange={(e) => setArchivos([...e.target.files])} />
        <button className="btn" style={{ width: '100%', marginTop: 16 }} disabled={publicando}>
          {publicando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Publicar'}
        </button>
      </form>
    </div>
  )
}

function ActualizarDatos({ idusuario, lugares, onListo, toast }) {
  const [sel, setSel] = useState(lugares[0]?.idestacionamiento)
  const actual = lugares.find((l) => l.idestacionamiento === sel) || lugares[0]
  if (!actual) return null
  return (
    <div>
      {lugares.length > 1 && (
        <div className="box" style={{ marginBottom: 12 }}>
          <label>¿Cuál estacionamiento quieres actualizar?</label>
          <select value={actual.idestacionamiento} onChange={(e) => setSel(Number(e.target.value))}>
            {lugares.map((l) => (
              <option key={l.idestacionamiento} value={l.idestacionamiento}>{l.nombreestacionamiento}</option>
            ))}
          </select>
        </div>
      )}
      <FormularioPublicar
        key={actual.idestacionamiento}
        idusuario={idusuario}
        existente={actual}
        onPublicado={onListo}
        toast={toast}
      />
    </div>
  )
}

export default function Propietario() {
  const { ses, entrar, toast, user } = useApp()
  const ok = ses && ses.role === 'propietario'
  const { idUsuario, buscando } = useIdUsuario()

  const [lugares, setLugares] = useState(null)
  const [errLugares, setErrLugares] = useState('')
  const peticion = useRef(0) // evita que una respuesta vieja pise a una nueva

  useEffect(() => {
    document.title = 'UbiPark | Panel del propietario'
    if (!ok) entrar('propietario')
  }, [ses])

  const cargar = async () => {
    if (!idUsuario) return
    const mia = ++peticion.current
    try {
      const L = await conLimite(obtenerEstacionamientosPorPropietario(idUsuario))
      if (mia !== peticion.current) return
      setErrLugares('')
      setLugares(Array.isArray(L) ? L : []) // null/undefined => lista vacía, nunca se queda en "Cargando"
    } catch (e) {
      if (mia !== peticion.current) return
      console.error('[UbiPark] cargar estacionamientos', e)
      setErrLugares(e?.message || 'Error desconocido')
    }
  }

  const reintentar = () => {
    setErrLugares('')
    setLugares(null)
    cargar()
  }

  useEffect(() => {
    setLugares(null)
    setErrLugares('')
    cargar()
    return () => { peticion.current++ } // invalida peticiones en vuelo al cambiar de usuario/desmontar
  }, [idUsuario])

  if (!ok) return null
  if (buscando) return <div className="wrap"><p>Cargando tu cuenta…</p></div>

  if (!idUsuario) {
    return (
      <div className="wrap" style={{ marginTop: 28 }}>
        <div className="box">
          <h3>No encontré tu cuenta de propietario</h3>
          <p>Cierra sesión y vuelve a entrar.</p>
        </div>
      </div>
    )
  }

  if (errLugares) {
    return (
      <div className="wrap" style={{ marginTop: 28 }}>
        <div className="box">
          <h3>No pude consultar tus estacionamientos</h3>
          <p>{errLugares}</p>
          <button className="btn sm" onClick={reintentar}>Reintentar</button>
        </div>
      </div>
    )
  }
  if (lugares === null) return <div className="wrap"><p>Cargando tu información…</p></div>

  if (lugares.length > 0) {
    return (
      <PanelPropietario
        key={idUsuario}
        idUsuario={idUsuario}
        renderPublicar={(onListo, lugaresPanel) => (
          <ActualizarDatos
            idusuario={idUsuario}
            lugares={lugaresPanel?.length ? lugaresPanel : lugares}
            onListo={onListo}
            toast={toast}
          />
        )}
      />
    )
  }

  return (
    <div className="view on">
      <div className="wrap">
        <div style={{ marginTop: 28, marginBottom: 16 }}>
          <h2 className="title" style={{ margin: 0 }}>
            Panel de {user?.nombre || ses?.nombre}
          </h2>
        </div>
        <div className="dash">
          <FormularioPublicar idusuario={idUsuario} onPublicado={cargar} toast={toast} />
          <div>
            <div className="box">
              <h3 style={{ margin: 0 }}>Mis estacionamientos</h3>
              <p className="sub" style={{ marginTop: 10 }}>Aún no publicas nada.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

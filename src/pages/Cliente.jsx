
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { avg, dist, stars } from '../lib/db.js'
import { useApp } from '../context/AppContext.jsx'
import { obtenerLugares } from '../services/lugarService.js'
import { supabase } from '../lib/supabase.js'
import ChatIA from '../components/ChatIA'

export default function Cliente() {
  const navigate = useNavigate()
  const { ses: user, toast } = useApp()

  const [pos, setPos] = useState(null)
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)

  // Estados de comentarios
  const [nuevasResenas, setNuevasResenas] = useState([])
  const [calificacion, setCalificacion] = useState(0)
  const [comentario, setComentario] = useState('')
  const [publicando, setPublicando] = useState(false)

  const track = useRef(null)
  const car = useRef(null)

  useEffect(() => {
    document.title = 'UbiPark | Panel de Cliente'
  }, [])

  // CARGAR LUGARES
  useEffect(() => {
    obtenerLugares()
      .then(setLista)
      .catch((e) => toast(e.message || 'No se pudieron cargar los lugares'))
      .finally(() => setCargando(false))
  }, [])

  // CARGAR COMENTARIOS
  const cargarComentarios = async () => {
    const { data, error } = await supabase
      .from('comentarios')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3)

    if (error) {
      console.error('Error al cargar comentarios:', error)
      return
    }

    const comentariosFormateados = (data || []).map((r) => ({
      id: r.idcoment,
      s: r['Calificación'],
      t: r.comentario,
      n: `Usuario #${r.idUsuarios}`,
      r: 'Cliente'
    }))

    setNuevasResenas(comentariosFormateados)
  }

  useEffect(() => {
    cargarComentarios()
  }, [])

  // ORDENAR LUGARES POR CERCANÍA
  let lugares = lista

  if (pos) {
    lugares = lugares
      .map((l) => ({
        ...l,
        d: l.lat
          ? dist(pos[0], pos[1], l.lat, l.lng)
          : 1e9
      }))
      .sort((a, b) => a.d - b.d)
  }

  // OBTENER UBICACIÓN
  const cerca = () => {
    if (!navigator.geolocation) {
      return toast('Tu navegador no permite ubicación')
    }

    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude])

        setTimeout(() => {
          car.current?.scrollIntoView({ behavior: 'smooth' })
        }, 0)
      },
      () => toast('No pudimos obtener tu ubicación')
    )
  }

  // MOVER CARRUSEL
  const sc = (d) =>
    track.current?.scrollBy({
      left: d * 320,
      behavior: 'smooth'
    })

  // PUBLICAR COMENTARIO
  const publicarResena = async () => {
    if (!user) {
      toast('Debes iniciar sesión para publicar')
      return
    }

    if (calificacion === 0) {
      alert('Selecciona una calificación.')
      return
    }

    if (!comentario.trim()) {
      alert('Escribe tu comentario.')
      return
    }

    setPublicando(true)

    try {
      const { error } = await supabase
        .from('comentarios')
        .insert({
          idUsuarios: user.id,
          'Calificación': calificacion,
          comentario: comentario.trim()
        })

      if (error) {
        console.error('Error al guardar comentario:', error)

        alert(
          'No se pudo publicar el comentario.\n' +
          error.message +
          '\nCódigo: ' + error.code
        )

        return
      }

      alert('¡Tu comentario se publicó correctamente!')

      setCalificacion(0)
      setComentario('')

      await cargarComentarios()

    } catch (error) {
      console.error('Error:', error)
      alert('Ocurrió un error al publicar tu comentario.')
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="view on">

      {/* SALUDO DEL CLIENTE */}
      <div className="hero" style={{ padding: '8px 0' }}>
        <div
          className="wrap"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
              ¡Hola, {user?.nombre || 'Cliente'}!
            </h2>

            <p style={{ margin: '2px 0 0', fontSize: '.9rem' }}>
              Explora las cocheras disponibles y reserva tu espacio.
            </p>
          </div>

          <button className="btn ghost sm" onClick={cerca}>
            Ver lugares cerca de mí
          </button>
        </div>
      </div>

      {/* CARRUSEL DE LUGARES */}
      <section className="blk">
        <div className="wrap">

          <div className="row">
            <div>
              <h2 className="title">
                {pos ? 'Cerca de ti' : 'Lugares destacados'}
              </h2>

              <p className="sub">
                Desliza o usa las flechas. Toca una tarjeta para ver toda la información.
              </p>
            </div>

            <div className="nav-c">
              <button onClick={() => sc(-1)}>⬅</button>
              <button onClick={() => sc(1)}>➡</button>
            </div>
          </div>

          {cargando && (
            <p className="sub">Cargando lugares...</p>
          )}

          {!cargando && lugares.length === 0 && (
            <p className="sub">
              Aún no hay estacionamientos registrados.
            </p>
          )}

          <div className="car" ref={car}>
            <div className="track" ref={track}>

              {lugares.map((l) => (
                <div
                  className="card"
                  key={l.id}
                  onClick={() => navigate('/lugar/' + l.id)}
                >
                  <div
                    className="ph"
                    style={
                      l.fotos?.[0]
                        ? { backgroundImage: `url(${l.fotos[0]})` }
                        : undefined
                    }
                  >
                    {l.fotos?.[0] ? '' : l.ico || '🅿️'}

                    <span className={'tag ' + (l.lleno ? 'full' : 'ok')}>
                      {l.lleno ? 'Lleno' : 'Disponible'}
                    </span>
                  </div>

                  <div className="cb">
                    <div className="stars">
                      {stars(avg(l.id))}
                    </div>

                    <h3>{l.nombre}</h3>

                    <small style={{ color: '#58708a' }}>
                      {l.dir || `${l.localidad || ''}, ${l.municipio || ''}`}
                      {l.d && l.d < 1e8
                        ? ' · ' + l.d.toFixed(1) + ' km'
                        : ''}
                    </small>

                    <div className="cf">
                      <div className="price">
                        ${l.pph}<small>/hora</small>
                      </div>

                      <div className="arrow">→</div>
                    </div>
                  </div>
                </div>
              ))}

            </div>
          </div>
        </div>
      </section>

      {/* CHAT CON IA */}
      <ChatIA />

      {/* COMENTARIOS DE CLIENTES */}
      <section className="blk">
        <div className="wrap">

          <h2 className="title">
            Lo que dicen los usuarios de{' '}
            <span style={{ color: 'black' }}>Ubi</span>
            <span style={{ color: '#0090E7' }}>Park</span>
            <MapPin size={38} strokeWidth={1.8} />.
          </h2>

          {/* COMENTARIOS PUBLICADOS */}
          <div className="revs">

            {nuevasResenas.map((r) => (
              <div className="rev" key={r.id}>

                <div className="stars">
                  {stars(Number(r.s))}
                </div>

                <p>"{r.t}"</p>

                <b>
                  — {r.n} ({r.r})
                </b>

              </div>
            ))}

            {nuevasResenas.length === 0 && (
              <p className="sub">
                ¡Sé el primero en compartir tu experiencia con UbiPark!
              </p>
            )}

          </div>

          {/* FORMULARIO DE COMENTARIOS */}
          <div className="form-resena">

            <h3>¡Déjanos tu opinión!</h3>

            <p>
              Hola, {user?.nombre || 'Cliente'}. ¿Cómo fue tu experiencia?
            </p>

            <label>Califica nuestro servicio</label>

            <div className="calificar">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={
                    n <= calificacion
                      ? 'estrella activa'
                      : 'estrella'
                  }
                  onClick={() => setCalificacion(n)}
                >
                  ★
                </button>
              ))}
            </div>

            <label htmlFor="comentario">
              Tu comentario
            </label>

            <textarea
              id="comentario"
              rows="4"
              placeholder="Escribe aquí tu experiencia..."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />

            <button
              className="btn"
              type="button"
              onClick={publicarResena}
              disabled={publicando}
            >
              {publicando
                ? 'Publicando...'
                : 'Publicar comentario'}
            </button>

          </div>
        </div>
      </section>

    </div>
  )
}

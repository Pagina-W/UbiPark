
import { useEffect, useState } from 'react'
import { MapPin, MessageCircle, Handshake } from 'lucide-react'
import { stars } from '../lib/db.js'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../context/AppContext.jsx'

export default function Inicio() {
  const { entrar, ses } = useApp()

  const [nuevasResenas, setNuevasResenas] = useState([])
  const [calificacion, setCalificacion] = useState(0)
  const [comentario, setComentario] = useState('')
  const [publicando, setPublicando] = useState(false)

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
    document.title = 'GoParking | Renta de estacionamientos locales'
    cargarComentarios()
  }, [])

  // IR AL INICIO DE SESIÓN Y REGRESAR A INICIO
  const irAcceso = () => {
    sessionStorage.setItem('gp_next', '/')
    entrar('cliente')
  }

  // PUBLICAR COMENTARIO
  const publicarResena = async () => {
    if (!ses) {
      irAcceso()
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
          idUsuarios: ses.id,
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

      {/* PORTADA */}
      <div className="hero">
        <div
          className="wrap"
          style={{
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              textAlign: 'center',
              maxWidth: '850px',
              margin: '0 auto'
            }}
          >
            <span className="pill">
              UBIPARK TU LUGAR SEGURO
            </span>

            <h1>
              Encuentra tu lugar y reserva en minutos
            </h1>

            <h3>
              Conoce el lugar, sus medidas y fotos.
              Habla directo con el dueño por WhatsApp.
              Sin pagos en la plataforma.
            </h3>

            <div style={{ marginTop: 22 }}></div>
          </div>
        </div>
      </div>

      {/* COMO FUNCIONA */}
      <section className="blk" style={{ background: '#e5e7eb' }}>
        <div className="wrap">

          <center>
            <h2 className="title">
              ¿Cómo funciona?
            </h2>
          </center>

          <p className="sub">
            Pasos sin complicaciones.
          </p>

          <div className="icono-paso">

            <div className="step">
              <MapPin size={38} strokeWidth={1.8} />
              <b>01</b>

              <h3>Elige un lugar</h3>

              <p>
                Revisa fotos, medidas y ubicación en el mapa.
              </p>
            </div>

            <div className="step">
              <MessageCircle size={38} strokeWidth={1.8} />
              <b>02</b>

              <h3>Escribe por WhatsApp</h3>

              <p>
                Acuerda con el dueño disponibilidad y forma de pago.
              </p>
            </div>

            <div className="step">
              <Handshake size={38} strokeWidth={1.8} />
              <b>03</b>

              <h3>Registra tu acuerdo</h3>

              <p>
                Efectivo o transferencia, tú decides la plataforma.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* COMENTARIOS */}
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

            {ses ? (
              <>
                <h3>¡Déjanos tu opinión!</h3>

                <p>
                  Hola, {ses.nombre}. ¿Cómo fue tu experiencia?
                </p>

                <label>
                  Califica nuestro servicio
                </label>

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
              </>
            ) : (
              <center>
                <h3>¿Ya utilizaste UbiPark?</h3>

                <p>
                  Inicia sesión para calificar y compartir tu experiencia.
                </p>

                <button
                  className="btn"
                  type="button"
                  onClick={irAcceso}
                >
                  Iniciar sesión
                </button>
              </center>
            )}

          </div>
        </div>
      </section>

    </div>
  )
}

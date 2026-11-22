  // DESTINO: src/components/ChatIA.jsx  (reemplaza el archivo completo)
// Mismo funcionamiento que antes (usa preguntarChat de iaService), con diseño oscuro.
// Uso: <ChatIA /> una sola vez en la vista de cliente.
// Cambia LOGO_URL por la ruta de tu logo (por ejemplo, pon logo.png dentro de la carpeta public/).
import { useEffect, useRef, useState } from 'react'
import { preguntarChat } from '../services/iaService'

const LOGO_URL = '/20ub.jpg'  // Cambia esto por la ruta de tu logo (por ejemplo, pon logo.png dentro de la carpeta public/).
const TITULO = 'Somos UbiPark'
const SUBTITULO = 'Encuentra estacionamientos y consulta tarifas, horarios y cómo reservar.'
const SALUDO = '¡Hola! Pregúntame lo que quieras sobre estacionamientos: precios, horarios, zonas, reseñas o disponibilidad.'

const EJEMPLOS = [
  '¿Qué estacionamientos hay disponibles?',
  'Busco uno económico para mi moto',
  '¿Cuál tiene mejores reseñas?',
]

const AZUL = '#4a6cf7'
const FONDO = '#262322'
const BURBUJA_IA = '#3a3635'
const CAMPO = '#332f2e'
const TEXTO = '#f5f5f4'
const TEXTO_SUAVE = '#a8a29e'

const estilos = {
  boton: {
    position: 'fixed', right: 20, bottom: 20, width: 58, height: 58, borderRadius: '50%',
    border: 'none', background: AZUL, color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(0,0,0,.35)', zIndex: 1000,
  },
  ventana: {
    position: 'fixed', right: 20, bottom: 90, width: 'min(390px, calc(100vw - 24px))',
    height: 'min(580px, calc(100vh - 115px))', background: FONDO, borderRadius: 28,
    boxShadow: '0 12px 40px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', zIndex: 1000, fontFamily: 'inherit', color: TEXTO,
  },
  cabecera: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
    borderBottom: '1px solid rgba(255,255,255,.07)',
  },
  logo: { width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', background: '#fff', flexShrink: 0 },
  logoFallback: {
    width: 40, height: 40, borderRadius: '50%', background: AZUL, display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
  },
  titulo: { fontWeight: 700, fontSize: 15, lineHeight: 1.2 },
  subtitulo: { fontSize: 12, color: TEXTO_SUAVE, lineHeight: 1.3, marginTop: 2 },
  botonCabecera: {
    background: 'transparent', border: 'none', color: TEXTO_SUAVE, cursor: 'pointer',
    fontSize: 22, lineHeight: 1, padding: 6, borderRadius: 8,
  },
  cuerpo: { flex: 1, overflowY: 'auto', padding: 16 },
  burbujaUsuario: {
    background: AZUL, color: '#fff', padding: '10px 15px', borderRadius: 20,
    maxWidth: '85%', marginLeft: 'auto', marginBottom: 10, fontSize: 14.5, lineHeight: 1.4,
    wordBreak: 'break-word', width: 'fit-content',
  },
  burbujaIA: {
    background: BURBUJA_IA, color: TEXTO, padding: '10px 15px', borderRadius: 20,
    maxWidth: '92%', marginBottom: 10, fontSize: 14.5, lineHeight: 1.45, wordBreak: 'break-word',
    width: 'fit-content',
  },
  chip: {
    border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: TEXTO,
    borderRadius: 18, padding: '8px 13px', fontSize: 13.5, cursor: 'pointer',
    marginBottom: 8, textAlign: 'left',
  },
  formulario: {
    display: 'flex', alignItems: 'center', gap: 8, margin: '0 14px 8px', padding: '6px 6px 6px 16px',
    background: CAMPO, border: '1px solid rgba(255,255,255,.1)', borderRadius: 999,
  },
  entrada: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none', color: TEXTO,
    fontSize: 14.5, minWidth: 0,
  },
  enviar: {
    width: 38, height: 38, borderRadius: '50%', border: 'none', background: AZUL, color: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pie: { textAlign: 'center', fontSize: 11.5, color: TEXTO_SUAVE, padding: '0 14px 12px' },
  fecha: { textAlign: 'center', fontSize: 12, color: TEXTO_SUAVE, margin: '2px 0 12px' },
  filaIA: { display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: '#fff', flexShrink: 0 },
  avatarFallback: {
    width: 32, height: 32, borderRadius: '50%', background: AZUL, color: '#fff', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0,
  },
}

const IconoChat = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
  </svg>
)

const IconoEnviar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)

/* Convierte saltos de línea y **negritas** del modelo en elementos React (sin dangerouslySetInnerHTML). */
function formatear(texto) {
  return String(texto).split('\n').map((linea, i) => (
    <p key={i} style={{ margin: '0 0 4px' }}>
      {linea.split(/(\*\*[^*]+\*\*)/g).map((trozo, j) =>
        trozo.startsWith('**') && trozo.endsWith('**') && trozo.length > 4
          ? <strong key={j}>{trozo.slice(2, -2)}</strong>
          : trozo,
      )}
    </p>
  ))
}

export default function ChatIA() {
  const [abierto, setAbierto] = useState(false)
  const [historial, setHistorial] = useState([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [logoOk, setLogoOk] = useState(true)
  const finRef = useRef(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historial, cargando, abierto])

  // Burbuja del asistente con tu logo a un lado
  const filaIA = (contenido, key) => (
    <div key={key} style={estilos.filaIA}>
      {logoOk
        ? <img src={LOGO_URL} alt="UbiPark" style={estilos.avatar} onError={() => setLogoOk(false)} />
        : <div style={estilos.avatarFallback}>U</div>}
      <div style={{ ...estilos.burbujaIA, marginBottom: 0, maxWidth: 'calc(100% - 42px)' }}>{contenido}</div>
    </div>
  )

  async function enviar(mensaje) {
    const limpio = (mensaje ?? texto).trim()
    if (!limpio || cargando) return

    const nuevo = [...historial, { role: 'user', parts: [{ text: limpio }] }]
    setHistorial(nuevo)
    setTexto('')
    setError('')
    setCargando(true)
    try {
      const respuesta = await preguntarChat(nuevo)
      setHistorial([...nuevo, { role: 'model', parts: [{ text: respuesta }] }])
    } catch (e) {
      console.error(e)
      setError('No pude responder: ' + (e?.message || 'error desconocido'))
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      <button style={estilos.boton} onClick={() => setAbierto((a) => !a)} aria-label="Abrir chat de ayuda">
        {abierto ? <span style={{ fontSize: 30, lineHeight: 1 }}>×</span> : <IconoChat />}
      </button>

      {abierto && (
        <div style={estilos.ventana}>
          <div style={estilos.cabecera}>
            {logoOk
              ? <img src={LOGO_URL} alt="UbiPark" style={estilos.logo} onError={() => setLogoOk(false)} />
              : <div style={estilos.logoFallback}>U</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={estilos.titulo}>{TITULO}</div>
              <div style={estilos.subtitulo}>{SUBTITULO}</div>
            </div>
            <button
              style={estilos.botonCabecera}
              onClick={() => { setHistorial([]); setError('') }}
              title="Nueva conversación"
              aria-label="Nueva conversación"
            >
              +
            </button>
          </div>

          <div style={estilos.cuerpo}>
            <div style={estilos.fecha}>Hoy</div>
            {historial.length === 0 && (
              <>
                {filaIA(SALUDO, 'saludo')}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  {EJEMPLOS.map((e) => (
                    <button key={e} style={estilos.chip} onClick={() => enviar(e)}>{e}</button>
                  ))}
                </div>
              </>
            )}

            {historial.map((m, i) => (
              m.role === 'user'
                ? <div key={i} style={estilos.burbujaUsuario}>{m.parts[0].text}</div>
                : filaIA(formatear(m.parts[0].text), i)
            ))}

            {cargando && filaIA(<span style={{ color: TEXTO_SUAVE }}>Escribiendo…</span>, 'cargando')}
            {error && <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 8 }}>{error}</div>}
            <div ref={finRef} />
          </div>

          <form
            style={estilos.formulario}
            onSubmit={(e) => { e.preventDefault(); enviar() }}
          >
            <input
              style={estilos.entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pregunta a Somos UbiPark"
              maxLength={500}
            />
            <button
              type="submit"
              style={{ ...estilos.enviar, opacity: cargando || !texto.trim() ? 0.45 : 1 }}
              disabled={cargando || !texto.trim()}
              aria-label="Enviar"
            >
              <IconoEnviar />
            </button>
          </form>
          <div style={estilos.pie}>Estás hablando con un agente de IA.</div>
        </div>
      )}
    </>
  )
}

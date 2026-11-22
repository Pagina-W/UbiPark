import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { useIdUsuario } from '../lib/useIdUsuario.js'
import EscanerQR from './escanearQR'
import {
  obtenerEstacionamientosPorPropietario,
  ocupacionDe,
  reservasDe,
  registrarSalida,
  actualizarEstacionamiento,
  cambiarEstadoEstacionamiento,
} from '../services/estacionamientoService.js'
import './Propietario.css'

/* ---------- utilidades ---------- */
const ts = (v) => (v ? new Date(/[zZ]$|[+-]\d\d(:?\d\d)?$/.test(v) ? v : v + 'Z') : null)
const fecha = (v) => ts(v)?.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) ?? '—'
const extraerCodigo = (t) => t.trim().replace(/[?#].*$/, '').split('/').filter(Boolean).pop()

// si una consulta tarda más de `ms`, falla en vez de quedarse colgada
const conLimite = (promesa, ms = 10000) => {
  let t
  const limite = new Promise((_, rechazar) => {
    t = setTimeout(() => rechazar(new Error('Tiempo agotado consultando Supabase')), ms)
  })
  return Promise.race([Promise.resolve(promesa), limite]).finally(() => clearTimeout(t))
}

function estadoOperativo(r, ahora) {
  if (/cancel/i.test(r.estadoreserva || '')) return 'cancelada'
  if (r.salida_real || r.estadoreserva === 'completada') return 'finalizada'
  if (r.qr_usado) return ts(r.fechasalida) < ahora ? 'excedido' : 'dentro'
  if (ts(r.fechasalida) < ahora) return 'no_llego'
  return 'por_llegar'
}

const ETIQUETA = {
  por_llegar: ['Por llegar', 'warn'],
  dentro: ['Dentro', 'ok'],
  excedido: ['Tiempo excedido', 'bad'],
  finalizada: ['Finalizada', 'muted'],
  no_llego: ['No llegó', 'muted'],
  cancelada: ['Cancelada', 'muted'],
}
const Badge = ({ tipo }) => <span className={'prop-badge ' + ETIQUETA[tipo][1]}>{ETIQUETA[tipo][0]}</span>

const CAMPOS_TEXTO = [
  ['direcciontexto', 'Dirección / referencias'],
  ['vehiculospermitidos', 'Vehículos permitidos'],
]

function Espacios({ cap, dentro, porLlegar }) {
  return (
    <div className="prop-slots">
      {Array.from({ length: Math.min(cap, 60) }, (_, i) => {
        const cls = i < dentro ? 'ocupado' : i < dentro + porLlegar ? 'reservado' : 'libre'
        return <span key={i} className={'prop-slot ' + cls} title={`Espacio ${i + 1}: ${cls}`}>{i + 1}</span>
      })}
    </div>
  )
}

/* ---------- carrusel (como el del admin) ---------- */
function Carrusel({ slides, onIr }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % slides.length), 6500)
    return () => clearInterval(t)
  }, [slides.length])
  const mover = (d) => setI((v) => (v + d + slides.length) % slides.length)
  return (
    <div className="prop-carousel">
      {slides.map((s, k) => (
        <div key={s.tag} className={'prop-slide' + (k === i ? ' on' : '')} aria-hidden={k !== i}>
          <div className={'prop-slide-bg t' + k} />
          <div className="prop-slide-big">{s.emoji}</div>
          <div className="prop-slide-content">
            <span className="prop-slide-tag">{s.tag}</span>
            <h1>{s.titulo}</h1>
            <p>{s.texto}</p>
            <button type="button" className="prop-slide-btn" tabIndex={k === i ? 0 : -1} onClick={() => onIr(s.ir)}>{s.boton}</button>
          </div>
        </div>
      ))}
      <button type="button" className="prop-arrow prev" aria-label="Anterior" onClick={() => mover(-1)}>‹</button>
      <button type="button" className="prop-arrow next" aria-label="Siguiente" onClick={() => mover(1)}>›</button>
      <div className="prop-dots">
        {slides.map((s, k) => (
          <button key={s.tag} type="button" aria-label={'Ir a ' + s.tag} className={'prop-dot' + (k === i ? ' on' : '')} onClick={() => setI(k)} />
        ))}
      </div>
    </div>
  )
}

const MENU = [
  ['resumen', '🏠', 'Resumen'],
  ['escanear', '📷', 'Escanear QR'],
  ['ocupacion', '🚗', 'Ocupación'],
  ['reservas', '🧾', 'Reservas'],
  ['lugares', '🅿️', 'Mi estacionamiento'],
  ['nuevo', '✏️', 'Actualizar datos'],
]

/* ---------- panel ---------- */
export default function PanelPropietario({ renderPublicar }) {
  const { ses, user, toast } = useApp()
  const { idUsuario: idOwner, buscando } = useIdUsuario()
  const navigate = useNavigate()

  const [vista, setVista] = useState('resumen')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [lugares, setLugares] = useState(null)
  const [ocup, setOcup] = useState({})
  const [reservas, setReservas] = useState([])
  const [ahora, setAhora] = useState(new Date())
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')   // fallo parcial: ocupación/reservas no cargaron

  const [manual, setManual] = useState('')
  const [filtroLugar, setFiltroLugar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [busca, setBusca] = useState('')
  const [ed, setEd] = useState(null)

  const cargar = useCallback(async () => {
    if (buscando) return
    if (!idOwner) {
      console.warn('idOwner vacío', { user, ses })
      setError('No se pudo identificar tu usuario. Cierra sesión y vuelve a entrar.')
      return
    }
    try {
      // 1) Primero los estacionamientos: con esto el panel y "Actualizar datos" ya funcionan
      const res = await conLimite(obtenerEstacionamientosPorPropietario(idOwner))
      const ls = Array.isArray(res) ? res : []
      setLugares(ls)
      setError('')

      // 2) Ocupación y reservas por separado: si fallan, no tiran el panel
      const ids = ls.map((l) => l.idestacionamiento)
      try {
        const [o, rs] = await Promise.all([conLimite(ocupacionDe(ids)), conLimite(reservasDe(ids))])
        setOcup(o || {})
        setReservas(rs || [])
        setAviso('')
      } catch (e2) {
        console.error('Error cargando ocupación/reservas', e2)
        setAviso('No se pudo cargar la ocupación o las reservas: ' + (e2.message || 'error desconocido'))
      }
      setAhora(new Date())
    } catch (e) {
      console.error('Error en cargar', e)
      setError(e.message || 'No se pudo cargar tu información.')
      toast(e.message)
    }
  }, [idOwner, buscando])

  useEffect(() => {
    document.title = 'UbiPark | Panel del propietario'
    cargar()
    const t = setInterval(cargar, 30000)
    return () => clearInterval(t)
  }, [cargar])

  const conEstado = useMemo(() => reservas.map((r) => ({ ...r, op: estadoOperativo(r, ahora) })), [reservas, ahora])
  const dentroAhora = conEstado.filter((r) => r.op === 'dentro' || r.op === 'excedido')
  const porLlegar = conEstado.filter((r) => r.op === 'por_llegar')

  const resumen = useMemo(() => {
    const vals = Object.values(ocup)
    const suma = (k) => vals.reduce((a, o) => a + Number(o[k] || 0), 0)
    return { cap: suma('capacidad'), dentro: suma('dentro'), llegan: suma('por_llegar'), libres: suma('disponibles') }
  }, [ocup])

  const sinLugares = lugares && lugares.length === 0
  const actual = sinLugares ? 'nuevo' : vista
  const nombre = ses?.nombre || ses?.name || user?.email || 'Propietario'
  const ir = (v) => { setVista(v); setMenuAbierto(false); window.scrollTo({ top: 0 }) }

  const estadoLugar = (l) => {
    if (!l.activo) return ['Cerrado', 'muted']
    return ocup[l.idestacionamiento]?.lleno ? ['Lleno', 'bad'] : ['Disponible', 'ok']
  }

  const salida = async (r) => {
    try {
      await registrarSalida(r.idreserva, idOwner)
      toast('Salida registrada. El espacio quedó libre.')
      await cargar()
    } catch (e) { toast(e.message) }
  }

  const irAValidar = (texto) => {
    const codigo = extraerCodigo(texto || '')
    if (codigo) navigate('/validar/' + encodeURIComponent(codigo))
  }

  const guardarEdicion = async (e) => {
    e.preventDefault()
    const orig = ed._original
    const cambios = {
      nombreestacionamiento: ed.nombreestacionamiento,
      precioporhora: +ed.precioporhora,
      capacidadtotal: +ed.capacidadtotal,
      horaapertura: ed.horaapertura,
      horacierre: ed.horacierre,
    }
    CAMPOS_TEXTO.forEach(([k]) => { if (k in orig) cambios[k] = ed[k] ?? '' })
    try {
      await actualizarEstacionamiento(ed.idestacionamiento, cambios)
      setEd(null); await cargar(); toast('¡Información actualizada!')
    } catch (err) { toast(err.message) }
  }

  const reservasFiltradas = conEstado.filter((r) => {
    if (filtroLugar && String(r.idestacionamiento) !== filtroLugar) return false
    if (filtroEstado && r.op !== filtroEstado) return false
    if (busca) {
      const txt = `${r.idreserva} ${r.usuarios?.nombre} ${r.usuarios?.apellidos} ${r.vehiculos?.placa}`.toLowerCase()
      if (!txt.includes(busca.toLowerCase())) return false
    }
    return true
  })

  const titulo = MENU.find((m) => m[0] === actual)?.[2]

  const slides = [
    { tag: 'BIENVENIDO', emoji: '🅿️', titulo: `Hola, ${String(nombre).split(' ')[0]}`, texto: 'Controla quién entra y quién sale de tu estacionamiento, en tiempo real.', boton: 'Ver ocupación', ir: 'ocupacion' },
    { tag: 'ACCESO', emoji: '📷', titulo: 'Escanea el QR del cliente', texto: 'Verifica el pago, registra la entrada y el lugar pasa a ocupado automáticamente.', boton: 'Escanear ahora', ir: 'escanear' },
    { tag: 'TU NEGOCIO', emoji: '🧾', titulo: 'Mantén tu información al día', texto: 'Precio, horario y capacidad: lo que cambies aquí es lo que ven tus clientes.', boton: 'Actualizar mis datos', ir: 'nuevo' },
  ]

  const modulos = [
    ['escanear', '#12a879', '📷', 'Escanear QR', 'Registra la entrada de un cliente y verifica su pago.', 'Abrir', 'lector'],
    ['ocupacion', '#ed9238', '🚗', 'Ocupación', 'Lugares ocupados, reservados y libres ahora mismo.', resumen.dentro, 'dentro'],
    ['reservas', '#8956dc', '🧾', 'Reservas', 'Historial y estado de las reservas de tus clientes.', reservas.length, 'reservas'],
    ['lugares', '#2878f0', '🅿️', 'Mi estacionamiento', 'Edita tarifa, horario, capacidad y dirección.', lugares?.length ?? 0, 'registrados'],
    ['nuevo', '#13a5a5', '✏️', 'Actualizar datos', 'Cambia o agrega información de tu estacionamiento.', 'Editar', 'datos'],
  ]

  return (
    <div className="prop-layout">
      {/* ---- barra lateral ---- */}
      <aside className={'prop-sidebar' + (menuAbierto ? ' open' : '')}>
        <div className="prop-brand">
          <div className="prop-brand-icon">P</div>
          <div><h2>UbiPark</h2><span>Panel del propietario</span></div>
        </div>
        <div className="prop-menu-label">MENÚ</div>
        <nav className="prop-nav">
          {MENU.map(([id, icono, texto]) => (
            <button key={id} type="button" disabled={sinLugares && id !== 'nuevo'}
              className={'prop-nav-item' + (actual === id ? ' active' : '')} onClick={() => ir(id)}>
              <span className="prop-nav-icon">{icono}</span>{texto}
              {actual === id && <span className="prop-nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="prop-sidebar-bottom">
          <div className="prop-profile">
            <div className="prop-avatar">{String(nombre).charAt(0).toUpperCase()}</div>
            <div><strong>{nombre}</strong><span>Propietario</span></div>
          </div>
        </div>
      </aside>

      {/* ---- contenido ---- */}
      <main className="prop-main">
        <header className="prop-topbar">
          <button type="button" className="prop-mobile-menu" aria-label="Menú" onClick={() => setMenuAbierto((v) => !v)}>☰</button>
          <div>
            <div className="prop-breadcrumb">Panel del propietario</div>
            <h2>{titulo}</h2>
          </div>
          <div className="prop-status"><i />En vivo</div>
        </header>

        <div className="prop-content" key={actual}>
          {lugares === null && !error && <p>Cargando tu información…</p>}

          {lugares === null && error && (
            <div className="prop-panel">
              <p className="prop-error">⚠️ {error}</p>
              <button type="button" className="prop-btn" onClick={cargar}>Reintentar</button>
            </div>
          )}

          {lugares !== null && aviso && actual !== 'nuevo' && (
            <div className="prop-panel">
              <p className="prop-error">⚠️ {aviso}</p>
              <button type="button" className="prop-btn" onClick={cargar}>Reintentar</button>
            </div>
          )}

          {/* ===== ACTUALIZAR DATOS / BIENVENIDA ===== */}
          {actual === 'nuevo' && lugares !== null && (
            <section>
              {sinLugares && (
                <div className="prop-panel">
                  <h1>¡Bienvenido a UbiPark!</h1>
                  <p>Cuéntanos sobre tu estacionamiento. Esta información es la que verán tus clientes y podrás editarla cuando quieras.</p>
                </div>
              )}
              {renderPublicar
                ? renderPublicar(async () => { await cargar(); setVista('resumen') }, lugares)
                : <p className="prop-error">Falta pasar renderPublicar con tu formulario de publicar.</p>}
            </section>
          )}

          {/* ===== RESUMEN ===== */}
          {actual === 'resumen' && lugares && (
            <section>
              <Carrusel slides={slides} onIr={ir} />

              <div className="prop-stats">
                {[
                  ['blue', '🅿️', 'Lugares totales', resumen.cap, 'capacidad registrada'],
                  ['orange', '🚗', 'Dentro ahora', resumen.dentro, 'vehículos en tu local'],
                  ['purple', '⏳', 'Por llegar', resumen.llegan, 'reservas apartando lugar'],
                  ['green', '✅', 'Disponibles', resumen.libres, 'para nuevos clientes'],
                ].map(([color, ico, et, val, sub]) => (
                  <div className="prop-stat" key={et}>
                    <div className={'prop-stat-icon ' + color}>{ico}</div>
                    <div><span>{et}</span><strong>{val}</strong><small>{sub}</small></div>
                  </div>
                ))}
              </div>

              <div className="prop-heading">
                <div><h3>Administración de mi estacionamiento</h3><p>Entra al módulo que necesites.</p></div>
              </div>
              <div className="prop-modules">
                {modulos.map(([id, color, ico, nom, desc, val, sub]) => (
                  <button key={id} type="button" className="prop-module" style={{ '--mc': color }} onClick={() => ir(id)}>
                    <div className="prop-module-top"><div className="prop-module-icon">{ico}</div><div className="prop-module-arrow">↗</div></div>
                    <h4>{nom}</h4>
                    <p>{desc}</p>
                    <div className="prop-module-bottom"><strong>{val}</strong><span>{sub}</span></div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ===== ESCANEAR ===== */}
          {actual === 'escanear' && lugares && (
            <section className="prop-escaner">
              <div className="prop-heading">
                <div><h3>Escanear QR del cliente</h3><p>Verás los datos de la reserva, verificarás el pago y darás acceso.</p></div>
              </div>
              <EscanerQR activo onCodigo={irAValidar} />
              <form className="prop-manual" onSubmit={(e) => { e.preventDefault(); irAValidar(manual) }}>
                <input type="search" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="O escribe el código de la reserva" />
                <button type="submit" className="prop-btn">Buscar</button>
              </form>
            </section>
          )}

          {/* ===== OCUPACIÓN ===== */}
          {actual === 'ocupacion' && lugares && (
            <section>
              {lugares.map((l) => {
                const o = ocup[l.idestacionamiento] || { capacidad: l.capacidadtotal || 1, dentro: 0, por_llegar: 0, disponibles: l.capacidadtotal || 1 }
                const [txt, tipo] = estadoLugar(l)
                return (
                  <div className="prop-lote" key={l.idestacionamiento}>
                    <div className="prop-lote-head">
                      <div>
                        <h3>{l.nombreestacionamiento}</h3>
                        <p>{o.dentro} dentro · {o.por_llegar} por llegar · {o.disponibles} libres de {o.capacidad}</p>
                      </div>
                      <span className={'prop-badge ' + tipo}>{txt}</span>
                    </div>
                    <Espacios cap={Number(o.capacidad)} dentro={Number(o.dentro)} porLlegar={Number(o.por_llegar)} />
                    <div className="prop-leyenda">
                      <span><i className="ocupado" />Ocupado</span>
                      <span><i className="reservado" />Reservado (esperando llegada)</span>
                      <span><i className="libre" />Libre</span>
                    </div>
                  </div>
                )
              })}

              <div className="prop-heading">
                <div><h3>Dentro ahora</h3><p>Al salir el cliente, registra la salida para liberar el espacio.</p></div>
              </div>
              <div className="prop-table-wrap">
                <table>
                  <thead><tr><th>Reserva</th><th>Estacionamiento</th><th>Cliente</th><th>Vehículo</th><th>Entró</th><th>Debe salir</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {dentroAhora.length ? dentroAhora.map((r) => (
                      <tr key={r.idreserva}>
                        <td>#{r.idreserva}</td>
                        <td><b>{r.estacionamientos?.nombreestacionamiento}</b></td>
                        <td>{r.usuarios?.nombre} {r.usuarios?.apellidos}</td>
                        <td>{r.vehiculos?.placa}</td>
                        <td>{fecha(r.qr_usado_en)}</td>
                        <td>{fecha(r.fechasalida)}</td>
                        <td><Badge tipo={r.op} /></td>
                        <td><button type="button" onClick={() => salida(r)}>Registrar salida</button></td>
                      </tr>
                    )) : <tr><td colSpan={8}>No hay vehículos dentro en este momento.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="prop-heading">
                <div><h3>Por llegar</h3><p>Reservas vigentes que todavía no escanean su QR.</p></div>
              </div>
              <div className="prop-table-wrap">
                <table>
                  <thead><tr><th>Reserva</th><th>Estacionamiento</th><th>Cliente</th><th>Vehículo</th><th>Entrada</th><th>Salida</th><th>Pago</th></tr></thead>
                  <tbody>
                    {porLlegar.length ? porLlegar.map((r) => (
                      <tr key={r.idreserva}>
                        <td>#{r.idreserva}</td>
                        <td><b>{r.estacionamientos?.nombreestacionamiento}</b></td>
                        <td>{r.usuarios?.nombre} {r.usuarios?.apellidos}</td>
                        <td>{r.vehiculos?.placa}</td>
                        <td>{fecha(r.fechaentrada)}</td>
                        <td>{fecha(r.fechasalida)}</td>
                        <td>{r.metodo_pago} · {r.estado_pago}</td>
                      </tr>
                    )) : <tr><td colSpan={7}>No hay reservas pendientes de llegar.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ===== RESERVAS ===== */}
          {actual === 'reservas' && lugares && (
            <section>
              <div className="prop-heading">
                <div><h3>Reservas de mis estacionamientos</h3><p>Solo ves las reservas de tus lugares.</p></div>
              </div>
              <div className="prop-filtros">
                <input type="search" placeholder="Buscar cliente, placa o folio…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <select value={filtroLugar} onChange={(e) => setFiltroLugar(e.target.value)}>
                  <option value="">Todos mis estacionamientos</option>
                  {lugares.map((l) => <option key={l.idestacionamiento} value={l.idestacionamiento}>{l.nombreestacionamiento}</option>)}
                </select>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {Object.entries(ETIQUETA).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </div>
              <div className="prop-table-wrap">
                <table>
                  <thead><tr><th>Folio</th><th>Estacionamiento</th><th>Cliente</th><th>Vehículo</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Pago</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {reservasFiltradas.length ? reservasFiltradas.map((r) => (
                      <tr key={r.idreserva}>
                        <td>#{r.idreserva}</td>
                        <td><b>{r.estacionamientos?.nombreestacionamiento}</b></td>
                        <td>{r.usuarios?.nombre} {r.usuarios?.apellidos}</td>
                        <td>{r.vehiculos?.placa}</td>
                        <td>{fecha(r.fechaentrada)}</td>
                        <td>{fecha(r.fechasalida)}</td>
                        <td>${Number(r.montototal || 0).toFixed(2)}</td>
                        <td>{r.metodo_pago} · {r.estado_pago}</td>
                        <td><Badge tipo={r.op} /></td>
                        <td>{(r.op === 'dentro' || r.op === 'excedido') && <button type="button" onClick={() => salida(r)}>Registrar salida</button>}</td>
                      </tr>
                    )) : <tr><td colSpan={10}>No hay reservas con estos filtros.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="prop-nota">{reservasFiltradas.length} reserva(s)</p>
            </section>
          )}

          {/* ===== MI ESTACIONAMIENTO ===== */}
          {actual === 'lugares' && lugares && (
            <section>
              {ed && (
                <div className="prop-panel">
                  <div className="prop-heading" style={{ marginTop: 0 }}>
                    <h3>Editando: {ed.nombreestacionamiento}</h3>
                    <button type="button" className="prop-btn" onClick={() => setEd(null)}>Cancelar</button>
                  </div>
                  <form onSubmit={guardarEdicion} className="prop-form">
                    <label>Nombre<input required value={ed.nombreestacionamiento ?? ''} onChange={(e) => setEd({ ...ed, nombreestacionamiento: e.target.value })} /></label>
                    {CAMPOS_TEXTO.filter(([k]) => k in ed._original).map(([k, et]) => (
                      <label key={k}>{et}<input value={ed[k] ?? ''} onChange={(e) => setEd({ ...ed, [k]: e.target.value })} /></label>
                    ))}
                    <label>Precio por hora ($)<input type="number" required value={ed.precioporhora ?? ''} onChange={(e) => setEd({ ...ed, precioporhora: e.target.value })} /></label>
                    <label>Capacidad total<input type="number" min="1" required value={ed.capacidadtotal ?? ''} onChange={(e) => setEd({ ...ed, capacidadtotal: e.target.value })} /></label>
                    <label>Hora de apertura<input type="time" required value={ed.horaapertura ?? '08:00'} onChange={(e) => setEd({ ...ed, horaapertura: e.target.value })} /></label>
                    <label>Hora de cierre<input type="time" required value={ed.horacierre ?? '20:00'} onChange={(e) => setEd({ ...ed, horacierre: e.target.value })} /></label>
                    <div className="prop-form-acciones"><button type="submit" className="prop-btn">Guardar cambios</button></div>
                  </form>
                </div>
              )}
              <div className="prop-table-wrap">
                <table>
                  <thead><tr><th>Nombre</th><th>Dirección</th><th>Tarifa</th><th>Capacidad</th><th>Horario</th><th>Estado</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {lugares.map((l) => {
                      const [txt, tipo] = estadoLugar(l)
                      return (
                        <tr key={l.idestacionamiento}>
                          <td><b>{l.nombreestacionamiento}</b></td>
                          <td>{l.direcciontexto || 'Sin dirección'}</td>
                          <td>${l.precioporhora}/h</td>
                          <td>{l.capacidadtotal || 1} lugares</td>
                          <td>{String(l.horaapertura || '08:00').slice(0, 5)} - {String(l.horacierre || '20:00').slice(0, 5)}</td>
                          <td><span className={'prop-badge ' + tipo}>{txt}</span></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={() => setEd({ ...l, _original: l })}>Editar</button>{' '}
                            <button type="button" onClick={async () => { try { await cambiarEstadoEstacionamiento(l.idestacionamiento, !l.activo); await cargar() } catch (e) { toast(e.message) } }}>
                              {l.activo ? 'Cerrar temporalmente' : 'Abrir'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="prop-nota">“Lleno” se calcula solo con los vehículos que ya entraron y las reservas por llegar. “Cerrado” lo controlas tú.</p>
            </section>
          )}

        </div>
      </main>
    </div>
  )
}

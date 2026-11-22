import { useState } from 'react'
import { descargarPDFReserva } from '../lib/pdfReserva.js'

const estilos = `
.folio {
  --c: #9a6200; --bg: #fff7e6; --borde: #f0b44c;
  background: var(--bg);
  border: 2px dashed var(--borde);
  border-radius: 14px;
  padding: 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
}
.folio.pend     { --c: #9a6200; --bg: #fff7e6; --borde: #f0b44c; }
.folio.review   { --c: #1d4ed8; --bg: #eff6ff; --borde: #93b4f5; }
.folio.paid     { --c: #0b7a3b; --bg: #ecfdf3; --borde: #34c27a; }
.folio.rejected { --c: #b91c1c; --bg: #fef2f2; --borde: #f19a9a; }
.folio.used     { --c: #6b7280; --bg: #f3f4f6; --borde: #c4c8cf; }

.folio-titulo { color: var(--c); font-size: 1rem; }
.folio-label  { font-size: .75rem; color: #6b7280; margin-top: 6px; letter-spacing: .06em; }
.folio-num    { font-size: 1.6rem; font-weight: 800; color: var(--c); }
.folio-datos  { display: block; margin-top: 6px; color: #374151; line-height: 1.5; }
.folio-nota   { font-size: .8rem; margin: 8px 0 0; color: var(--c); }
.folio-btn {
  width: 100%; margin-top: 10px; padding: 10px;
  background: var(--blue, #2563eb); color: #fff;
  border: none; border-radius: 8px; font-weight: 600; cursor: pointer;
  transition: opacity .15s;
}
.folio-btn:hover:not(:disabled) { opacity: .9; }
.folio-btn:disabled { opacity: .6; cursor: not-allowed; }
.folio-error { font-size: .8rem; color: #b91c1c; margin: 6px 0 0; }
`

/* naranja = pendiente, azul = en revisión, verde = pagado, rojo = rechazado, gris = usado.
   El folio (#idreserva) es único: es la llave primaria de la tabla reservas. */
export default function TarjetaQR({ r, lugar }) {
  const [generando, setGenerando] = useState(false)
  const [errorPDF, setErrorPDF] = useState('')

  const nombre = lugar || r.estacionamientos?.nombreestacionamiento || ''
  const direccion = r.estacionamientos?.direcciontexto || ''
  const transf = r.metodo_pago === 'transferencia'
  const ok = r.estado_pago === 'verificado' || r.estado_pago === 'cobrado'
  const duracion = r.tipo_reserva === 'dia' ? `${r.dias} día(s)` : `${r.horas} h`
  const fmt = (f) => new Date(f).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

  let clase = 'pend', titulo = '', nota = ''

  if (r.qr_usado) {
    clase = 'used'
    titulo = '✔ Reserva ya utilizada'
    nota = 'Esta reserva ya se validó y no puede volver a usarse.'
  } else if (r.estado_pago === 'rechazado') {
    clase = 'rejected'
    titulo = '❌ Comprobante rechazado'
    nota = 'El dueño no pudo verificar tu transferencia. Contáctalo por WhatsApp.'
  } else if (transf && !ok) {
    clase = 'review'
    titulo = '📄 Transferencia · comprobante enviado'
    nota = 'El dueño revisará tu comprobante. Descarga tu PDF y muéstralo al llegar.'
  } else if (transf && ok) {
    clase = 'paid'
    titulo = '✅ Transferencia verificada · PAGADO'
    nota = 'Descarga tu PDF y muéstralo al dueño al llegar.'
  } else if (ok) {
    clase = 'paid'
    titulo = '✅ Efectivo cobrado · PAGADO'
    nota = 'Descarga tu PDF y muéstralo al dueño al llegar.'
  } else {
    clase = 'pend'
    titulo = '⏳ Apartado · pago pendiente en físico'
    nota = `Pagarás $${r.montototal} MXN en efectivo con el dueño. Descarga tu PDF y muéstralo al llegar.`
  }

  const bajarPDF = async () => {
    setGenerando(true)
    setErrorPDF('')
    try {
      await descargarPDFReserva(r.idreserva)
    } catch (e) {
      setErrorPDF('No se pudo generar el PDF: ' + (e?.message || 'intenta de nuevo'))
    } finally {
      setGenerando(false)
    }
  }

  return (
    <>
      <style>{estilos}</style>
      <div className={'folio ' + clase}>
        <b className="folio-titulo">{titulo}</b>

        <div className="folio-label">FOLIO ÚNICO</div>
        <code className="folio-num">#{r.idreserva}</code>

        <small className="folio-datos">
          {nombre}
          {direccion && <><br />{direccion}</>}
          <br />
          {r.tipo_vehiculo} · {duracion} · ${r.montototal} MXN
          <br />
          {fmt(r.fechaentrada)} → {fmt(r.fechasalida)}
        </small>

        <p className="folio-nota">{nota}</p>

        <button type="button" className="folio-btn" onClick={bajarPDF} disabled={generando}>
          {generando ? 'Generando PDF…' : '📄 Descargar PDF'}
        </button>

        {errorPDF && <p className="folio-error">{errorPDF}</p>}
      </div>
    </>
  )
}
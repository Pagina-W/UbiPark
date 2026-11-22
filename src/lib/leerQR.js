// Lee un código QR desde un PDF o una imagen (para usar en la computadora).
// Imágenes: html5-qrcode (ya instalado para la cámara). PDF: necesita  npm i pdfjs-dist
import { Html5Qrcode } from 'html5-qrcode'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

async function escanearImagen(archivo) {
  const caja = document.createElement('div')
  caja.id = 'qr-tmp-' + Math.random().toString(36).slice(2, 8)
  caja.style.display = 'none'
  document.body.appendChild(caja)
  const lector = new Html5Qrcode(caja.id)
  try {
    return await lector.scanFile(archivo, false)
  } catch {
    return null
  } finally {
    try { lector.clear() } catch { /* nada */ }
    caja.remove()
  }
}

async function dePDF(archivo) {
  const data = await archivo.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const paginas = Math.min(pdf.numPages, 10)
  for (const escala of [2, 3]) {          // algunos QR pequeños se leen mejor ampliados
    for (let n = 1; n <= paginas; n++) {
      const pagina = await pdf.getPage(n)
      const vp = pagina.getViewport({ scale: escala })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) continue
      const texto = await escanearImagen(new File([blob], `pagina-${n}.png`, { type: 'image/png' }))
      if (texto) return texto
    }
  }
  return null
}

/* Devuelve el texto del QR (URL o código) o null si no encontró ninguno */
export async function leerQRDeArchivo(archivo) {
  const esPDF = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)
  return esPDF ? dePDF(archivo) : escanearImagen(archivo)
}
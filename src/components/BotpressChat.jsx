// DESTINO: src/components/BotpressChat.jsx  (junto a ChatIA.jsx)
// Uso: pon <BotpressChat /> en la vista de cliente, donde antes estaba <ChatIA />.
// El chat solo existe mientras esa vista está abierta: al salir de ella se quita por completo.
import { useEffect } from 'react'

const BASE = 'https://vdk-viber-runtime-prod.bot.botpress.host'
const BOT_ID = '368bf068-be1a-4ac9-a0aa-4618e1518bac'

export default function BotpressChat() {
  useEffect(() => {
    let cancelado = false
    let instancia = null
    // Foto de lo que ya hay en la página, para quitar después solo lo que agregue Botpress
    const antes = new Set(Array.from(document.body.children))

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${BASE}/edge/webchat.css`
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = `${BASE}/edge/webchat.js`
    script.onload = async () => {
      try {
        const res = await fetch(`${BASE}/edge/bots/${BOT_ID}/config`)
        const { webchat } = await res.json()
        if (cancelado) return // el usuario ya salió de la vista
        instancia = await window.VdkEdgeWebchat.mount({
          ...webchat,
          mode: 'bubble',
          baseUrl: BASE,
          botId: BOT_ID,
        })
      } catch (e) {
        console.error('Chat de Botpress:', e)
      }
    }
    script.onerror = () => console.error('Chat de Botpress: no cargó webchat.js')
    document.body.appendChild(script)

    return () => {
      cancelado = true
      try { instancia?.unmount?.() } catch { /* si no existe, la limpieza de abajo basta */ }
      link.remove()
      script.remove()
      Array.from(document.body.children).forEach((el) => {
        if (!antes.has(el)) el.remove()
      })
    }
  }, [])

  return null
}

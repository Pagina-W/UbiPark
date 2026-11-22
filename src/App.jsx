import { Routes, Route, Navigate } from 'react-router-dom'

import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Toast from './components/Toast.jsx'
import RutaProtegida from './components/rutaProtegida.jsx'

import Inicio from './pages/Inicio.jsx'
import Acceso from './pages/Acceso.jsx'
import Lugar from './pages/Lugar.jsx'
import Propietario from './pages/Propietario.jsx'
import Cliente from './pages/Cliente.jsx'
import Administrador from './pages/Administrador.jsx'
import Validar from './pages/validar.jsx'

export default function App() {
  return (
    <>
      <Header />

      <Routes>
        {/* Públicas: las ve cualquiera */}
        <Route path="/" element={<Inicio />} />
        <Route path="/acceso" element={<Acceso />} />
        <Route path="/lugar/:id" element={<Lugar />} />

        {/* Protegidas por rol */}
        <Route
          path="/cliente"
          element={
            <RutaProtegida roles={['cliente']}>
              <Cliente />
            </RutaProtegida>
          }
        />

        <Route
          path="/propietario"
          element={
            <RutaProtegida roles={['propietario']}>
              <Propietario />
            </RutaProtegida>
          }
        />

        {/* El dueño llega aquí al escanear el QR del cliente.
            validar.jsx revisa la sesión por su cuenta, por eso no lleva RutaProtegida */}
        <Route path="/validar/:codigo" element={<Validar />} />

        {/* Apartado de administrador */}
        <Route
          path="/administrador"
          element={
            <RutaProtegida roles={['administrador']}>
              <Administrador />
            </RutaProtegida>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Footer />
      <Toast />
    </>
  )
}

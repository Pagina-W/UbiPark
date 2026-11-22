import { supabase } from '../lib/supabase.js'

// Función auxiliar para registrar o reutilizar estado, municipio y localidad
async function obtenerOCrearLocalidad(nombreEstado, nombreMunicipio, nombreLocalidad) {
  const estTexto = (nombreEstado || 'Hidalgo').trim()
  const munTexto = (nombreMunicipio || 'General').trim()
  const locTexto = (nombreLocalidad || 'Centro').trim()

  let { data: est } = await supabase
    .from('estado')
    .select('*')
    .ilike('nombreestado', estTexto)
    .maybeSingle()

  if (!est) {
    const { data: nuevoEst, error } = await supabase
      .from('estado')
      .insert([{ nombreestado: estTexto }])
      .select()
      .single()
    if (error) throw new Error('Error al guardar Estado: ' + error.message)
    est = nuevoEst
  }

  let { data: mun } = await supabase
    .from('municipio')
    .select('*')
    .ilike('nombremunicipio', munTexto)
    .eq('idestado', est.idestado)
    .maybeSingle()

  if (!mun) {
    const { data: nuevoMun, error } = await supabase
      .from('municipio')
      .insert([{ nombremunicipio: munTexto, idestado: est.idestado }])
      .select()
      .single()
    if (error) throw new Error('Error al guardar Municipio: ' + error.message)
    mun = nuevoMun
  }

  let { data: loc } = await supabase
    .from('localidad')
    .select('*')
    .ilike('nombrelocalidad', locTexto)
    .eq('idmunicipio', mun.idmunicipio)
    .maybeSingle()

  if (!loc) {
    const { data: nuevaLoc, error } = await supabase
      .from('localidad')
      .insert([{ nombrelocalidad: locTexto, idmunicipio: mun.idmunicipio }])
      .select()
      .single()
    if (error) throw new Error('Error al guardar Localidad: ' + error.message)
    loc = nuevaLoc
  }

  return loc.idlocalidad
}

export async function crearEstacionamiento(datos) {
  // Una cuenta solo crea su primer estacionamiento; después se edita el mismo
  const { data: yaTiene, error: errDup } = await supabase
    .from('estacionamientos')
    .select('idestacionamiento')
    .eq('idusuario', datos.idusuario)
    .limit(1)

  if (errDup) throw new Error('No se pudo verificar el estacionamiento: ' + errDup.message)
  if (yaTiene?.length) {
    throw new Error('Ya tienes un estacionamiento. Usa "Actualizar datos" para editarlo.')
  }

  // Genera o busca el idlocalidad relacional
  const idlocalidad = await obtenerOCrearLocalidad(
    datos.estado,
    datos.municipio,
    datos.localidad
  )

  // Convierte el arreglo de moto, sedan, etc. a texto
  const vehiculosTexto = Array.isArray(datos.tipos) ? datos.tipos.join(', ') : datos.tipos

  const fila = {
    nombreestacionamiento: datos.nombre,
    idusuario: datos.idusuario,
    idlocalidad: idlocalidad,
    direcciontexto: datos.direccion,
    latitud: datos.latitud || null,
    longitud: datos.longitud || null,
    precioporhora: datos.precioporhora,
    capacidadtotal: datos.capacidadtotal,
    horaapertura: datos.horaapertura || null,
    horacierre: datos.horacierre || null,
    vehiculospermitidos: vehiculosTexto,
    activo: true,
    imagen: datos.imagen || null,
  }

  // Campos extra (requieren las columnas nuevas de la tabla estacionamientos)
  const extras = {
    caracteristicas: datos.caracteristicas || null,
    reglamento: datos.reglamento || null,
    largo_max: datos.largo_max || null,
    ancho_max: datos.ancho_max || null,
    altura_max: datos.altura_max || null,
  }

  let { data, error } = await supabase
    .from('estacionamientos')
    .insert([{ ...fila, ...extras }])
    .select()

  // Si todavía no corriste el ALTER TABLE, publica sin los campos extra en vez de fallar
  if (error && /column|schema cache|PGRST204/i.test((error.message || '') + (error.code || ''))) {
    console.warn('[UbiPark] Faltan columnas en estacionamientos (caracteristicas, reglamento, largo_max, ancho_max, altura_max). Se publicó sin ellas; corre el ALTER TABLE para guardarlas.')
    ;({ data, error } = await supabase.from('estacionamientos').insert([fila]).select())
  }

  if (error) {
    console.error('Error al crear el estacionamiento:', error.message)
    throw new Error('No se pudo publicar el estacionamiento.')
  }

  return data
}

export async function obtenerEstacionamientosPorPropietario(idusuario) {
  const { data, error } = await supabase
    .from('estacionamientos')
    .select('*')
    .eq('idusuario', idusuario)
    .order('idestacionamiento', { ascending: false })

  if (error) throw new Error('No se pudieron cargar tus estacionamientos.')
  return data
}

export async function cambiarEstadoEstacionamiento(idestacionamiento, estadoActivo) {
  const { data, error } = await supabase
    .from('estacionamientos')
    .update({ activo: estadoActivo })
    .eq('idestacionamiento', idestacionamiento)
    .select()

  if (error) throw new Error('No se pudo actualizar el estado.')
  return data
}

export async function eliminarEstacionamiento(idestacionamiento) {
  const { error } = await supabase
    .from('estacionamientos')
    .delete()
    .eq('idestacionamiento', idestacionamiento)

  if (error) throw new Error('No se pudo eliminar el estacionamiento.')
}

// Editar campos puntuales de un estacionamiento existente
export async function actualizarEstacionamiento(idestacionamiento, cambios) {
  const { data, error } = await supabase
    .from('estacionamientos')
    .update(cambios)
    .eq('idestacionamiento', idestacionamiento)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/* Estado / municipio / localidad de un estacionamiento (para prellenar el formulario) */
export async function obtenerUbicacion(idlocalidad) {
  if (!idlocalidad) return null
  const { data: loc } = await supabase
    .from('localidad').select('nombrelocalidad, idmunicipio').eq('idlocalidad', idlocalidad).maybeSingle()
  if (!loc) return null
  const { data: mun } = await supabase
    .from('municipio').select('nombremunicipio, idestado').eq('idmunicipio', loc.idmunicipio).maybeSingle()
  const { data: est } = mun
    ? await supabase.from('estado').select('nombreestado').eq('idestado', mun.idestado).maybeSingle()
    : { data: null }
  return {
    estado: est?.nombreestado || '',
    municipio: mun?.nombremunicipio || '',
    localidad: loc.nombrelocalidad || '',
  }
}

/* Actualiza el MISMO estacionamiento con todos los datos del formulario */
export async function actualizarDatosEstacionamiento(idestacionamiento, datos) {
  const cambios = {
    nombreestacionamiento: datos.nombre,
    direcciontexto: datos.direccion,
    latitud: datos.latitud || null,
    longitud: datos.longitud || null,
    precioporhora: datos.precioporhora,
    capacidadtotal: datos.capacidadtotal,
    horaapertura: datos.horaapertura || null,
    horacierre: datos.horacierre || null,
    vehiculospermitidos: Array.isArray(datos.tipos) ? datos.tipos.join(', ') : datos.tipos,
  }
  if (datos.estado && datos.municipio && datos.localidad) {
    cambios.idlocalidad = await obtenerOCrearLocalidad(datos.estado, datos.municipio, datos.localidad)
  }
  if (datos.imagen) cambios.imagen = datos.imagen   // solo si subió foto nueva

  const extras = {
    caracteristicas: datos.caracteristicas || null,
    reglamento: datos.reglamento || null,
    largo_max: datos.largo_max || null,
    ancho_max: datos.ancho_max || null,
    altura_max: datos.altura_max || null,
  }

  let { error } = await supabase
    .from('estacionamientos').update({ ...cambios, ...extras }).eq('idestacionamiento', idestacionamiento)

  if (error && /column|schema cache|PGRST204/i.test((error.message || '') + (error.code || ''))) {
    ;({ error } = await supabase.from('estacionamientos').update(cambios).eq('idestacionamiento', idestacionamiento))
  }
  if (error) throw new Error('No se pudo actualizar: ' + error.message)
}

// Consultar reservas en Supabase con nombre y correo del cliente
export async function obtenerReservasPropietario(idsEstacionamientos) {
  if (!idsEstacionamientos.length) return []

  const { data, error } = await supabase
    .from('reservas')
    .select(`
      *,
      usuarios (
        nombre,
        apellidos,
        credenciales ( correo, telefono )
      ),
      estacionamientos ( nombreestacionamiento )
    `)
    .in('idestacionamiento', idsEstacionamientos)

  if (error) return null
  return data || []
}

/* =====================================================================
   Panel del propietario: ocupación, reservas y salida
   ===================================================================== */

/* { [idestacionamiento]: { capacidad, dentro, por_llegar, disponibles, lleno } } */
export async function ocupacionDe(ids) {
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from('ocupacion_estacionamiento')
    .select('*')
    .in('idestacionamiento', ids)
  if (error) throw new Error(error.message)
  return Object.fromEntries((data || []).map((o) => [o.idestacionamiento, o]))
}

/* Reservas (solo de los estacionamientos que le pases) con cliente y vehículo */
export async function reservasDe(ids) {
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('reservas')
    .select(`
      idreserva, idestacionamiento, fechaentrada, fechasalida, montototal,
      metodo_pago, estado_pago, estadoreserva, qr_usado, qr_usado_en, salida_real,
      estacionamientos ( nombreestacionamiento ),
      usuarios ( nombre, apellidos ),
      vehiculos ( placa, descripcion )
    `)
    .in('idestacionamiento', ids)
    .order('fechaentrada', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return data || []
}

/* Libera el espacio: llama a la función SQL registrar_salida */
export async function registrarSalida(idreserva, idOwner) {
  const { data, error } = await supabase.rpc('registrar_salida', {
    p_idreserva: idreserva,
    p_idpropietario: idOwner,
  })
  if (error) throw new Error(error.message)
  if (data !== 'ok') throw new Error('No se pudo registrar la salida (' + data + ')')
}
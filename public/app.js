// app.js - Frontend Distrito Padel v7.2 - Validación servidor + Rangos de hora
const API_BASE = '';

let state = {
  token: localStorage.getItem('session_token') || '',
  email: localStorage.getItem('user_email') || '',
  nombre: localStorage.getItem('user_nombre') || '',
  selectedDate: '',
  selectedCourt: '',
  selectedTime: '',
  selectedDuration: 1,
  reservas: [],
  promociones: [],
  bloqueos: [],
  config: { precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 } },
  serverTime: null // Hora del servidor
};

// INICIALIZAR
document.addEventListener('DOMContentLoaded', () => {
  cargarConfig();
  cargarHoraServidor();
  if (state.token) {
    mostrarDashboard();
  } else {
    mostrarAuth();
  }
});

// CARGAR HORA DEL SERVIDOR
async function cargarHoraServidor() {
  try {
    const res = await fetch(API_BASE + '/api/server-time');
    state.serverTime = await res.json();
  } catch (err) {
    console.error('Error al obtener hora del servidor:', err);
  }
}

// CARGAR CONFIG
async function cargarConfig() {
  try {
    const res = await fetch(API_BASE + '/api/config');
    state.config = await res.json();
  } catch (err) {
    console.error('Error config:', err);
  }
}

// MOSTRAR AUTH
function mostrarAuth() {
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('dashboardSection').classList.add('hidden');
}

// MOSTRAR DASHBOARD
async function mostrarDashboard() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');
  document.getElementById('userNombre').textContent = state.nombre;
  
  // Esperar a que se cargue la hora del servidor
  if (!state.serverTime) {
    await cargarHoraServidor();
  }
  
  const todayStr = state.serverTime.fecha;
  
  const serverDate = new Date(state.serverTime.timestamp);
  const maxDate = new Date(serverDate);
  maxDate.setDate(serverDate.getDate() + 7);
  const maxYear = maxDate.getFullYear();
  const maxMonth = String(maxDate.getMonth() + 1).padStart(2, '0');
  const maxDay = String(maxDate.getDate()).padStart(2, '0');
  const maxDateStr = `${maxYear}-${maxMonth}-${maxDay}`;
  
  const dateInput = document.getElementById('fechaReserva');
  dateInput.min = todayStr;
  dateInput.max = maxDateStr;
  dateInput.value = todayStr;
  state.selectedDate = todayStr;
  
  dateInput.addEventListener('change', async function() {
    // Revalidar con el servidor
    await cargarHoraServidor();
    const serverToday = state.serverTime.fecha;
    const selectedValue = this.value;
    
    if (selectedValue < serverToday) {
      alert('No puedes reservar en fechas pasadas');
      this.value = serverToday;
      state.selectedDate = serverToday;
      return;
    }
    
    if (selectedValue > maxDateStr) {
      alert('Solo puedes reservar hasta 7 dias adelante');
      this.value = maxDateStr;
      state.selectedDate = maxDateStr;
      return;
    }
    
    state.selectedDate = selectedValue;
    
    if (state.selectedCourt) {
      cargarDisponibilidad();
    }
  });
  
  cargarPromociones();
  cargarBloqueos();
}

// REGISTRO
async function registrar() {
  const nombre = document.getElementById('regNombre').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const telefono = document.getElementById('regTelefono').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!nombre || !email || !telefono || !password) {
    alert('Completa todos los campos');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, telefono, password })
    });

    const data = await res.json();

    if (data.ok) {
      state.token = data.token;
      state.email = data.email;
      state.nombre = data.nombre;
      localStorage.setItem('session_token', data.token);
      localStorage.setItem('user_email', data.email);
      localStorage.setItem('user_nombre', data.nombre);
      mostrarDashboard();
      alert('Registro exitoso');
    } else {
      alert(data.msg || 'Error al registrar');
    }
  } catch (err) {
    alert('Error de conexion');
  }
}

// LOGIN
async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    alert('Completa todos los campos');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.ok) {
      state.token = data.token;
      state.email = data.email;
      state.nombre = data.nombre;
      localStorage.setItem('session_token', data.token);
      localStorage.setItem('user_email', data.email);
      localStorage.setItem('user_nombre', data.nombre);
      mostrarDashboard();
    } else {
      alert(data.msg || 'Credenciales invalidas');
    }
  } catch (err) {
    alert('Error de conexion');
  }
}

// LOGOUT
function logout() {
  state.token = '';
  state.email = '';
  state.nombre = '';
  localStorage.removeItem('session_token');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_nombre');
  mostrarAuth();
}

// CARGAR PROMOCIONES
async function cargarPromociones() {
  try {
    const res = await fetch(API_BASE + '/api/promociones');
    state.promociones = await res.json();
  } catch (err) {
    console.error('Error promociones:', err);
  }
}

// CARGAR BLOQUEOS
async function cargarBloqueos() {
  try {
    const res = await fetch(API_BASE + '/api/bloqueos');
    state.bloqueos = await res.json();
  } catch (err) {
    console.error('Error bloqueos:', err);
  }
}

// SELECCIONAR CANCHA
function seleccionarCancha(cancha) {
  state.selectedCourt = cancha;
  document.querySelectorAll('.cancha-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  event.target.classList.add('selected');
  cargarDisponibilidad();
}

// CARGAR DISPONIBILIDAD
async function cargarDisponibilidad() {
  const fecha = document.getElementById('fechaReserva').value;
  const cancha = state.selectedCourt;

  if (!fecha || !cancha) return;
  
  // Revalidar hora del servidor antes de cargar
  await cargarHoraServidor();

  state.selectedDate = fecha;

  try {
    const res = await fetch(API_BASE + `/api/disponibilidad?fecha=${fecha}&cancha=${cancha}`);
    const data = await res.json();
    
    state.reservas = data.reservas || [];
    state.bloqueos = data.bloqueos || [];
    
    renderizarHorarios();
  } catch (err) {
    console.error('Error disponibilidad:', err);
  }
}

// RENDERIZAR HORARIOS - Validación con servidor
function renderizarHorarios() {
  const container = document.getElementById('horariosDisponibles');
  container.innerHTML = '';

  if (!state.serverTime) {
    container.innerHTML = '<p class="text-center text-gray-500 py-4">Cargando...</p>';
    return;
  }

  const hoyStr = state.serverTime.fecha;
  const horaServidor = state.serverTime.hora;
  const minutosServidor = state.serverTime.minutos;

  for (let h = 8; h <= 23; h++) {
    for (let minutos = 0; minutos < 60; minutos += 30) {
      const horaActual = h + (minutos / 60);
      const hora = `${h.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
      
      // Verificar si la hora ya pasó (usando hora del servidor)
      let pasado = false;
      if (state.selectedDate < hoyStr) {
        pasado = true;
      } else if (state.selectedDate === hoyStr) {
        const horaActualServidor = horaServidor + (minutosServidor / 60);
        if (horaActual <= horaActualServidor) {
          pasado = true;
        }
      }

      // Verificar si TODAS las duraciones están bloqueadas/ocupadas
      const slotInicioMin = h * 60 + minutos;
      const todasOcupadas = [1, 1.5, 2].every(dur => {
        const duracionMin = dur * 60;
        const slotFinMin = slotInicioMin + duracionMin;
        const horaFinH = Math.floor(slotFinMin / 60);
        const horaFinM = slotFinMin % 60;
        
        if (horaFinH > 24 || (horaFinH === 24 && horaFinM > 0)) return true;
        
        const ocupado = state.reservas.some(r => {
          const horaArr = r.hora_inicio.split(':');
          const inicioMin = parseInt(horaArr[0]) * 60 + parseInt(horaArr[1] || 0);
          const finMin = inicioMin + (parseFloat(r.duracion) * 60);
          return (slotInicioMin < finMin && slotFinMin > inicioMin);
        });
        
        const bloqueado = state.bloqueos.some(b => {
          if (!b.hora_inicio || !b.hora_fin) return true;
          const bloqArr1 = b.hora_inicio.split(':');
          const bloqArr2 = b.hora_fin.split(':');
          const bloqInicioMin = parseInt(bloqArr1[0]) * 60 + parseInt(bloqArr1[1] || 0);
          const bloqFinMin = parseInt(bloqArr2[0]) * 60 + parseInt(bloqArr2[1] || 0);
          return (slotInicioMin < bloqFinMin && slotFinMin > bloqInicioMin);
        });
        
        return ocupado || bloqueado;
      });

      const div = document.createElement('div');
      div.className = `p-3 rounded-lg border-2 cursor-pointer transition text-center ${
        pasado ? 'bg-gray-200 cursor-not-allowed opacity-50' :
        todasOcupadas ? 'bg-red-100 border-red-300 cursor-not-allowed opacity-50' :
        'bg-primary-lighter border-primary hover:shadow-md hover:border-primary-light'
      }`;

      if (!pasado && !todasOcupadas) {
        div.onclick = () => mostrarModalDuraciones(hora);
      }

      div.innerHTML = `
        <p class="font-bold text-base text-gray-800">${convertirA12h(hora)}</p>
        ${pasado ? '<p class="text-xs text-gray-500 mt-1">Pasado</p>' : 
          todasOcupadas ? '<p class="text-xs text-red-600 mt-1">Ocupado</p>' : 
          '<p class="text-xs text-primary mt-1">Disponible</p>'}
      `;

      container.appendChild(div);
    }
  }
}

// CALCULAR HORA FIN
function calcularHoraFin(horaInicio, duracion) {
  const [h, m] = horaInicio.split(':').map(Number);
  const minutosTotal = (h * 60 + m) + (duracion * 60);
  const horaFin = Math.floor(minutosTotal / 60);
  const minutosFin = minutosTotal % 60;
  return `${horaFin.toString().padStart(2, '0')}:${minutosFin.toString().padStart(2, '0')}`;
}

// MOSTRAR MODAL DE DURACIONES
function mostrarModalDuraciones(hora) {
  state.selectedTime = hora;
  const [h, m] = hora.split(':').map(Number);
  const slotInicioMin = h * 60 + m;
  
  const duraciones = [1, 1.5, 2];
  let opcionesHTML = '';
  
  duraciones.forEach(duracion => {
    const duracionMin = duracion * 60;
    const slotFinMin = slotInicioMin + duracionMin;
    const horaFinH = Math.floor(slotFinMin / 60);
    const horaFinM = slotFinMin % 60;
    
    if (horaFinH > 24 || (horaFinH === 24 && horaFinM > 0)) {
      return;
    }
    
    const ocupado = state.reservas.some(r => {
      const horaArr = r.hora_inicio.split(':');
      const inicioMin = parseInt(horaArr[0]) * 60 + parseInt(horaArr[1] || 0);
      const finMin = inicioMin + (parseFloat(r.duracion) * 60);
      return (slotInicioMin < finMin && slotFinMin > inicioMin);
    });
    
    const bloqueado = state.bloqueos.some(b => {
      if (!b.hora_inicio || !b.hora_fin) return true;
      const bloqArr1 = b.hora_inicio.split(':');
      const bloqArr2 = b.hora_fin.split(':');
      const bloqInicioMin = parseInt(bloqArr1[0]) * 60 + parseInt(bloqArr1[1] || 0);
      const bloqFinMin = parseInt(bloqArr2[0]) * 60 + parseInt(bloqArr2[1] || 0);
      return (slotInicioMin < bloqFinMin && slotFinMin > bloqInicioMin);
    });
    
    if (ocupado || bloqueado) {
      return;
    }
    
    // Calcular precio
    const horaActual = h + (m / 60);
    let precioBase = 0;
    let horasRestantes = duracion;
    let horaCalculo = horaActual;
    
    while (horasRestantes > 0) {
      const precioHora = horaCalculo < state.config.precios.cambioTarifa ? 
        state.config.precios.horaDia : 
        state.config.precios.horaNoche;
      
      const horasEnEsteTarifa = Math.min(horasRestantes, 
        horaCalculo < state.config.precios.cambioTarifa ? 
          state.config.precios.cambioTarifa - horaCalculo : 
          24 - horaCalculo
      );
      
      precioBase += precioHora * horasEnEsteTarifa;
      horasRestantes -= horasEnEsteTarifa;
      horaCalculo += horasEnEsteTarifa;
    }
    
    // Verificar promoción
    let descuento = 0;
    const promo = state.promociones.find(p => {
      if (!p.activa) return false;
      
      if (p.fecha) {
        const promoFecha = p.fecha.split('T')[0];
        if (promoFecha !== state.selectedDate) return false;
      }
      
      if (!p.hora_inicio || !p.hora_fin) return true;
      
      const promoArr1 = p.hora_inicio.split(':');
      const promoArr2 = p.hora_fin.split(':');
      const promoInicioMin = parseInt(promoArr1[0]) * 60 + parseInt(promoArr1[1] || 0);
      const promoFinMin = parseInt(promoArr2[0]) * 60 + parseInt(promoArr2[1] || 0);
      
      return slotInicioMin >= promoInicioMin && slotInicioMin < promoFinMin;
    });
    
    if (promo) {
      descuento = promo.descuento;
    }
    
    const precioFinal = Math.round(precioBase * (1 - descuento / 100));
    const duracionTexto = duracion === 1 ? '1h 00min' : duracion === 1.5 ? '1h 30min' : '2h 00min';
    
    // Calcular hora fin
    const horaFin = calcularHoraFin(hora, duracion);
    
    opcionesHTML += `
      <button onclick="seleccionarDuracion(${duracion}, ${precioFinal}, ${descuento}, ${precioBase}, '${horaFin}')" 
        class="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-primary hover:bg-primary-lighter transition text-left mb-3">
        <div class="flex justify-between items-center">
          <div>
            <p class="font-bold text-gray-800">${duracionTexto}</p>
            <p class="text-xs text-gray-600">${convertirA12h(hora)} - ${convertirA12h(horaFin)}</p>
            ${descuento > 0 ? `<p class="text-xs text-purple-600 font-bold">${descuento}% OFF</p>` : ''}
          </div>
          <div class="text-right">
            <p class="font-bold text-lg text-primary">$${precioFinal}</p>
            ${descuento > 0 ? `<p class="text-xs text-gray-500 line-through">$${Math.round(precioBase)}</p>` : ''}
          </div>
        </div>
      </button>
    `;
  });
  
  if (opcionesHTML === '') {
    opcionesHTML = '<p class="text-center text-gray-500 py-4">No hay duraciones disponibles para este horario</p>';
  }
  
  document.getElementById('duracionModalTitulo').textContent = `Selecciona duracion - ${convertirA12h(hora)}`;
  document.getElementById('duracionModalOpciones').innerHTML = opcionesHTML;
  document.getElementById('duracionModal').classList.remove('hidden');
}

// SELECCIONAR DURACIÓN
function seleccionarDuracion(duracion, precioFinal, descuento, precioBase, horaFin) {
  state.selectedDuration = duracion;
  cerrarModalDuracion();
  
  const duracionTexto = duracion === 1 ? '1 hora' : duracion === 1.5 ? '1.5 horas' : '2 horas';
  
  document.getElementById('confirmacionDetalle').innerHTML = `
    <p class="text-lg"><strong>Cancha:</strong> ${state.selectedCourt}</p>
    <p class="text-lg"><strong>Fecha:</strong> ${formatearFecha(state.selectedDate)}</p>
    <p class="text-lg"><strong>Hora:</strong> ${convertirA12h(state.selectedTime)} - ${convertirA12h(horaFin)}</p>
    <p class="text-lg"><strong>Duracion:</strong> ${duracionTexto}</p>
    ${descuento > 0 ? `
      <p class="text-lg text-purple-600 font-bold"><strong>Descuento:</strong> ${descuento}%</p>
      <p class="text-lg text-gray-500 line-through">Precio: $${Math.round(precioBase)} MXN</p>
    ` : ''}
    <p class="text-2xl font-bold text-primary mt-2">Total: $${precioFinal} MXN</p>
  `;
  
  document.getElementById('confirmacionModal').classList.remove('hidden');
}

function cerrarModalDuracion() {
  document.getElementById('duracionModal').classList.add('hidden');
}

// CONFIRMAR RESERVA (con validación de servidor)
async function confirmarReserva() {
  // Revalidar con el servidor antes de confirmar
  await cargarHoraServidor();
  
  const [h, m] = state.selectedTime.split(':').map(Number);
  const horaReserva = h + (m / 60);
  const horaActualServidor = state.serverTime.hora + (state.serverTime.minutos / 60);
  
  // Verificar si la hora ya pasó
  if (state.selectedDate === state.serverTime.fecha && horaReserva <= horaActualServidor) {
    alert('Esta hora ya paso. Por favor selecciona otro horario.');
    cerrarModal();
    cargarDisponibilidad();
    return;
  }
  
  // Verificar si la fecha es pasada
  if (state.selectedDate < state.serverTime.fecha) {
    alert('Esta fecha ya paso. Por favor selecciona otra fecha.');
    cerrarModal();
    return;
  }
  
  try {
    const res = await fetch(API_BASE + '/api/reservas/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: state.token,
        fecha: state.selectedDate,
        hora: state.selectedTime,
        duracion: state.selectedDuration,
        cancha: state.selectedCourt
      })
    });

    const data = await res.json();

    if (data.ok) {
      alert('Reserva creada exitosamente');
      cerrarModal();
      cargarDisponibilidad();
    } else {
      alert(data.msg || 'Error al crear reserva');
    }
  } catch (err) {
    alert('Error de conexion');
  }
}

// FORMATEAR FECHA (YYYY-MM-DD a DD/MM/YYYY)
function formatearFecha(fechaStr) {
  const [year, month, day] = fechaStr.split('-');
  return `${day}/${month}/${year}`;
}

// VER MIS RESERVAS (con formato mejorado)
async function verMisReservas() {
  try {
    const res = await fetch(API_BASE + '/api/mis-reservas', {
      headers: { 'x-token': state.token }
    });

    const reservas = await res.json();
    const container = document.getElementById('misReservasList');
    container.innerHTML = '';

    if (reservas.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500 py-8">No tienes reservas activas</p>';
    } else {
      reservas.forEach(r => {
        const div = document.createElement('div');
        div.className = 'bg-primary-lighter rounded-xl p-6 mb-4 border-2 border-primary';
        
        // Formatear fecha
        const fechaFormateada = r.fecha.includes('T') ? 
          formatearFecha(r.fecha.split('T')[0]) : 
          formatearFecha(r.fecha);
        
        // Calcular hora fin
        const horaFin = calcularHoraFin(r.hora_inicio, r.duracion);
        
        div.innerHTML = `
          <div class="flex justify-between items-start mb-3">
            <div>
              <p class="text-xl font-bold text-primary">Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600 mt-1">${fechaFormateada}</p>
              <p class="text-sm text-gray-600">${convertirA12h(r.hora_inicio)} - ${convertirA12h(horaFin)} (${r.duracion}h)</p>
            </div>
            <button onclick="cancelarReserva('${r.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">
              Cancelar
            </button>
          </div>
          <div class="bg-white rounded-lg p-4">
            <p class="text-2xl font-bold text-primary">$${r.precio} MXN</p>
            <p class="text-sm mt-2 ${r.pagado ? 'text-green-600' : 'text-yellow-600'} font-bold">
              ${r.pagado ? 'Pagado' : 'Pendiente de pago'}
            </p>
          </div>
        `;
        container.appendChild(div);
      });
    }

    document.getElementById('misReservasModal').classList.remove('hidden');
  } catch (err) {
    alert('Error al cargar reservas');
  }
}

// CANCELAR RESERVA
async function cancelarReserva(id) {
  if (!confirm('Seguro que deseas cancelar esta reserva?')) return;

  try {
    const res = await fetch(API_BASE + '/api/reservas/' + id, {
      method: 'DELETE',
      headers: { 'x-token': state.token }
    });

    const data = await res.json();

    if (data.ok) {
      alert('Reserva cancelada');
      verMisReservas();
    } else {
      alert('Error al cancelar');
    }
  } catch (err) {
    alert('Error de conexion');
  }
}

// UTILIDADES
function convertirA12h(hora24) {
  const [h, m] = hora24.split(':');
  const hora = parseInt(h);
  const ampm = hora >= 12 ? 'PM' : 'AM';
  const hora12 = hora % 12 || 12;
  return `${hora12}:${m} ${ampm}`;
}

function cerrarModal() {
  document.getElementById('confirmacionModal').classList.add('hidden');
}

function cerrarMisReservas() {
  document.getElementById('misReservasModal').classList.add('hidden');
}

// EVENT LISTENERS
document.getElementById('fechaReserva')?.addEventListener('change', () => {
  if (state.selectedCourt) {
    cargarDisponibilidad();
  }
});

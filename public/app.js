// app.js - Frontend Distrito Padel v7.3 - Playtomic Style + Badges Colores + QR
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
  serverTime: null
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
      alert('Solo puedes reservar hasta 7 días adelante');
      this.value = maxDateStr;
      state.selectedDate = maxDateStr;
      return;
    }
    
    state.selectedDate = selectedValue;
    if (state.selectedCourt) {
      cargarDisponibilidad();
    }
  });
  
  await Promise.all([cargarPromociones(), cargarBloqueos()]);
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
    alert('Error de conexión');
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
      alert(data.msg || 'Credenciales inválidas');
    }
  } catch (err) {
    alert('Error de conexión');
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

// CARGAR DISPONIBILIDAD - Playtomic Style
async function cargarDisponibilidad() {
  const fecha = document.getElementById('fechaReserva').value;
  const cancha = state.selectedCourt;

  if (!fecha || !cancha) return;
  
  await cargarHoraServidor();
  state.selectedDate = fecha;

  try {
    const res = await fetch(API_BASE + `/api/disponibilidad?fecha=${fecha}&cancha=${cancha}`);
    const data = await res.json();
    
    state.reservas = data.reservas || [];
    state.bloqueos = data.bloqueos || [];
    
    renderizarHorariosPlaytomic();
  } catch (err) {
    console.error('Error disponibilidad:', err);
  }
}

// RENDERIZAR HORARIOS - Playtomic Style con Badges Colores
function renderizarHorariosPlaytomic() {
  const container = document.getElementById('horariosDisponibles');
  container.innerHTML = '';

  if (!state.serverTime) {
    container.innerHTML = '<p class="text-center text-gray-500 py-4">Cargando horarios...</p>';
    return;
  }

  const hoyStr = state.serverTime.fecha;
  const horaServidor = state.serverTime.hora;
  const minutosServidor = state.serverTime.minutos;

  // Grid estilo Playtomic 8:00 - 23:00 cada 30min
  for (let h = 8; h <= 23; h++) {
    for (let minutos = 0; minutos < 60; minutos += 30) {
      const hora = `${h.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
      const slotInicioMin = h * 60 + minutos;
      
      // Verificar si ya pasó
      let esPasado = false;
      if (state.selectedDate < hoyStr || 
          (state.selectedDate === hoyStr && slotInicioMin <= (horaServidor * 60 + minutosServidor))) {
        esPasado = true;
      }

      // Verificar disponibilidad para 1h (badge principal)
      const disponible1h = verificarSlotDisponible(slotInicioMin, 60);
      
      // Detectar promociones para este slot
      const promoActiva = state.promociones.find(p => {
        if (!p.activa || p.fecha !== state.selectedDate) return false;
        if (!p.hora_inicio) return true;
        const [pH, pM] = p.hora_inicio.split(':').map(Number);
        const promoInicioMin = pH * 60 + pM;
        const [pHf, pMf] = p.hora_fin.split(':').map(Number);
        const promoFinMin = pHf * 60 + pMf;
        return slotInicioMin >= promoInicioMin && slotInicioMin < promoFinMin;
      });

      // Badge colores Playtomic
      let badgeClass = 'bg-gray-200 text-gray-600 cursor-not-allowed';
      let badgeText = 'Pasado';
      
      if (!esPasado) {
        if (!disponible1h.disponible) {
          badgeClass = 'bg-red-100 border-red-400 text-red-800';
          badgeText = 'Ocupado';
        } else if (promoActiva) {
          badgeClass = 'bg-yellow-100 border-yellow-400 text-yellow-800 font-bold';
          badgeText = `${promoActiva.descuento}% OFF`;
        } else {
          badgeClass = 'bg-green-100 border-green-400 text-green-800 hover:shadow-lg hover:scale-105';
          badgeText = 'Disponible';
        }
      }

      const div = document.createElement('div');
      div.className = `w-24 h-20 p-2 rounded-xl border-2 ${badgeClass} flex flex-col items-center justify-center cursor-pointer transition-all m-1 shadow-sm hover:shadow-md`;
      
      if (!esPasado && disponible1h.disponible) {
        div.onclick = () => mostrarModalDuraciones(hora);
      }

      div.innerHTML = `
        <div class="text-lg font-bold">${convertirA12h(hora)}</div>
        <div class="text-sm mt-1">${badgeIcon} ${badgeText}</div>
        ${promoActiva && !esPasado ? `<div class="text-xs mt-1 bg-yellow-200 px-1 rounded">Promo</div>` : ''}
      `;

      container.appendChild(div);
    }
  }
}

// VERIFICAR SLOT DISPONIBLE (helper)
function verificarSlotDisponible(inicioMin, duracionMin) {
  const finMin = inicioMin + duracionMin;
  
  const ocupado = state.reservas.some(r => {
    const [rh, rm] = r.hora_inicio.split(':').map(Number);
    const rInicioMin = rh * 60 + rm;
    const rFinMin = rInicioMin + (parseFloat(r.duracion) * 60);
    return inicioMin < rFinMin && finMin > rInicioMin;
  });
  
  const bloqueado = state.bloqueos.some(b => {
    if (!b.hora_inicio || !b.hora_fin) return true;
    const [bh, bm] = b.hora_inicio.split(':').map(Number);
    const bInicioMin = bh * 60 + bm;
    const [bhf, bmf] = b.hora_fin.split(':').map(Number);
    const bFinMin = bhf * 60 + bmf;
    return inicioMin < bFinMin && finMin > bInicioMin;
  });
  
  return { disponible: !ocupado && !bloqueado };
}

// CALCULAR HORA FIN
function calcularHoraFin(horaInicio, duracion) {
  const [h, m] = horaInicio.split(':').map(Number);
  const minutosTotal = (h * 60 + m) + (duracion * 60);
  const horaFin = Math.floor(minutosTotal / 60);
  const minutosFin = minutosTotal % 60;
  return `${horaFin.toString().padStart(2, '0')}:${minutosFin.toString().padStart(2, '0')}`;
}

// MOSTRAR MODAL DURACIONES - Playtomic Style
function mostrarModalDuraciones(hora) {
  state.selectedTime = hora;
  const [h, m] = hora.split(':').map(Number);
  const slotInicioMin = h * 60 + m;
  
  const duraciones = [1, 1.5, 2];
  let opcionesHTML = '';
  
  duraciones.forEach(duracion => {
    const duracionMin = duracion * 60;
    const slotFinMin = slotInicioMin + duracionMin;
    const disponible = verificarSlotDisponible(slotInicioMin, duracionMin);
    
    if (!disponible.disponible) return;
    
    // Calcular precio preciso
    const precioData = calcularPrecioPreciso(hora, duracion);
    
    const duracionTexto = duracion === 1 ? '1h' : duracion === 1.5 ? '1h 30m' : '2h';
    const horaFin = calcularHoraFin(hora, duracion);
    
    opcionesHTML += `
      <button onclick="seleccionarDuracion(${duracion}, ${precioData.precioFinal}, ${precioData.descuento}, ${precioData.precioBase}, '${horaFin}')" 
        class="w-full p-4 border-2 rounded-xl hover:border-green-400 hover:shadow-lg transition-all text-left mb-3 ${precioData.descuento > 0 ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-white'}">
        <div class="flex justify-between items-center">
          <div>
            <p class="font-bold text-lg">${duracionTexto}</p>
            <p class="text-sm text-gray-600">${convertirA12h(hora)} - ${convertirA12h(horaFin)}</p>
            ${precioData.descuento > 0 ? `<p class="text-sm font-bold text-yellow-700 mt-1">${precioData.descuento}% OFF</p>` : ''}
          </div>
          <div class="text-right">
            <p class="text-2xl font-bold text-green-600">$${precioData.precioFinal}</p>
            ${precioData.descuento > 0 ? `<p class="text-sm text-gray-500 line-through">$${Math.round(precioData.precioBase)}</p>` : ''}
          </div>
        </div>
      </button>
    `;
  });
  
  if (opcionesHTML === '') {
    opcionesHTML = '<p class="text-center text-gray-500 py-8">No hay duraciones disponibles</p>';
  }
  
  document.getElementById('duracionModalTitulo').textContent = `${convertirA12h(hora)} - Selecciona duración`;
  document.getElementById('duracionModalOpciones').innerHTML = opcionesHTML;
  document.getElementById('duracionModal').classList.remove('hidden');
}

// CALCULAR PRECIO PRECISO
function calcularPrecioPreciso(horaInicio, duracion) {
  const [h, m] = horaInicio.split(':').map(Number);
  const horaDecimal = h + (m / 60);
  const cambioTarifa = state.config.precios.cambioTarifa;
  
  let precioBase = 0;
  let horaActual = horaDecimal;
  let duracionRestante = duracion;
  
  while (duracionRestante > 0) {
    const precioHora = horaActual < cambioTarifa ? state.config.precios.horaDia : state.config.precios.horaNoche;
    const horasTarifa = Math.min(duracionRestante, Math.abs(cambioTarifa - horaActual));
    precioBase += precioHora * horasTarifa;
    duracionRestante -= horasTarifa;
    horaActual += horasTarifa;
  }
  
  // Aplicar promoción
  let descuento = 0;
  const promo = state.promociones.find(p => {
    if (!p.activa || p.fecha !== state.selectedDate) return false;
    if (!p.hora_inicio) return true;
    const promoInicioMin = parseInt(p.hora_inicio.split(':')[0]) * 60 + parseInt(p.hora_inicio.split(':')[1]);
    return (h * 60 + m) >= promoInicioMin;
  });
  
  if (promo) descuento = promo.descuento;
  
  const precioFinal = Math.round(precioBase * (1 - descuento / 100));
  
  return { precioBase, precioFinal, descuento };
}

// SELECCIONAR DURACIÓN
function seleccionarDuracion(duracion, precioFinal, descuento, precioBase, horaFin) {
  state.selectedDuration = duracion;
  cerrarModalDuracion();
  
  const duracionTexto = duracion === 1 ? '1 hora' : duracion === 1.5 ? '1h 30min' : '2 horas';
  
  document.getElementById('confirmacionDetalle').innerHTML = `
    <div class="space-y-3">
      <div class="flex justify-between">
        <span class="text-gray-700">Cancha</span>
        <span class="font-bold">Cancha ${state.selectedCourt}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-700">Fecha</span>
        <span class="font-bold">${formatearFecha(state.selectedDate)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-700">Horario</span>
        <span class="font-bold">${convertirA12h(state.selectedTime)} - ${convertirA12h(horaFin)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-700">Duración</span>
        <span class="font-bold">${duracionTexto}</span>
      </div>
      ${descuento > 0 ? `
        <div class="flex justify-between bg-yellow-50 p-3 rounded-lg">
          <span class="text-yellow-800 font-bold">Descuento</span>
          <span class="text-yellow-800 font-bold">${descuento}% OFF</span>
        </div>
        <div class="flex justify-between text-sm text-gray-500">
          <span>Precio original</span>
          <span class="line-through">$${Math.round(precioBase)}</span>
        </div>
      ` : ''}
      <div class="border-t pt-3">
        <div class="flex justify-between text-2xl font-bold text-green-600">
          <span>Total</span>
          <span>$${precioFinal}</span>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('confirmacionModal').classList.remove('hidden');
}

function cerrarModalDuracion() {
  document.getElementById('duracionModal').classList.add('hidden');
}

// CONFIRMAR RESERVA
async function confirmarReserva() {
  await cargarHoraServidor();
  
  const [h, m] = state.selectedTime.split(':').map(Number);
  const horaReserva = h + (m / 60);
  const horaActual = state.serverTime.hora + (state.serverTime.minutos / 60);
  
  if (state.selectedDate === state.serverTime.fecha && horaReserva <= horaActual) {
    alert('Esta hora ya pasó');
    return;
  }
  
  try {
    const res = await fetch(API_BASE + '/api/reservas/crear', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-token': state.token 
      },
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
      // Generar QR temporal
      generarQRReserva(data.reservaId);
      alert('Reserva confirmada exitosamente');
      cerrarModal();
      cargarDisponibilidad();
    } else {
      alert(data.msg || 'Error al crear reserva');
    }
  } catch (err) {
    alert('Error de conexión');
  }
}

// GENERAR QR RESERVA
function generarQRReserva(reservaId) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${window.location.origin}/reserva/${reservaId}`;
  const qrImg = document.createElement('img');
  qrImg.src = qrUrl;
  qrImg.className = 'mx-auto mb-4 rounded-lg shadow-lg';
  qrImg.alt = 'QR Reserva';
  
  const qrContainer = document.getElementById('qrContainer') || document.createElement('div');
  qrContainer.innerHTML = `
    <p class="text-center font-bold mb-2">Muestra este QR en recepción</p>
  `;
  qrContainer.appendChild(qrImg);
  document.querySelector('.modal-content').appendChild(qrContainer);
}

// UTILIDADES
function formatearFecha(fechaStr) {
  const [year, month, day] = fechaStr.split('-');
  return `${day}/${month}/${year}`;
}

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

// MIS RESERVAS
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
        div.className = 'bg-white rounded-xl p-6 mb-4 border shadow-sm';
        const horaFin = calcularHoraFin(r.hora_inicio, r.duracion);
        
        div.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <div>
              <p class="text-2xl font-bold text-green-600">Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600">${formatearFecha(r.fecha)}</p>
              <p class="text-lg font-semibold">${convertirA12h(r.hora_inicio)} - ${convertirA12h(horaFin)}</p>
            </div>
            ${!r.pagado ? `<span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-bold">Pendiente</span>` : ''}
          </div>
          <div class="flex justify-between items-center pt-4 border-t">
            <p class="text-2xl font-bold">$${r.precio}</p>
            <button onclick="cancelarReserva('${r.id}')" class="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              Cancelar
            </button>
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

async function cancelarReserva(id) {
  if (!confirm('¿Cancelar esta reserva?')) return;

  try {
    const res = await fetch(API_BASE + `/api/reservas/${id}`, {
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
    alert('Error de conexión');
  }
}

// EVENT LISTENERS
document.getElementById('fechaReserva')?.addEventListener('change', () => {
  if (state.selectedCourt) {
    cargarDisponibilidad();
  }
});

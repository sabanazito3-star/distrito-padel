// app.js - Frontend Distrito Padel v7.0 - Postgres Compatible
const API_BASE = '';

let state = {
  token: localStorage.getItem('session_token') || '',
  email: localStorage.getItem('user_email') || '',
  nombre: localStorage.getItem('user_nombre') || '',
  selectedDate: '',
  selectedCourt: '',
  selectedTime: '',
  reservas: [],
  promocion: null,
  bloqueos: [],
  config: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 }
};

window.onload = async () => {
  if (state.token) {
    showBookingSection();
  }
  setMinMaxDate();
};

function showTab(tab) {
  if (tab === 'login') {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('tabLogin').classList.add('bg-white', 'text-green-600', 'shadow');
    document.getElementById('tabLogin').classList.remove('text-gray-600');
    document.getElementById('tabRegister').classList.remove('bg-white', 'text-green-600', 'shadow');
    document.getElementById('tabRegister').classList.add('text-gray-600');
  } else {
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('tabRegister').classList.add('bg-white', 'text-green-600', 'shadow');
    document.getElementById('tabRegister').classList.remove('text-gray-600');
    document.getElementById('tabLogin').classList.remove('bg-white', 'text-green-600', 'shadow');
    document.getElementById('tabLogin').classList.add('text-gray-600');
  }
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showMessage('loginMsg', 'Complete todos los campos', 'red');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.success) {
      state.token = data.token;
      state.nombre = data.nombre;
      localStorage.setItem('session_token', data.token);
      localStorage.setItem('user_nombre', data.nombre);
      showBookingSection();
    } else {
      showMessage('loginMsg', data.error || 'Error al iniciar sesión', 'red');
    }
  } catch (err) {
    showMessage('loginMsg', 'Error de conexión', 'red');
  }
}

async function register() {
  const nombre = document.getElementById('regNombre').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const telefono = document.getElementById('regTelefono').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!nombre || !email || !telefono || !password) {
    showMessage('registerMsg', 'Complete todos los campos', 'red');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showMessage('registerMsg', 'Email inválido', 'red');
    return;
  }

  const telLimpio = telefono.replace(/\D/g, '');
  if (telLimpio.length !== 10) {
    showMessage('registerMsg', 'Teléfono debe tener 10 dígitos', 'red');
    return;
  }

  if (password.length < 6) {
    showMessage('registerMsg', 'Contraseña mínimo 6 caracteres', 'red');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, telefono, password })
    });

    const data = await res.json();

    if (data.success) {
      state.token = data.token;
      state.nombre = nombre;
      localStorage.setItem('session_token', data.token);
      localStorage.setItem('user_nombre', nombre);
      showBookingSection();
    } else {
      showMessage('registerMsg', data.error || 'Error al registrarse', 'red');
    }
  } catch (err) {
    showMessage('registerMsg', 'Error de conexión', 'red');
  }
}

function showMessage(elementId, message, color) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.style.color = color;
  element.classList.remove('hidden');
  setTimeout(() => element.classList.add('hidden'), 5000);
}

function setMinMaxDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 7);
  const maxYear = maxDate.getFullYear();
  const maxMonth = String(maxDate.getMonth() + 1).padStart(2, '0');
  const maxDay = String(maxDate.getDate()).padStart(2, '0');
  const maxDateStr = `${maxYear}-${maxMonth}-${maxDay}`;

  const fechaInput = document.getElementById('fechaInput');
  fechaInput.setAttribute('min', todayStr);
  fechaInput.setAttribute('max', maxDateStr);
  fechaInput.value = todayStr;
  state.selectedDate = todayStr;
}

function showBookingSection() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('bookingSection').classList.remove('hidden');
  document.getElementById('userInfo').classList.remove('hidden');
  document.getElementById('userName').textContent = state.nombre;
  initializeCourts();
  loadAvailability();
}

function initializeCourts() {
  const courtButtons = document.getElementById('courtButtons');
  courtButtons.innerHTML = '';

  for (let i = 1; i <= 3; i++) {
    const btn = document.createElement('button');
    btn.textContent = 'Cancha ' + i;
    btn.className = 'court-btn px-4 py-3 bg-white border-2 border-gray-300 rounded-xl font-semibold text-gray-700';
    btn.onclick = () => selectCourt(i, btn);
    courtButtons.appendChild(btn);
  }
}

function selectCourt(court, btnElement) {
  document.querySelectorAll('.court-btn').forEach(b => {
    b.classList.remove('border-green-500', 'bg-green-50');
    b.classList.add('border-gray-300');
  });

  btnElement.classList.add('border-green-500', 'bg-green-50');
  btnElement.classList.remove('border-gray-300');

  state.selectedCourt = court;
  state.selectedTime = '';
  document.getElementById('reservarBtn').disabled = true;
  document.getElementById('precioInfo').style.display = 'none';
  loadAvailability();
}

async function loadAvailability() {
  const fecha = document.getElementById('fechaInput').value;
  if (!fecha || !state.selectedCourt) return;

  state.selectedDate = fecha;

  try {
    // Solo reservas por ahora (promos/bloqueos después)
    const reservas = await fetch(API_BASE + `/api/disponibilidad?fecha=${fecha}&cancha=${state.selectedCourt}`).then(r => r.json());
    state.reservas = reservas;
    renderTimeSlots();
  } catch (err) {
    console.error(err);
    state.reservas = [];
    renderTimeSlots();
  }
}

function convertirA12h(hora24) {
  const [h, m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const hora12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hora12}:${String(m).padStart(2, '0')} ${periodo}`;
}

function esHoraPasada(fecha, hora) {
  const [year, month, day] = fecha.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  const fechaHoraReserva = new Date(year, month - 1, day, h, m);
  const ahora = new Date();
  return fechaHoraReserva < ahora;
}

function calcularPrecio(hora, duracion) {
  const [h, m] = hora.split(':').map(Number);
  const inicioMinutos = h * 60 + m;
  const finMinutos = inicioMinutos + (duracion * 60);

  const CAMBIO_TARIFA = 16 * 60; // 4 PM
  const PRECIO_DIA = 250;
  const PRECIO_NOCHE = 400;

  let precioBase = 0;
  let detalle = '';

  if (finMinutos <= CAMBIO_TARIFA) {
    precioBase = PRECIO_DIA * duracion;
    detalle = `${duracion}h a $${PRECIO_DIA}/h`;
  } else if (inicioMinutos >= CAMBIO_TARIFA) {
    precioBase = PRECIO_NOCHE * duracion;
    detalle = `${duracion}h a $${PRECIO_NOCHE}/h`;
  } else {
    const minutosAntes = CAMBIO_TARIFA - inicioMinutos;
    const minutosDespues = finMinutos - CAMBIO_TARIFA;
    precioBase = (minutosAntes / 60 * PRECIO_DIA) + (minutosDespues / 60 * PRECIO_NOCHE);
    detalle = `${minutosAntes}min $${PRECIO_DIA}/h + ${minutosDespues}min $${PRECIO_NOCHE}/h`;
  }

  return { total: Math.round(precioBase), detalle, descuento: 0 };
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isTimeOccupied(hora, duracion) {
  const inicioMin = hhmmToMinutes(hora);
  const finMin = inicioMin + duracion * 60;

  return state.reservas.some(r => {
    if (parseInt(r.cancha) !== parseInt(state.selectedCourt)) return false;
    if (r.estado === 'cancelada') return false;

    const rInicio = hhmmToMinutes(r.hora_inicio);
    const rFin = rInicio + Number(r.duracion_minutos);
    return inicioMin < rFin && rInicio < finMin;
  });
}

function renderTimeSlots() {
  const grid = document.getElementById('availabilityGrid');
  grid.innerHTML = '';

  const hours = [];
  for (let h = 8; h <= 23; h++) {
    hours.push(String(h).padStart(2, '0') + ':00');
    if (h < 23) hours.push(String(h).padStart(2, '0') + ':30');
  }

  const duracion = parseFloat(document.getElementById('duracionInput').value || 1);
  const fecha = state.selectedDate;

  hours.forEach(hora => {
    const isOccupied = isTimeOccupied(hora, duracion);
    const isPast = esHoraPasada(fecha, hora);
    const precioInfo = calcularPrecio(hora, duracion);

    const slot = document.createElement('button');
    const [h] = hora.split(':').map(Number);
    const rangoHorario = h >= 16 ? '$400/h' : '$250/h';

    const hora12 = convertirA12h(hora);
    slot.innerHTML = `
      <div class="font-bold">${hora12}</div>
      <div class="text-xs mt-1">${rangoHorario}</div>
    `;

    slot.className = 'time-slot px-3 py-3 border-2 rounded-lg text-center';

    if (isPast) {
      slot.classList.add('past');
    } else if (isOccupied) {
      slot.classList.add('occupied');
      slot.disabled = true;
    } else {
      slot.onclick = () => selectTime(hora, duracion);
    }

    grid.appendChild(slot);
  });
}

function selectTime(hora, duracion) {
  state.selectedTime = hora;

  document.querySelectorAll('.time-slot').forEach(slot => {
    slot.classList.remove('selected');
  });

  event.currentTarget.classList.add('selected');

  const precioInfo = calcularPrecio(hora, duracion);
  const hora12 = convertirA12h(hora);
  
  document.getElementById('precioTexto').textContent = 'Total: $' + precioInfo.total + ' MXN';
  document.getElementById('precioDetalle').textContent = `${hora12} - ${duracion*60}min - ${precioInfo.detalle}`;
  document.getElementById('precioInfo').style.display = 'block';
  document.getElementById('reservarBtn').disabled = false;
}

async function crearReserva() {
  if (!state.selectedTime || !state.selectedCourt) {
    alert('Selecciona cancha y horario');
    return;
  }

  const duracion = parseFloat(document.getElementById('duracionInput').value || 1);
  const precioInfo = calcularPrecio(state.selectedTime, duracion);

  try {
    const res = await fetch(API_BASE + '/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: state.nombre,
        email: state.email || 'no-email@distritopadel.com',
        telefono: '0000000000', // Temporal
        fecha: state.selectedDate,
        hora_inicio: state.selectedTime,
        duracion_minutos: duracion * 60,
        cancha: parseInt(state.selectedCourt),
        precio_total: precioInfo.total
      })
    });

    const data = await res.json();

    if (data.success) {
      alert('¡Reserva confirmada!');
      state.selectedTime = '';
      document.getElementById('reservarBtn').disabled = true;
      document.getElementById('precioInfo').style.display = 'none';
      loadAvailability();
    } else {
      alert('Error: ' + (data.error || 'No se pudo reservar'));
    }
  } catch (err) {
    alert('Error de conexión');
  }
}

function logout() {
  localStorage.removeItem('session_token');
  localStorage.removeItem('user_nombre');
  location.reload();
}

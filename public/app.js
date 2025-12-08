// app.js - Frontend Distrito Padel v6.0 - Con límite 7 días, duraciones variables y precios dinámicos

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
  config: null
};

window.onload = async () => {
  await cargarConfiguracion();
  if (state.token) {
    showBookingSection();
  }
  setMinMaxDate();
};

// ============ CARGAR CONFIGURACIÓN DE PRECIOS ============
async function cargarConfiguracion() {
  try {
    const config = await fetch(API_BASE + '/api/config/precios').then(r => r.json());
    state.config = config;
    console.log('Configuración cargada:', config);
  } catch (err) {
    console.warn('Error al cargar configuración, usando valores por defecto');
    state.config = {
      horaDia: 250,
      horaNoche: 400,
      cambioTarifa: 16
    };
  }
}

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
      showBookingSection();
    } else {
      showMessage('loginMsg', data.msg || 'Error al iniciar sesión', 'red');
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
    showMessage('registerMsg', 'Email inválido. Ejemplo: juan@gmail.com', 'red');
    return;
  }

  const telLimpio = telefono.replace(/\D/g, '');
  if (telLimpio.length !== 10) {
    showMessage('registerMsg', 'Teléfono debe tener 10 dígitos', 'red');
    return;
  }

  if (password.length < 6) {
    showMessage('registerMsg', 'La contraseña debe tener al menos 6 caracteres', 'red');
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
      showBookingSection();
    } else {
      showMessage('registerMsg', data.msg || 'Error al registrarse', 'red');
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

// ============ LÍMITE 7 DÍAS - ZONA HORARIA LOCAL ============
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
  
  console.log('Fecha de hoy:', todayStr);
}

function showBookingSection() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('bookingSection').classList.remove('hidden');
  document.getElementById('userInfo').classList.remove('hidden');
  document.getElementById('userName').textContent = state.nombre;
  document.getElementById('userEmail').textContent = state.email;
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
    const [reservas, promo, bloqueos] = await Promise.all([
      fetch(API_BASE + '/api/reservas?fecha=' + fecha).then(r => r.json()),
      fetch(API_BASE + '/api/promociones?fecha=' + fecha).then(r => r.json()),
      fetch(API_BASE + '/api/bloqueos?fecha=' + fecha).then(r => r.json())
    ]);

    state.reservas = reservas;
    state.promocion = promo;
    state.bloqueos = bloqueos;

    if (promo && promo.activa) {
      const promoTexto = promo.horaInicio && promo.horaFin
        ? `${promo.descuento}% de descuento de ${convertirA12h(promo.horaInicio)} a ${convertirA12h(promo.horaFin)}`
        : `${promo.descuento}% de descuento en todas las reservas`;
      document.getElementById('promoBanner').classList.remove('hidden');
      document.getElementById('promoText').textContent = promoTexto;
    } else {
      document.getElementById('promoBanner').classList.add('hidden');
    }

    renderTimeSlots();
  } catch (err) {
    console.error(err);
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

// ============ CALCULAR PRECIO CON CONFIG DINÁMICA ============
function calcularPrecio(hora, duracion) {
  if (!state.config) return { total: 0, detalle: 'Cargando...', descuento: 0 };

  const [h, m] = hora.split(':').map(Number);
  const inicioMinutos = h * 60 + m;
  const finMinutos = inicioMinutos + (duracion * 60);

  const CAMBIO_TARIFA = state.config.cambioTarifa * 60;
  const PRECIO_DIA = state.config.horaDia;
  const PRECIO_NOCHE = state.config.horaNoche;

  let precioBase = 0;
  let detalle = '';

  if (finMinutos <= CAMBIO_TARIFA) {
    precioBase = PRECIO_DIA * duracion;
    detalle = duracion + 'h a $' + PRECIO_DIA + '/hora';
  } else if (inicioMinutos >= CAMBIO_TARIFA) {
    precioBase = PRECIO_NOCHE * duracion;
    detalle = duracion + 'h a $' + PRECIO_NOCHE + '/hora';
  } else {
    const minutosAntesDe4pm = CAMBIO_TARIFA - inicioMinutos;
    const horasAntesDe4pm = minutosAntesDe4pm / 60;
    const minutosDespuesDe4pm = finMinutos - CAMBIO_TARIFA;
    const horasDespuesDe4pm = minutosDespuesDe4pm / 60;
    precioBase = (horasAntesDe4pm * PRECIO_DIA) + (horasDespuesDe4pm * PRECIO_NOCHE);
    detalle = minutosAntesDe4pm + 'min a $' + PRECIO_DIA + '/h + ' + minutosDespuesDe4pm + 'min a $' + PRECIO_NOCHE + '/h';
  }

  let precioFinal = Math.round(precioBase);
  let descuento = 0;

  if (state.promocion && state.promocion.activa) {
    if (state.promocion.horaInicio && state.promocion.horaFin) {
      const horaMin = hhmmToMinutes(hora);
      const promoInicio = hhmmToMinutes(state.promocion.horaInicio);
      const promoFin = hhmmToMinutes(state.promocion.horaFin);
      if (horaMin >= promoInicio && horaMin < promoFin) {
        descuento = state.promocion.descuento;
        precioFinal = Math.round(precioBase * (1 - descuento / 100));
        detalle += ' (-' + descuento + '%)';
      }
    } else {
      descuento = state.promocion.descuento;
      precioFinal = Math.round(precioBase * (1 - descuento / 100));
      detalle += ' (-' + descuento + '%)';
    }
  }

  return { total: precioFinal, detalle, descuento };
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function estaBloqueo(hora, duracion) {
  const inicioMin = hhmmToMinutes(hora);
  const finMin = inicioMin + duracion * 60;

  return state.bloqueos.some(b => {
    if (b.cancha && String(b.cancha) !== String(state.selectedCourt)) return false;
    if (!b.horaInicio && !b.horaFin) return true;
    if (b.horaInicio && b.horaFin) {
      const bInicio = hhmmToMinutes(b.horaInicio);
      const bFin = hhmmToMinutes(b.horaFin);
      return inicioMin < bFin && bInicio < finMin;
    }
    return false;
  });
}

function isTimeOccupied(hora, duracion) {
  const inicioMin = hhmmToMinutes(hora);
  const finMin = inicioMin + duracion * 60;

  return state.reservas.some(r => {
    if (String(r.cancha) !== String(state.selectedCourt)) return false;
    
    // Ignorar reservas canceladas
    if (r.estado === 'cancelada') return false;
    
    const rInicio = hhmmToMinutes(r.horaInicio);
    const rFin = rInicio + Number(r.duracion) * 60;
    return inicioMin < rFin && rInicio < finMin;
  });
}

// ============ RENDER CON PRECIOS DINÁMICOS ============
function renderTimeSlots() {
  const grid = document.getElementById('availabilityGrid');
  grid.innerHTML = '';

  if (!state.config) {
    grid.innerHTML = '<p class="col-span-full text-center text-gray-500">Cargando precios...</p>';
    return;
  }

  const hours = [];
  for (let h = 8; h <= 23; h++) {
    hours.push(String(h).padStart(2, '0') + ':00');
    if (h < 23) hours.push(String(h).padStart(2, '0') + ':30');
  }

  const duracion = parseFloat(document.getElementById('duracionInput').value);
  const fecha = state.selectedDate;

  hours.forEach(hora => {
    const isOccupied = isTimeOccupied(hora, duracion);
    const isPast = esHoraPasada(fecha, hora);
    const isBlocked = estaBloqueo(hora, duracion);
    const precioInfo = calcularPrecio(hora, duracion);

    const slot = document.createElement('button');
    const [h] = hora.split(':').map(Number);
    
    const rangoHorario = h >= state.config.cambioTarifa 
      ? `$${state.config.horaNoche}/h` 
      : `$${state.config.horaDia}/h`;

    let priceText = rangoHorario;
    if (precioInfo.descuento > 0) {
      priceText = '-' + precioInfo.descuento + '%';
    }

    const hora12 = convertirA12h(hora);
    slot.innerHTML = `
      <div class="font-bold">${hora12}</div>
      <div class="text-xs mt-1">${priceText}</div>
    `;

    slot.className = 'time-slot px-3 py-3 border-2 rounded-lg text-center';

    if (isPast) {
      slot.classList.add('past');
    } else if (isBlocked) {
      slot.classList.add('occupied');
      slot.disabled = true;
    } else if (isOccupied) {
      slot.classList.add('occupied');
      slot.disabled = true;
    } else {
      if (precioInfo.descuento > 0) {
        slot.classList.add('promo');
      }
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
  
  let duracionTexto = '';
  if (duracion === 1) duracionTexto = '60 minutos';
  else if (duracion === 1.5) duracionTexto = '90 minutos';
  else if (duracion === 2) duracionTexto = '120 minutos';

  document.getElementById('precioTexto').textContent = 'Total: $' + precioInfo.total + ' MXN';
  document.getElementById('precioDetalle').textContent = `${hora12} - ${duracionTexto} - ${precioInfo.detalle}`;
  document.getElementById('precioInfo').style.display = 'block';
  document.getElementById('reservarBtn').disabled = false;
}

async function crearReserva() {
  if (!state.selectedTime || !state.selectedCourt) {
    alert('Selecciona cancha y horario');
    return;
  }

  const duracion = parseFloat(document.getElementById('duracionInput').value);

  try {
    const res = await fetch(API_BASE + '/api/reservas/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: state.token,
        fecha: state.selectedDate,
        hora: state.selectedTime,
        duracion,
        cancha: state.selectedCourt
      })
    });

    const data = await res.json();

    if (data.ok) {
      alert('Reserva confirmada!\n\nRecibirás un email de confirmación.');
      state.selectedTime = '';
      document.getElementById('reservarBtn').disabled = true;
      document.getElementById('precioInfo').style.display = 'none';
      loadAvailability();
    } else {
      alert('Error: ' + (data.msg || 'Error al crear reserva'));
    }
  } catch (err) {
    alert('Error de conexión');
  }
}

async function verMisReservas() {
  try {
    const res = await fetch(API_BASE + '/api/mis-reservas', {
      headers: { 'x-session-token': state.token }
    });

    const reservas = await res.json();
    const container = document.getElementById('misReservasList');
    container.innerHTML = '';

    if (reservas.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500 py-8">No tienes reservas activas</p>';
    } else {
      reservas.forEach(r => {
        const descuentoHTML = r.descuento > 0 
          ? `<br><span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full mt-1 inline-block">Promoción -${r.descuento}%</span>`
          : '';
          
        let durTexto = r.duracion === 1 ? '60 min' : r.duracion === 1.5 ? '90 min' : '120 min';
        
        const div = document.createElement('div');
        div.className = 'bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 mb-4 border-2 border-green-200';
        div.innerHTML = `
          <div class="flex justify-between items-start mb-3">
            <div>
              <p class="text-xl font-bold text-green-700">Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600 mt-1">Fecha: ${r.fecha} - Hora: ${convertirA12h(r.horaInicio)} - Duración: ${durTexto}</p>
            </div>
            <button onclick="cancelarReserva('${r.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              Cancelar
            </button>
          </div>
          <div class="bg-white rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">$${r.precio} MXN${descuentoHTML}</p>
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

async function cancelarReserva(id) {
  if (!confirm('¿Estás seguro de cancelar esta reserva?')) return;

  try {
    const res = await fetch(API_BASE + '/api/reservas/' + id, {
      method: 'DELETE',
      headers: { 'x-session-token': state.token }
    });

    const data = await res.json();

    if (data.ok) {
      alert('Reserva cancelada correctamente');
      verMisReservas();
      loadAvailability();
    } else {
      alert('Error: ' + (data.msg || 'Error'));
    }
  } catch (err) {
    alert('Error de conexión');
  }
}

function cerrarMisReservas() {
  document.getElementById('misReservasModal').classList.add('hidden');
}

function logout() {
  localStorage.removeItem('session_token');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_nombre');
  location.reload();
}

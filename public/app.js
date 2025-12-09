// app.js - Frontend Distrito Padel v7.0 - Interfaz Mejorada con QR
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
  config: { precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 } }
};


// INICIALIZAR
document.addEventListener('DOMContentLoaded', () => {
  cargarConfig();
  if (state.token) {
    mostrarDashboard();
  } else {
    mostrarAuth();
  }
});


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
function mostrarDashboard() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');
  document.getElementById('userNombre').textContent = state.nombre;
  
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 7);
  const maxYear = maxDate.getFullYear();
  const maxMonth = String(maxDate.getMonth() + 1).padStart(2, '0');
  const maxDay = String(maxDate.getDate()).padStart(2, '0');
  const maxDateStr = `${maxYear}-${maxMonth}-${maxDay}`;
  
  const dateInput = document.getElementById('fechaReserva');
  dateInput.min = todayStr;
  dateInput.max = maxDateStr;
  dateInput.value = todayStr;
  state.selectedDate = todayStr;
  
  dateInput.addEventListener('change', function() {
    const selectedValue = this.value;
    
    if (selectedValue < todayStr) {
      alert('No puedes reservar en fechas pasadas');
      this.value = todayStr;
      return;
    }
    
    if (selectedValue > maxDateStr) {
      alert('Solo puedes reservar hasta 7 días adelante');
      this.value = maxDateStr;
      return;
    }
  });
  
  document.getElementById('duracionReserva').addEventListener('change', function() {
    state.selectedDuration = parseFloat(this.value);
    if (state.selectedCourt && state.selectedDate) {
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
    btn.classList.remove('bg-green-600', 'text-white', 'border-green-600');
    btn.classList.add('bg-gradient-to-br', 'from-green-50', 'to-green-100', 'border-green-400');
  });
  event.target.classList.remove('bg-gradient-to-br', 'from-green-50', 'to-green-100', 'border-green-400');
  event.target.classList.add('bg-green-600', 'text-white', 'border-green-600');
  cargarDisponibilidad();
}


// CARGAR DISPONIBILIDAD
async function cargarDisponibilidad() {
  const fecha = document.getElementById('fechaReserva').value;
  const cancha = state.selectedCourt;


  if (!fecha || !cancha) return;


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


// RENDERIZAR HORARIOS MEJORADOS
function renderizarHorarios() {
  const container = document.getElementById('horariosDisponibles');
  container.innerHTML = '';


  const ahora = new Date();
  const duracion = parseFloat(document.getElementById('duracionReserva').value);
  const duracionMin = duracion * 60;


  for (let h = 8; h <= 23; h++) {
    for (let minutos = 0; minutos < 60; minutos += 30) {
      const horaActual = h + (minutos / 60);
      const hora = `${h.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
      const horaFinMin = (h * 60 + minutos) + duracionMin;
      const horaFinH = Math.floor(horaFinMin / 60);
      const horaFinM = horaFinMin % 60;
      
      if (horaFinH > 24) continue;
      if (horaFinH === 24 && horaFinM > 0) continue;
      
      // Verificar si pasó
      let pasado = false;
      const fechaSeleccionada = state.selectedDate;
      const hoy = new Date();
      const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
      
      if (fechaSeleccionada < hoyStr) {
        pasado = true;
      } else if (fechaSeleccionada === hoyStr) {
        const horaActualCompleta = hoy.getHours() + (hoy.getMinutes() / 60);
        if (horaActual <= horaActualCompleta) {
          pasado = true;
        }
      }


      // Verificar reservas
      const slotInicioMin = h * 60 + minutos;
      const slotFinMin = slotInicioMin + duracionMin;
      
      const ocupado = state.reservas.some(r => {
        const horaArr = r.hora_inicio.split(':');
        const inicioMin = parseInt(horaArr[0]) * 60 + parseInt(horaArr[1] || 0);
        const finMin = inicioMin + (parseFloat(r.duracion) * 60);
        return (slotInicioMin < finMin && slotFinMin > inicioMin);
      });


      // Verificar bloqueos
      const bloqueado = state.bloqueos.some(b => {
        if (!b.hora_inicio || !b.hora_fin) return true;
        const bloqArr1 = b.hora_inicio.split(':');
        const bloqArr2 = b.hora_fin.split(':');
        const bloqInicioMin = parseInt(bloqArr1[0]) * 60 + parseInt(bloqArr1[1] || 0);
        const bloqFinMin = parseInt(bloqArr2[0]) * 60 + parseInt(bloqArr2[1] || 0);
        return (slotInicioMin < bloqFinMin && slotFinMin > bloqInicioMin);
      });


      // Calcular precio
      const precioHoraInicio = horaActual < state.config.precios.cambioTarifa ? 
        state.config.precios.horaDia : state.config.precios.horaNoche;
      const precioHoraFin = (horaActual + duracion) <= state.config.precios.cambioTarifa ?
        state.config.precios.horaDia : state.config.precios.horaNoche;
      
      let precioBase = 0;
      if (precioHoraInicio === precioHoraFin) {
        precioBase = precioHoraInicio * duracion;
      } else {
        const horasAntes = state.config.precios.cambioTarifa - horaActual;
        const horasDespues = duracion - horasAntes;
        precioBase = (horasAntes * state.config.precios.horaDia) + (horasDespues * state.config.precios.horaNoche);
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


      const div = document.createElement('div');
      div.className = `hora-slot p-4 rounded-xl text-center font-bold relative transition-all ${
        pasado ? 'pasado' :
        ocupado ? 'ocupado' :
        bloqueado ? 'pasado' :
        descuento > 0 ? 'promocion' :
        'disponible'
      }`;


      if (!pasado && !ocupado && !bloqueado) {
        div.onclick = () => seleccionarHora(hora);
      }


      div.innerHTML = `
        <p class="text-base mb-1">${convertirA12h(hora)}</p>
        ${!pasado && !ocupado && !bloqueado ? `
          <p class="text-lg font-bold ${descuento > 0 ? 'text-purple-700' : 'text-green-700'}">
            $${precioFinal}
          </p>
          ${descuento > 0 ? `<span class="badge-disponibilidad text-purple-600">${descuento}% OFF</span>` : ''}
        ` : `
          <p class="text-xs ${pasado ? 'text-gray-500' : 'text-red-600'}">
            ${pasado ? 'Pasado' : ocupado ? 'Ocupado' : 'Bloqueado'}
          </p>
        `}
      `;


      container.appendChild(div);
    }
  }
}


// SELECCIONAR HORA Y MOSTRAR MODAL CON QR
function seleccionarHora(hora) {
  const [h, m] = hora.split(':').map(Number);
  const duracion = parseFloat(document.getElementById('duracionReserva').value);
  
  const horaFinMin = (h * 60 + m) + (duracion * 60);
  const horaFinH = Math.floor(horaFinMin / 60);
  const horaFinM = horaFinMin % 60;
  
  if (horaFinH > 24 || (horaFinH === 24 && horaFinM > 0)) {
    alert('El club cierra a las 12:00 AM. Selecciona un horario o duración menor.');
    return;
  }
  
  state.selectedTime = hora;
  state.selectedDuration = duracion;
  
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
    
    const promoInicioMin = parseInt(p.hora_inicio.split(':')[0]) * 60 + parseInt(p.hora_inicio.split(':')[1] || 0);
    const promoFinMin = parseInt(p.hora_fin.split(':')[0]) * 60 + parseInt(p.hora_fin.split(':')[1] || 0);
    const horaMin = h * 60 + m;
    
    return horaMin >= promoInicioMin && horaMin < promoFinMin;
  });


  if (promo) {
    descuento = promo.descuento;
  }


  const precioFinal = Math.round(precioBase * (1 - descuento / 100));


  // Generar QR Code
  const qrData = `DISTRITO PADEL\nCancha: ${state.selectedCourt}\nFecha: ${state.selectedDate}\nHora: ${convertirA12h(hora)}\nDuración: ${duracion}h\nPrecio: $${precioFinal}`;
  
  setTimeout(() => {
    const canvas = document.getElementById('qrCodeCanvas');
    if (canvas && window.QRCode) {
      QRCode.toCanvas(canvas, qrData, {
        width: 200,
        margin: 2,
        color: {
          dark: '#16a34a',
          light: '#ffffff'
        }
      });
    }
  }, 100);


  document.getElementById('confirmacionDetalle').innerHTML = `
    <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <span class="text-2xl">🎾</span>
      <div class="flex-1">
        <p class="text-xs text-gray-600">Cancha</p>
        <p class="font-bold text-gray-900">Cancha ${state.selectedCourt}</p>
      </div>
    </div>
    <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <span class="text-2xl">📅</span>
      <div class="flex-1">
        <p class="text-xs text-gray-600">Fecha</p>
        <p class="font-bold text-gray-900">${formatearFecha(state.selectedDate)}</p>
      </div>
    </div>
    <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <span class="text-2xl">⏰</span>
      <div class="flex-1">
        <p class="text-xs text-gray-600">Horario</p>
        <p class="font-bold text-gray-900">${convertirA12h(hora)} (${duracion}h)</p>
      </div>
    </div>
    ${descuento > 0 ? `
      <div class="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border-2 border-purple-200">
        <span class="text-2xl">🎉</span>
        <div class="flex-1">
          <p class="text-xs text-purple-600">Promoción Aplicada</p>
          <p class="font-bold text-purple-700">${descuento}% de descuento</p>
          <p class="text-xs text-gray-500 line-through">Precio normal: $${Math.round(precioBase)}</p>
        </div>
      </div>
    ` : ''}
    <div class="flex items-center gap-3 p-4 bg-green-50 rounded-xl border-2 border-green-200">
      <span class="text-2xl">💰</span>
      <div class="flex-1">
        <p class="text-xs text-gray-600">Total a Pagar</p>
        <p class="font-bold text-3xl text-green-600">$${precioFinal}</p>
      </div>
    </div>
  `;
  
  document.getElementById('confirmacionModal').classList.remove('hidden');
}


// CONFIRMAR RESERVA
async function confirmarReserva() {
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
    alert('Error de conexión');
  }
}


// VER MIS RESERVAS
async function verMisReservas() {
  try {
    const res = await fetch(API_BASE + '/api/mis-reservas', {
      headers: { 'x-token': state.token }
    });


    const reservas = await res.json();
    const container = document.getElementById('misReservasList');
    container.innerHTML = '';


    if (reservas.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500 py-12 text-lg">No tienes reservas activas</p>';
    } else {
      reservas.forEach(r => {
        const div = document.createElement('div');
        div.className = 'bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl p-6 mb-4 border-2 border-green-200 shadow-md hover:shadow-lg transition';
        div.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <div>
              <p class="text-2xl font-bold text-green-700">Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600 mt-2">📅 ${formatearFecha(r.fecha)}</p>
              <p class="text-sm text-gray-600">⏰ ${convertirA12h(r.hora_inicio)} - ${r.duracion}h</p>
            </div>
            <button onclick="cancelarReserva('${r.id}')" class="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 text-sm font-bold transition transform hover:scale-105">
              Cancelar
            </button>
          </div>
          <div class="bg-white rounded-xl p-4">
            <p class="text-3xl font-bold text-green-600">$${r.precio}</p>
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
  if (!confirm('¿Seguro que deseas cancelar esta reserva?')) return;


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
    alert('Error de conexión');
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


function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const fechaStr = fechaISO.split('T')[0];
  const fecha = new Date(fechaStr + 'T00:00:00');
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const año = fecha.getFullYear();
  return `${dia}/${mes}/${año}`;
}


function cerrarModal() {
  document.getElementById('confirmacionModal').classList.add('hidden');
}


function cerrarMisReservas() {
  document.getElementById('misReservasModal').classList.add('hidden');
}

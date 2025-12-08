// app.js - Frontend Distrito Padel v6.2 - Horarios 30min + Fix Promociones + Fix iPhone
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
  document.getElementById('userInfo').classList.add('hidden');
}

// MOSTRAR DASHBOARD
function mostrarDashboard() {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboardSection').classList.remove('hidden');
  document.getElementById('userInfo').classList.remove('hidden');
  document.getElementById('userNombre').textContent = state.nombre;
  
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 7);
  
  const dateInput = document.getElementById('fechaReserva');
  dateInput.min = today.toISOString().split('T')[0];
  dateInput.max = maxDate.toISOString().split('T')[0];
  dateInput.value = today.toISOString().split('T')[0];
  
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
  document.querySelectorAll('.cancha-btn').forEach(btn => btn.classList.remove('bg-green-600', 'text-white'));
  event.target.classList.add('bg-green-600', 'text-white');
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

// RENDERIZAR HORARIOS (CON INTERVALOS DE 30 MINUTOS)
function renderizarHorarios() {
  const container = document.getElementById('horariosDisponibles');
  container.innerHTML = '';

  const ahora = new Date();
  const [añoHoy, mesHoy, diaHoy] = state.selectedDate.split('-').map(Number);
  const fechaSeleccionada = new Date(añoHoy, mesHoy - 1, diaHoy);
  const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  for (let h = 6; h <= 23; h++) {
    for (let minutos = 0; minutos < 60; minutos += 30) {
      const horaActual = h + (minutos / 60);
      const hora = `${h.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
      const duracionMin = state.selectedDuration * 60;
      const horaFinMin = (h * 60 + minutos) + duracionMin;
      const horaFinH = Math.floor(horaFinMin / 60);
      const horaFinM = horaFinMin % 60;
      const horaFin = `${horaFinH.toString().padStart(2, '0')}:${horaFinM.toString().padStart(2, '0')}`;
      
      // Verificar si pasó
      let pasado = false;
      if (fechaSeleccionada < hoyInicio) {
        pasado = true;
      } else if (fechaSeleccionada.getTime() === hoyInicio.getTime()) {
        const horaActualCompleta = ahora.getHours() + (ahora.getMinutes() / 60);
        if (horaActual < horaActualCompleta) {
          pasado = true;
        }
      }

      // Verificar reservas
      const ocupado = state.reservas.some(r => {
        const inicioMin = parseInt(r.hora_inicio.split(':')[0]) * 60 + parseInt(r.hora_inicio.split(':')[1] || 0);
        const duracion = parseFloat(r.duracion);
        const finMin = inicioMin + (duracion * 60);
        const slotInicioMin = h * 60 + minutos;
        const slotFinMin = slotInicioMin + duracionMin;
        
        return (slotInicioMin < finMin && slotFinMin > inicioMin);
      });

      // Verificar bloqueos
      const bloqueado = state.bloqueos.some(b => {
        if (b.hora_inicio && b.hora_fin) {
          const bloqInicioMin = parseInt(b.hora_inicio.split(':')[0]) * 60 + parseInt(b.hora_inicio.split(':')[1] || 0);
          const bloqFinMin = parseInt(b.hora_fin.split(':')[0]) * 60 + parseInt(b.hora_fin.split(':')[1] || 0);
          const slotInicioMin = h * 60 + minutos;
          const slotFinMin = slotInicioMin + duracionMin;
          return (slotInicioMin < bloqFinMin && slotFinMin > bloqInicioMin);
        }
        return true;
      });

      // Calcular precio
      let precioBase = 0;
      let horasRestantes = state.selectedDuration;
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

      // Verificar promoción (MEJORADO - soporta sin fecha)
      let descuento = 0;
      const promo = state.promociones.find(p => {
        if (!p.fecha) return true;
        if (p.fecha !== state.selectedDate) return false;
        
        if (!p.hora_inicio || !p.hora_fin) return true;
        
        const promoInicioMin = parseInt(p.hora_inicio.split(':')[0]) * 60 + parseInt(p.hora_inicio.split(':')[1] || 0);
        const promoFinMin = parseInt(p.hora_fin.split(':')[0]) * 60 + parseInt(p.hora_fin.split(':')[1] || 0);
        const slotMin = h * 60 + minutos;
        return slotMin >= promoInicioMin && slotMin < promoFinMin;
      });

      if (promo) {
        descuento = promo.descuento;
      }

      const precioFinal = Math.round(precioBase * (1 - descuento / 100));

      const div = document.createElement('div');
      div.className = `p-4 rounded-lg border-2 cursor-pointer transition ${
        pasado ? 'bg-gray-200 cursor-not-allowed' :
        ocupado ? 'bg-red-100 border-red-300 cursor-not-allowed' :
        bloqueado ? 'bg-gray-300 cursor-not-allowed' :
        descuento > 0 ? 'bg-purple-100 border-purple-400 hover:bg-purple-200' :
        'bg-green-100 border-green-400 hover:bg-green-200'
      }`;

      if (!pasado && !ocupado && !bloqueado) {
        div.onclick = () => seleccionarHora(hora);
      }

      div.innerHTML = `
        <div class="flex justify-between items-center">
          <div>
            <p class="font-bold">${convertirA12h(hora)} - ${convertirA12h(horaFin)}</p>
            <p class="text-sm ${pasado ? 'text-gray-500' : ocupado || bloqueado ? 'text-red-600' : 'text-green-600'}">
              ${pasado ? 'Pasado' : ocupado ? 'Ocupado' : bloqueado ? 'Bloqueado' : 'Disponible'}
            </p>
          </div>
          <div class="text-right">
            ${!pasado && !ocupado && !bloqueado ? `
              <p class="text-lg font-bold ${descuento > 0 ? 'text-purple-600' : 'text-green-600'}">
                $${precioFinal}
              </p>
              ${descuento > 0 ? `
                <p class="text-xs text-purple-600 font-bold">${descuento}% OFF</p>
                <p class="text-xs text-gray-500 line-through">$${Math.round(precioBase)}</p>
              ` : ''}
            ` : ''}
          </div>
        </div>
      `;

      container.appendChild(div);
    }
  }
}

// SELECCIONAR HORA
function seleccionarHora(hora) {
  state.selectedTime = hora;
  document.getElementById('confirmacionModal').classList.remove('hidden');
  
  const [h, m] = hora.split(':').map(Number);
  const horaActual = h + (m / 60);
  const duracion = state.selectedDuration;
  
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

  let descuento = 0;
  const promo = state.promociones.find(p => {
    if (!p.fecha) return true;
    if (p.fecha !== state.selectedDate) return false;
    
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

  document.getElementById('confirmacionDetalle').innerHTML = `
    <p><strong>Cancha:</strong> ${state.selectedCourt}</p>
    <p><strong>Fecha:</strong> ${state.selectedDate}</p>
    <p><strong>Hora:</strong> ${convertirA12h(hora)}</p>
    <p><strong>Duración:</strong> ${duracion}h</p>
    ${descuento > 0 ? `
      <p class="text-purple-600 font-bold"><strong>Descuento:</strong> ${descuento}%</p>
      <p class="text-gray-500 line-through">Precio: $${Math.round(precioBase)} MXN</p>
    ` : ''}
    <p class="text-2xl font-bold text-green-600 mt-2">Total: $${precioFinal} MXN</p>
  `;
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
      headers: { 
        'x-token': state.token
      }
    });

    const reservas = await res.json();
    const container = document.getElementById('misReservasList');
    container.innerHTML = '';

    if (reservas.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500 py-8">No tienes reservas activas</p>';
    } else {
      reservas.forEach(r => {
        const div = document.createElement('div');
        div.className = 'bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 mb-4 border-2 border-green-200';
        div.innerHTML = `
          <div class="flex justify-between items-start mb-3">
            <div>
              <p class="text-xl font-bold text-green-700">Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600 mt-1">Fecha: ${r.fecha} - Hora: ${convertirA12h(r.hora_inicio)} - Duración: ${r.duracion}h</p>
            </div>
            <button onclick="cancelarReserva('${r.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              Cancelar
            </button>
          </div>
          <div class="bg-white rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">$${r.precio} MXN</p>
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

// CAMBIAR DURACIÓN
function cambiarDuracion() {
  state.selectedDuration = parseFloat(document.getElementById('duracionReserva').value);
  if (state.selectedCourt && state.selectedDate) {
    cargarDisponibilidad();
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
document.getElementById('fechaReserva')?.addEventListener('change', cargarDisponibilidad);
document.getElementById('duracionReserva')?.addEventListener('change', cambiarDuracion);

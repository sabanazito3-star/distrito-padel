// app.js - Frontend Distrito Padel v7.0 - Selección duración estilo Joger + Color #26422b
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
      alert('Solo puedes reservar hasta 7 dias adelante');
      this.value = maxDateStr;
      return;
    }
    
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

// RENDERIZAR HORARIOS - ESTILO JOGER (con opciones de duración)
function renderizarHorarios() {
  const container = document.getElementById('horariosDisponibles');
  container.innerHTML = '';

  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  
  const duraciones = [1, 1.5, 2]; // Opciones: 1h, 1.5h, 2h

  for (let h = 8; h <= 23; h++) {
    for (let minutos = 0; minutos < 60; minutos += 30) {
      const horaActual = h + (minutos / 60);
      const hora = `${h.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
      
      // Verificar si la hora ya pasó
      let pasado = false;
      if (state.selectedDate < hoyStr) {
        pasado = true;
      } else if (state.selectedDate === hoyStr) {
        const horaActualCompleta = hoy.getHours() + (hoy.getMinutes() / 60);
        if (horaActual <= horaActualCompleta) {
          pasado = true;
        }
      }

      // Crear contenedor para este horario
      const horarioDiv = document.createElement('div');
      horarioDiv.className = 'border-2 border-gray-200 rounded-xl p-3 bg-white';
      
      // Título del horario
      const titulo = document.createElement('div');
      titulo.className = 'text-base font-bold text-primary mb-2 border-b pb-2';
      titulo.textContent = convertirA12h(hora);
      horarioDiv.appendChild(titulo);

      // Grid de duraciones
      const duracionesGrid = document.createElement('div');
      duracionesGrid.className = 'grid grid-cols-3 gap-2';

      // Generar opciones de duración para este horario
      duraciones.forEach(duracion => {
        const slotInicioMin = h * 60 + minutos;
        const duracionMin = duracion * 60;
        const slotFinMin = slotInicioMin + duracionMin;
        const horaFinH = Math.floor(slotFinMin / 60);
        const horaFinM = slotFinMin % 60;
        
        // Validar que no pase de las 24:00
        if (horaFinH > 24 || (horaFinH === 24 && horaFinM > 0)) {
          return; // Skip esta duración
        }

        // Verificar si está ocupado
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

        // Crear slot de duración
        const slot = document.createElement('div');
        slot.className = `duracion-slot p-2 rounded-lg text-center ${
          pasado ? 'opacity-40 cursor-not-allowed bg-gray-100' :
          ocupado ? 'opacity-40 cursor-not-allowed bg-red-50 border-red-200' :
          bloqueado ? 'opacity-40 cursor-not-allowed bg-gray-100' :
          descuento > 0 ? 'bg-purple-50 border-purple-300' :
          'bg-white hover:bg-primary-lighter'
        }`;

        if (!pasado && !ocupado && !bloqueado) {
          slot.onclick = () => seleccionarHoraDuracion(hora, duracion, precioFinal, descuento, precioBase);
        }

        const duracionTexto = duracion === 1 ? '1h' : duracion === 1.5 ? '1.5h' : '2h';
        
        slot.innerHTML = `
          <p class="text-xs font-bold text-gray-700">${duracionTexto}</p>
          ${!pasado && !ocupado && !bloqueado ? `
            <p class="text-sm font-bold ${descuento > 0 ? 'text-purple-600' : 'text-primary'} mt-1">
              $${precioFinal}
            </p>
            ${descuento > 0 ? `<p class="text-[9px] text-purple-600 font-bold">${descuento}% OFF</p>` : ''}
          ` : `
            <p class="text-[10px] text-gray-500 mt-1">
              ${pasado ? 'Pasado' : ocupado ? 'Ocupado' : 'Bloqueado'}
            </p>
          `}
        `;

        duracionesGrid.appendChild(slot);
      });

      horarioDiv.appendChild(duracionesGrid);
      container.appendChild(horarioDiv);
    }
  }
}

// SELECCIONAR HORA Y DURACIÓN
function seleccionarHoraDuracion(hora, duracion, precioFinal, descuento, precioBase) {
  state.selectedTime = hora;
  state.selectedDuration = duracion;
  
  document.getElementById('confirmacionModal').classList.remove('hidden');
  
  const duracionTexto = duracion === 1 ? '1 hora' : duracion === 1.5 ? '1.5 horas' : '2 horas';
  
  document.getElementById('confirmacionDetalle').innerHTML = `
    <p class="text-lg"><strong>Cancha:</strong> ${state.selectedCourt}</p>
    <p class="text-lg"><strong>Fecha:</strong> ${state.selectedDate}</p>
    <p class="text-lg"><strong>Hora:</strong> ${convertirA12h(hora)}</p>
    <p class="text-lg"><strong>Duracion:</strong> ${duracionTexto}</p>
    ${descuento > 0 ? `
      <p class="text-lg text-purple-600 font-bold"><strong>Descuento:</strong> ${descuento}%</p>
      <p class="text-lg text-gray-500 line-through">Precio: $${Math.round(precioBase)} MXN</p>
    ` : ''}
    <p class="text-2xl font-bold mt-2" style="color: #26422b;">Total: $${precioFinal} MXN</p>
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
    alert('Error de conexion');
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
      container.innerHTML = '<p class="text-center text-gray-500 py-8">No tienes reservas activas</p>';
    } else {
      reservas.forEach(r => {
        const div = document.createElement('div');
        div.className = 'bg-primary-lighter rounded-xl p-6 mb-4 border-2 border-primary';
        div.innerHTML = `
          <div class="flex justify-between items-start mb-3">
            <div>
              <p class="text-xl font-bold text-primary">Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600 mt-1">${r.fecha} - ${convertirA12h(r.hora_inicio)} - ${r.duracion}h</p>
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

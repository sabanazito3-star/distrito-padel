// app.js - Frontend Distrito Padel v6.7 - Fix zona horaria MST
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
  
  // 🆕 FIX: Usar fecha local en lugar de UTC
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
  
  // Validar cambio de fecha
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
  
  // Listener para cambio de duración
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
      alert('✅ Registro exitoso');
    } else {
      alert('❌ ' + (data.msg || 'Error al registrar'));
    }
  } catch (err) {
    alert('❌ Error de conexión');
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
      alert('❌ ' + (data.msg || 'Credenciales inválidas'));
    }
  } catch (err) {
    alert('❌ Error de conexión');
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



// RENDERIZAR HORARIOS (8am - 12am)
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
      
      // 🆕 FIX: Verificar si pasó usando fecha local
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



      // Verificar promoción (FIX: Extraer fecha sin hora)
      let descuento = 0;
      const promo = state.promociones.find(p => {
        if (!p.activa) return false;
        
        // Si tiene fecha específica, extraer solo YYYY-MM-DD y comparar
        if (p.fecha) {
          const promoFecha = p.fecha.split('T')[0];
          if (promoFecha !== state.selectedDate) return false;
        }
        
        // Si NO tiene rango horario, aplica a todo el día
        if (!p.hora_inicio || !p.hora_fin) return true;
        
        // Si tiene rango horario, verificar que el slot esté dentro
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
      div.className = `p-3 rounded-lg border-2 cursor-pointer transition text-sm ${
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
        <p class="font-bold text-sm">${convertirA12h(hora)}</p>
        <p class="text-xs ${pasado ? 'text-gray-500' : ocupado || bloqueado ? 'text-red-600' : 'text-green-600'}">
          ${pasado ? 'Pasado' : ocupado ? 'Ocupado' : bloqueado ? 'Bloqueado' : 'Disponible'}
        </p>
        ${!pasado && !ocupado && !bloqueado ? `
          <p class="font-bold mt-1 ${descuento > 0 ? 'text-purple-600' : 'text-green-600'}">
            $${precioFinal}
          </p>
          ${descuento > 0 ? `<p class="text-xs text-purple-600 font-bold">${descuento}% OFF</p>` : ''}
        ` : ''}
      `;



      container.appendChild(div);
    }
  }
}



// SELECCIONAR HORA
function seleccionarHora(hora) {
  const [h, m] = hora.split(':').map(Number);
  const duracion = parseFloat(document.getElementById('duracionReserva').value);
  
  const horaFinMin = (h * 60 + m) + (duracion * 60);
  const horaFinH = Math.floor(horaFinMin / 60);
  const horaFinM = horaFinMin % 60;
  
  if (horaFinH > 24 || (horaFinH === 24 && horaFinM > 0)) {
    alert('⚠️ El club cierra a las 12:00 AM\n\nNo puedes hacer una reserva que termine después de la medianoche.\n\nSelecciona un horario o duración menor.');
    return;
  }
  
  state.selectedTime = hora;
  state.selectedDuration = duracion;
  
  document.getElementById('confirmacionModal').classList.remove('hidden');
  
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



  // Verificar promoción (FIX: Extraer fecha sin hora)
  let descuento = 0;
  const promo = state.promociones.find(p => {
    if (!p.activa) return false;
    
    // Si tiene fecha específica, extraer solo YYYY-MM-DD y comparar
    if (p.fecha) {
      const promoFecha = p.fecha.split('T')[0];
      if (promoFecha !== state.selectedDate) return false;
    }
    
    // Si NO tiene rango horario, aplica a todo el día
    if (!p.hora_inicio || !p.hora_fin) return true;
    
    // Si tiene rango horario, verificar que el slot esté dentro
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
    <p class="text-lg"><strong>Cancha:</strong> ${state.selectedCourt}</p>
    <p class="text-lg"><strong>Fecha:</strong> ${state.selectedDate}</p>
    <p class="text-lg"><strong>Hora:</strong> ${convertirA12h(hora)}</p>
    <p class="text-lg"><strong>Duración:</strong> ${duracion}h</p>
    ${descuento > 0 ? `
      <p class="text-lg text-purple-600 font-bold"><strong>Descuento:</strong> ${descuento}%</p>
      <p class="text-lg text-gray-500 line-through">Precio: $${Math.round(precioBase)} MXN</p>
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
      alert('✅ Reserva creada exitosamente');
      cerrarModal();
      cargarDisponibilidad();
    } else {
      alert('❌ ' + (data.msg || 'Error al crear reserva'));
    }
  } catch (err) {
    alert('❌ Error de conexión');
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
              <p class="text-xl font-bold text-green-700">🎾 Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600 mt-1">📅 ${r.fecha} - ⏰ ${convertirA12h(r.hora_inicio)} - ⌛ ${r.duracion}h</p>
            </div>
            <button onclick="cancelarReserva('${r.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">
              ❌ Cancelar
            </button>
          </div>
          <div class="bg-white rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">💰 $${r.precio} MXN</p>
            <p class="text-sm mt-2 ${r.pagado ? 'text-green-600' : 'text-yellow-600'} font-bold">
              ${r.pagado ? '✅ Pagado' : '⏳ Pendiente de pago'}
            </p>
          </div>
        `;
        container.appendChild(div);
      });
    }



    document.getElementById('misReservasModal').classList.remove('hidden');
  } catch (err) {
    alert('❌ Error al cargar reservas');
  }
}



// CANCELAR RESERVA
async function cancelarReserva(id) {
  if (!confirm('⚠️ ¿Seguro que deseas cancelar esta reserva?')) return;



  try {
    const res = await fetch(API_BASE + '/api/reservas/' + id, {
      method: 'DELETE',
      headers: { 'x-token': state.token }
    });



    const data = await res.json();



    if (data.ok) {
      alert('✅ Reserva cancelada');
      verMisReservas();
    } else {
      alert('❌ Error al cancelar');
    }
  } catch (err) {
    alert('❌ Error de conexión');
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
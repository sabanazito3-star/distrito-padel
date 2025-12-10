// app.js - Frontend Distrito Padel v8.0 - Calendario Carrusel + Filtros + WhatsApp + Auto-refresh
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
  serverTime: null,
  filtroSoloDisponibles: false
};

let autoRefreshInterval = null;

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
  state.selectedDate = todayStr;
  
  renderizarCalendarioCarrusel();
  
  await Promise.all([cargarPromociones(), cargarBloqueos()]);
  
  iniciarAutoRefresh();
}

// GENERAR CALENDARIO CARRUSEL
function generarCalendarioCarrusel() {
  if (!state.serverTime) return [];
  
  const serverDate = new Date(state.serverTime.timestamp);
  const dias = [];
  
  for (let i = 0; i < 7; i++) {
    const fecha = new Date(serverDate);
    fecha.setDate(serverDate.getDate() + i);
    
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    const fechaStr = `${year}-${month}-${day}`;
    
    const nombreDia = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][fecha.getDay()];
    const nombreMes = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][fecha.getMonth()];
    
    dias.push({
      fechaStr,
      dia: day,
      nombreDia,
      mes: nombreMes,
      esHoy: i === 0
    });
  }
  
  return dias;
}

// RENDERIZAR CALENDARIO CARRUSEL
function renderizarCalendarioCarrusel() {
  const dias = generarCalendarioCarrusel();
  const container = document.getElementById('calendarioCarrusel');
  
  if (!container) return;
  
  container.innerHTML = `
    <div class="flex gap-3 overflow-x-auto pb-2 px-1" style="scrollbar-width: thin;">
      ${dias.map(d => `
        <button 
          onclick="seleccionarFechaCarrusel('${d.fechaStr}')"
          class="flex-shrink-0 w-20 p-3 rounded-xl border-2 transition-all ${
            state.selectedDate === d.fechaStr 
              ? 'bg-primary border-primary text-white shadow-lg scale-105' 
              : 'bg-white border-gray-200 hover:border-primary hover:shadow-md'
          }">
          <p class="text-xs font-semibold ${state.selectedDate === d.fechaStr ? 'text-white' : 'text-gray-500'}">${d.nombreDia}</p>
          <p class="text-2xl font-bold my-1">${d.dia}</p>
          <p class="text-xs ${state.selectedDate === d.fechaStr ? 'text-white' : 'text-gray-600'}">${d.mes}</p>
          ${d.esHoy ? `<p class="text-xs font-bold mt-1 ${state.selectedDate === d.fechaStr ? 'text-white' : 'text-primary'}">Hoy</p>` : ''}
        </button>
      `).join('')}
    </div>
  `;
}

// SELECCIONAR FECHA CARRUSEL
function seleccionarFechaCarrusel(fecha) {
  state.selectedDate = fecha;
  renderizarCalendarioCarrusel();
  if (state.selectedCourt) {
    cargarDisponibilidad();
  }
}

// TOGGLE FILTRO DISPONIBLES
function toggleFiltroDisponibles() {
  state.filtroSoloDisponibles = !state.filtroSoloDisponibles;
  renderizarHorariosPlaytomic();
}

// AUTO-REFRESH
function iniciarAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  autoRefreshInterval = setInterval(async () => {
    if (state.selectedCourt && state.selectedDate) {
      await cargarDisponibilidad();
    }
  }, 30000);
}

function detenerAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
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
  detenerAutoRefresh();
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
  const fecha = state.selectedDate;
  const cancha = state.selectedCourt;

  if (!fecha || !cancha) return;
  
  await cargarHoraServidor();

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

// RENDERIZAR HORARIOS PLAYTOMIC - CORREGIDA
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

  for (let h = 8; h <= 23; h++) {
    for (let minutos = 0; minutos < 60; minutos += 30) {
      const hora = `${h.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
      const slotInicioMin = h * 60 + minutos;
      
      let esPasado = false;
      if (state.selectedDate < hoyStr) {
        esPasado = true;
      } else if (state.selectedDate === hoyStr) {
        const horaActualServidor = horaServidor * 60 + minutosServidor;
        if (slotInicioMin < horaActualServidor) {
          esPasado = true;
        }
      }

      const disponible1h = verificarSlotDisponible(slotInicioMin, 60);
      
      const promoActiva = state.promociones.find(p => {
        if (!p.activa || p.fecha !== state.selectedDate) return false;
        if (!p.hora_inicio) return true;
        const [pH, pM] = p.hora_inicio.split(':').map(Number);
        const promoInicioMin = pH * 60 + pM;
        const [pHf, pMf] = p.hora_fin.split(':').map(Number);
        const promoFinMin = pHf * 60 + pMf;
        return slotInicioMin >= promoInicioMin && slotInicioMin < promoFinMin;
      });

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

      if (state.filtroSoloDisponibles && (!disponible1h.disponible || esPasado)) {
        continue;
      }

      const div = document.createElement('div');
      div.className = `w-24 h-20 p-2 rounded-xl border-2 ${badgeClass} flex flex-col items-center justify-center cursor-pointer transition-all m-1 shadow-sm hover:shadow-md`;
      
      if (!esPasado && disponible1h.disponible) {
        div.onclick = () => mostrarModalDuraciones(hora);
      }

      div.innerHTML = `
        <div class="text-lg font-bold">${convertirA12h(hora)}</div>
        <div class="text-sm mt-1">${badgeText}</div>
      `;

      container.appendChild(div);
    }
  }
}

// VERIFICAR SLOT DISPONIBLE
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

// MOSTRAR MODAL DURACIONES - CORREGIDA
function mostrarModalDuraciones(hora) {
  state.selectedTime = hora;
  const [h, m] = hora.split(':').map(Number);
  const slotInicioMin = h * 60 + m;
  
  const duraciones = [1, 1.5, 2];
  let opcionesHTML = '';
  
  duraciones.forEach(duracion => {
    const duracionMin = duracion * 60;
    const slotFinMin = slotInicioMin + duracionMin;
    
    if (slotFinMin > 24 * 60) {
      return;
    }
    
    const disponible = verificarSlotDisponible(slotInicioMin, duracionMin);
    
    if (!disponible.disponible) return;
    
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
    opcionesHTML = '<p class="text-center text-gray-500 py-8">No hay duraciones disponibles para este horario</p>';
  }
  
  document.getElementById('duracionModalTitulo').textContent = `${convertirA12h(hora)} - Selecciona duracion`;
  document.getElementById('duracionModalOpciones').innerHTML = opcionesHTML;
  document.getElementById('duracionModal').classList.remove('hidden');
}

// CALCULAR PRECIO PRECISO - CORREGIDA PARA EVITAR LOOP INFINITO
function calcularPrecioPreciso(horaInicio, duracion) {
  const [h, m] = horaInicio.split(':').map(Number);
  const horaDecimal = h + (m / 60);
  const cambioTarifa = state.config.precios.cambioTarifa;
  
  let precioBase = 0;
  
  // Calcular fin de reserva
  const horaFin = horaDecimal + duracion;
  
  // Si toda la reserva es antes del cambio de tarifa
  if (horaFin <= cambioTarifa) {
    precioBase = state.config.precios.horaDia * duracion;
  } 
  // Si toda la reserva es después del cambio de tarifa
  else if (horaDecimal >= cambioTarifa) {
    precioBase = state.config.precios.horaNoche * duracion;
  } 
  // Si la reserva cruza el cambio de tarifa
  else {
    const horasAntes = cambioTarifa - horaDecimal;
    const horasDespues = duracion - horasAntes;
    precioBase = (horasAntes * state.config.precios.horaDia) + (horasDespues * state.config.precios.horaNoche);
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

// SELECCIONAR DURACION
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
        <span class="text-gray-700">Duracion</span>
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

// CONFIRMAR RESERVA - CORREGIDA
async function confirmarReserva() {
  await cargarHoraServidor();
  
  const [h, m] = state.selectedTime.split(':').map(Number);
  const horaReservaMin = h * 60 + m;
  const horaActualMin = state.serverTime.hora * 60 + state.serverTime.minutos;
  
  if (state.selectedDate === state.serverTime.fecha && horaReservaMin < horaActualMin) {
    alert('Esta hora ya paso');
    cerrarModal();
    cargarDisponibilidad();
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
      alert('Reserva confirmada exitosamente');
      cerrarModal();
      cargarDisponibilidad();
    } else {
      alert(data.msg || 'Error al crear reserva');
    }
  } catch (err) {
    alert('Error de conexion');
  }
}

// FORMATEAR FECHA - CORREGIDA
function formatearFecha(fechaStr) {
  if (fechaStr.includes('T')) {
    fechaStr = fechaStr.split('T')[0];
  }
  
  const [year, month, day] = fechaStr.split('-');
  return `${day}/${month}/${year}`;
}

// CONVERTIR A 12H
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

// COMPARTIR RESERVA WHATSAPP
function compartirReservaWhatsApp(reserva) {
  const horaFin = calcularHoraFin(reserva.hora_inicio, reserva.duracion);
  
  const mensaje = `Distrito Padel - Mi Reserva\n\n` +
    `Fecha: ${reserva.fecha}\n` +
    `Hora: ${convertirA12h(reserva.hora_inicio)} - ${convertirA12h(horaFin)}\n` +
    `Cancha: ${reserva.cancha}\n` +
    `Precio: $${reserva.precio}\n\n` +
    `Nos vemos en la cancha`;
  
  const mensajeCodificado = encodeURIComponent(mensaje);
  const urlWhatsApp = `https://api.whatsapp.com/send?text=${mensajeCodificado}`;
  
  window.open(urlWhatsApp, '_blank');
}

// MIS RESERVAS - CORREGIDA
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
        
        const fechaFormateada = r.fecha.includes('T') ? 
          formatearFecha(r.fecha.split('T')[0]) : 
          formatearFecha(r.fecha);
        
        const horaFin = calcularHoraFin(r.hora_inicio, r.duracion);
        
        div.innerHTML = `
          <div class="flex justify-between items-start mb-4">
            <div>
              <p class="text-2xl font-bold text-green-600">Cancha ${r.cancha}</p>
              <p class="text-sm text-gray-600">${fechaFormateada}</p>
              <p class="text-lg font-semibold">${convertirA12h(r.hora_inicio)} - ${convertirA12h(horaFin)}</p>
            </div>
            ${!r.pagado ? `<span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-bold">Pendiente</span>` : ''}
          </div>
          <div class="flex justify-between items-center pt-4 border-t gap-3">
            <p class="text-2xl font-bold">$${r.precio}</p>
            <div class="flex gap-2">
              <button onclick='compartirReservaWhatsApp(${JSON.stringify({
                fecha: fechaFormateada,
                hora_inicio: r.hora_inicio,
                duracion: r.duracion,
                cancha: r.cancha,
                precio: r.precio
              })})' 
                class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                WhatsApp
              </button>
              <button onclick="cancelarReserva('${r.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">
                Cancelar
              </button>
            </div>
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
  if (!confirm('Cancelar esta reserva?')) return;

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
    alert('Error de conexion');
  }
}

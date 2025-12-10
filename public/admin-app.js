
// admin-app.js - Panel Admin Avanzado v8.1 - COMPLETO
const API_BASE = '';

let state = {
  reservas: [],
  promociones: [],
  bloqueos: [],
  usuarios: [],
  config: { 
    precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 },
    horarios: { apertura: 8, cierre: 24 },
    duraciones: [1, 1.5, 2],
    anticipacionMinima: 0,
    canchasActivas: { 1: true, 2: true, 3: true }
  },
  token: localStorage.getItem('admin_token') || '',
  currentTab: 'dashboard',
  autoUpdateInterval: null,
  mostrarCanceladas: false,
  mostrarPasadas: false,
  filtroTotalTipo: 'todo',
  filtroFechaInicio: '',
  filtroFechaFin: '',
  vistaCalendario: 'dia'
};

window.onload = () => {
  if (state.token) {
    document.getElementById('adminToken').value = state.token;
    loadAllData();
    startAutoUpdate();
  }
  cargarConfigActual();
  initDatepicker();
};

async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  if (state.token) opts.headers['x-admin-token'] = state.token;
  const res = await fetch(API_BASE + '/api/admin' + path, opts);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw json || { error: 'API error' };
  return json;
}

async function loadAllData() {
  const token = document.getElementById('adminToken').value.trim();
  if (!token) {
    alert('Ingresa el token de administrador');
    return;
  }

  state.token = token;
  localStorage.setItem('admin_token', token);

  try {
    // Cargar solo los endpoints que SÍ existen
    const reservas = await api('/reservas');

    // Intentar cargar usuarios (si falla, array vacío)
    let usuarios = [];
    try {
      usuarios = await api('/usuarios');
    } catch (err) {
      console.warn('Endpoint usuarios no disponible');
    }

    // Cargar promociones y bloqueos sin romper todo si fallan
    const promociones = await fetch(API_BASE + '/api/promociones').then(r => r.json()).catch(() => []);
    const bloqueos = await fetch(API_BASE + '/api/bloqueos').then(r => r.json()).catch(() => []);

    state.reservas = reservas;
    state.usuarios = usuarios;
    state.promociones = promociones;
    state.bloqueos = bloqueos;

    renderReservas();
    renderPromociones();
    renderBloqueos();
    renderUsuarios();
    renderEstadisticasAvanzadas();
    renderCalendario();
    renderGestionFinanciera();
    renderGestionCanchas();
    updateStats();
    updateLastUpdate();

    if (!state.autoUpdateInterval) {
      startAutoUpdate();
    }
  } catch (err) {
    console.error('Error completo:', err);
    alert('Error: ' + (err.msg || err.error || 'Token invalido o servidor no responde'));
    localStorage.removeItem('admin_token');
    stopAutoUpdate();
  }
}

function startAutoUpdate() {
  stopAutoUpdate();
  state.autoUpdateInterval = setInterval(async () => {
    if (!state.token) return;
    try {
      const reservas = await api('/reservas');
      if (JSON.stringify(reservas) !== JSON.stringify(state.reservas)) {
        state.reservas = reservas;
        renderReservas();
        renderCalendario();
        renderGestionFinanciera();
        updateStats();
        renderEstadisticasAvanzadas();
      }
      updateLastUpdate();
    } catch (err) {
      console.error('Auto-update error:', err);
    }
  }, 15000);
}

function stopAutoUpdate() {
  if (state.autoUpdateInterval) {
    clearInterval(state.autoUpdateInterval);
    state.autoUpdateInterval = null;
  }
}

function updateLastUpdate() {
  const now = new Date();
  const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const updateEl = document.getElementById('lastUpdate');
  if (updateEl) {
    updateEl.textContent = 'Ultima actualizacion: ' + time;
  }
}

function showTab(tab) {
  state.currentTab = tab;

  document.getElementById('contentDashboard').classList.add('hidden');
  document.getElementById('contentReservas').classList.add('hidden');
  document.getElementById('contentUsuarios').classList.add('hidden');
  document.getElementById('contentPromociones').classList.add('hidden');
  document.getElementById('contentBloqueos').classList.add('hidden');
  document.getElementById('contentConfig').classList.add('hidden');
  document.getElementById('contentReportes').classList.add('hidden');
  document.getElementById('contentFinanciero').classList.add('hidden');
  document.getElementById('contentCanchas').classList.add('hidden');
  document.getElementById('contentCalendario').classList.add('hidden');

  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  const tabMap = {
    'dashboard': 'contentDashboard',
    'reservas': 'contentReservas',
    'usuarios': 'contentUsuarios',
    'promociones': 'contentPromociones',
    'bloqueos': 'contentBloqueos',
    'config': 'contentConfig',
    'reportes': 'contentReportes',
    'financiero': 'contentFinanciero',
    'canchas': 'contentCanchas',
    'calendario': 'contentCalendario'
  };

  const contentId = tabMap[tab];
  if (contentId) {
    document.getElementById(contentId).classList.remove('hidden');
    const tabBtn = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (tabBtn) tabBtn.classList.add('active');
  }

  if (tab === 'dashboard') {
    renderEstadisticasAvanzadas();
  } else if (tab === 'calendario') {
    renderCalendario();
  } else if (tab === 'financiero') {
    renderGestionFinanciera();
  } else if (tab === 'canchas') {
    renderGestionCanchas();
  }
}

function convertirA12h(hora24) {
  if (!hora24) return '';
  const [h, m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const hora12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hora12}:${String(m).padStart(2, '0')} ${periodo}`;
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const fechaStr = typeof fechaISO === 'string' && fechaISO.includes('T') ? fechaISO.split('T')[0] : fechaISO;
  const fecha = new Date(fechaStr + 'T00:00:00');
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const año = fecha.getFullYear();
  return `${dia}/${mes}/${año}`;
}

function obtenerFechaISO(fechaStr) {
  if (!fechaStr) return null;
  if (typeof fechaStr === 'string' && fechaStr.includes('T')) {
    return fechaStr.split('T')[0];
  }
  return fechaStr;
}

// RESERVAS
function renderReservas() {
  const tbody = document.getElementById('reservasTable');
  tbody.innerHTML = '';

  if (state.reservas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-12 text-gray-500">
          <p class="text-lg">No hay reservas registradas</p>
        </td>
      </tr>
    `;
    return;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const activas = state.reservas.filter(r => r.estado !== 'cancelada');
  const canceladas = state.reservas.filter(r => r.estado === 'cancelada');

  const futuras = activas.filter(r => {
    const fechaISO = obtenerFechaISO(r.fecha);
    if (!fechaISO) return false;
    const fechaReserva = new Date(fechaISO + 'T00:00:00');
    fechaReserva.setHours(0, 0, 0, 0);
    return fechaReserva >= hoy;
  });

  const pasadas = activas.filter(r => {
    const fechaISO = obtenerFechaISO(r.fecha);
    if (!fechaISO) return false;
    const fechaReserva = new Date(fechaISO + 'T00:00:00');
    fechaReserva.setHours(0, 0, 0, 0);
    return fechaReserva < hoy;
  });

  const agruparPorFecha = (reservas) => {
    const grupos = {};
    reservas.forEach(r => {
      const fechaISO = obtenerFechaISO(r.fecha);
      if (!fechaISO) return;
      if (!grupos[fechaISO]) grupos[fechaISO] = [];
      grupos[fechaISO].push(r);
    });
    return grupos;
  };

  const reservasFuturas = agruparPorFecha(futuras);
  const reservasPasadas = agruparPorFecha(pasadas);

  const header = document.createElement('tr');
  header.innerHTML = `
    <td colspan="8" class="px-4 py-3 bg-blue-50 text-center">
      <div class="flex justify-center gap-6 items-center flex-wrap">
        <span class="font-bold text-primary">Activas (Hoy y Futuras): ${futuras.length}</span>
        <span class="font-bold text-gray-700">Pasadas: ${pasadas.length}</span>
        <span class="font-bold text-red-700">Canceladas: ${canceladas.length}</span>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="checkMostrarPasadas" ${state.mostrarPasadas ? 'checked' : ''}>
          <span class="text-sm">Mostrar pasadas</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="checkMostrarCanceladas" ${state.mostrarCanceladas ? 'checked' : ''}>
          <span class="text-sm">Mostrar canceladas</span>
        </label>
      </div>
    </td>
  `;
  tbody.appendChild(header);

  setTimeout(() => {
    const checkPasadas = document.getElementById('checkMostrarPasadas');
    const checkCanceladas = document.getElementById('checkMostrarCanceladas');
    
    if (checkPasadas) {
      checkPasadas.onchange = function() {
        state.mostrarPasadas = this.checked;
        renderReservas();
      };
    }
    
    if (checkCanceladas) {
      checkCanceladas.onchange = function() {
        state.mostrarCanceladas = this.checked;
        renderReservas();
      };
    }
  }, 0);

  const renderGrupo = (grupos, titulo, colorClass) => {
    const fechasOrdenadas = Object.keys(grupos).sort((a, b) => new Date(b) - new Date(a));

    fechasOrdenadas.forEach(fechaISO => {
      const reservasDelDia = grupos[fechaISO].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
      
      const fecha = new Date(fechaISO + 'T00:00:00');
      const esHoy = fecha.getTime() === hoy.getTime();
      const diaSemana = fecha.toLocaleDateString('es-MX', { weekday: 'long' });
      const fechaFormateada = formatearFecha(fechaISO);
      const etiquetaHoy = esHoy ? ' - HOY' : '';
      
      const headerDia = document.createElement('tr');
      headerDia.className = `bg-${colorClass}-100 border-t-2 border-${colorClass}-300`;
      headerDia.innerHTML = `
        <td colspan="8" class="px-4 py-2 font-bold text-${colorClass}-800">
          ${diaSemana.toUpperCase()} ${fechaFormateada}${etiquetaHoy} - ${reservasDelDia.length} reserva(s)
        </td>
      `;
      tbody.appendChild(headerDia);

      reservasDelDia.forEach(r => {
        const tr = document.createElement('tr');
        const canceladaClass = r.estado === 'cancelada' ? 'bg-gray-100 opacity-60' : 'hover:bg-gray-50';
        tr.className = `${canceladaClass} border-b`;

        const pagadoClass = r.pagado ? 'bg-green-100 text-primary' : 'bg-yellow-100 text-yellow-700';
        const pagadoText = r.pagado ? 'Pagada' : 'Pendiente';
        const metodoPagoTexto = r.metodo_pago ? `<br><span class="text-xs text-gray-600">${r.metodo_pago}</span>` : '';

        const tieneDescuento = r.descuento && r.descuento > 0;
        const precioHTML = tieneDescuento ? `
          <div>
            <p class="text-xs text-gray-500 line-through">$${Math.round(r.precio_base || r.precio)}</p>
            <p class="text-lg font-bold text-purple-600">$${r.precio}</p>
            <span class="px-2 py-1 bg-purple-500 text-white text-xs rounded-full">
              ${r.descuento}% OFF
            </span>
          </div>
        ` : `
          <p class="text-lg font-bold text-primary">$${r.precio}</p>
        `;

        const botonesHTML = r.estado === 'cancelada' 
          ? '<span class="text-xs text-gray-500 italic">Cancelada</span>'
          : `
            <button onclick="editarReserva('${r.id}')" class="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 mr-2 mb-1">
              Editar
            </button>
            <button onclick="marcarPagada('${r.id}', ${!r.pagado})" class="px-3 py-1 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 mr-2 mb-1">
              ${r.pagado ? 'Marcar Pendiente' : 'Marcar Pagada'}
            </button>
            <button onclick="cancelarReserva('${r.id}')" class="px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600">
              Cancelar
            </button>
          `;

        tr.innerHTML = `
          <td class="px-4 py-3 font-bold text-blue-600">${convertirA12h(r.hora_inicio)}</td>
          <td class="px-4 py-3">${r.duracion}h</td>
          <td class="px-4 py-3 text-center font-bold">Cancha ${r.cancha}</td>
          <td class="px-4 py-3">
            <div>
              <p class="font-bold text-gray-800">${r.nombre}</p>
              <p class="text-xs text-gray-600">${r.email}</p>
              <p class="text-xs text-gray-600">${r.telefono}</p>
            </div>
          </td>
          <td class="px-4 py-3">${precioHTML}</td>
          <td class="px-4 py-3">
            <span class="px-3 py-1 rounded-full text-xs font-bold ${pagadoClass}">
              ${pagadoText}${metodoPagoTexto}
            </span>
          </td>
          <td class="px-4 py-3">
            <button onclick="agregarNota('${r.id}')" class="text-blue-600 hover:underline text-sm">
              ${r.notas ? 'Ver nota' : 'Agregar nota'}
            </button>
          </td>
          <td class="px-4 py-3">${botonesHTML}</td>
        `;
        tbody.appendChild(tr);
      });
    });
  };

  renderGrupo(reservasFuturas, 'Hoy y Proximas Reservas', 'green');

  if (state.mostrarPasadas) {
    renderGrupo(reservasPasadas, 'Reservas Anteriores', 'gray');
  }

  if (state.mostrarCanceladas) {
    const canceladasAgrupadas = agruparPorFecha(canceladas);
    renderGrupo(canceladasAgrupadas, 'Canceladas', 'red');
  }
}

async function editarReserva(id) {
  const reserva = state.reservas.find(r => r.id === id);
  if (!reserva) return;

  const nuevaHora = prompt('Nueva hora (HH:MM formato 24h):', reserva.hora_inicio);
  if (!nuevaHora) return;

  const nuevaDuracion = prompt('Nueva duracion (1, 1.5 o 2):', reserva.duracion);
  if (!nuevaDuracion) return;

  try {
    await fetch(API_BASE + `/api/admin/reservas/${id}/editar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ hora: nuevaHora, duracion: parseFloat(nuevaDuracion) })
    });

    alert('Reserva editada exitosamente');
    await loadAllData();
  } catch (err) {
    alert('Error al editar reserva');
  }
}

async function agregarNota(id) {
  const reserva = state.reservas.find(r => r.id === id);
  if (!reserva) return;

  const nota = prompt('Nota interna (solo visible para admin):', reserva.notas || '');
  if (nota === null) return;

  try {
    await fetch(API_BASE + `/api/admin/reservas/${id}/nota`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ nota })
    });

    alert('Nota guardada');
    await loadAllData();
  } catch (err) {
    alert('Error al guardar nota');
  }
}

async function marcarPagada(id, pagar) {
  if (!pagar) {
    if (!confirm('Marcar como PENDIENTE de pago?')) return;
    
    try {
      const response = await fetch(API_BASE + `/api/admin/reservas/${id}/marcar-pendiente`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': state.token
        }
      });

      if (response.ok) {
        alert('Marcada como pendiente');
        await loadAllData();
      } else {
        alert('Error al marcar como pendiente');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error al marcar como pendiente');
    }
    return;
  }

  const metodo = prompt('Metodo de pago:\n1 = Efectivo\n2 = Tarjeta\n3 = Transferencia');
  
  if (!metodo || !['1','2','3'].includes(metodo)) {
    alert('Metodo invalido. Debe ser 1, 2 o 3');
    return;
  }

  try {
    const response = await fetch(API_BASE + `/api/admin/reservas/${id}/pagar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ metodoPago: metodo })
    });

    if (response.ok) {
      alert('Reserva marcada como pagada');
      await loadAllData();
    } else {
      alert('Error al marcar como pagada');
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al marcar como pagada');
  }
}

async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva?\n\nSe mantendra el registro pero se liberara el horario.')) return;
  
  try {
    const response = await fetch(API_BASE + `/api/admin/reservas/${id}/cancelar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      }
    });

    if (response.ok) {
      alert('Reserva cancelada exitosamente');
      await loadAllData();
    } else {
      alert('Error al cancelar reserva');
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Error al cancelar reserva');
  }
}

async function crearReservaManual() {
  const fecha = document.getElementById('manualFecha').value;
  const hora = document.getElementById('manualHora').value;
  const duracion = parseFloat(document.getElementById('manualDuracion').value);
  const cancha = parseInt(document.getElementById('manualCancha').value);
  const nombre = document.getElementById('manualNombre').value.trim();
  const telefono = document.getElementById('manualTelefono').value.trim();
  const email = document.getElementById('manualEmail').value.trim() || `manual${Date.now()}@sistema.local`;

  if (!fecha || !hora || !nombre || !telefono) {
    alert('Completa todos los campos obligatorios');
    return;
  }

  try {
    await fetch(API_BASE + '/api/admin/reservas/manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ fecha, hora, duracion, cancha, nombre, telefono, email })
    });
    
    alert('Reserva manual creada exitosamente');
    document.getElementById('manualNombre').value = '';
    document.getElementById('manualTelefono').value = '';
    document.getElementById('manualEmail').value = '';
    await loadAllData();
  } catch (err) {
    alert('Error al crear reserva manual');
  }
}

// USUARIOS
function renderUsuarios() {
  const tbody = document.getElementById('usuariosTable');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (state.usuarios.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-12 text-gray-500">
          <p class="text-lg">No hay usuarios registrados</p>
        </td>
      </tr>
    `;
    return;
  }

  state.usuarios.forEach(u => {
    const reservasUsuario = state.reservas.filter(r => r.email === u.email && r.estado !== 'cancelada');
    const totalGastado = reservasUsuario.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const bloqueado = u.bloqueado || false;
    
    const tr = document.createElement('tr');
    tr.className = bloqueado ? 'bg-red-50 opacity-60 border-b' : 'hover:bg-gray-50 border-b';
    tr.innerHTML = `
      <td class="px-4 py-3 font-bold text-gray-800">${u.nombre}</td>
      <td class="px-4 py-3 text-gray-600">${u.email}</td>
      <td class="px-4 py-3 text-gray-600">${u.telefono}</td>
      <td class="px-4 py-3 text-center font-bold text-blue-600">${reservasUsuario.length}</td>
      <td class="px-4 py-3 text-center font-bold text-primary">$${Math.round(totalGastado)}</td>
      <td class="px-4 py-3 text-center">
        ${bloqueado ? '<span class="px-2 py-1 bg-red-500 text-white rounded text-xs">Bloqueado</span>' : '<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Activo</span>'}
      </td>
      <td class="px-4 py-3 text-center">
        <button onclick="verDetalleUsuario('${u.email}')" class="px-3 py-1 bg-primary text-white rounded-lg text-sm hover:bg-primary-light mr-2">
          Ver Detalle
        </button>
        <button onclick="toggleBloqueoUsuario('${u.email}')" class="px-3 py-1 ${bloqueado ? 'bg-green-500' : 'bg-red-500'} text-white rounded-lg text-sm hover:opacity-80">
          ${bloqueado ? 'Desbloquear' : 'Bloquear'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleBloqueoUsuario(email) {
  const usuario = state.usuarios.find(u => u.email === email);
  const accion = usuario.bloqueado ? 'desbloquear' : 'bloquear';
  
  if (!confirm(`¿${accion.toUpperCase()} a ${usuario.nombre}?`)) return;

  try {
    await fetch(API_BASE + `/api/admin/usuarios/${email}/bloquear`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ bloqueado: !usuario.bloqueado })
    });

    alert(`Usuario ${accion}ado exitosamente`);
    await loadAllData();
  } catch (err) {
    alert(`Error al ${accion} usuario`);
  }
}

function verDetalleUsuario(email) {
  const usuario = state.usuarios.find(u => u.email === email);
  if (!usuario) return;

  const reservasUsuario = state.reservas.filter(r => r.email === email).sort((a, b) => {
    const fechaA = obtenerFechaISO(a.fecha);
    const fechaB = obtenerFechaISO(b.fecha);
    return fechaB.localeCompare(fechaA);
  });

  const totalGastado = reservasUsuario.filter(r => r.estado !== 'cancelada').reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);

  let historialHTML = '';
  reservasUsuario.forEach(r => {
    const estadoClass = r.estado === 'cancelada' ? 'bg-red-100 text-red-700' : r.pagado ? 'bg-green-100 text-primary' : 'bg-yellow-100 text-yellow-700';
    const estadoTexto = r.estado === 'cancelada' ? 'Cancelada' : r.pagado ? 'Pagada' : 'Pendiente';
    
    historialHTML += `
      <div class="border-b py-3">
        <div class="flex justify-between items-center">
          <div>
            <p class="font-bold">${formatearFecha(r.fecha)} - ${convertirA12h(r.hora_inicio)} (${r.duracion}h)</p>
            <p class="text-sm text-gray-600">Cancha ${r.cancha} - $${r.precio}</p>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-bold ${estadoClass}">${estadoTexto}</span>
        </div>
      </div>
    `;
  });

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-4 border-b pb-4">
        <h2 class="text-2xl font-bold text-primary">Detalle Usuario</h2>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700 text-3xl">&times;</button>
      </div>
      
      <div class="mb-6">
        <p class="text-lg"><strong>Nombre:</strong> ${usuario.nombre}</p>
        <p class="text-lg"><strong>Email:</strong> ${usuario.email}</p>
        <p class="text-lg"><strong>Telefono:</strong> ${usuario.telefono}</p>
        <p class="text-lg"><strong>Total Reservas:</strong> ${reservasUsuario.length}</p>
        <p class="text-lg"><strong>Total Gastado:</strong> <span class="text-primary font-bold">$${Math.round(totalGastado)}</span></p>
        <p class="text-lg"><strong>Estado:</strong> ${usuario.bloqueado ? '<span class="text-red-600">Bloqueado</span>' : '<span class="text-green-600">Activo</span>'}</p>
      </div>

      <h3 class="font-bold text-lg mb-3 border-b pb-2">Historial de Reservas</h3>
      <div class="space-y-2">
        ${historialHTML || '<p class="text-gray-500 text-center py-4">Sin reservas</p>'}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// PROMOCIONES
function renderPromociones() {
  const container = document.getElementById('promocionesLista');
  if (!container) return;

  container.innerHTML = '';

  if (state.promociones.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No hay promociones activas</p>';
    return;
  }

  state.promociones.forEach(p => {
    const div = document.createElement('div');
    div.className = 'bg-purple-50 border-2 border-purple-200 rounded-xl p-4 mb-4';
    
    let textoPromo = `${p.descuento}% OFF`;
    if (p.fecha) textoPromo += ` - ${formatearFecha(p.fecha)}`;
    if (p.hora_inicio && p.hora_fin) textoPromo += ` de ${convertirA12h(p.hora_inicio)} a ${convertirA12h(p.hora_fin)}`;
    if (p.codigo) textoPromo += ` - Codigo: ${p.codigo}`;
    
    div.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <p class="font-bold text-purple-700">${textoPromo}</p>
          <p class="text-sm text-gray-600">${p.activa ? 'Activa' : 'Inactiva'}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="togglePromocion('${p.id}')" class="px-4 py-2 ${p.activa ? 'bg-gray-500' : 'bg-green-500'} text-white rounded-lg hover:opacity-80">
            ${p.activa ? 'Desactivar' : 'Activar'}
          </button>
          <button onclick="eliminarPromocion('${p.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
            Eliminar
          </button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

async function togglePromocion(id) {
  const promo = state.promociones.find(p => p.id === id);
  if (!promo) return;

  try {
    await fetch(API_BASE + `/api/admin/promociones/${id}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      }
    });
    alert(`Promocion ${promo.activa ? 'desactivada' : 'activada'}`);
    await loadAllData();
  } catch (err) {
    alert('Error al cambiar estado');
  }
}

async function crearPromocion() {
  const fecha = document.getElementById('promoFecha').value || null;
  const descuento = parseInt(document.getElementById('promoDescuento').value);
  const horaInicio = document.getElementById('promoHoraInicio').value || null;
  const horaFin = document.getElementById('promoHoraFin').value || null;
  const codigo = document.getElementById('promoCodigo').value.trim() || null;

  if (!descuento || descuento < 1 || descuento > 100) {
    alert('Ingresa un descuento valido entre 1 y 100%');
    return;
  }

  try {
    await fetch(API_BASE + '/api/admin/promociones', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ fecha, descuento, horaInicio, horaFin, codigo })
    });

    alert('Promocion creada');
    document.getElementById('promoFecha').value = '';
    document.getElementById('promoDescuento').value = '';
    document.getElementById('promoHoraInicio').value = '';
    document.getElementById('promoHoraFin').value = '';
    document.getElementById('promoCodigo').value = '';
    await loadAllData();
  } catch (err) {
    alert('Error al crear promocion');
  }
}

async function eliminarPromocion(id) {
  if (!confirm('Eliminar esta promocion?')) return;

  try {
    await fetch(API_BASE + `/api/admin/promociones/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': state.token }
    });
    alert('Promocion eliminada');
    await loadAllData();
  } catch (err) {
    alert('Error al eliminar');
  }
}

// BLOQUEOS
function renderBloqueos() {
  const container = document.getElementById('bloqueosLista');
  if (!container) return;

  container.innerHTML = '';

  if (state.bloqueos.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No hay bloqueos registrados</p>';
    return;
  }

  state.bloqueos.forEach(b => {
    const div = document.createElement('div');
    div.className = 'bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4';
    
    let textoBloqueo = `${formatearFecha(b.fecha)}`;
    if (b.cancha) textoBloqueo += ` - Cancha ${b.cancha}`;
    else textoBloqueo += ' - Todas las canchas';
    if (b.hora_inicio && b.hora_fin) textoBloqueo += ` de ${convertirA12h(b.hora_inicio)} a ${convertirA12h(b.hora_fin)}`;
    
    div.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <p class="font-bold text-red-700">${textoBloqueo}</p>
          <p class="text-sm text-gray-600">${b.motivo || 'Sin motivo'}</p>
        </div>
        <button onclick="eliminarBloqueo('${b.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
          Eliminar
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

async function crearBloqueo() {
  const fecha = document.getElementById('bloqueoFecha').value;
  const cancha = document.getElementById('bloqueoCancha').value ? parseInt(document.getElementById('bloqueoCancha').value) : null;
  const horaInicio = document.getElementById('bloqueoHoraInicio').value || null;
  const horaFin = document.getElementById('bloqueoHoraFin').value || null;
  const motivo = document.getElementById('bloqueoMotivo').value.trim();

  if (!fecha) {
    alert('Ingresa una fecha');
    return;
  }

  try {
    await fetch(API_BASE + '/api/admin/bloqueos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ fecha, cancha, horaInicio, horaFin, motivo })
    });

    alert('Bloqueo creado');
    document.getElementById('bloqueoFecha').value = '';
    document.getElementById('bloqueoCancha').value = '';
    document.getElementById('bloqueoHoraInicio').value = '';
    document.getElementById('bloqueoHoraFin').value = '';
    document.getElementById('bloqueoMotivo').value = '';
    await loadAllData();
  } catch (err) {
    alert('Error al crear bloqueo');
  }
}

async function crearBloqueoMasivo() {
  const fechaInicio = document.getElementById('bloqueoMasivoInicio').value;
  const fechaFin = document.getElementById('bloqueoMasivoFin').value;
  const cancha = document.getElementById('bloqueoMasivoCancha').value ? parseInt(document.getElementById('bloqueoMasivoCancha').value) : null;
  const motivo = document.getElementById('bloqueoMasivoMotivo').value.trim();

  if (!fechaInicio || !fechaFin) {
    alert('Selecciona rango de fechas');
    return;
  }

  if (!confirm(`Crear bloqueo desde ${formatearFecha(fechaInicio)} hasta ${formatearFecha(fechaFin)}?`)) return;

  try {
    await fetch(API_BASE + '/api/admin/bloqueos/masivo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ fechaInicio, fechaFin, cancha, motivo })
    });

    alert('Bloqueos masivos creados');
    document.getElementById('bloqueoMasivoInicio').value = '';
    document.getElementById('bloqueoMasivoFin').value = '';
    document.getElementById('bloqueoMasivoCancha').value = '';
    document.getElementById('bloqueoMasivoMotivo').value = '';
    await loadAllData();
  } catch (err) {
    alert('Error al crear bloqueos masivos');
  }
}

async function eliminarBloqueo(id) {
  if (!confirm('Eliminar este bloqueo?')) return;

  try {
    await fetch(API_BASE + `/api/admin/bloqueos/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': state.token }
    });
    alert('Bloqueo eliminado');
    await loadAllData();
  } catch (err) {
    alert('Error al eliminar');
  }
}

// CONFIG
async function cargarConfigActual() {
  try {
    const res = await fetch(API_BASE + '/api/config');
    const config = await res.json();
    state.config = config;

    document.getElementById('configPrecioDia').value = config.precios.horaDia;
    document.getElementById('configPrecioNoche').value = config.precios.horaNoche;
    document.getElementById('configCambioTarifa').value = config.precios.cambioTarifa;

    document.getElementById('displayPrecioDia').textContent = '$' + config.precios.horaDia;
    document.getElementById('displayPrecioNoche').textContent = '$' + config.precios.horaNoche;
    document.getElementById('displayCambio').textContent = config.precios.cambioTarifa + ':00';
  } catch (err) {
    console.error('Error cargar config:', err);
  }
}

async function actualizarPrecios() {
  const horaDia = parseFloat(document.getElementById('configPrecioDia').value);
  const horaNoche = parseFloat(document.getElementById('configPrecioNoche').value);
  const cambioTarifa = parseInt(document.getElementById('configCambioTarifa').value);

  if (!horaDia || !horaNoche || !cambioTarifa) {
    alert('Completa todos los campos');
    return;
  }

  try {
    await fetch(API_BASE + '/api/admin/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ horaDia, horaNoche, cambioTarifa })
    });

    alert('Precios actualizados');
    await cargarConfigActual();
  } catch (err) {
    alert('Error al actualizar precios');
  }
}

// REPORTES
async function descargarReporteDia() {
  const fecha = prompt('Fecha (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
  if (!fecha) return;

  try {
    const response = await fetch(API_BASE + `/api/admin/reporte/dia?fecha=${fecha}`, {
      headers: { 'x-admin-token': state.token }
    });
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${fecha}.csv`;
    a.click();
  } catch (err) {
    alert('Error al descargar reporte');
  }
}

async function descargarReporteMes() {
  const mes = prompt('Mes (1-12):', new Date().getMonth() + 1);
  const año = prompt('Ano:', new Date().getFullYear());
  if (!mes || !año) return;

  try {
    const response = await fetch(API_BASE + `/api/admin/reporte/mes?mes=${mes}&año=${año}`, {
      headers: { 'x-admin-token': state.token }
    });
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${mes}_${año}.csv`;
    a.click();
  } catch (err) {
    alert('Error al descargar reporte');
  }
}

async function exportarUsuarios() {
  if (state.usuarios.length === 0) {
    alert('No hay usuarios para exportar');
    return;
  }

  let csv = 'Nombre,Email,Telefono,Total Reservas,Total Gastado,Estado\n';
  
  state.usuarios.forEach(u => {
    const reservasUsuario = state.reservas.filter(r => r.email === u.email && r.estado !== 'cancelada');
    const totalGastado = reservasUsuario.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    const estado = u.bloqueado ? 'Bloqueado' : 'Activo';
    csv += `"${u.nombre}","${u.email}","${u.telefono}",${reservasUsuario.length},${Math.round(totalGastado)},"${estado}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `usuarios_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

function cambiarFiltroTotal() {
  const tipo = document.getElementById('filtroTotalTipo').value;
  state.filtroTotalTipo = tipo;
  
  const filtroFechaDiv = document.getElementById('filtroFechaDiv');
  const filtroRangoDiv = document.getElementById('filtroRangoDiv');
  
  filtroFechaDiv.classList.add('hidden');
  filtroRangoDiv.classList.add('hidden');
  
  if (tipo === 'fecha') {
    filtroFechaDiv.classList.remove('hidden');
  } else if (tipo === 'rango') {
    filtroRangoDiv.classList.remove('hidden');
  }
  
  updateStats();
}

function aplicarFiltroFecha() {
  const fecha = document.getElementById('filtroFechaUnica').value;
  if (!fecha) {
    alert('Selecciona una fecha');
    return;
  }
  state.filtroFechaInicio = fecha;
  state.filtroFechaFin = fecha;
  updateStats();
  renderGestionFinanciera();
}

function aplicarFiltroRango() {
  const inicio = document.getElementById('filtroFechaInicio').value;
  const fin = document.getElementById('filtroFechaFin').value;
  
  if (!inicio || !fin) {
    alert('Selecciona ambas fechas');
    return;
  }
  
  if (inicio > fin) {
    alert('La fecha inicial no puede ser mayor a la final');
    return;
  }
  
  state.filtroFechaInicio = inicio;
  state.filtroFechaFin = fin;
  updateStats();
  renderGestionFinanciera();
}

function updateStats() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  const reservasActivas = state.reservas.filter(r => {
    if (r.estado === 'cancelada') return false;
    const fechaISO = obtenerFechaISO(r.fecha);
    if (!fechaISO) return false;
    const fechaReserva = new Date(fechaISO + 'T00:00:00');
    fechaReserva.setHours(0, 0, 0, 0);
    return fechaReserva >= hoy;
  });
  
  let reservasParaTotal = state.reservas.filter(r => r.estado !== 'cancelada');
  
  if (state.filtroTotalTipo === 'fecha' && state.filtroFechaInicio) {
    reservasParaTotal = reservasParaTotal.filter(r => {
      const fechaISO = obtenerFechaISO(r.fecha);
      return fechaISO === state.filtroFechaInicio;
    });
  } else if (state.filtroTotalTipo === 'rango' && state.filtroFechaInicio && state.filtroFechaFin) {
    reservasParaTotal = reservasParaTotal.filter(r => {
      const fechaISO = obtenerFechaISO(r.fecha);
      return fechaISO >= state.filtroFechaInicio && fechaISO <= state.filtroFechaFin;
    });
  }
  
  const totalReservas = reservasActivas.length;
  const totalRecaudado = reservasParaTotal.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
  const pendientesPago = reservasActivas.filter(r => !r.pagado).length;

  const statReservas = document.getElementById('statReservas');
  const statRecaudado = document.getElementById('statRecaudado');
  const statPendientes = document.getElementById('statPendientes');
  
  if (statReservas) statReservas.textContent = totalReservas;
  if (statRecaudado) statRecaudado.textContent = '$' + Math.round(totalRecaudado).toLocaleString();
  if (statPendientes) statPendientes.textContent = pendientesPago;
  
  let filtroTexto = 'Todo el tiempo';
  if (state.filtroTotalTipo === 'fecha' && state.filtroFechaInicio) {
    filtroTexto = formatearFecha(state.filtroFechaInicio);
  } else if (state.filtroTotalTipo === 'rango' && state.filtroFechaInicio && state.filtroFechaFin) {
    filtroTexto = `${formatearFecha(state.filtroFechaInicio)} - ${formatearFecha(state.filtroFechaFin)}`;
  }
  
  const filtroLabel = document.getElementById('filtroTotalLabel');
  if (filtroLabel) {
    filtroLabel.textContent = filtroTexto;
  }
}

// ESTADISTICAS AVANZADAS (Dashboard)
function renderEstadisticasAvanzadas() {
  const container = document.getElementById('estadisticasAvanzadas');
  if (!container) return;

  // Calcular datos
  const reservasActivas = state.reservas.filter(r => r.estado !== 'cancelada');
  
  // Ingresos por semana/mes
  const hoy = new Date();
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - hoy.getDay());
  inicioSemana.setHours(0, 0, 0, 0);
  
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  
  const reservasSemana = reservasActivas.filter(r => {
    const fechaISO = obtenerFechaISO(r.fecha);
    if (!fechaISO) return false;
    const fecha = new Date(fechaISO + 'T00:00:00');
    return fecha >= inicioSemana;
  });
  
  const reservasMes = reservasActivas.filter(r => {
    const fechaISO = obtenerFechaISO(r.fecha);
    if (!fechaISO) return false;
    const fecha = new Date(fechaISO + 'T00:00:00');
    return fecha >= inicioMes;
  });
  
  const ingresosSemana = reservasSemana.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
  const ingresosMes = reservasMes.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
  
  // Ingresos por cancha
  const ingresosPorCancha = { 1: 0, 2: 0, 3: 0 };
  reservasActivas.forEach(r => {
    ingresosPorCancha[r.cancha] = (ingresosPorCancha[r.cancha] || 0) + parseFloat(r.precio || 0);
  });

  // Clientes más frecuentes
  const clientesFrecuentes = {};
  reservasActivas.forEach(r => {
    const key = `${r.nombre}-${r.email}`;
    if (!clientesFrecuentes[key]) {
      clientesFrecuentes[key] = { nombre: r.nombre, email: r.email, count: 0, total: 0 };
    }
    clientesFrecuentes[key].count++;
    clientesFrecuentes[key].total += parseFloat(r.precio || 0);
  });

  const topClientes = Object.values(clientesFrecuentes)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Horarios más populares
  const horariosPopulares = {};
  reservasActivas.forEach(r => {
    const hora = r.hora_inicio.split(':')[0];
    horariosPopulares[hora] = (horariosPopulares[hora] || 0) + 1;
  });

  const topHorarios = Object.entries(horariosPopulares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Días más populares
  const diasPopulares = {};
  reservasActivas.forEach(r => {
    const fechaISO = obtenerFechaISO(r.fecha);
    if (!fechaISO) return;
    const fecha = new Date(fechaISO + 'T00:00:00');
    const dia = fecha.toLocaleDateString('es-MX', { weekday: 'long' });
    diasPopulares[dia] = (diasPopulares[dia] || 0) + 1;
  });

  const topDias = Object.entries(diasPopulares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  // Ocupación por cancha
  const ocupacionCanchas = { 1: 0, 2: 0, 3: 0 };
  reservasActivas.forEach(r => {
    ocupacionCanchas[r.cancha] = (ocupacionCanchas[r.cancha] || 0) + 1;
  });

  // Promedio de duración
  const promedioDuracion = reservasActivas.length > 0 
    ? reservasActivas.reduce((sum, r) => sum + parseFloat(r.duracion || 0), 0) / reservasActivas.length
    : 0;

  // Clientes nuevos vs recurrentes
  const clientesUnicos = new Set(reservasActivas.map(r => r.email));
  const clientesRecurrentes = Object.values(clientesFrecuentes).filter(c => c.count > 1).length;
  const clientesNuevos = clientesUnicos.size - clientesRecurrentes;

  let html = `
    <!-- Ingresos por periodo -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div class="bg-gradient-to-r from-blue-400 to-blue-600 rounded-xl p-6 text-white shadow-lg">
        <p class="text-sm opacity-90">Ingresos Esta Semana</p>
        <p class="text-3xl font-bold mt-2">$${Math.round(ingresosSemana).toLocaleString()}</p>
        <p class="text-xs opacity-75 mt-1">${reservasSemana.length} reservas</p>
      </div>
      <div class="bg-gradient-to-r from-purple-400 to-purple-600 rounded-xl p-6 text-white shadow-lg">
        <p class="text-sm opacity-90">Ingresos Este Mes</p>
        <p class="text-3xl font-bold mt-2">$${Math.round(ingresosMes).toLocaleString()}</p>
        <p class="text-xs opacity-75 mt-1">${reservasMes.length} reservas</p>
      </div>
      <div class="bg-gradient-to-r from-green-400 to-green-600 rounded-xl p-6 text-white shadow-lg">
        <p class="text-sm opacity-90">Ticket Promedio</p>
        <p class="text-3xl font-bold mt-2">$${reservasActivas.length > 0 ? Math.round(reservasActivas.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0) / reservasActivas.length) : 0}</p>
        <p class="text-xs opacity-75 mt-1">Por reserva</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Ingresos por Cancha -->
      <div class="bg-white rounded-xl shadow-md p-6">
        <h3 class="text-xl font-bold text-primary mb-4 border-b pb-2">Ingresos por Cancha</h3>
        <div class="space-y-3">
          ${[1, 2, 3].map(cancha => {
            const total = ingresosPorCancha[cancha] || 0;
            const porcentaje = reservasActivas.length > 0 ? ((ingresosPorCancha[cancha] || 0) / reservasActivas.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0) * 100).toFixed(1) : 0;
            return `
              <div>
                <div class="flex justify-between mb-1">
                  <span class="font-bold">Cancha ${cancha}</span>
                  <span class="font-bold text-primary">$${Math.round(total).toLocaleString()} (${porcentaje}%)</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-primary h-2 rounded-full" style="width: ${porcentaje}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Top Clientes -->
      <div class="bg-white rounded-xl shadow-md p-6">
        <h3 class="text-xl font-bold text-primary mb-4 border-b pb-2">Clientes Frecuentes</h3>
        <div class="space-y-2">
          ${topClientes.length > 0 ? topClientes.map((c, i) => `
            <div class="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
              <div>
                <p class="font-bold text-sm">${i + 1}. ${c.nombre}</p>
                <p class="text-xs text-gray-600">${c.email}</p>
              </div>
              <div class="text-right">
                <p class="font-bold text-primary">${c.count} reservas</p>
                <p class="text-xs text-gray-600">$${Math.round(c.total)}</p>
              </div>
            </div>
          `).join('') : '<p class="text-gray-500 text-center py-4">Sin datos</p>'}
        </div>
      </div>

      <!-- Top Horarios -->
      <div class="bg-white rounded-xl shadow-md p-6">
        <h3 class="text-xl font-bold text-primary mb-4 border-b pb-2">Horarios Populares</h3>
        <div class="space-y-2">
          ${topHorarios.length > 0 ? topHorarios.map(([hora, count], i) => {
            const porcentaje = reservasActivas.length > 0 ? (count / reservasActivas.length * 100).toFixed(1) : 0;
            return `
              <div>
                <div class="flex justify-between items-center mb-1">
                  <p class="font-bold">${i + 1}. ${hora}:00 - ${parseInt(hora) + 1}:00</p>
                  <p class="font-bold text-primary">${count} (${porcentaje}%)</p>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-primary h-2 rounded-full" style="width: ${porcentaje}%"></div>
                </div>
              </div>
            `;
          }).join('') : '<p class="text-gray-500 text-center py-4">Sin datos</p>'}
        </div>
      </div>

      <!-- Días Populares -->
      <div class="bg-white rounded-xl shadow-md p-6">
        <h3 class="text-xl font-bold text-primary mb-4 border-b pb-2">Dias Mas Populares</h3>
        <div class="space-y-2">
          ${topDias.length > 0 ? topDias.map(([dia, count], i) => {
            const porcentaje = reservasActivas.length > 0 ? (count / reservasActivas.length * 100).toFixed(1) : 0;
            return `
              <div>
                <div class="flex justify-between items-center mb-1">
                  <p class="font-bold capitalize">${i + 1}. ${dia}</p>
                  <p class="font-bold text-primary">${count} (${porcentaje}%)</p>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-primary h-2 rounded-full" style="width: ${porcentaje}%"></div>
                </div>
              </div>
            `;
          }).join('') : '<p class="text-gray-500 text-center py-4">Sin datos</p>'}
        </div>
      </div>

      <!-- Ocupación Canchas -->
      <div class="bg-white rounded-xl shadow-md p-6">
        <h3 class="text-xl font-bold text-primary mb-4 border-b pb-2">Ocupacion por Cancha</h3>
        <div class="space-y-3">
          ${[1, 2, 3].map(cancha => {
            const total = ocupacionCanchas[cancha] || 0;
            const porcentaje = reservasActivas.length > 0 ? (total / reservasActivas.length * 100).toFixed(1) : 0;
            return `
              <div>
                <div class="flex justify-between mb-1">
                  <span class="font-bold">Cancha ${cancha}</span>
                  <span class="font-bold text-primary">${total} (${porcentaje}%)</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-primary h-2 rounded-full" style="width: ${porcentaje}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Métricas Generales -->
      <div class="bg-white rounded-xl shadow-md p-6">
        <h3 class="text-xl font-bold text-primary mb-4 border-b pb-2">Metricas Generales</h3>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-700">Promedio Duracion:</span>
            <span class="font-bold text-primary">${promedioDuracion.toFixed(1)}h</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-700">Total Usuarios:</span>
            <span class="font-bold text-primary">${state.usuarios.length}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-700">Clientes Nuevos:</span>
            <span class="font-bold text-green-600">${clientesNuevos}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-700">Clientes Recurrentes:</span>
            <span class="font-bold text-blue-600">${clientesRecurrentes}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-700">Tasa Cancelacion:</span>
            <span class="font-bold text-red-600">${state.reservas.length > 0 ? ((state.reservas.filter(r => r.estado === 'cancelada').length / state.reservas.length) * 100).toFixed(1) : 0}%</span>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// GESTION FINANCIERA
function renderGestionFinanciera() {
  const tbody = document.getElementById('financieroTable');
  if (!tbody) return;

  tbody.innerHTML = '';

  let reservasFiltradas = state.reservas.filter(r => r.estado !== 'cancelada');

  // Aplicar filtros
  const filtroEstado = document.getElementById('filtroFinancieroEstado')?.value;
  const filtroCancha = document.getElementById('filtroFinancieroCancha')?.value;
  const filtroCliente = document.getElementById('filtroFinancieroCliente')?.value.toLowerCase();

  if (filtroEstado && filtroEstado !== 'todos') {
    if (filtroEstado === 'pagadas') {
      reservasFiltradas = reservasFiltradas.filter(r => r.pagado);
    } else if (filtroEstado === 'pendientes') {
      reservasFiltradas = reservasFiltradas.filter(r => !r.pagado);
    }
  }

  if (filtroCancha && filtroCancha !== 'todas') {
    reservasFiltradas = reservasFiltradas.filter(r => r.cancha === parseInt(filtroCancha));
  }

  if (filtroCliente) {
    reservasFiltradas = reservasFiltradas.filter(r => 
      r.nombre.toLowerCase().includes(filtroCliente) || 
      r.email.toLowerCase().includes(filtroCliente)
    );
  }

  // Totales
  const totalPagadas = reservasFiltradas.filter(r => r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
  const totalPendientes = reservasFiltradas.filter(r => !r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
  const totalGeneral = reservasFiltradas.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);

  // Por método de pago
  const porMetodo = {};
  reservasFiltradas.filter(r => r.pagado && r.metodo_pago).forEach(r => {
    porMetodo[r.metodo_pago] = (porMetodo[r.metodo_pago] || 0) + parseFloat(r.precio || 0);
  });

  const totalesEl = document.getElementById('financieroTotales');
  if (totalesEl) {
    totalesEl.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-green-100 rounded-lg p-4">
          <p class="text-sm text-gray-700">Total Pagado</p>
          <p class="text-2xl font-bold text-green-700">$${Math.round(totalPagadas).toLocaleString()}</p>
        </div>
        <div class="bg-yellow-100 rounded-lg p-4">
          <p class="text-sm text-gray-700">Total Pendiente</p>
          <p class="text-2xl font-bold text-yellow-700">$${Math.round(totalPendientes).toLocaleString()}</p>
        </div>
        <div class="bg-blue-100 rounded-lg p-4">
          <p class="text-sm text-gray-700">Total General</p>
          <p class="text-2xl font-bold text-blue-700">$${Math.round(totalGeneral).toLocaleString()}</p>
        </div>
        <div class="bg-purple-100 rounded-lg p-4">
          <p class="text-sm text-gray-700">Por Metodo</p>
          ${Object.entries(porMetodo).map(([metodo, total]) => `
            <p class="text-xs text-gray-600">${metodo}: $${Math.round(total)}</p>
          `).join('') || '<p class="text-xs text-gray-500">Sin datos</p>'}
        </div>
      </div>
    `;
  }

  // Tabla
  reservasFiltradas.sort((a, b) => {
    const fechaA = obtenerFechaISO(a.fecha);
    const fechaB = obtenerFechaISO(b.fecha);
    return fechaB.localeCompare(fechaA) || b.hora_inicio.localeCompare(a.hora_inicio);
  }).forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50 border-b';

    const estadoClass = r.pagado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
    const estadoText = r.pagado ? 'Pagada' : 'Pendiente';

    tr.innerHTML = `
      <td class="px-4 py-3">${formatearFecha(r.fecha)}</td>
      <td class="px-4 py-3">${convertirA12h(r.hora_inicio)}</td>
      <td class="px-4 py-3 text-center">Cancha ${r.cancha}</td>
      <td class="px-4 py-3">
        <p class="font-bold">${r.nombre}</p>
        <p class="text-xs text-gray-600">${r.email}</p>
      </td>
      <td class="px-4 py-3 font-bold text-primary">$${r.precio}</td>
      <td class="px-4 py-3">
        <span class="px-3 py-1 rounded-full text-xs font-bold ${estadoClass}">${estadoText}</span>
        ${r.metodo_pago ? `<p class="text-xs text-gray-600 mt-1">${r.metodo_pago}</p>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (reservasFiltradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No hay reservas con estos filtros</td></tr>';
  }
}

// GESTION DE CANCHAS
function renderGestionCanchas() {
  const container = document.getElementById('gestionCanchasContainer');
  if (!container) return;

  const canchas = [1, 2, 3];
  let html = '<div class="grid grid-cols-1 md:grid-cols-3 gap-6">';

  canchas.forEach(cancha => {
    const activa = state.config.canchasActivas[cancha] !== false;
    const reservasCancha = state.reservas.filter(r => r.cancha === cancha && r.estado !== 'cancelada');
    const ingresos = reservasCancha.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);

    html += `
      <div class="bg-white rounded-xl shadow-md p-6 ${!activa ? 'opacity-60' : ''}">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold">Cancha ${cancha}</h3>
          <span class="px-3 py-1 rounded-full text-xs font-bold ${activa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
            ${activa ? 'Activa' : 'Desactivada'}
          </span>
        </div>
        
        <div class="space-y-2 mb-4">
          <p class="text-sm text-gray-600">Total reservas: <span class="font-bold">${reservasCancha.length}</span></p>
          <p class="text-sm text-gray-600">Ingresos: <span class="font-bold text-primary">$${Math.round(ingresos)}</span></p>
        </div>

        <button onclick="toggleCanchaActiva(${cancha})" 
                class="w-full px-4 py-2 ${activa ? 'bg-red-500' : 'bg-green-500'} text-white rounded-lg font-bold hover:opacity-80">
          ${activa ? 'Desactivar' : 'Activar'} Cancha
        </button>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

async function toggleCanchaActiva(cancha) {
  const activa = state.config.canchasActivas[cancha] !== false;
  const accion = activa ? 'desactivar' : 'activar';
  
  if (!confirm(`¿${accion.toUpperCase()} Cancha ${cancha}?`)) return;

  state.config.canchasActivas[cancha] = !activa;

  try {
    await fetch(API_BASE + '/api/admin/canchas/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ cancha, activa: !activa })
    });

    alert(`Cancha ${cancha} ${accion}ada`);
    renderGestionCanchas();
  } catch (err) {
    alert(`Error al ${accion} cancha`);
  }
}

// CALENDARIO AVANZADO
function initDatepicker() {
  const fechaInput = document.getElementById('calendarioFecha');
  if (fechaInput) {
    fechaInput.value = new Date().toISOString().split('T')[0];
  }
}

function renderCalendario() {
  const container = document.getElementById('calendarioContainer');
  if (!container) return;

  const vista = state.vistaCalendario;
  const fechaBase = document.getElementById('calendarioFecha')?.value || new Date().toISOString().split('T')[0];

  if (vista === 'dia') {
    renderCalendarioDia(container, fechaBase);
  } else if (vista === 'semana') {
    renderCalendarioSemana(container, fechaBase);
  } else if (vista === 'mes') {
    renderCalendarioMes(container, fechaBase);
  }
}

function renderCalendarioDia(container, fecha) {
  const reservasDia = state.reservas.filter(r => {
    const fechaISO = obtenerFechaISO(r.fecha);
    return fechaISO === fecha;
  });

  const horas = Array.from({ length: 17 }, (_, i) => i + 8); // 8am a 12am
  const canchas = [1, 2, 3];

  let html = `
    <div class="bg-white rounded-xl shadow-md p-4">
      <h3 class="text-xl font-bold text-primary mb-4">${formatearFecha(fecha)} - Vista Dia</h3>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-primary-lighter">
              <th class="border p-2 text-primary">Hora</th>
              ${canchas.map(c => `<th class="border p-2 text-primary">Cancha ${c}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
  `;

  horas.forEach(hora => {
    html += '<tr>';
    html += `<td class="border p-2 font-bold text-center">${hora}:00</td>`;
    
    canchas.forEach(cancha => {
      const reserva = reservasDia.find(r => {
        const horaInicio = parseInt(r.hora_inicio.split(':')[0]);
        return r.cancha === cancha && horaInicio === hora && r.estado !== 'cancelada';
      });

      if (reserva) {
        const bgClass = reserva.pagado ? 'bg-green-100' : 'bg-yellow-100';
        html += `
          <td class="border p-2 ${bgClass}">
            <div class="text-xs">
              <p class="font-bold">${reserva.nombre}</p>
              <p class="text-gray-600">${reserva.duracion}h - $${reserva.precio}</p>
            </div>
          </td>
        `;
      } else {
        html += '<td class="border p-2 bg-gray-50"></td>';
      }
    });
    
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  container.innerHTML = html;
}

function renderCalendarioSemana(container, fechaBase) {
  const fecha = new Date(fechaBase + 'T00:00:00');
  const inicioSemana = new Date(fecha);
  inicioSemana.setDate(fecha.getDate() - fecha.getDay());

  const dias = Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(inicioSemana);
    dia.setDate(inicioSemana.getDate() + i);
    return dia.toISOString().split('T')[0];
  });

  let html = `
    <div class="bg-white rounded-xl shadow-md p-4">
      <h3 class="text-xl font-bold text-primary mb-4">Vista Semana</h3>
      <div class="grid grid-cols-7 gap-2">
  `;

  dias.forEach(dia => {
    const reservasDia = state.reservas.filter(r => {
      const fechaISO = obtenerFechaISO(r.fecha);
      return fechaISO === dia && r.estado !== 'cancelada';
    });

    const fecha = new Date(dia + 'T00:00:00');
    const diaSemana = fecha.toLocaleDateString('es-MX', { weekday: 'short' });
    const diaNum = fecha.getDate();

    html += `
      <div class="border rounded-lg p-2">
        <p class="font-bold text-center text-sm">${diaSemana} ${diaNum}</p>
        <div class="space-y-1 mt-2">
          ${reservasDia.slice(0, 3).map(r => `
            <div class="${r.pagado ? 'bg-green-100' : 'bg-yellow-100'} rounded p-1 text-xs">
              <p class="font-bold truncate">${convertirA12h(r.hora_inicio)}</p>
              <p class="truncate">C${r.cancha} - ${r.nombre.split(' ')[0]}</p>
            </div>
          `).join('')}
          ${reservasDia.length > 3 ? `<p class="text-xs text-gray-500 text-center">+${reservasDia.length - 3} más</p>` : ''}
        </div>
      </div>
    `;
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function renderCalendarioMes(container, fechaBase) {
  const fecha = new Date(fechaBase + 'T00:00:00');
  const año = fecha.getFullYear();
  const mes = fecha.getMonth();
  const primerDia = new Date(año, mes, 1);
  const ultimoDia = new Date(año, mes + 1, 0);
  const diasMes = ultimoDia.getDate();
  const primerDiaSemana = primerDia.getDay();

  const nombreMes = fecha.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  let html = `
    <div class="bg-white rounded-xl shadow-md p-4">
      <h3 class="text-xl font-bold text-primary mb-4 capitalize">${nombreMes} - Vista Mes</h3>
      <div class="grid grid-cols-7 gap-2">
        ${['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map(d => 
          `<div class="font-bold text-center text-sm">${d}</div>`
        ).join('')}
  `;

  // Días vacíos antes del inicio del mes
  for (let i = 0; i < primerDiaSemana; i++) {
    html += '<div class="border rounded-lg p-2 bg-gray-50"></div>';
  }

  // Días del mes
  for (let dia = 1; dia <= diasMes; dia++) {
    const fechaDia = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const reservasDia = state.reservas.filter(r => {
      const fechaISO = obtenerFechaISO(r.fecha);
      return fechaISO === fechaDia && r.estado !== 'cancelada';
    });

    const esHoy = fechaDia === new Date().toISOString().split('T')[0];

    html += `
      <div class="border rounded-lg p-2 ${esHoy ? 'bg-blue-50 border-blue-300' : ''} min-h-[80px]">
        <p class="font-bold text-sm ${esHoy ? 'text-blue-600' : ''}">${dia}</p>
        ${reservasDia.length > 0 ? `
          <div class="mt-1">
            <p class="text-xs bg-primary text-white rounded px-1 text-center">${reservasDia.length}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  html += '</div></div>';
  container.innerHTML = html;
}

function cambiarVistaCalendario(vista) {
  state.vistaCalendario = vista;
  
  document.querySelectorAll('.vista-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`vista${vista.charAt(0).toUpperCase() + vista.slice(1)}`).classList.add('active');
  
  renderCalendario();
}

function cambiarFechaCalendario() {
  renderCalendario();
}
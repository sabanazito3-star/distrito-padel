// admin-app.js - Panel Admin Avanzado v8.0 - Profesional
const API_BASE = '';

let state = {
  reservas: [],
  promociones: [],
  bloqueos: [],
  usuarios: [],
  config: { precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 } },
  token: localStorage.getItem('admin_token') || '',
  currentTab: 'dashboard',
  autoUpdateInterval: null,
  mostrarCanceladas: false,
  mostrarPasadas: false,
  filtroTotalTipo: 'todo',
  filtroFechaInicio: '',
  filtroFechaFin: '',
  chartOcupacion: null,
  chartIngresos: null
};

window.onload = () => {
  if (state.token) {
    document.getElementById('adminToken').value = state.token;
    loadAllData();
    startAutoUpdate();
  }
  cargarConfigActual();
  initCharts();
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
    const [reservas, usuarios, promociones, bloqueos] = await Promise.all([
      api('/reservas'),
      api('/usuarios'),
      fetch(API_BASE + '/api/promociones').then(r => r.json()),
      fetch(API_BASE + '/api/bloqueos').then(r => r.json())
    ]);

    state.reservas = reservas;
    state.usuarios = usuarios;
    state.promociones = promociones;
    state.bloqueos = bloqueos;

    renderReservas();
    renderPromociones();
    renderBloqueos();
    renderUsuarios();
    renderEstadisticasAvanzadas();
    updateStats();
    updateLastUpdate();
    updateCharts();

    if (!state.autoUpdateInterval) {
      startAutoUpdate();
    }
  } catch (err) {
    alert('Error: ' + (err.msg || 'Token invalido'));
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
        updateStats();
        updateCharts();
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
    'reportes': 'contentReportes'
  };

  const contentId = tabMap[tab];
  if (contentId) {
    document.getElementById(contentId).classList.remove('hidden');
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  }

  if (tab === 'dashboard') {
    updateCharts();
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

function renderReservas() {
  const tbody = document.getElementById('reservasTable');
  tbody.innerHTML = '';

  if (state.reservas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-12 text-gray-500">
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

  const obtenerFechaISO = (fechaStr) => {
    if (!fechaStr) return null;
    if (typeof fechaStr === 'string' && fechaStr.includes('T')) {
      return fechaStr.split('T')[0];
    }
    return fechaStr;
  };

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
    <td colspan="7" class="px-4 py-3 bg-blue-50 text-center">
      <div class="flex justify-center gap-6 items-center">
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
        <td colspan="7" class="px-4 py-2 font-bold text-${colorClass}-800">
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
            <button onclick="marcarPagada('${r.id}', ${!r.pagado})" class="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 mr-2 mb-1">
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
        <td colspan="6" class="text-center py-12 text-gray-500">
          <p class="text-lg">No hay usuarios registrados</p>
        </td>
      </tr>
    `;
    return;
  }

  state.usuarios.forEach(u => {
    const reservasUsuario = state.reservas.filter(r => r.email === u.email && r.estado !== 'cancelada');
    const totalGastado = reservasUsuario.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50 border-b';
    tr.innerHTML = `
      <td class="px-4 py-3 font-bold text-gray-800">${u.nombre}</td>
      <td class="px-4 py-3 text-gray-600">${u.email}</td>
      <td class="px-4 py-3 text-gray-600">${u.telefono}</td>
      <td class="px-4 py-3 text-center font-bold text-blue-600">${reservasUsuario.length}</td>
      <td class="px-4 py-3 text-center font-bold text-primary">$${Math.round(totalGastado)}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="verDetalleUsuario('${u.email}')" class="px-3 py-1 bg-primary text-white rounded-lg text-sm hover:bg-primary-light">
          Ver Detalle
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function verDetalleUsuario(email) {
  const usuario = state.usuarios.find(u => u.email === email);
  if (!usuario) return;

  const reservasUsuario = state.reservas.filter(r => r.email === email).sort((a, b) => {
    const fechaA = a.fecha.includes('T') ? a.fecha.split('T')[0] : a.fecha;
    const fechaB = b.fecha.includes('T') ? b.fecha.split('T')[0] : b.fecha;
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
    
    div.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <p class="font-bold text-purple-700">${textoPromo}</p>
          <p class="text-sm text-gray-600">${p.activa ? 'Activa' : 'Inactiva'}</p>
        </div>
        <button onclick="eliminarPromocion('${p.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
          Eliminar
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

async function crearPromocion() {
  const fecha = document.getElementById('promoFecha').value || null;
  const descuento = parseInt(document.getElementById('promoDescuento').value);
  const horaInicio = document.getElementById('promoHoraInicio').value || null;
  const horaFin = document.getElementById('promoHoraFin').value || null;

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
      body: JSON.stringify({ fecha, descuento, horaInicio, horaFin })
    });

    alert('Promocion creada');
    document.getElementById('promoFecha').value = '';
    document.getElementById('promoDescuento').value = '';
    document.getElementById('promoHoraInicio').value = '';
    document.getElementById('promoHoraFin').value = '';
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

  let csv = 'Nombre,Email,Telefono,Total Reservas,Total Gastado\n';
  
  state.usuarios.forEach(u => {
    const reservasUsuario = state.reservas.filter(r => r.email === u.email && r.estado !== 'cancelada');
    const totalGastado = reservasUsuario.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
    csv += `"${u.nombre}","${u.email}","${u.telefono}",${reservasUsuario.length},${Math.round(totalGastado)}\n`;
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
  updateCharts();
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
  updateCharts();
}

function updateStats() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  const obtenerFechaISO = (fechaStr) => {
    if (!fechaStr) return null;
    if (typeof fechaStr === 'string' && fechaStr.includes('T')) {
      return fechaStr.split('T')[0];
    }
    return fechaStr;
  };
  
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

// ESTADISTICAS AVANZADAS
function renderEstadisticasAvanzadas() {
  const container = document.getElementById('estadisticasAvanzadas');
  if (!container) return;

  const obtenerFechaISO = (fechaStr) => {
    if (!fechaStr) return null;
    if (typeof fechaStr === 'string' && fechaStr.includes('T')) {
      return fechaStr.split('T')[0];
    }
    return fechaStr;
  };

  // Clientes más frecuentes
  const clientesFrecuentes = {};
  state.reservas.filter(r => r.estado !== 'cancelada').forEach(r => {
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
  state.reservas.filter(r => r.estado !== 'cancelada').forEach(r => {
    const hora = r.hora_inicio.split(':')[0];
    horariosPopulares[hora] = (horariosPopulares[hora] || 0) + 1;
  });

  const topHorarios = Object.entries(horariosPopulares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Ocupación por cancha
  const ocupacionCanchas = { 1: 0, 2: 0, 3: 0 };
  state.reservas.filter(r => r.estado !== 'cancelada').forEach(r => {
    ocupacionCanchas[r.cancha] = (ocupacionCanchas[r.cancha] || 0) + 1;
  });

  // Promedio de duración
  const reservasActivas = state.reservas.filter(r => r.estado !== 'cancelada');
  const promedioDuracion = reservasActivas.length > 0 
    ? reservasActivas.reduce((sum, r) => sum + parseFloat(r.duracion || 0), 0) / reservasActivas.length
    : 0;

  let html = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          ${topHorarios.length > 0 ? topHorarios.map(([hora, count], i) => `
            <div class="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
              <p class="font-bold">${i + 1}. ${hora}:00 - ${parseInt(hora) + 1}:00</p>
              <p class="font-bold text-primary">${count} reservas</p>
            </div>
          `).join('') : '<p class="text-gray-500 text-center py-4">Sin datos</p>'}
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
            <span class="text-gray-700">Tasa Cancelacion:</span>
            <span class="font-bold text-red-600">${state.reservas.length > 0 ? ((state.reservas.filter(r => r.estado === 'cancelada').length / state.reservas.length) * 100).toFixed(1) : 0}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-700">Ticket Promedio:</span>
            <span class="font-bold text-primary">$${reservasActivas.length > 0 ? Math.round(reservasActivas.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0) / reservasActivas.length) : 0}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// GRAFICAS (placeholder - necesitas Chart.js)
function initCharts() {
  // Placeholder para inicializar gráficas
  // Requiere incluir Chart.js en el HTML
}

function updateCharts() {
  // Placeholder para actualizar gráficas
  // Se implementaría con Chart.js
}

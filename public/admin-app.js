// admin-app.js - Panel Admin v7.1 - Postgres Compatible CORREGIDO
const API_BASE = '';

let state = {
  reservas: [],
  promociones: [],
  bloqueos: [],
  usuarios: [],
  config: { precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 } },
  token: localStorage.getItem('admin_token') || '',
  currentTab: 'reservas',
  autoUpdateInterval: null,
  mostrarCanceladas: false
};

window.onload = () => {
  if (state.token) {
    document.getElementById('adminToken').value = state.token;
    loadAllData();
    startAutoUpdate();
  }
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
    const [reservas, usuarios] = await Promise.all([
      api('/reservas'),
      api('/usuarios')
    ]);

    state.reservas = reservas;
    state.usuarios = usuarios;

    renderReservas();
    updateStats();
    updateLastUpdate();

    if (!state.autoUpdateInterval) {
      startAutoUpdate();
    }
  } catch (err) {
    alert('Error: ' + (err.msg || 'Token inválido'));
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
      }
      updateLastUpdate();
    } catch (err) {
      console.error('Auto-update error:', err);
    }
  }, 10000);
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
  document.getElementById('lastUpdate').textContent = 'Última actualización: ' + time;
}

function showTab(tab) {
  state.currentTab = tab;

  document.getElementById('contentReservas').classList.add('hidden');
  document.getElementById('contentPromociones').classList.add('hidden');
  document.getElementById('contentBloqueos').classList.add('hidden');
  document.getElementById('contentConfig').classList.add('hidden');

  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  if (tab === 'reservas') {
    document.getElementById('contentReservas').classList.remove('hidden');
    document.getElementById('tabReservas').classList.add('active');
  }
}

function convertirA12h(hora24) {
  if (!hora24) return '';
  const [h, m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const hora12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hora12}:${String(m).padStart(2, '0')} ${periodo}`;
}

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

  // Separar activas y canceladas
  const activas = state.reservas.filter(r => r.estado !== 'cancelada');
  const canceladas = state.reservas.filter(r => r.estado === 'cancelada');

  // Header con contadores
  const header = document.createElement('tr');
  header.innerHTML = `
    <td colspan="8" class="px-4 py-3 bg-blue-50 text-center">
      <div class="flex justify-center gap-6 items-center">
        <span class="font-bold text-green-700">Activas: ${activas.length}</span>
        <span class="font-bold text-red-700">Canceladas: ${canceladas.length}</span>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="checkMostrarCanceladas" ${state.mostrarCanceladas ? 'checked' : ''}>
          <span class="text-sm">Mostrar canceladas</span>
        </label>
      </div>
    </td>
  `;
  tbody.appendChild(header);

  setTimeout(() => {
    const checkbox = document.getElementById('checkMostrarCanceladas');
    if (checkbox) {
      checkbox.onchange = function() {
        state.mostrarCanceladas = this.checked;
        renderReservas();
      };
    }
  }, 0);

  const reservasAMostrar = state.mostrarCanceladas ? [...activas, ...canceladas] : activas;

  reservasAMostrar
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach(r => {
      const tr = document.createElement('tr');
      const canceladaClass = r.estado === 'cancelada' ? 'bg-gray-100 opacity-60' : 'hover:bg-gray-50';
      tr.className = `${canceladaClass} border-b`;

      const pagadoClass = r.pagado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
      const pagadoText = r.pagado ? 'Pagada' : 'Pendiente';
      const metodoPagoTexto = r.metodo_pago ? `<br><span class="text-xs text-gray-600">${r.metodo_pago}</span>` : '';

      const botonesHTML = r.estado === 'cancelada' 
        ? '<span class="text-xs text-gray-500 italic">Cancelada</span>'
        : `
          <button onclick="marcarPagada('${r.id}', ${!r.pagado})" class="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 mr-2">
            ${r.pagado ? 'Marcar Pendiente' : 'Marcar Pagada'}
          </button>
          <button onclick="cancelarReserva('${r.id}')" class="px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600">
            Cancelar
          </button>
        `;

      tr.innerHTML = `
        <td class="px-4 py-3">${r.fecha}</td>
        <td class="px-4 py-3 font-bold">${convertirA12h(r.hora_inicio)}</td>
        <td class="px-4 py-3">${r.duracion}h</td>
        <td class="px-4 py-3">${r.cancha}</td>
        <td class="px-4 py-3">${r.nombre || r.email}</td>
        <td class="px-4 py-3 font-bold text-green-600">$${r.precio}</td>
        <td class="px-4 py-3">
          <span class="px-3 py-1 rounded-full text-xs font-bold ${pagadoClass}">
            ${pagadoText}${metodoPagoTexto}
          </span>
        </td>
        <td class="px-4 py-3">${botonesHTML}</td>
      `;
      tbody.appendChild(tr);
    });
}

async function marcarPagada(id, pagar) {
  if (!pagar) {
    // Marcar como pendiente (no se necesita método de pago)
    try {
      await fetch(API_BASE + `/api/admin/reservas/${id}/pagar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': state.token
        },
        body: JSON.stringify({ metodoPago: '1' }) // Temporal para desmarcar
      });
      await loadAllData();
    } catch (err) {
      alert('Error al actualizar');
    }
    return;
  }

  const metodo = prompt('Método de pago:\n1 = Efectivo\n2 = Tarjeta\n3 = Transferencia');
  
  if (!metodo || !['1','2','3'].includes(metodo)) {
    alert('Método inválido');
    return;
  }

  try {
    await fetch(API_BASE + `/api/admin/reservas/${id}/pagar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ metodoPago: metodo })
    });
    await loadAllData();
  } catch (err) {
    alert('Error al marcar como pagada');
  }
}

async function cancelarReserva(id) {
  if (!confirm('¿Cancelar esta reserva?\n\nSe mantendrá el registro pero se liberará el horario.')) return;
  
  try {
    await fetch(API_BASE + `/api/admin/reservas/${id}/cancelar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      }
    });
    alert('Reserva cancelada');
    await loadAllData();
  } catch (err) {
    alert('Error al cancelar reserva');
  }
}

function updateStats() {
  const reservasActivas = state.reservas.filter(r => r.estado !== 'cancelada');
  const totalReservas = reservasActivas.length;
  const totalRecaudado = reservasActivas.reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
  const pendientesPago = reservasActivas.filter(r => !r.pagado).length;

  document.getElementById('statReservas').textContent = totalReservas;
  document.getElementById('statRecaudado').textContent = '$' + Math.round(totalRecaudado).toLocaleString();
  document.getElementById('statPendientes').textContent = pendientesPago;
}

// DESCARGAR REPORTE DÍA
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

// DESCARGAR REPORTE MES
async function descargarReporteMes() {
  const mes = prompt('Mes (1-12):', new Date().getMonth() + 1);
  const año = prompt('Año:', new Date().getFullYear());
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
// Agregar al final de admin-app.js

function showTab(tab) {
  state.currentTab = tab;

  document.getElementById('contentReservas').classList.add('hidden');
  document.getElementById('contentPromociones').classList.add('hidden');
  document.getElementById('contentBloqueos').classList.add('hidden');
  document.getElementById('contentConfig').classList.add('hidden');

  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  if (tab === 'reservas') {
    document.getElementById('contentReservas').classList.remove('hidden');
    document.getElementById('tabReservas').classList.add('active');
  } else if (tab === 'promociones') {
    document.getElementById('contentPromociones').classList.remove('hidden');
    document.getElementById('tabPromociones').classList.add('active');
  } else if (tab === 'bloqueos') {
    document.getElementById('contentBloqueos').classList.remove('hidden');
    document.getElementById('tabBloqueos').classList.add('active');
  } else if (tab === 'config') {
    document.getElementById('contentConfig').classList.remove('hidden');
    document.getElementById('tabConfig').classList.add('active');
  }
}

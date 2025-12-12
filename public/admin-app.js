// admin-app.js - Panel Admin v8.0 - Sistema Completo de Torneos
const API_BASE = '';

let state = {
  reservas: [],
  promociones: [],
  bloqueos: [],
  usuarios: [],
  torneos: [],
  config: { precios: { horaDia: 250, horaNoche: 400, cambioTarifa: 16 } },
  token: localStorage.getItem('admin_token') || '',
  currentTab: 'reservas',
  autoUpdateInterval: null,
  mostrarCanceladas: false,
  mostrarPasadas: false,
  filtroTotalTipo: 'todo',
  filtroFechaInicio: '',
  filtroFechaFin: '',
  torneoActual: null
};

window.onload = () => {
  if (state.token) {
    document.getElementById('adminToken').value = state.token;
    loadAllData();
    startAutoUpdate();
  }
  cargarConfigActual();
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
    const [reservas, usuarios, promociones, bloqueos, torneos] = await Promise.all([
      api('/reservas'),
      api('/usuarios'),
      fetch(API_BASE + '/api/promociones').then(r => r.json()),
      fetch(API_BASE + '/api/bloqueos').then(r => r.json()),
      api('/torneos').catch(() => [])
    ]);

    state.reservas = reservas;
    state.usuarios = usuarios;
    state.promociones = promociones;
    state.bloqueos = bloqueos;
    state.torneos = torneos;

    renderReservas();
    renderPromociones();
    renderBloqueos();
    renderTorneos();
    updateStats();
    updateLastUpdate();

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
  document.getElementById('lastUpdate').textContent = 'Ultima actualizacion: ' + time;
}

function showTab(tab) {
  state.currentTab = tab;

  document.getElementById('contentReservas').classList.add('hidden');
  document.getElementById('contentPromociones').classList.add('hidden');
  document.getElementById('contentBloqueos').classList.add('hidden');
  document.getElementById('contentConfig').classList.add('hidden');
  document.getElementById('contentTorneos').classList.add('hidden');

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
  } else if (tab === 'torneos') {
    document.getElementById('contentTorneos').classList.remove('hidden');
    document.getElementById('tabTorneos').classList.add('active');
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
        <span class="font-bold text-green-700">Activas (Hoy y Futuras): ${futuras.length}</span>
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

        const pagadoClass = r.pagado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
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
          <p class="text-lg font-bold text-green-600">$${r.precio}</p>
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
// ==================== TORNEOS - SISTEMA COMPLETO ====================

function renderTorneos() {
  const container = document.getElementById('torneosLista');
  if (!container) return;

  container.innerHTML = '';

  if (!state.torneos || state.torneos.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No hay torneos registrados</p>';
    return;
  }

  state.torneos.forEach(t => {
    const participantes = t.total_participantes || 0;
    const partidos = t.total_partidos || 0;
    
    const estadoBadge = {
      'abierto': '<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-bold">Abierto</span>',
      'cerrado': '<span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-bold">Cerrado</span>',
      'en-curso': '<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-bold">En Curso</span>',
      'finalizado': '<span class="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-bold">Finalizado</span>'
    };

    const div = document.createElement('div');
    div.className = 'bg-white border-2 border-gray-200 rounded-xl p-5 mb-4 hover:shadow-lg transition-shadow';
    
    const imagenHTML = t.imagen_base64 
      ? `<img src="${t.imagen_base64}" class="w-full h-40 object-cover rounded-lg mb-3" alt="${t.nombre}">`
      : '';
    
    div.innerHTML = `
      ${imagenHTML}
      <div class="flex justify-between items-start mb-3">
        <div class="flex-1">
          <h3 class="font-bold text-xl text-gray-800">${t.nombre}</h3>
          <p class="text-sm text-purple-600 font-semibold">${formatearTipoTorneo(t.tipo)}</p>
          <p class="text-sm text-gray-700 mt-1">${t.descripcion || ''}</p>
        </div>
        ${estadoBadge[t.estado] || ''}
      </div>
      <div class="grid grid-cols-3 gap-3 text-sm mb-3 bg-gray-50 p-3 rounded-lg">
        <div>
          <span class="text-gray-600">Inicio:</span><br>
          <span class="font-bold">${formatearFecha(t.fecha_inicio)}</span>
        </div>
        <div>
          <span class="text-gray-600">Inscripción:</span><br>
          <span class="font-bold text-green-600">$${t.precio_inscripcion}</span>
        </div>
        <div>
          <span class="text-gray-600">👥 Jugadores:</span><br>
          <span class="font-bold">${participantes}/${t.max_participantes}</span>
        </div>
      </div>
      ${partidos > 0 ? `<p class="text-xs text-blue-600 font-semibold mb-2">${partidos} partidos generados</p>` : ''}
      <div class="flex gap-2 flex-wrap">
        <button onclick="verDetallesTorneo('${t.id}')" class="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-semibold">
          Ver Detalles
        </button>
        <button onclick="gestionarParticipantes('${t.id}')" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
          Participantes
        </button>
        ${!t.bracket_generado && t.estado !== 'abierto' ? `
          <button onclick="generarBracket('${t.id}')" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
            Generar Bracket
          </button>
        ` : ''}
        ${t.bracket_generado ? `
          <button onclick="gestionarPartidos('${t.id}')" class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm">
            Partidos
          </button>
        ` : ''}
        <button onclick="cambiarEstadoTorneo('${t.id}', '${t.estado}')" class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm">
          Cambiar Estado
        </button>
        <button onclick="eliminarTorneo('${t.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">
          Eliminar
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

function formatearTipoTorneo(tipo) {
  const tipos = {
    'eliminacion-simple': 'Eliminación Simple',
    'doble-eliminacion': 'Doble Eliminación',
    'round-robin': 'Round Robin',
    'rey-pala': 'Rey de la Pala',
    'relampago': 'Relámpago',
    'americano': '🇺🇸 Americano',
    'mixto': 'Mixto',
    'liga': 'Liga'
  };
  return tipos[tipo] || tipo;
}

// Función para convertir imagen a base64
function convertirImagenABase64(input, callback) {
  const file = input.files[0];
  if (!file) {
    callback(null, null);
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('La imagen no debe superar 5MB');
    callback(null, null);
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    callback(e.target.result, file.name);
  };
  reader.readAsDataURL(file);
}

async function crearTorneo() {
  const nombre = document.getElementById('torneoNombre').value.trim();
  const tipo = document.getElementById('torneoTipo').value;
  const descripcion = document.getElementById('torneoDescripcion').value.trim();
  const fecha_inicio = document.getElementById('torneoFechaInicio').value;
  const fecha_fin = document.getElementById('torneoFechaFin').value || null;
  const hora_inicio = document.getElementById('torneoHoraInicio').value || null;
  const precio_inscripcion = parseInt(document.getElementById('torneoPrecio').value) || 0;
  const max_participantes = parseInt(document.getElementById('torneoMaxParticipantes').value) || 16;
  const min_participantes = parseInt(document.getElementById('torneoMinParticipantes').value) || 4;
  const reglas = document.getElementById('torneoReglas').value.trim() || null;
  const premios = document.getElementById('torneoPremios').value.trim() || null;

  if (!nombre || !tipo || !fecha_inicio) {
    alert('Completa los campos obligatorios (Nombre, Tipo, Fecha)');
    return;
  }

  const imagenInput = document.getElementById('torneoImagen');
  
  convertirImagenABase64(imagenInput, async (imagen_base64, imagen_nombre) => {
    try {
      const response = await fetch(API_BASE + '/api/admin/torneos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': state.token
        },
        body: JSON.stringify({
          nombre, tipo, descripcion, fecha_inicio, fecha_fin, hora_inicio,
          precio_inscripcion, max_participantes, min_participantes,
          imagen_base64, imagen_nombre, reglas, premios
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        alert('Torneo creado exitosamente');
        document.getElementById('torneoNombre').value = '';
        document.getElementById('torneoDescripcion').value = '';
        document.getElementById('torneoFechaInicio').value = '';
        document.getElementById('torneoFechaFin').value = '';
        document.getElementById('torneoHoraInicio').value = '';
        document.getElementById('torneoPrecio').value = '0';
        document.getElementById('torneoReglas').value = '';
        document.getElementById('torneoPremios').value = '';
        imagenInput.value = '';
        await loadAllData();
      } else {
        alert('Error: ' + (data.msg || 'No se pudo crear'));
      }
    } catch (err) {
      alert('Error al crear torneo');
      console.error(err);
    }
  });
}

async function cambiarEstadoTorneo(id, estadoActual) {
  const opciones = {
    'abierto': 'Cerrar inscripciones',
    'cerrado': 'Iniciar torneo',
    'en-curso': 'Finalizar torneo',
    'finalizado': 'Reabrir'
  };

  const nuevoEstado = {
    'abierto': 'cerrado',
    'cerrado': 'en-curso',
    'en-curso': 'finalizado',
    'finalizado': 'abierto'
  };

  if (!confirm(`${opciones[estadoActual]}?`)) return;

  try {
    const response = await fetch(API_BASE + `/api/admin/torneos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ estado: nuevoEstado[estadoActual] })
    });

    const data = await response.json();
    
    if (data.ok) {
      alert('Estado actualizado');
      await loadAllData();
    } else {
      alert('Error: ' + (data.msg || 'No se pudo actualizar'));
    }
  } catch (err) {
    alert('Error al actualizar estado');
  }
}

async function eliminarTorneo(id) {
  if (!confirm('Eliminar este torneo?\n\nSe eliminaran todos los participantes y partidos.')) return;

  try {
    const response = await fetch(API_BASE + `/api/admin/torneos/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': state.token }
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('Torneo eliminado');
      await loadAllData();
    } else {
      alert('Error: ' + (data.msg || 'No se pudo eliminar'));
    }
  } catch (err) {
    alert('Error al eliminar torneo');
  }
}

async function verDetallesTorneo(id) {
  try {
    const response = await fetch(API_BASE + `/api/torneos/${id}`);
    const torneo = await response.json();

    let mensaje = `DETALLES DEL TORNEO\n`;
    mensaje += `═══════════════════════\n`;
    mensaje += `Nombre: ${torneo.nombre}\n`;
    mensaje += `Tipo: ${formatearTipoTorneo(torneo.tipo)}\n`;
    mensaje += `Estado: ${torneo.estado.toUpperCase()}\n`;
    mensaje += `Fecha: ${formatearFecha(torneo.fecha_inicio)}\n`;
    if (torneo.hora_inicio) mensaje += `Hora: ${convertirA12h(torneo.hora_inicio)}\n`;
    mensaje += `Inscripción: $${torneo.precio_inscripcion}\n`;
    mensaje += `Participantes: ${torneo.participantes.length}/${torneo.max_participantes}\n`;
    if (torneo.reglas) mensaje += `\nReglas: ${torneo.reglas}\n`;
    if (torneo.premios) mensaje += `\nPremios: ${torneo.premios}\n`;
    
    alert(mensaje);
  } catch (err) {
    alert('Error al cargar detalles');
  }
}

async function gestionarParticipantes(torneoId) {
  try {
    const response = await fetch(API_BASE + `/api/torneos/${torneoId}`);
    const torneo = await response.json();

    if (!torneo.participantes || torneo.participantes.length === 0) {
      const agregar = confirm('No hay participantes.\n\n¿Agregar uno manualmente?');
      if (agregar) {
        await agregarParticipanteManual(torneoId);
      }
      return;
    }

    let mensaje = `👥 PARTICIPANTES (${torneo.participantes.length})\n`;
    mensaje += `═══════════════════════\n\n`;
    
    torneo.participantes.forEach((p, i) => {
      mensaje += `${i + 1}. ${p.nombre}\n`;
      mensaje += `   ${p.email}\n`;
      if (p.pareja_nombre) mensaje += `   Pareja: ${p.pareja_nombre}\n`;
      if (p.nivel) mensaje += `   Nivel: ${p.nivel}\n`;
      mensaje += `   ${p.pagado ? 'PAGADO' : 'PENDIENTE'}\n`;
      if (p.puntos !== undefined) mensaje += `  Puntos: ${p.puntos}\n`;
      mensaje += `\n`;
    });

    const accion = prompt(mensaje + '\nOpciones:\n1 = Agregar participante\n2 = Marcar pago\n3 = Eliminar participante\n0 = Salir');
    
    if (accion === '1') {
      await agregarParticipanteManual(torneoId);
    } else if (accion === '2') {
      const email = prompt('Email del participante a marcar como pagado:');
      if (email) await marcarPagadoParticipante(torneoId, email);
    } else if (accion === '3') {
      const email = prompt('Email del participante a eliminar:');
      if (email && confirm(`Eliminar a ${email}?`)) {
        await eliminarParticipante(torneoId, email);
      }
    }
  } catch (err) {
    alert('Error al cargar participantes');
    console.error(err);
  }
}

async function agregarParticipanteManual(torneoId) {
  const email = prompt('Email del participante:');
  if (!email) return;
  
  const nombre = prompt('Nombre completo:');
  if (!nombre) return;
  
  const pareja_email = prompt('Email de la pareja (opcional, dejar vacío si no aplica):');
  const pareja_nombre = pareja_email ? prompt('Nombre de la pareja:') : null;
  const nivel = prompt('Nivel (principiante/intermedio/avanzado/profesional):', 'intermedio');
  const pagado = confirm('¿Ya pagó la inscripción?');

  try {
    const response = await fetch(API_BASE + `/api/admin/torneos/${torneoId}/participante`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({ email, nombre, pareja_email, pareja_nombre, nivel, pagado })
    });

    const data = await response.json();
    
    if (data.ok) {
      alert('Participante agregado');
      await loadAllData();
    } else {
      alert('Error: ' + (data.msg || 'No se pudo agregar'));
    }
  } catch (err) {
    alert('Error al agregar participante');
  }
}

async function marcarPagadoParticipante(torneoId, email) {
  try {
    const response = await fetch(API_BASE + `/api/admin/torneos/${torneoId}/participantes/${email}/pagar`, {
      method: 'PATCH',
      headers: { 'x-admin-token': state.token }
    });

    const data = await response.json();
    
    if (data.ok) {
      alert('Marcado como pagado');
      await loadAllData();
    } else {
      alert('Error: ' + (data.msg || 'No se pudo marcar'));
    }
  } catch (err) {
    alert('Error al marcar como pagado');
  }
}

async function eliminarParticipante(torneoId, email) {
  try {
    const response = await fetch(API_BASE + `/api/admin/torneos/${torneoId}/participante/${email}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': state.token }
    });

    const data = await response.json();
    
    if (data.ok) {
      alert('Participante eliminado');
      await loadAllData();
    } else {
      alert('Error: ' + (data.msg || 'No se pudo eliminar'));
    }
  } catch (err) {
    alert('Error al eliminar participante');
  }
}

async function generarBracket(torneoId) {
  if (!confirm('Generar bracket automáticamente?\n\nEsto creará todos los partidos según el tipo de torneo.')) return;

  try {
    const response = await fetch(API_BASE + `/api/admin/torneos/${torneoId}/generar-bracket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      }
    });

    const data = await response.json();
    
    if (data.ok) {
      alert(`Bracket generado!\n\n${data.total_partidos} partidos creados`);
      await loadAllData();
    } else {
      alert('Error: ' + (data.msg || 'No se pudo generar'));
    }
  } catch (err) {
    alert('Error al generar bracket');
  }
}

async function gestionarPartidos(torneoId) {
  try {
    const response = await fetch(API_BASE + `/api/torneos/${torneoId}`);
    const torneo = await response.json();

    if (!torneo.partidos || torneo.partidos.length === 0) {
      alert('No hay partidos generados');
      return;
    }

    let mensaje = `PARTIDOS DEL TORNEO\n`;
    mensaje += `═══════════════════════\n\n`;
    
    // Agrupar por ronda
    const porRonda = {};
    torneo.partidos.forEach(p => {
      if (!porRonda[p.ronda]) porRonda[p.ronda] = [];
      porRonda[p.ronda].push(p);
    });

    Object.keys(porRonda).forEach(ronda => {
      mensaje += ` ${ronda.toUpperCase()}\n`;
      porRonda[ronda].forEach(p => {
        const eq1 = p.equipo1_nombres ? p.equipo1_nombres.join(' + ') : 'TBD';
        const eq2 = p.equipo2_nombres ? p.equipo2_nombres.join(' + ') : 'TBD';
        const resultado = p.estado === 'finalizado' 
          ? ` → ${p.resultado_equipo1}-${p.resultado_equipo2}` 
          : ` (${p.estado})`;
        mensaje += `  ${p.id}. ${eq1} vs ${eq2}${resultado}\n`;
      });
      mensaje += `\n`;
    });

    const partidoId = prompt(mensaje + '\nIngresa el ID del partido para registrar resultado (o 0 para salir):');
    
    if (partidoId && partidoId !== '0') {
      await registrarResultado(torneoId, parseInt(partidoId));
    }
  } catch (err) {
    alert('Error al cargar partidos');
  }
}

async function registrarResultado(torneoId, partidoId) {
  const resultado_equipo1 = parseInt(prompt('Sets ganados por Equipo 1:'));
  const resultado_equipo2 = parseInt(prompt('Sets ganados por Equipo 2:'));
  
  if (isNaN(resultado_equipo1) || isNaN(resultado_equipo2)) {
    alert('Resultados inválidos');
    return;
  }

  const ganador = resultado_equipo1 > resultado_equipo2 ? 'equipo1' : 'equipo2';
  
  // Sets detallados
  const sets_detalle = [];
  const totalSets = resultado_equipo1 + resultado_equipo2;
  
  for (let i = 0; i < totalSets; i++) {
    const eq1 = parseInt(prompt(`Set ${i+1} - Puntos Equipo 1:`));
    const eq2 = parseInt(prompt(`Set ${i+1} - Puntos Equipo 2:`));
    sets_detalle.push({ eq1, eq2 });
  }

  const cancha = parseInt(prompt('Cancha donde se jugó (1, 2 o 3):', '1'));
  const fecha = prompt('Fecha (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
  const hora = prompt('Hora (HH:MM):', '18:00');

  try {
    const response = await fetch(API_BASE + `/api/admin/torneos/${torneoId}/resultado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token
      },
      body: JSON.stringify({
        partido_id: partidoId,
        resultado_equipo1,
        resultado_equipo2,
        sets_detalle,
        ganador,
        cancha,
        fecha,
        hora
      })
    });

    const data = await response.json();
    
    if (data.ok) {
      alert('Resultado registrado!');
      await loadAllData();
    } else {
      alert('Error: ' + (data.msg || 'No se pudo registrar'));
    }
  } catch (err) {
    alert('Error al registrar resultado');
  }
}

// ==================== CONFIG Y REPORTES ====================

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

  document.getElementById('statReservas').textContent = totalReservas;
  document.getElementById('statRecaudado').textContent = '$' + Math.round(totalRecaudado).toLocaleString();
  document.getElementById('statPendientes').textContent = pendientesPago;
  
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

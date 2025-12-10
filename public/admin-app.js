// admin-app.js - Panel Admin v7.5 - Fix Reservas Activas + Filtro Fechas Total
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
  mostrarCanceladas: false,
  mostrarPasadas: false,
  filtroTotalTipo: 'todo', // 'todo', 'fecha', 'rango'
  filtroFechaInicio: '',
  filtroFechaFin: ''
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
      checkPasadas.onchange = function () {
        state.mostrarPasadas = this.checked;
        renderReservas();
      };
    }

    if (checkCanceladas) {
      checkCanceladas.onchange = function () {
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
        const metodoPagoTexto = r.metodo_pago
          ? `<br><span class="text-xs text-gray-600">${r.metodo_pago}</span>`
          : '';

        let estadoBadgeClass = 'bg-blue-100 text-blue-700';
        let estadoText = 'Activa';

        if (r.estado === 'cancelada') {
          estadoBadgeClass = 'bg-gray-200 text-gray-700';
          estadoText = 'Cancelada';
        } else if (!r.pagado) {
          estadoBadgeClass = 'bg-yellow-100 text-yellow-700';
          estadoText = 'Pendiente';
        }

        const tieneDescuento = r.descuento && r.descuento > 0;
        const precioHTML = tieneDescuento
          ? `
          <div>
            <p class="text-xs text-gray-500 line-through">$${Math.round(r.precio_base || r.precio)}</p>
            <p class="text-lg font-bold text-purple-600">$${r.precio}</p>
            <span class="px-2 py-1 bg-purple-500 text-white text-xs rounded-full">
              ${r.descuento}% OFF
            </span>
          </div>
        `
          : `
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
            <div class="flex flex-col gap-1">
              <span class="px-3 py-1 rounded-full text-xs font-bold ${estadoBadgeClass}">
                ${estadoText}
              </span>
              <span class="px-3 py-1 rounded-full text-xs font-bold ${pagadoClass}">
                ${pagadoText}${metodoPagoTexto}
              </span>
            </div>
          </td>
          <td class="px-4 py-3">${botonesHTML}</td>
        `;
        tbody.appendChild(tr);
      });
    });
  };

  renderGrupo(reservasFuturas, 'Hoy y Próximas Reservas', 'green');

  if (state.mostrarPasadas) {
    renderGrupo(reservasPasadas, 'Reservas Anteriores', 'gray');
  }

  if (state.mostrarCanceladas) {
    const canceladasAgrupadas = agruparPorFecha(canceladas);
    renderGrupo(canceladasAgrupadas, 'Canceladas', 'red');
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
    div.className = `bg-purple-50 border-2 border-purple-200 rounded-xl p-4 mb-4 ${!p.activa ? 'opacity-60' : ''}`;

    let textoPromo = `${p.descuento}% OFF`;
    
    // Etiquetas aclaratorias
    const etiquetas = [];
    if (!p.fecha) etiquetas.push('Permanente');
    if (!p.hora_inicio && !p.hora_fin) etiquetas.push('Todo el día');
    
    if (p.fecha) textoPromo += ` - ${formatearFecha(p.fecha)}`;
    if (p.hora_inicio && p.hora_fin) {
      textoPromo += ` de ${convertirA12h(p.hora_inicio)} a ${convertirA12h(p.hora_fin)}`;
    }

    div.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <p class="font-bold text-purple-700 text-lg">${textoPromo}</p>
          <div class="flex flex-wrap gap-2 mt-1">
            ${etiquetas.map(et => `<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">${et}</span>`).join('')}
            <span class="px-2 py-1 ${p.activa ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'} text-xs rounded-full">
              ${p.activa ? 'Activa' : 'Inactiva'}
            </span>
          </div>
        </div>
        ${p.activa ? `
          <button onclick="eliminarPromocion('${p.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 ml-4 flex-shrink-0">
            Eliminar
          </button>
        ` : '<span class="text-xs text-gray-500 italic ml-4">Promo desactivada</span>'}
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
    alert('Ingresa un descuento válido entre 1 y 100%');
    return;
  }

  // Validar coherencia de horarios
  if (horaInicio && horaFin) {
    const [hiH, hiM] = horaInicio.split(':').map(Number);
    const [hfH, hfM] = horaFin.split(':').map(Number);
    const inicioMin = hiH * 60 + hiM;
    const finMin = hfH * 60 + hfM;
    
    if (inicioMin >= finMin) {
      alert('La hora de inicio debe ser anterior a la hora de fin');
      return;
    }
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

    alert('Promoción creada exitosamente');
    document.getElementById('promoFecha').value = '';
    document.getElementById('promoDescuento').value = '';
    document.getElementById('promoHoraInicio').value = '';
    document.getElementById('promoHoraFin').value = '';
    await loadAllData();
  } catch (err) {
    console.error('Error crear promo:', err);
    alert('Error al crear promoción');
  }
}

async function eliminarPromocion(id) {
  if (!confirm('¿Eliminar esta promoción?\n\nEsta acción no se puede deshacer.')) return;

  try {
    await fetch(API_BASE + `/api/admin/promociones/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': state.token }
    });
    alert('Promoción eliminada');
    await loadAllData();
  } catch (err) {
    console.error('Error eliminar promo:', err);
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
    const badges = [];
    
    if (b.cancha) {
      textoBloqueo += ` - Cancha ${b.cancha}`;
    } else {
      badges.push('Todas las canchas');
    }
    
    if (b.hora_inicio && b.hora_fin) {
      textoBloqueo += ` de ${convertirA12h(b.hora_inicio)} a ${convertirA12h(b.hora_fin)}`;
      badges.push('Horario parcial');
    } else {
      badges.push('Día completo');
    }

    div.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <p class="font-bold text-red-700 text-lg">${textoBloqueo}</p>
          <div class="flex flex-wrap gap-2 mt-1">
            ${badges.map(badge => `<span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">${badge}</span>`).join('')}
          </div>
          ${b.motivo ? `<p class="text-sm text-gray-600 mt-1">${b.motivo}</p>` : ''}
        </div>
        <button onclick="eliminarBloqueo('${b.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 ml-4 flex-shrink-0">
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

  // Validar coherencia de horarios
  if (horaInicio && horaFin) {
    const [hiH, hiM] = horaInicio.split(':').map(Number);
    const [hfH, hfM] = horaFin.split(':').map(Number);
    const inicioMin = hiH * 60 + hiM;
    const finMin = hfH * 60 + hfM;
    
    if (inicioMin >= finMin) {
      alert('La hora de inicio debe ser anterior a la hora de fin');
      return;
    }
  }

  if (cancha && (cancha < 1 || cancha > 3)) {
    alert('Cancha debe ser 1, 2 o 3');
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

    alert('Bloqueo creado exitosamente');
    document.getElementById('bloqueoFecha').value = '';
    document.getElementById('bloqueoCancha').value = '';
    document.getElementById('bloqueoHoraInicio').value = '';
    document.getElementById('bloqueoHoraFin').value = '';
    document.getElementById('bloqueoMotivo').value = '';
    await loadAllData();
  } catch (err) {
    console.error('Error crear bloqueo:', err);
    alert('Error al crear bloqueo');
  }
}

async function eliminarBloqueo(id) {
  if (!confirm('¿Eliminar este bloqueo?\n\nEsta acción no se puede deshacer.')) return;

  try {
    await fetch(API_BASE + `/api/admin/bloqueos/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': state.token }
    });
    alert('Bloqueo eliminado');
    await loadAllData();
  } catch (err) {
    console.error('Error eliminar bloqueo:', err);
    alert('Error al eliminar');
  }
}

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

  if (!horaDia || horaDia <= 0) {
    alert('Precio día debe ser mayor a 0');
    return;
  }

  if (!horaNoche || horaNoche <= 0) {
    alert('Precio noche debe ser mayor a 0');
    return;
  }

  if (!cambioTarifa || cambioTarifa < 0 || cambioTarifa > 23) {
    alert('Cambio de tarifa debe estar entre 0 y 23');
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

    alert('Precios actualizados correctamente');
    await cargarConfigActual();
  } catch (err) {
    console.error('Error actualizar precios:', err);
    alert('Error al actualizar precios');
  }
}

async function descargarReporteDia() {
  const fecha = prompt('Fecha (YYYY-MM-DD):', getFechaLocalMST());
  if (!fecha) return;

  try {
    const response = await fetch(API_BASE + `/api/admin/reporte/dia?fecha=${fecha}`, {
      headers: { 'x-admin-token': state.token }
    });
    
    if (!response.ok) throw new Error('Error del servidor');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_dia_${fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error descargar reporte:', err);
    alert('Error al descargar reporte');
  }
}

async function descargarReporteMes() {
  const mes = prompt('Mes (1-12):', new Date().getMonth() + 1);
  const año = prompt('Año (YYYY):', new Date().getFullYear());
  
  if (!mes || !año || isNaN(mes) || isNaN(año)) {
    alert('Mes y año inválidos');
    return;
  }

  const mesNum = parseInt(mes);
  if (mesNum < 1 || mesNum > 12) {
    alert('Mes debe estar entre 1 y 12');
    return;
  }

  try {
    const response = await fetch(API_BASE + `/api/admin/reporte/mes?mes=${mesNum}&año=${año}`, {
      headers: { 'x-admin-token': state.token }
    });
    
    if (!response.ok) throw new Error('Error del servidor');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_mes_${mesNum}_${año}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error descargar reporte:', err);
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
  const totalPagado = reservasParaTotal.filter(r => r.pagado).reduce((sum, r) => sum + parseFloat(r.precio || 0), 0);
  const pendientesPago = reservasActivas.filter(r => !r.pagado).length;
  const conPromo = reservasParaTotal.filter(r => r.descuento > 0).length;
  const descuentoTotal = reservasParaTotal.reduce((sum, r) => {
    if (r.descuento > 0 && r.precio_base) {
      return sum + (parseFloat(r.precio_base) - parseFloat(r.precio));
    }
    return sum;
  }, 0);

  document.getElementById('statReservas').textContent = totalReservas;
  document.getElementById('statRecaudado').textContent = '$' + Math.round(totalRecaudado).toLocaleString();
  document.getElementById('statPendientes').textContent = pendientesPago;
  
  // Nuevas métricas
  if (document.getElementById('statPagado')) {
    document.getElementById('statPagado').textContent = '$' + Math.round(totalPagado).toLocaleString();
  }
  if (document.getElementById('statPromos')) {
    document.getElementById('statPromos').textContent = conPromo;
  }
  if (document.getElementById('statDescuentos')) {
    document.getElementById('statDescuentos').textContent = '$' + Math.round(descuentoTotal).toLocaleString();
  }
  
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

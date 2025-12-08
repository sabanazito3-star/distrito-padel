// admin-app.js - Panel Admin v6.0 - Con reservas manuales, promociones horarias y configuración de precios

let state = {
  reservas: [],
  promociones: [],
  bloqueos: [],
  config: null,
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

function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  if (state.token) opts.headers['x-admin-token'] = state.token;
  return fetch('/api' + path, opts).then(async r => {
    const json = await r.json().catch(() => null);
    if (!r.ok) throw json || { error: 'API error' };
    return json;
  });
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
    const [reservas, promociones, bloqueos] = await Promise.all([
      api('/admin/reservas'),
      api('/admin/promociones'),
      api('/admin/bloqueos')
    ]);

    state.reservas = reservas;
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
    alert('Error: ' + (err.error || 'Token inválido'));
    localStorage.removeItem('admin_token');
    stopAutoUpdate();
  }
}

function startAutoUpdate() {
  stopAutoUpdate();
  state.autoUpdateInterval = setInterval(async () => {
    if (!state.token) return;

    try {
      const [reservas, promociones, bloqueos] = await Promise.all([
        api('/admin/reservas'),
        api('/admin/promociones'),
        api('/admin/bloqueos')
      ]);

      const hasChanges =
        JSON.stringify(reservas) !== JSON.stringify(state.reservas) ||
        JSON.stringify(promociones) !== JSON.stringify(state.promociones) ||
        JSON.stringify(bloqueos) !== JSON.stringify(state.bloqueos);

      if (hasChanges) {
        state.reservas = reservas;
        state.promociones = promociones;
        state.bloqueos = bloqueos;
        renderReservas();
        renderPromociones();
        renderBloqueos();
        updateStats();
      }

      updateLastUpdate();
    } catch (err) {
      console.error('Error en auto-actualización:', err);
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
    cargarConfiguracion();
  }
}

// ============ FORMATO 12 HORAS ============
function convertirA12h(hora24) {
  if (!hora24) return '';
  const [h, m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  const hora12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hora12}:${String(m).padStart(2, '0')} ${periodo}`;
}

// ============ RESERVAS CON ESTADO DE CANCELACIÓN ============
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

  // Mostrar contador
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

  // Agregar evento al checkbox DESPUÉS de agregarlo al DOM
  setTimeout(() => {
    const checkbox = document.getElementById('checkMostrarCanceladas');
    if (checkbox) {
      checkbox.onchange = function() {
        state.mostrarCanceladas = this.checked;
        renderReservas();
      };
    }
  }, 0);

  // Determinar qué mostrar
  const reservasAMostrar = state.mostrarCanceladas 
    ? [...activas, ...canceladas] 
    : activas;

  reservasAMostrar
    .sort((a, b) => new Date(b.creada) - new Date(a.creada))
    .forEach(r => {
      const tr = document.createElement('tr');
      
      // Fila gris si está cancelada
      const canceladaClass = r.estado === 'cancelada' ? 'bg-gray-100 opacity-60' : 'hover:bg-gray-50';
      tr.className = `${canceladaClass} border-b`;

      const esManual = r.esManual ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full ml-2">Manual</span>' : '';
      
      // Badge de estado
      let estadoBadge = '';
      if (r.estado === 'cancelada') {
        const canceladoPor = r.canceladaPor === 'admin' ? 'Admin' : 'Usuario';
        const fechaCancel = new Date(r.fechaCancelacion).toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        estadoBadge = `<span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full ml-2">CANCELADA</span>
                      <br><span class="text-xs text-gray-500">Por ${canceladoPor} - ${fechaCancel}</span>`;
      }
      
      const pagadoClass = r.pagado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
      const pagadoText = r.pagado ? 'Pagado' : 'Pendiente';
      const metodoPagoTexto = r.pagado && r.metodoPago ? `<br><span class="text-xs text-gray-600">${r.metodoPago}</span>` : '';

      const precioHTML = r.descuento > 0 
        ? `<span class="font-bold text-green-600">$${r.precio}</span>
           <br><span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
             -${r.descuento}% (era $${r.precioBase})
           </span>`
        : `<span class="font-bold text-green-600">$${r.precio}</span>`;

      // Botones deshabilitados si está cancelada
      const botonesHTML = r.estado === 'cancelada' 
        ? '<span class="text-xs text-gray-500 italic">Cancelada</span>'
        : `<button onclick="togglePago('${r.id}', ${!r.pagado})" class="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 mr-2">
             ${r.pagado ? 'Marcar Pendiente' : 'Marcar Pagado'}
           </button>
           <button onclick="eliminarReserva('${r.id}')" class="px-3 py-1 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600">
             Cancelar
           </button>`;

      tr.innerHTML = `
        <td class="px-4 py-3">${r.fecha}</td>
        <td class="px-4 py-3 font-bold">${convertirA12h(r.horaInicio)}</td>
        <td class="px-4 py-3">${r.duracion}h</td>
        <td class="px-4 py-3">${r.cancha}</td>
        <td class="px-4 py-3">${r.nombre || r.email}${esManual}${estadoBadge}</td>
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
}

async function togglePago(id, pagado) {
  let metodoPago = null;
  
  if (pagado) {
    const metodo = prompt('Método de pago:\n1 = Efectivo\n2 = Tarjeta\n3 = Transferencia');
    if (!metodo || !['1', '2', '3'].includes(metodo)) {
      alert('Debes seleccionar un método válido (1, 2 o 3)');
      return;
    }
    const metodos = { '1': 'Efectivo', '2': 'Tarjeta', '3': 'Transferencia' };
    metodoPago = metodos[metodo];
  }
  
  try {
    await api('/admin/reservas/' + id + '/pago', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado, metodoPago })
    });
    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al actualizar'));
  }
}

// CANCELAR RESERVA - No elimina, solo marca como cancelada
async function eliminarReserva(id) {
  if (!confirm('¿Cancelar esta reserva?\n\nLa reserva no se eliminará, solo se marcará como cancelada y el horario se liberará.')) return;

  try {
    await api('/admin/reservas/' + id, { method: 'DELETE' });
    alert('Reserva cancelada correctamente');
    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al cancelar'));
  }
}

// ============ CREAR RESERVA MANUAL ============
async function crearReservaManual() {
  const fecha = document.getElementById('manualFecha').value;
  const horaInicio = document.getElementById('manualHora').value;
  const duracion = document.getElementById('manualDuracion').value;
  const cancha = document.getElementById('manualCancha').value;
  const nombreCliente = document.getElementById('manualNombre').value.trim();
  const telefonoCliente = document.getElementById('manualTelefono').value.trim();
  const emailCliente = document.getElementById('manualEmail').value.trim();

  if (!fecha || !horaInicio || !duracion || !cancha || !nombreCliente) {
    alert('Completa todos los campos obligatorios');
    return;
  }

  try {
    await api('/admin/reservas/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha,
        horaInicio,
        duracion: Number(duracion),
        cancha,
        nombreCliente,
        telefonoCliente,
        emailCliente
      })
    });

    alert('Reserva manual creada correctamente');

    document.getElementById('manualFecha').value = '';
    document.getElementById('manualHora').value = '';
    document.getElementById('manualDuracion').value = '1';
    document.getElementById('manualCancha').value = '1';
    document.getElementById('manualNombre').value = '';
    document.getElementById('manualTelefono').value = '';
    document.getElementById('manualEmail').value = '';

    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al crear reserva'));
  }
}

// ============ PROMOCIONES CON RANGO HORARIO ============
function renderPromociones() {
  const container = document.getElementById('promocionesContainer');
  container.innerHTML = '';

  if (state.promociones.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg">No hay promociones configuradas</p>
      </div>
    `;
    return;
  }

  state.promociones
    .sort((a, b) => new Date(b.creada) - new Date(a.creada))
    .forEach(p => {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between p-4 border rounded-xl ' +
        (p.activa ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200');

      const fechaTexto = p.fecha ? `Fecha: ${p.fecha}` : 'Sin fecha específica';
      const horarioTexto = p.horaInicio && p.horaFin
        ? `Horario: ${convertirA12h(p.horaInicio)} - ${convertirA12h(p.horaFin)}`
        : 'Todo el día';

      div.innerHTML = `
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl font-bold text-purple-600">${p.descuento}% OFF</span>
            <span class="px-3 py-1 rounded-full text-xs font-bold ${p.activa ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}">
              ${p.activa ? 'Activa' : 'Pausada'}
            </span>
          </div>
          <p class="text-sm text-gray-700">${fechaTexto}</p>
          <p class="text-sm text-gray-700">${horarioTexto}</p>
          <p class="text-xs text-gray-500 mt-1">Creada: ${new Date(p.creada).toLocaleString()}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="togglePromocion('${p.id}')" class="px-4 py-2 ${p.activa ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg">
            ${p.activa ? 'Pausar' : 'Activar'}
          </button>
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
  const descuento = document.getElementById('promoDescuento').value;
  const horaInicio = document.getElementById('promoHoraInicio').value || null;
  const horaFin = document.getElementById('promoHoraFin').value || null;

  if (!descuento || descuento < 1 || descuento > 100) {
    alert('Ingresa un descuento válido (1-100)');
    return;
  }

  try {
    await api('/admin/promociones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, descuento: Number(descuento), horaInicio, horaFin })
    });

    alert('Promoción creada correctamente');
    document.getElementById('promoFecha').value = '';
    document.getElementById('promoDescuento').value = '';
    document.getElementById('promoHoraInicio').value = '';
    document.getElementById('promoHoraFin').value = '';
    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al crear'));
  }
}

async function togglePromocion(id) {
  try {
    await api('/admin/promociones/' + id + '/toggle', { method: 'PATCH' });
    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al actualizar'));
  }
}

async function eliminarPromocion(id) {
  if (!confirm('¿Eliminar esta promoción?')) return;

  try {
    await api('/admin/promociones/' + id, { method: 'DELETE' });
    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al eliminar'));
  }
}

// ============ REPORTE DE CIERRE CON PROMOCIONES ============
async function descargarReporteHoy() {
  const hoy = new Date();
  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, '0');
  const day = String(hoy.getDate()).padStart(2, '0');
  const hoyStr = `${year}-${month}-${day}`;
  await descargarReporte(hoyStr, null);
}

async function descargarReporteMes() {
  const mes = prompt('Ingresa el mes (formato: 2025-12):');
  if (!mes) return;
  await descargarReporte(null, mes);
}

async function descargarReporte(fecha, mes) {
  try {
    const query = fecha ? `fecha=${fecha}` : mes ? `mes=${mes}` : '';
    const data = await api(`/admin/reporte-cierre?${query}`);

    let csv = 'Fecha,Hora,Cancha,Cliente,Precio Base,Descuento %,Precio Final,Método de Pago\n';
    data.reservas.forEach(r => {
      const descuentoTexto = r.descuento > 0 ? `${r.descuento}%` : '0%';
      const precioBase = r.precioBase || r.precio;
      csv += `${r.fecha},${convertirA12h(r.horaInicio)},${r.cancha},${r.nombre},${precioBase},${descuentoTexto},${r.precio},${r.metodoPago || 'N/A'}\n`;
    });

    csv += '\n';
    csv += `TOTALES POR MÉTODO DE PAGO\n`;
    csv += `Efectivo,${data.totales.efectivo}\n`;
    csv += `Tarjeta,${data.totales.tarjeta}\n`;
    csv += `Transferencia,${data.totales.transferencia}\n`;
    csv += `Otro,${data.totales.otro}\n`;
    csv += `\nTOTAL GENERAL,${data.totales.total}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_${fecha || mes || 'total'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Reporte descargado\n\nTotal: $${data.totales.total} MXN\nEfectivo: $${data.totales.efectivo}\nTarjeta: $${data.totales.tarjeta}\nTransferencia: $${data.totales.transferencia}`);
  } catch (err) {
    alert('Error al generar reporte: ' + (err.error || 'Error desconocido'));
  }
}

// ============ BLOQUEOS ============
function renderBloqueos() {
  const container = document.getElementById('bloqueosContainer');
  container.innerHTML = '';

  if (state.bloqueos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg">No hay bloqueos activos</p>
      </div>
    `;
    return;
  }

  state.bloqueos
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .forEach(b => {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between p-4 border border-red-200 rounded-xl bg-red-50';

      const horarioTexto = b.horaInicio && b.horaFin
        ? `${convertirA12h(b.horaInicio)} - ${convertirA12h(b.horaFin)}`
        : 'Todo el día';
      const canchaTexto = b.cancha ? 'Cancha ' + b.cancha : 'Todas las canchas';

      div.innerHTML = `
        <div class="flex-1">
          <p class="font-bold text-red-700">BLOQUEADO: ${canchaTexto}</p>
          <p class="text-sm text-gray-700 mt-1">Fecha: ${b.fecha} - ${horarioTexto}</p>
          ${b.motivo ? `<p class="text-sm text-gray-600 mt-1">Motivo: ${b.motivo}</p>` : ''}
        </div>
        <button onclick="eliminarBloqueo('${b.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
          Eliminar
        </button>
      `;
      container.appendChild(div);
    });
}

async function crearBloqueo() {
  const fecha = document.getElementById('bloqueoFecha').value;
  const horaInicio = document.getElementById('bloqueoHoraInicio').value || null;
  const horaFin = document.getElementById('bloqueoHoraFin').value || null;
  const cancha = document.getElementById('bloqueoCancha').value || null;
  const motivo = document.getElementById('bloqueoMotivo').value.trim() || 'Bloqueado';

  if (!fecha) {
    alert('Selecciona una fecha');
    return;
  }

  try {
    await api('/admin/bloqueos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, horaInicio, horaFin, cancha, motivo })
    });

    alert('Bloqueo creado correctamente');
    document.getElementById('bloqueoFecha').value = '';
    document.getElementById('bloqueoHoraInicio').value = '';
    document.getElementById('bloqueoHoraFin').value = '';
    document.getElementById('bloqueoCancha').value = '';
    document.getElementById('bloqueoMotivo').value = '';
    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al crear'));
  }
}

async function eliminarBloqueo(id) {
  if (!confirm('¿Eliminar este bloqueo?')) return;

  try {
    await api('/admin/bloqueos/' + id, { method: 'DELETE' });
    await loadAllData();
  } catch (err) {
    alert('Error: ' + (err.error || 'Error al eliminar'));
  }
}

// ============ CONFIGURACIÓN DE PRECIOS ============
async function cargarConfiguracion() {
  try {
    const config = await api('/admin/config');
    state.config = config;
    
    document.getElementById('configPrecioDia').value = config.precios.horaDia;
    document.getElementById('configPrecioNoche').value = config.precios.horaNoche;
    document.getElementById('configCambioTarifa').value = config.precios.cambioTarifa;
    
    document.getElementById('displayPrecioDia').textContent = '$' + config.precios.horaDia;
    document.getElementById('displayPrecioNoche').textContent = '$' + config.precios.horaNoche;
    
    const horaCambio = config.precios.cambioTarifa === 24 
      ? 'Sin cambio' 
      : convertirA12h(config.precios.cambioTarifa + ':00');
    document.getElementById('displayCambio').textContent = horaCambio;
  } catch (err) {
    console.error('Error al cargar configuración:', err);
    alert('Error al cargar configuración');
  }
}

async function actualizarPrecios() {
  const horaDia = document.getElementById('configPrecioDia').value;
  const horaNoche = document.getElementById('configPrecioNoche').value;
  const cambioTarifa = document.getElementById('configCambioTarifa').value;

  if (!horaDia || !horaNoche || !cambioTarifa) {
    alert('Completa todos los campos');
    return;
  }

  if (Number(horaDia) < 0 || Number(horaNoche) < 0) {
    alert('Los precios no pueden ser negativos');
    return;
  }

  if (Number(cambioTarifa) < 0 || Number(cambioTarifa) > 24) {
    alert('La hora de cambio debe estar entre 0 y 24');
    return;
  }

  if (confirm('¿Estás seguro de cambiar los precios?\n\nEsto afectará todas las nuevas reservas.\n\nReservas existentes mantendrán su precio original.')) {
    try {
      await api('/admin/config/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          horaDia: Number(horaDia),
          horaNoche: Number(horaNoche),
          cambioTarifa: Number(cambioTarifa)
        })
      });

      alert('Precios actualizados correctamente\n\nLos cambios ya están activos para nuevas reservas.');
      cargarConfiguracion();
    } catch (err) {
      alert('Error: ' + (err.error || 'Error al actualizar'));
    }
  }
}

// ============ ESTADÍSTICAS (SOLO RESERVAS ACTIVAS) ============
function updateStats() {
  // Contar solo activas
  const reservasActivas = state.reservas.filter(r => r.estado !== 'cancelada');
  const totalReservas = reservasActivas.length;
  const totalRecaudado = reservasActivas.reduce((sum, r) => sum + r.precio, 0);
  const pendientesPago = reservasActivas.filter(r => !r.pagado).length;

  document.getElementById('statReservas').textContent = totalReservas;
  document.getElementById('statRecaudado').textContent = '$' + totalRecaudado.toLocaleString();
  document.getElementById('statPendientes').textContent = pendientesPago;
}

async function verMisReservas() {
  try {
    const res = await fetch(API_BASE + '/api/mis-reservas', {
      headers: { 
        'x-email': state.email  // ← FIX: pasa email en header
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
              <p class="text-sm text-gray-600 mt-1">Fecha: ${r.fecha} - Hora: ${convertirA12h(r.hora_inicio)} - Duración: ${Math.round(r.duracion_minutos/60)}h</p>
            </div>
            <button onclick="cancelarReserva('${r.id}')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              Cancelar
            </button>
          </div>
          <div class="bg-white rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">$${r.precio_total} MXN</p>
            <p class="text-sm mt-2 ${r.estado === 'pagada' ? 'text-green-600' : 'text-yellow-600'} font-bold">
              ${r.estado === 'pagada' ? 'Pagado' : 'Pendiente de pago'}
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

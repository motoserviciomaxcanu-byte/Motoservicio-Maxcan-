// js/credencial.js
// Módulo de Credencial Digital y Compresión de Imágenes en Canvas

/**
 * Compresión de imágenes en Canvas HTML5
 * Convierte un File a Base64 JPEG
 */
export function comprimirImagen(file, maxAncho = 400, calidad = 0.6) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxAncho) {
          height = Math.round((height * maxAncho) / width);
          width = maxAncho;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const base64Str = canvas.toDataURL("image/jpeg", calidad);
        resolve(base64Str);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Renderiza la credencial/sticker oficial en el DOM
 */
export function renderizarCredencialModal(chofer, contenedorId) {
  const container = document.getElementById(contenedorId);
  if (!container || !chofer) return;

  const fotoChofer = chofer.fotoUrl || "https://via.placeholder.com/150?text=Chofer";
  const fotoTrici = chofer.fotoTriciUrl || "https://via.placeholder.com/150?text=Unidad";

  container.innerHTML = `
    <div class="bg-black border-2 border-yellow-400 rounded-2xl p-5 shadow-2xl max-w-sm mx-auto text-center relative overflow-hidden">
      <div class="bg-yellow-400 text-black font-black text-xs py-1 uppercase tracking-widest rounded-t-lg mb-3">
        Yo Viajo Seguro Con Moto Servicio Maxcanú
      </div>
      
      <div class="flex justify-between items-center mb-4 px-2">
        <div class="text-left">
          <p class="text-gray-400 text-xs font-semibold">UNIDAD ECONÓMICA</p>
          <p class="text-3xl font-black text-yellow-400">#${chofer.unidad || "N/A"}</p>
        </div>
        <div class="text-right">
          <span class="inline-block px-3 py-1 text-xs font-bold rounded-full ${
            chofer.estatus === "ACTIVO" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }">
            ${chofer.estatus || "DESCONOCIDO"}
          </span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-gray-900 p-1 rounded-xl border border-gray-800">
          <img src="${fotoChofer}" alt="Chofer" class="w-full h-28 object-cover rounded-lg">
          <p class="text-[10px] text-gray-400 mt-1 font-bold">CONDUCTOR</p>
        </div>
        <div class="bg-gray-900 p-1 rounded-xl border border-gray-800">
          <img src="${fotoTrici}" alt="Mototaxi" class="w-full h-28 object-cover rounded-lg">
          <p class="text-[10px] text-gray-400 mt-1 font-bold">VEHÍCULO</p>
        </div>
      </div>

      <div class="bg-gray-900 rounded-xl p-3 border border-gray-800 text-left mb-4 space-y-1">
        <p class="text-xs text-gray-400">Nombre del Socio:</p>
        <p class="text-sm font-bold text-white uppercase">${chofer.nombre || "Socio Registrado"}</p>
        <div class="flex justify-between text-xs text-gray-400 pt-1">
          <span>Clave: <strong class="text-yellow-400">${chofer.codigoAcceso || "XXXX"}</strong></span>
          <span>Alta: <strong class="text-gray-300">${chofer.fechaAlta || "2026"}</strong></span>
        </div>
      </div>

      <div class="flex items-center justify-between bg-gray-950 p-2 rounded-xl border border-yellow-500/30">
        <div class="text-left">
          <p class="text-[10px] text-yellow-400 font-bold uppercase">Verificación Oficial</p>
          <p class="text-[9px] text-gray-400">Escanea para validar vigencia</p>
        </div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(
          window.location.origin + '/verificar.html?codigo=' + (chofer.codigoAcceso || 'M4X7')
        )}" alt="QR" class="w-12 h-12 rounded bg-white p-0.5">
      </div>
    </div>
  `;
}

import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let choferesCache = []; 
let reportesGlobales = []; 
let mapaFlotaAdmin = null; 
let marcadoresChoferesNube = {};

const TILE_URL_ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

document.addEventListener('DOMContentLoaded', () => { 
    vincularEventosAdmin(); 
    escucharFlotaActiva();
    escucharReportesOficiales();
    escucharEstadisticasViajesSemanal();
});

function vincularEventosAdmin() {
    document.getElementById('btn-tab-monitoreo')?.addEventListener('click', () => cambiarTabAdmin('tab-monitoreo'));
    document.getElementById('btn-tab-estadisticas')?.addEventListener('click', () => cambiarTabAdmin('tab-estadisticas'));
    document.getElementById('btn-tab-choferes')?.addEventListener('click', () => cambiarTabAdmin('tab-choferes'));
    document.getElementById('btn-tab-config')?.addEventListener('click', () => cambiarTabAdmin('tab-configuracion'));
    document.getElementById('btn-tab-reportes')?.addEventListener('click', () => cambiarTabAdmin('tab-reportes'));
    
    document.getElementById('form-crear-chofer')?.addEventListener('submit', guardarChofer);
    document.getElementById('form-ajustar-tarifas')?.addEventListener('submit', guardarAjustesTarifas);
    document.getElementById('switch-modo-lluvia')?.addEventListener('change', guardarConfiguracionAdmin);
    document.getElementById('switch-permitir-multiviajes')?.addEventListener('change', guardarConfiguracionAdmin);
    document.getElementById('btn-exportar-csv')?.addEventListener('click', exportarReporteCSV);
}

window.cambiarTabAdmin = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(tabId)?.classList.remove('hidden');

    if (tabId === 'tab-monitoreo') {
        setTimeout(() => {
            if (!mapaFlotaAdmin) inicializarMapaFlotaAdmin();
            else mapaFlotaAdmin.invalidateSize();
        }, 200);
    }
};

window.renderizarTablas = function() {
    escucharFlotaActiva();
    escucharReportesOficiales();
    escucharEstadisticasViajesSemanal();
};

function escucharFlotaActiva() {
    try {
        onSnapshot(collection(db, "choferes"), (snapshot) => {
            choferesCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const activos = choferesCache.filter(c => c.enLinea === true || c.enLinea === "true");
            
            const contadorElemento = document.getElementById('monitoreo-contador-activos');
            if (contadorElemento) {
                contadorElemento.textContent = `${activos.length} Unidades en vivo`;
            }
            
            dibujarTablaChoferesAvanzada(choferesCache);
            inicializarMapaFlotaAdmin();
            actualizarMarcadoresEnMapa(activos);
            if (window.cargarDatalistChoferes) window.cargarDatalistChoferes();

            const listaDiv = document.getElementById('lista-monitoreo-choferes');
            if (listaDiv) {
                if (activos.length === 0) {
                    listaDiv.innerHTML = `<p class="text-xs text-zinc-500 col-span-2 text-center py-4">No hay choferes conectados actualmente.</p>`;
                } else {
                    listaDiv.innerHTML = activos.map(c => `
                        <div class="bg-zinc-800 p-3 rounded-xl border border-emerald-500/40 flex items-center justify-between shadow">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-emerald-500 text-zinc-950 font-black rounded-lg flex items-center justify-center text-xs">U-${c.unidad}</div>
                                <div><h4 class="font-bold text-white text-xs">${c.nombre}</h4><p class="text-[10px] text-zinc-400">${c.telefono}</p></div>
                            </div>
                            ${c.lat && c.lng ? `<button onclick="enfocarChoferEnMapa(${c.lat},${c.lng})" class="px-2.5 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg cursor-pointer hover:bg-amber-500/30">Ver GPS</button>` : `<span class="text-[10px] text-zinc-500 font-bold">Sin GPS</span>`}
                        </div>
                    `).join('');
                }
            }
        });
    } catch (e) {}
}

window.enfocarChoferEnMapa = function(lat, lng) {
    if (mapaFlotaAdmin) { mapaFlotaAdmin.setView([lat, lng], 17, { animate: true }); }
};

function inicializarMapaFlotaAdmin() {
    const elMapa = document.getElementById('mapa-flota-admin');
    if (!elMapa) return;
    if (mapaFlotaAdmin) { mapaFlotaAdmin.invalidateSize(); return; }
    
    mapaFlotaAdmin = L.map('mapa-flota-admin').setView([20.5828, -90.0008], 15);
    L.tileLayer(TILE_URL_ESRI, { maxZoom: 19, attribution: '© Esri' }).addTo(mapaFlotaAdmin);
}

function actualizarMarcadoresEnMapa(activos) {
    if (!mapaFlotaAdmin) return;
    const idsConectados = activos.map(a => a.id);

    Object.keys(marcadoresChoferesNube).forEach(id => {
        if (!idsConectados.includes(id)) { mapaFlotaAdmin.removeLayer(marcadoresChoferesNube[id]); delete marcadoresChoferesNube[id]; }
    });

    activos.forEach(c => {
        if (c.lat && c.lng) {
            const popup = `<div style="font-size:11px; text-align:center;"><b>Unidad ${c.unidad}</b><br><span>${c.nombre}</span><br><span style="color:#10b981; font-weight:bold;">🟢 En Línea</span></div>`;
            if (marcadoresChoferesNube[c.id]) marcadoresChoferesNube[c.id].setLatLng([c.lat, c.lng]);
            else marcadoresChoferesNube[c.id] = L.marker([c.lat, c.lng]).addTo(mapaFlotaAdmin).bindPopup(popup);
        }
    });
}

async function guardarConfiguracionAdmin() {
    const modoLluvia = document.getElementById('switch-modo-lluvia')?.checked || false;
    const permitirMultiviajes = document.getElementById('switch-permitir-multiviajes')?.checked || false;
    try { await setDoc(doc(db, "configuracion", "global"), { modoLluvia, permitirMultiviajes }, { merge: true }); } catch (e) {}
}

async function guardarAjustesTarifas(e) {
    e.preventDefault();
    const tarifaBase = parseInt(document.getElementById('cfg-tarifa-base')?.value || 10);
    const tarifaNocturna = parseInt(document.getElementById('cfg-tarifa-nocturna')?.value || 15);
    const inicioNocturno = parseInt(document.getElementById('cfg-hora-inicio-nocturno')?.value || 22);
    const finNocturno = parseInt(document.getElementById('cfg-hora-fin-nocturno')?.value || 6);

    try {
        await setDoc(doc(db, "configuracion", "global"), { tarifaBase, tarifaNocturna, inicioNocturno, finNocturno }, { merge: true });
        alert("✅ Ajustes tarifarios guardados.");
    } catch (err) {}
}

function escucharEstadisticasViajesSemanal() {
    try {
        onSnapshot(collection(db, "solicitudesViaje"), (snapshot) => {
            const viajes = snapshot.docs.map(d => d.data());
            const hoyStr = new Date().toISOString().split('T')[0];
            const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            let conteoHoy = 0; 
            let conteoSemana = 0; 
            const conteoChoferes = {}; 
            const conteoUsuarios = {};

            viajes.forEach(v => {
                const fechaViaje = new Date(v.fechaHora);
                if (v.fechaHora && v.fechaHora.startsWith(hoyStr)) conteoHoy++;
                if (fechaViaje >= hace7Dias) {
                    conteoSemana++;
                    if (v.choferUnidad) { const key = `U-${v.choferUnidad} (${v.choferNombre})`; conteoChoferes[key] = (conteoChoferes[key] || 0) + 1; }
                    if (v.pasajeroNombre) { const key = `${v.pasajeroNombre}||${v.pasajeroTel}`; conteoUsuarios[key] = (conteoUsuarios[key] || 0) + 1; }
                }
            });

            if(document.getElementById('kpi-viajes-hoy')) document.getElementById('kpi-viajes-hoy').textContent = conteoHoy;
            if(document.getElementById('kpi-viajes-semana')) document.getElementById('kpi-viajes-semana').textContent = conteoSemana;

            const sortedChoferes = Object.entries(conteoChoferes).sort((a,b) => b[1] - a[1]).slice(0, 20);
            const tablaChoferes = document.getElementById('tabla-top-choferes-body');
            if (tablaChoferes) {
                if (sortedChoferes.length === 0) tablaChoferes.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-zinc-500">Sin datos esta semana.</td></tr>`;
                else {
                    document.getElementById('kpi-chofer-lider').textContent = sortedChoferes[0][0];
                    tablaChoferes.innerHTML = sortedChoferes.map(([chofer, total], idx) => `<tr class="border-b border-zinc-800"><td class="p-2 font-black ${idx === 0 ? 'text-amber-400' : 'text-zinc-400'}">#${idx + 1}</td><td class="p-2 text-yellow-500 font-bold">${chofer.split(' ')[0]}</td><td class="p-2">${chofer.substring(chofer.indexOf(' ') + 1)}</td><td class="p-2 text-right font-mono font-black text-emerald-400 text-xs">${total} viajes</td></tr>`).join('');
                }
            }

            const sortedUsuarios = Object.entries(conteoUsuarios).sort((a,b) => b[1] - a[1]).slice(0, 20);
            const tablaUsuarios = document.getElementById('tabla-top-usuarios-body');
            if (tablaUsuarios) {
                if (sortedUsuarios.length === 0) tablaUsuarios.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-zinc-500">Sin datos esta semana.</td></tr>`;
                else {
                    document.getElementById('kpi-usuario-top').textContent = sortedUsuarios[0][0].split('||')[0];
                    tablaUsuarios.innerHTML = sortedUsuarios.map(([userStr, total], idx) => `<tr class="border-b border-zinc-800"><td class="p-2 font-black ${idx === 0 ? 'text-sky-400' : 'text-zinc-400'}">#${idx + 1}</td><td class="p-2 text-white font-bold">${userStr.split('||')[0]}</td><td class="p-2 font-mono text-zinc-400">${userStr.split('||')[1]}</td><td class="p-2 text-right font-mono font-black text-sky-400 text-xs">${total} servicios</td></tr>`).join('');
                }
            }
        });
    } catch (e) {}
}

function escucharReportesOficiales() {
    try {
        onSnapshot(collection(db, "reportesOficiales"), (snapshot) => {
            reportesGlobales = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const pendientes = reportesGlobales.filter(r => r.estado === 'PENDIENTE');
            if(document.getElementById('badge-total-reportes')) document.getElementById('badge-total-reportes').textContent = pendientes.length;
            dibujarTablaChoferesAvanzada(choferesCache);
            window.verReportes('choferes');
        });
    } catch (e) {}
}

function dibujarTablaChoferesAvanzada(lista) {
    const tBody = document.getElementById('tabla-choferes-body');
    if (!tBody) return;

    if (lista.length === 0) { tBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-zinc-500">No hay choferes registrados.</td></tr>`; return; }

    tBody.innerHTML = lista.map(c => {
        const reportesDelChofer = reportesGlobales.filter(r => r.tipoReporte === 'chofer' && r.acusadoInfo && r.acusadoInfo.includes(c.unidad) && r.estado !== 'RESUELTO');
        const numRep = reportesDelChofer.length;
        
        let colorFila = "border-zinc-800"; 
        let iconoAlerta = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check"></i> Limpio</span>`;
        
        if (numRep === 1) { colorFila = "border-yellow-600/50 bg-yellow-950/20"; iconoAlerta = `<span class="text-yellow-400 font-bold">⚠️ 1 Reporte</span>`; }
        if (numRep === 2) { colorFila = "border-orange-600/50 bg-orange-950/20"; iconoAlerta = `<span class="text-orange-400 font-bold">⚠️ 2 Reportes</span>`; }
        if (numRep >= 3) { colorFila = "border-red-600/60 bg-red-950/30"; iconoAlerta = `<span class="text-red-400 font-black">🛑 ${numRep} (CRÍTICO)</span>`; }

        return `
        <tr class="border-b ${colorFila}">
            <td class="p-2 flex gap-1 items-center">
                ${c.fotoUrl ? `<img src="${c.fotoUrl}" class="w-8 h-8 rounded-full object-cover border border-yellow-500">` : `<div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500"><i class="fa-solid fa-user"></i></div>`}
                ${c.fotoTriciUrl ? `<img src="${c.fotoTriciUrl}" class="w-8 h-8 rounded-lg object-cover border border-emerald-400">` : `<div class="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500"><i class="fa-solid fa-motorcycle"></i></div>`}
            </td>
            <td class="p-2 font-black text-yellow-500">U-${c.unidad}</td>
            <td class="p-2 font-bold text-white">${c.nombre}</td>
            <td class="p-2 text-center">${iconoAlerta}</td>
            <td class="p-2"><span class="px-2 py-0.5 ${c.estatus === 'ACTIVO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'} rounded-full text-[10px] font-bold">${c.estatus}</span></td>
            <td class="p-2 text-center space-x-1">
                <button onclick="prepararEdicionChofer('${c.id}')" class="px-2 py-1 bg-zinc-800 hover:bg-yellow-500 hover:text-zinc-950 rounded text-[10px] cursor-pointer"><i class="fa-solid fa-pen"></i></button>
                <button onclick="cambiarEstatusNube('${c.id}', '${c.estatus}')" class="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-[10px] cursor-pointer"><i class="fa-solid fa-power-off"></i></button>
                <button onclick="eliminarChofer('${c.id}', '${c.unidad}')" class="px-2 py-1 bg-red-950 text-red-400 rounded text-[10px] cursor-pointer"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

window.verReportes = function(vista) {
    const tBody = document.getElementById('tabla-reportes-avanzado-body');
    if (!tBody) return;

    if (vista === 'choferes') {
        document.getElementById('sub-btn-rep-choferes').className = "text-xs font-bold text-yellow-500 border-b-2 border-yellow-500 pb-1 cursor-pointer";
        document.getElementById('sub-btn-rep-usuarios').className = "text-xs font-bold text-zinc-500 pb-1 cursor-pointer";
        if (document.getElementById('th-rep-acusado')) document.getElementById('th-rep-acusado').textContent = "Unidad Acusada";
    } else {
        document.getElementById('sub-btn-rep-choferes').className = "text-xs font-bold text-zinc-500 pb-1 cursor-pointer";
        document.getElementById('sub-btn-rep-usuarios').className = "text-xs font-bold text-yellow-500 border-b-2 border-yellow-500 pb-1 cursor-pointer";
        if (document.getElementById('th-rep-acusado')) document.getElementById('th-rep-acusado').textContent = "Teléfono Pasajero";
    }

    const reportesFiltrados = reportesGlobales.filter(r => r.tipoReporte === (vista === 'choferes' ? 'chofer' : 'usuario'));
    if (reportesFiltrados.length === 0) { tBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-zinc-500">Sin reportes registrados.</td></tr>`; return; }

    tBody.innerHTML = reportesFiltrados.map(r => `
        <tr class="border-b border-zinc-800 ${r.estado === 'PENDIENTE' ? 'bg-red-950/20' : 'opacity-50'}">
            <td class="p-2 text-[10px] text-zinc-400">${new Date(r.fecha).toLocaleDateString()}</td>
            <td class="p-2 font-black text-white">${r.acusadoInfo}</td>
            <td class="p-2 text-[10px]"><b>${r.motivo}</b><br>${r.descripcion}</td>
            <td class="p-2 text-center">${r.evidenciaUrl ? `<a href="${r.evidenciaUrl}" target="_blank" class="text-sky-400 underline font-bold">Ver Foto</a>` : 'N/A'}</td>
            <td class="p-2 font-bold ${r.estado === 'PENDIENTE' ? 'text-red-400' : 'text-emerald-400'}">${r.estado}</td>
            <td class="p-2 text-center">
                ${vista === 'usuarios' ? `<button onclick="window.open('https://wa.me/52${r.acusadoInfo}', '_blank')" class="px-2 py-1 bg-emerald-600 text-white font-bold rounded text-[10px] cursor-pointer shadow"><i class="fa-brands fa-whatsapp"></i> Contactar</button>` : `<button onclick="resolverReporte('${r.id}')" class="px-2.5 py-1 bg-emerald-600 text-white font-black rounded text-[10px] shadow cursor-pointer">Resolver</button>`}
            </td>
        </tr>`).join('');
};

window.resolverReporte = async function(id) {
    if (confirm("¿Marcar este reporte como RESUELTO?")) { try { await updateDoc(doc(db, "reportesOficiales", id), { estado: 'RESUELTO' }); } catch(e){} }
};

async function guardarChofer(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-guardar-chofer');
    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = "Guardando en Base de Datos..."; }

    const choferId = document.getElementById('chofer-id-edit')?.value || "";
    const nombre = document.getElementById('nuevo-nombre')?.value.trim().toUpperCase();
    const unidad = document.getElementById('nueva-unidad')?.value.trim();
    const tel = document.getElementById('nuevo-tel')?.value.trim();
    const esAdmin = document.getElementById('chk-es-admin')?.checked || false;
    
    const fileC = document.getElementById('nueva-foto-chofer-file')?.files[0];
    const fileT = document.getElementById('nueva-foto-trici-file')?.files[0];

    if (!/^\d{10}$/.test(tel)) { 
        alert("⚠️ Ingresa un número telefónico válido a 10 dígitos."); 
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Guardar Socio Chofer"; }
        return; 
    }

    try {
        let fotoC = "", fotoT = "";
        if (fileC) fotoC = await comprimirImagenAdmin(fileC);
        if (fileT) fotoT = await comprimirImagenAdmin(fileT);

        if (choferId) {
            const payload = { nombre, unidad, telefono: tel, esAdmin };
            if (fotoC) payload.fotoUrl = fotoC; 
            if (fotoT) payload.fotoTriciUrl = fotoT;
            
            await updateDoc(doc(db, "choferes", choferId), payload); 
            alert("✅ Chofer actualizado correctamente."); 
        } else {
            const codigoAcceso = Math.random().toString(36).substring(2, 6).toUpperCase();
            const payload = { 
                nombre, 
                unidad, 
                telefono: tel, 
                codigoAcceso, 
                estatus: 'ACTIVO', 
                enLinea: false,
                esAdmin, 
                fotoUrl: fotoC, 
                fotoTriciUrl: fotoT, 
                fechaAlta: new Date().toLocaleDateString('es-MX') 
            };
            await addDoc(collection(db, "choferes"), payload); 
            alert(`✅ Chofer registrado exitosamente.\nCódigo de Acceso asignado: ${codigoAcceso}`); 
        }

        document.getElementById('form-crear-chofer').reset();
        document.getElementById('chofer-id-edit').value = "";
    } catch(err) {
        alert("Error al guardar chofer en la base de datos.");
    } finally {
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Guardar Socio Chofer"; }
    }
}

function comprimirImagenAdmin(file) {
    return new Promise((resolve) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = img.height * (400 / img.width);
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
        };
    });
}

function exportarReporteCSV() {
    let csvContent = "\uFEFFUnidad,Nombre,Telefono,Estatus,FechaAlta\n";
    choferesCache.forEach(c => {
        csvContent += `U-${c.unidad},"${c.nombre}",${c.telefono},${c.estatus},${c.fechaAlta || 'N/A'}\n`;
    });
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a"); link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Padrón_MotoServicio_Maxcanú_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

window.prepararEdicionChofer = function(id) {
    const chofer = choferesCache.find(c => c.id === id); if (!chofer) return;
    document.getElementById('chofer-id-edit').value = chofer.id;
    document.getElementById('nuevo-nombre').value = chofer.nombre;
    document.getElementById('nueva-unidad').value = chofer.unidad;
    document.getElementById('nuevo-tel').value = chofer.telefono;
    document.getElementById('chk-es-admin').checked = chofer.esAdmin || false;
};

window.eliminarChofer = async function(id, unidad) {
    if (confirm(`¿Eliminar definitivamente a la Unidad ${unidad}?`)) { try { await deleteDoc(doc(db, "choferes", id)); } catch (e) {} }
};

window.cambiarEstatusNube = async function(idDoc, estatusActual) {
    const nuevoEstatus = estatusActual === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO';
    try { await updateDoc(doc(db, "choferes", idDoc), { estatus: nuevoEstatus }); } catch (e) {}
};

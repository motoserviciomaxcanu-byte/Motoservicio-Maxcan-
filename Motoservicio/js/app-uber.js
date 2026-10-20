import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, doc, updateDoc, setDoc, query, where, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let mapaPasajero = null; 
let mapaConductor = null; 
let marcadorPasajero = null; 
let watchIdGps = null;
let marcadorChoferEnMapaUser = null; 
let audioCtx = null; 
let estrellasSeleccionadas = 5;

const TILE_URL_ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

document.addEventListener('DOMContentLoaded', () => {
    inicializarAppUber();
    restaurarEstadoNavegacion();
    cargarDatalistChoferes();
    inicializarLogicaCalificaciones();
    desbloquearAudioEnGesto();
});

function desbloquearAudioEnGesto() {
    document.addEventListener('click', () => {
        if (audioCtx && audioCtx.state === 'suspended') { audioCtx.resume(); }
    }, { once: true });
}

function restaurarEstadoNavegacion() {
    const vistaGuardada = localStorage.getItem('maxcanu_vista_actual') || 'pantalla-bienvenida';
    if (vistaGuardada !== 'pantalla-bienvenida') {
        cambiarVista(vistaGuardada, false);
    }

    const sesionChofer = localStorage.getItem('maxcanu_chofer_sesion');
    if (sesionChofer) {
        try {
            window.choferSesionActual = JSON.parse(sesionChofer);
            if (window.choferSesionActual?.id) {
                document.getElementById('box-login-chofer-panel')?.classList.add('hidden');
                document.getElementById('box-operacion-conductor')?.classList.remove('hidden');
                document.getElementById('btn-ver-credencial')?.classList.remove('hidden');
                
                // Muestra automáticamente el botón de cerrar sesión al restaurar la sesión del chofer
                document.getElementById('btn-cerrar-sesion-cond')?.classList.remove('hidden');
                
                if (document.getElementById('panel-cond-nombre')) document.getElementById('panel-cond-nombre').textContent = window.choferSesionActual.nombre;
                if (document.getElementById('panel-cond-unidad')) document.getElementById('panel-cond-unidad').textContent = window.choferSesionActual.unidad;

                // ESCUCHADOR EN TIEMPO REAL DEL ROL DE ADMINISTRADOR
                onSnapshot(doc(db, "choferes", window.choferSesionActual.id), (docSnap) => {
                    if (docSnap.exists()) {
                        const datosActualizados = docSnap.data();
                        window.choferSesionActual.esAdmin = Boolean(datosActualizados.esAdmin);
                        localStorage.setItem('maxcanu_chofer_sesion', JSON.stringify(window.choferSesionActual));

                        const btnAdmin = document.getElementById('btn-acceso-admin-chofer');
                        if (window.choferSesionActual.esAdmin) {
                            btnAdmin?.classList.remove('hidden');
                            if (window.renderizarTablas && !window.tablasCargadas) {
                                window.renderizarTablas(); 
                                window.tablasCargadas = true;
                            }
                        } else {
                            btnAdmin?.classList.add('hidden');
                            // Si estaba dentro del panel de administración y le quitan el rol, lo sacamos por seguridad
                            window.cerrarPantallaModal('modal-admin');
                        }
                    }
                });

                const toggleSwitch = document.getElementById('switch-estado-chofer');
                if (toggleSwitch) {
                    const estaEnLinea = window.choferSesionActual.enLinea === true || window.choferSesionActual.enLinea === "true";
                    toggleSwitch.checked = estaEnLinea;
                    actualizarLabelEstadoChofer(estaEnLinea);
                    if (estaEnLinea) iniciarRastreoGPSConductor();
                }
            }
        } catch (e) {}
    }

    const pedidoActivoId = localStorage.getItem('maxcanu_pedido_activo_id');
    if (pedidoActivoId) {
        escucharEstadoPedidoPasajero(pedidoActivoId);
    }
}

function inicializarAppUber() {
    vincularEventosNavegacion();
    vincularEventosPasajero();
    vincularEventosConductor();
    escucharConfiguracionGlobal();
}

function vincularEventosNavegacion() {
    document.getElementById('btn-rol-pasajero')?.addEventListener('click', () => cambiarVista('app-pasajero'));
    document.getElementById('btn-rol-chofer')?.addEventListener('click', () => cambiarVista('app-conductor'));
    document.getElementById('btn-volver-inicio-pas')?.addEventListener('click', () => cambiarVista('pantalla-bienvenida'));
    document.getElementById('btn-volver-inicio-cond')?.addEventListener('click', () => cambiarVista('pantalla-bienvenida'));

    document.getElementById('btn-cerrar-modal-admin')?.addEventListener('click', () => window.cerrarPantallaModal('modal-admin'));
    document.getElementById('btn-cerrar-modal-rep')?.addEventListener('click', () => window.cerrarPantallaModal('modal-reporte'));
    document.getElementById('btn-cerrar-credencial')?.addEventListener('click', () => window.cerrarPantallaModal('modal-credencial'));
    document.getElementById('btn-ver-credencial')?.addEventListener('click', mostrarCredencialDigital);
    document.getElementById('btn-abrir-reporte-pas')?.addEventListener('click', () => window.verPantallaModal('modal-reporte'));
    document.getElementById('btn-reportar-chofer-activo')?.addEventListener('click', () => window.verPantallaModal('modal-reporte'));
    
    document.getElementById('btn-acceso-admin-chofer')?.addEventListener('click', () => {
        window.verPantallaModal('modal-admin');
        if (window.renderizarTablas && !window.tablasCargadas) { 
            window.renderizarTablas(); 
            window.tablasCargadas = true; 
        }
    });

    // --- VINCULACIÓN DIRECTA DE LOS BOTONES DE CERRAR SESIÓN ---
    const btnCerrarPas = document.getElementById('btn-cerrar-sesion-pas');
    if (btnCerrarPas) {
        btnCerrarPas.onclick = () => {
            if (confirm("¿Deseas cerrar sesión? Se borrarán tus datos de acceso en este dispositivo.")) {
                localStorage.removeItem('maxcanu_pasajero_sesion');
                localStorage.removeItem('maxcanu_pedido_activo_id');
                window.location.reload();
            }
        };
    }

    const btnCerrarCond = document.getElementById('btn-cerrar-sesion-cond');
    if (btnCerrarCond) {
        btnCerrarCond.onclick = () => {
            if (confirm("¿Deseas cerrar sesión de socio chofer?")) {
                localStorage.removeItem('maxcanu_chofer_sesion');
                window.location.reload();
            }
        };
    }
}

window.cambiarVista = function(vistaId, guardarEnStorage = true) {
    document.getElementById('pantalla-bienvenida')?.classList.add('hidden');
    document.getElementById('app-pasajero')?.classList.add('hidden');
    document.getElementById('app-conductor')?.classList.add('hidden');
    
    const elementoTarget = document.getElementById(vistaId);
    if (elementoTarget) elementoTarget.classList.remove('hidden');
    else document.getElementById('pantalla-bienvenida')?.classList.remove('hidden');

    if (guardarEnStorage) {
        localStorage.setItem('maxcanu_vista_actual', vistaId);
    }

    const statusBar = document.getElementById('status-bar-role');
    if (statusBar) {
        if (vistaId === 'app-pasajero') { 
            statusBar.textContent = "PASAJERO"; 
            setTimeout(inicializarMapaPasajero, 100); 
        } else if (vistaId === 'app-conductor') { 
            statusBar.textContent = "SOCIO CHOFER"; 
            setTimeout(inicializarMapaConductor, 100); 
        } else { 
            statusBar.textContent = "INICIO"; 
        }
    }
};

window.verPantallaModal = function(modalId) { document.getElementById(modalId)?.classList.remove('hidden'); };
window.cerrarPantallaModal = function(modalId) { document.getElementById(modalId)?.classList.add('hidden'); };

function escucharConfiguracionGlobal() {
    try {
        onSnapshot(doc(db, "configuracion", "global"), (docSnap) => {
            if (docSnap.exists()) {
                window.configGlobal = docSnap.data();
                const badgeLluvia = document.getElementById('badge-modo-lluvia');
                const switchLluvia = document.getElementById('switch-modo-lluvia');
                const switchMulti = document.getElementById('switch-permitir-multiviajes');
                
                if (window.configGlobal.modoLluvia) { 
                    badgeLluvia?.classList.remove('hidden'); 
                    if (switchLluvia) switchLluvia.checked = true; 
                } else { 
                    badgeLluvia?.classList.add('hidden'); 
                    if (switchLluvia) switchLluvia.checked = false; 
                }

                if (switchMulti) switchMulti.checked = window.configGlobal.permitirMultiviajes || false;

                recalcularTarifaPasajero();
            }
        });
    } catch (e) {}
}

function vincularEventosPasajero() {
    document.getElementById('form-registro-pasajero')?.addEventListener('submit', guardarRegistroPasajero);
    document.getElementById('chk-compartido')?.addEventListener('change', toggleOpcionesCompartido);
    document.getElementById('pas-num-personas')?.addEventListener('change', recalcularTarifaPasajero);
    document.getElementById('btn-pedir-trici')?.addEventListener('click', solicitarServicioPasajero);
    document.getElementById('btn-cancelar-pedido')?.addEventListener('click', cancelarServicioPasajero);
    document.getElementById('btn-cancelar-viaje-activo')?.addEventListener('click', cancelarServicioPasajero);
    document.getElementById('btn-compartir-viaje')?.addEventListener('click', compartirViajeEnVivo);
    verificarSesionPasajero();
}

function verificarSesionPasajero() {
    const sesion = localStorage.getItem('maxcanu_pasajero_sesion');
    if (sesion) {
        document.getElementById('box-registro-pasajero')?.classList.add('hidden');
        document.getElementById('box-pedido-pasajero')?.classList.remove('hidden');
    } else {
        document.getElementById('box-registro-pasajero')?.classList.remove('hidden');
        document.getElementById('box-pedido-pasajero')?.classList.add('hidden');
    }
}

async function guardarRegistroPasajero(e) {
    e.preventDefault();
    const nombre = document.getElementById('pas-reg-nombre')?.value.trim();
    const telefono = document.getElementById('pas-reg-tel')?.value.trim();

    if (!/^\d{10}$/.test(telefono)) { alert("⚠️ Ingresa un número telefónico de 10 dígitos."); return; }
    const pasajero = { nombre, telefono, fechaRegistro: new Date().toISOString() };
    
    try { await setDoc(doc(db, "usuarios", telefono), pasajero, { merge: true }); } catch(err){}
    localStorage.setItem('maxcanu_pasajero_sesion', JSON.stringify(pasajero));
    verificarSesionPasajero();
    alert("✅ Registro guardado exitosamente.");
}

function toggleOpcionesCompartido(e) {
    const box = document.getElementById('box-opciones-compartido');
    if (e.target.checked) box?.classList.remove('hidden'); else box?.classList.add('hidden');
    recalcularTarifaPasajero();
}

function recalcularTarifaPasajero() {
    const chkCompartido = document.getElementById('chk-compartido')?.checked;
    const numPersonas = chkCompartido ? parseInt(document.getElementById('pas-num-personas')?.value || 1) : 1;
    
    const config = window.configGlobal || {};
    const tBase = config.tarifaBase || 10; 
    const tNocturna = config.tarifaNocturna || 15;
    const hInicio = config.inicioNocturno || 22; 
    const hFin = config.finNocturno || 6;

    const horaActual = new Date().getHours();
    const esNocturno = (horaActual >= hInicio || horaActual < hFin);
    
    let tarifaPersona = tBase; 
    let motivo = `($${tBase} Tarifa Base)`;
    
    if (config.modoLluvia) { tarifaPersona = tNocturna; motivo = `($${tNocturna} Modo Lluvia)`; } 
    else if (esNocturno) { tarifaPersona = tNocturna; motivo = `($${tNocturna} Horario Nocturno)`; }

    const tarifaTotal = numPersonas * tarifaPersona;
    if (document.getElementById('pas-tarifa-detalle')) document.getElementById('pas-tarifa-detalle').textContent = motivo;
    if (document.getElementById('pas-tarifa-total')) document.getElementById('pas-tarifa-total').textContent = `$${tarifaTotal} MXN`;
}

async function solicitarServicioPasajero() {
    const sesion = localStorage.getItem('maxcanu_pasajero_sesion');
    if (!sesion) { alert("⚠️ Completa tu registro de pasajero primero."); return; }

    const pasData = JSON.parse(sesion);
    const chkCompartido = document.getElementById('chk-compartido')?.checked || false;
    const numPersonas = chkCompartido ? parseInt(document.getElementById('pas-num-personas')?.value || 1) : 1;
    const destino = chkCompartido ? (document.getElementById('pas-destino-input')?.value.trim() || "Destino no especificado") : "Local Maxcanú";

    const btnPedir = document.getElementById('btn-pedir-trici');
    if (btnPedir) { btnPedir.disabled = true; btnPedir.textContent = "BUSCANDO UNIDAD CERCANA..."; }

    let pasLat = 20.5828;
    let pasLng = -90.0008;

    if (marcadorPasajero && marcadorPasajero.getLatLng) {
        const pos = marcadorPasajero.getLatLng();
        if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
            pasLat = pos.lat;
            pasLng = pos.lng;
        }
    }

    const pedido = {
        pasajeroNombre: pasData.nombre || "Pasajero",
        pasajeroTel: pasData.telefono || "0000000000",
        esCompartido: Boolean(chkCompartido),
        personas: Number(numPersonas),
        destino: String(destino),
        pasLat: Number(pasLat),
        pasLng: Number(pasLng),
        estatus: 'PENDIENTE',
        tiempoLlegadaMin: 5,
        fechaHora: new Date().toISOString()
    };

    try {
        const docRef = await addDoc(collection(db, "solicitudesViaje"), pedido);
        localStorage.setItem('maxcanu_pedido_activo_id', docRef.id);
        escucharEstadoPedidoPasajero(docRef.id);
    } catch (e) {
        console.error("Error al registrar solicitud:", e);
        alert("Error al solicitar el viaje. Inténtalo de nuevo.");
        if (btnPedir) { btnPedir.disabled = false; btnPedir.textContent = "PEDIR MOTO-TAXI AHORA"; }
    }
}

function escucharEstadoPedidoPasajero(pedidoId) {
    onSnapshot(doc(db, "solicitudesViaje", pedidoId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            window.datosViajePasajeroActual = data;
            const boxNotif = document.getElementById('box-notificacion-pasajero');
            const txtNotif = document.getElementById('notif-pasajero-texto');
            const boxPedido = document.getElementById('box-pedido-pasajero');
            const badgeRetraso = document.getElementById('badge-alerta-retraso-pas');

            if (data.estatus === 'ACEPTADO' || data.estatus === 'LLEGO_UBICACION') {
                if (boxPedido) boxPedido.classList.add('hidden');
                if (boxNotif) boxNotif.classList.remove('hidden');

                const inicioMs = new Date(data.fechaHora).getTime();
                const transcurridoMin = (Date.now() - inicioMs) / 60000;
                if (transcurridoMin > (data.tiempoLlegadaMin || 5) && data.estatus !== 'LLEGO_UBICACION') {
                    badgeRetraso?.classList.remove('hidden');
                } else { badgeRetraso?.classList.add('hidden'); }

                if (txtNotif) {
                    txtNotif.innerHTML = `
                        <div class="space-y-1">
                            <p class="font-black text-emerald-300 text-xs uppercase">${data.estatus === 'LLEGO_UBICACION' ? '🔔 ¡TU UNIDAD YA ESTÁ AFUERA!' : `Unidad U-${data.choferUnidad} en camino`}</p>
                            <p><b>Chofer:</b> ${data.choferNombre}</p>
                            <p><b>Teléfono:</b> ${data.choferTel}</p>
                            <p class="text-yellow-400 font-bold mt-1"><i class="fa-solid fa-clock"></i> Tiempo Estimado (ETA): <b>${data.tiempoLlegadaMin || 5} min</b></p>
                        </div>`;
                }

                if (data.choferLat && data.choferLng && mapaPasajero) {
                    if (marcadorChoferEnMapaUser) marcadorChoferEnMapaUser.setLatLng([data.choferLat, data.choferLng]);
                    else marcadorChoferEnMapaUser = L.marker([data.choferLat, data.choferLng]).addTo(mapaPasajero).bindPopup(`<b>Unidad U-${data.choferUnidad}</b>`).openPopup();
                }

                document.getElementById('btn-contactar-chofer-wa').onclick = () => { window.open(`https://wa.me/52${data.choferTel}`, '_blank'); };

            } else if (data.estatus === 'FINALIZADO') {
                if (boxNotif) boxNotif.classList.add('hidden');
                if (boxPedido) boxPedido.classList.remove('hidden');
                localStorage.removeItem('maxcanu_pedido_activo_id');
                
                window.verPantallaModal('modal-calificar');
                window.choferIdACalificar = data.choferId;

            } else if (data.estatus === 'CANCELADO') {
                if (boxNotif) boxNotif.classList.add('hidden');
                if (boxPedido) boxPedido.classList.remove('hidden');
                localStorage.removeItem('maxcanu_pedido_activo_id');
                alert("El servicio fue cancelado.");
            }
        }
    });
}

function inicializarLogicaCalificaciones() {
    document.querySelectorAll('#contenedor-estrellas i').forEach(star => {
        star.addEventListener('click', (e) => {
            const val = parseInt(e.target.getAttribute('data-val'));
            estrellasSeleccionadas = val;
            document.querySelectorAll('#contenedor-estrellas i').forEach(s => {
                const sVal = parseInt(s.getAttribute('data-val'));
                if (sVal <= val) { s.classList.remove('opacity-30'); s.classList.add('opacity-100'); }
                else { s.classList.remove('opacity-100'); s.classList.add('opacity-30'); }
            });
        });
    });

    document.getElementById('btn-enviar-calificacion')?.addEventListener('click', async () => {
        if (window.choferIdACalificar) {
            try {
                await addDoc(collection(db, "calificaciones"), {
                    choferId: window.choferIdACalificar,
                    estrellas: estrellasSeleccionadas,
                    fecha: new Date().toISOString()
                });
                alert("⭐ ¡Gracias por calificar el servicio!");
                window.cerrarPantallaModal('modal-calificar');
            } catch(e) { window.cerrarPantallaModal('modal-calificar'); }
        }
    });
}

function compartirViajeEnVivo() {
    const data = window.datosViajePasajeroActual; if (!data) return;
    const txt = `Hola, voy en trayecto con Moto Servicio Maxcanú en la Unidad U-${data.choferUnidad} (Chofer: ${data.choferNombre}). Mi viaje está registrado y seguro.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`, '_blank');
}

function cancelarServicioPasajero() {
    const pedidoId = localStorage.getItem('maxcanu_pedido_activo_id');
    if (pedidoId && confirm("¿Deseas cancelar la solicitud activa?")) {
        try { updateDoc(doc(db, "solicitudesViaje", pedidoId), { estatus: 'CANCELADO' }); } catch (e) {}
        localStorage.removeItem('maxcanu_pedido_activo_id');
        document.getElementById('box-notificacion-pasajero')?.classList.add('hidden');
        document.getElementById('box-pedido-pasajero')?.classList.remove('hidden');
    }
}

function vincularEventosConductor() {
    document.getElementById('switch-estado-chofer')?.addEventListener('change', alternarEstadoChofer);
    document.getElementById('form-login-conductor-panel')?.addEventListener('submit', loginSocioChofer);
    document.getElementById('btn-sos-chofer')?.addEventListener('click', activarBotonSOS);
    escucharSolicitudesParaChoferes();
    escucharPeticionesCederViaje();
}

async function activarBotonSOS() {
    if (!window.choferSesionActual) return;
    if (confirm("🚨 ¿ACTIVAR ALERTA DE EMERGENCIA (SOS)?\nSe enviará tu posición GPS a la Administración y se marcará a Emergencias.")) {
        const payload = {
            choferId: window.choferSesionActual.id,
            unidad: window.choferSesionActual.unidad,
            nombre: window.choferSesionActual.nombre,
            telefono: window.choferSesionActual.telefono,
            lat: window.choferSesionActual.lat || 20.5828,
            lng: window.choferSesionActual.lng || -90.0008,
            fecha: new Date().toISOString()
        };
        try {
            await addDoc(collection(db, "alertasSOS"), payload);
            window.open('tel:911', '_self');
        } catch(e) { alert("Alerta enviada."); }
    }
}

async function loginSocioChofer(e) {
    e.preventDefault();
    const tel = document.getElementById('cond-login-tel')?.value.trim();
    const cod = document.getElementById('cond-login-cod')?.value.trim().toUpperCase();

    try {
        const q = query(collection(db, "choferes"), where("telefono", "==", tel), where("codigoAcceso", "==", cod));
        const snap = await getDocs(q);
        if (snap.empty) { alert("⚠️ Credenciales incorrectas o unidad inactiva."); return; }

        const cData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        window.choferSesionActual = cData;
        localStorage.setItem('maxcanu_chofer_sesion', JSON.stringify(cData));
        restaurarEstadoNavegacion();
    } catch(err) { alert("Error al iniciar turno."); }
}

function actualizarLabelEstadoChofer(estaActivo) {
    const labelTexto = document.getElementById('label-estado-texto');
    if (labelTexto) {
        if (estaActivo) {
            labelTexto.className = "font-bold text-emerald-400 flex items-center gap-1.5 text-xs";
            labelTexto.innerHTML = `<i class="fa-solid fa-circle text-[8px] animate-pulse"></i> En Línea (Recibiendo Viajes)`;
        } else {
            labelTexto.className = "font-bold text-red-500 flex items-center gap-1.5 text-xs";
            labelTexto.innerHTML = `<i class="fa-solid fa-circle text-[8px]"></i> Fuera de Línea`;
        }
    }
}

async function alternarEstadoChofer(e) {
    const estaActivo = e.target.checked;
    if (!window.choferSesionActual?.id) { alert("⚠️ Inicia sesión como chofer."); e.target.checked = false; return; }

    actualizarLabelEstadoChofer(estaActivo);
    window.choferSesionActual.enLinea = estaActivo;
    localStorage.setItem('maxcanu_chofer_sesion', JSON.stringify(window.choferSesionActual));

    try { 
        await updateDoc(doc(db, "choferes", window.choferSesionActual.id), { enLinea: estaActivo }); 
    } catch (err) {}
    
    if (estaActivo) iniciarRastreoGPSConductor(); else detenerRastreoGPSConductor();
}

function iniciarRastreoGPSConductor() {
    if (navigator.geolocation) {
        watchIdGps = navigator.geolocation.watchPosition((pos) => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            window.choferSesionActual.lat = lat; window.choferSesionActual.lng = lng;
            if (window.choferSesionActual?.id) {
                try { updateDoc(doc(db, "choferes", window.choferSesionActual.id), { lat, lng }); } catch (e) {}
            }
            verificarGeocercaLlegadaAutomática(lat, lng);
        }, null, { enableHighAccuracy: true });
    }
}

function detenerRastreoGPSConductor() {
    if (watchIdGps !== null) { navigator.geolocation.clearWatch(watchIdGps); watchIdGps = null; }
}

function verificarGeocercaLlegadaAutomática(choferLat, choferLng) {
    const viajeActivo = window.viajeEnCursoChofer;
    if (!viajeActivo || !viajeActivo.pasLat || viajeActivo.estatus !== 'ACEPTADO') return;

    const distMetros = calcularDistanciaMetros(choferLat, choferLng, viajeActivo.pasLat, viajeActivo.pasLng);
    if (distMetros <= 40) {
        try {
            updateDoc(doc(db, "solicitudesViaje", viajeActivo.id), { estatus: 'LLEGO_UBICACION' });
            alert("🔔 Geocerca GPS: Llegaste a la ubicación del pasajero. Se le notificó automáticamente.");
        } catch(e){}
    }
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const p1 = lat1 * Math.PI/180; 
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180; 
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function escucharSolicitudesParaChoferes() {
    try {
        const q = query(collection(db, "solicitudesViaje"));
        onSnapshot(q, (snapshot) => {
            const contenedor = document.getElementById('lista-pedidos-activos');
            const vacio = document.getElementById('estado-vacio-pedidos');
            if (!contenedor) return;

            const choferActivoEnLinea = window.choferSesionActual && (window.choferSesionActual.enLinea === true || window.choferSesionActual.enLinea === "true");
            const viajesDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            const pendientes = viajesDocs.filter(v => v.estatus === 'PENDIENTE');
            if (pendientes.length > 0 && choferActivoEnLinea) reproducirAlarmaNuevoViaje();

            const ordenados = viajesDocs.filter(v => v.estatus === 'PENDIENTE').sort((a,b) => new Date(a.fechaHora) - new Date(b.fechaHora));
            const miViajeEnCurso = viajesDocs.find(v => (v.estatus === 'ACEPTADO' || v.estatus === 'LLEGO_UBICACION') && v.choferId === window.choferSesionActual?.id);
            window.viajeEnCursoChofer = miViajeEnCurso;

            const bannerMulti = document.getElementById('banner-recordatorio-multiviaje');
            if (miViajeEnCurso && window.configGlobal?.permitirMultiviajes) bannerMulti?.classList.remove('hidden');
            else bannerMulti?.classList.add('hidden');

            if (ordenados.length === 0 && !miViajeEnCurso) {
                vacio?.classList.remove('hidden'); contenedor.innerHTML = "";
            } else {
                vacio?.classList.add('hidden'); let html = "";

                if (miViajeEnCurso) {
                    html += `
                        <div class="bg-emerald-950 border border-emerald-500/50 p-4 rounded-2xl shadow-xl space-y-3">
                            <div class="flex justify-between items-center border-b border-emerald-800 pb-2">
                                <span class="text-xs font-black text-emerald-300">🟢 VIAJE EN CURSO</span>
                                <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${miViajeEnCurso.pasLat},${miViajeEnCurso.pasLng}', '_blank')" class="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-black text-[10px] rounded-lg cursor-pointer">🗺️ Abrir Google Maps</button>
                            </div>
                            <div class="text-xs text-zinc-200 space-y-1">
                                <p><b>Pasajero:</b> ${miViajeEnCurso.pasajeroNombre} (${miViajeEnCurso.pasajeroTel})</p>
                                <p><b>Destino:</b> ${miViajeEnCurso.destino}</p>
                            </div>
                            <div class="grid grid-cols-2 gap-2 pt-1">
                                <button onclick="marcarYaEnUbicacionManual('${miViajeEnCurso.id}')" class="py-2.5 bg-yellow-500 text-zinc-950 font-black text-xs rounded-xl cursor-pointer shadow">¡Ya en Ubicación!</button>
                                <button onclick="finalizarViajeChofer('${miViajeEnCurso.id}')" class="py-2.5 bg-emerald-500 text-zinc-950 font-black text-xs rounded-xl cursor-pointer shadow">Finalizar Viaje</button>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <button onclick="window.open('https://wa.me/52${miViajeEnCurso.pasajeroTel}', '_blank')" class="py-2 bg-zinc-900 border border-zinc-700 text-emerald-400 font-bold text-[11px] rounded-xl cursor-pointer"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
                                <button onclick="abrirReporteUsuarioPostViaje('${miViajeEnCurso.pasajeroTel}')" class="py-2 bg-zinc-900 border border-zinc-700 text-red-400 font-bold text-[11px] rounded-xl cursor-pointer"><i class="fa-solid fa-triangle-exclamation"></i> Reportar Pasajero</button>
                            </div>
                        </div>`;
                }

                html += ordenados.map(req => {
                    const minPasados = Math.floor((Date.now() - new Date(req.fechaHora).getTime()) / 60000);
                    return `
                        <div class="bg-zinc-900 border border-yellow-500/40 p-4 rounded-2xl shadow-xl space-y-3">
                            <div class="flex justify-between items-start">
                                <div><h4 class="font-black text-white text-sm">${req.pasajeroNombre}</h4><p class="text-xs text-yellow-400 font-mono">${req.pasajeroTel}</p></div>
                                <span class="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">Hace ${minPasados} min</span>
                            </div>
                            <div class="text-xs text-zinc-300 space-y-1 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                                <div><b>Pasajeros:</b> ${req.personas} persona(s)</div><div><b>Destino:</b> ${req.destino}</div>
                            </div>
                            <div class="space-y-1">
                                <label class="text-[11px] text-yellow-400 font-bold block">Tiempo estimado de llegada (Minutos):</label>
                                <input type="number" id="tiempo-min-${req.id}" value="5" min="1" max="30" class="w-full p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-bold text-xs focus:outline-none">
                            </div>
                            <button onclick="aceptarViajeChoferConTiempo('${req.id}')" class="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs rounded-xl shadow cursor-pointer flex items-center justify-center gap-2 transition">
                                <i class="fa-solid fa-check-circle"></i> ACEPTAR SERVICIO
                            </button>
                        </div>`;
                }).join('');

                contenedor.innerHTML = html;
            }
        });
    } catch (e) {}
}

function reproducirAlarmaNuevoViaje() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator(); 
        const gain = audioCtx.createGain();
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.connect(gain); 
        gain.connect(audioCtx.destination);
        osc.start(); 
        osc.stop(audioCtx.currentTime + 0.3);
    } catch(e){}
}

window.solicitarCederViaje = async function(viajeId, choferActualId) {
    if (!window.choferSesionActual) return;
    if (confirm("¿Enviar solicitud para que te cedan este viaje?")) {
        const payload = {
            viajeId: viajeId, choferActualId: choferActualId,
            solicitanteId: window.choferSesionActual.id, solicitanteNombre: window.choferSesionActual.nombre,
            solicitanteUnidad: window.choferSesionActual.unidad, solicitanteTel: window.choferSesionActual.telefono,
            estado: 'PENDIENTE', fecha: new Date().toISOString()
        };
        try {
            await addDoc(collection(db, "solicitudesCederViaje"), payload);
            alert("⏳ Solicitud enviada. Esperando respuesta (8 segundos)...");
        } catch(e) { alert("Error al solicitar traspaso."); }
    }
};

window.aceptarViajeChoferConTiempo = async function(solicitudId) {
    if (!window.choferSesionActual || (window.choferSesionActual.enLinea !== true && window.choferSesionActual.enLinea !== "true")) { 
        alert("⚠️ Activa tu switch 'En Línea' para tomar viajes."); 
        return; 
    }
    const minutos = parseInt(document.getElementById(`tiempo-min-${solicitudId}`)?.value || 5);

    try {
        await updateDoc(doc(db, "solicitudesViaje", solicitudId), {
            estatus: 'ACEPTADO', choferId: window.choferSesionActual.id,
            choferNombre: window.choferSesionActual.nombre, choferUnidad: window.choferSesionActual.unidad,
            choferTel: window.choferSesionActual.telefono, tiempoLlegadaMin: minutos
        });
        alert(`✅ Servicio Aceptado. ETA notificado: ${minutos} min.`);
    } catch (e) { alert("El servicio fue tomado por otro compañero."); }
};

window.marcarYaEnUbicacionManual = async function(solicitudId) {
    try { await updateDoc(doc(db, "solicitudesViaje", solicitudId), { estatus: 'LLEGO_UBICACION' }); alert("🔔 Notificado al pasajero."); } catch(e){}
};

window.finalizarViajeChofer = async function(solicitudId) {
    if (confirm("¿Concluir este viaje?")) {
        try { await updateDoc(doc(db, "solicitudesViaje", solicitudId), { estatus: 'FINALIZADO' }); } catch(e){}
    }
};

function escucharPeticionesCederViaje() {
    try {
        onSnapshot(collection(db, "solicitudesCederViaje"), (snap) => {
            snap.docs.forEach(docSnap => {
                const ceder = docSnap.data();
                if (ceder.choferActualId === window.choferSesionActual?.id && ceder.estado === 'PENDIENTE') {
                    mostrarModalCeder8Segundos(docSnap.id, ceder);
                }
            });
        });
    } catch(e){}
}

function mostrarModalCeder8Segundos(docId, ceder) {
    window.verPantallaModal('modal-pedir-ceder');
    document.getElementById('texto-solicitante-ceder').textContent = `El chofer U-${ceder.solicitanteUnidad} pide que le cedas este viaje.`;
    
    let tiempo = 8;
    const barra = document.getElementById('barra-timer-ceder');
    
    const interval = setInterval(() => {
        tiempo--;
        if (barra) barra.style.width = `${(tiempo / 8) * 100}%`;
        if (tiempo <= 0) {
            clearInterval(interval);
            window.cerrarPantallaModal('modal-pedir-ceder');
            deleteDoc(doc(db, "solicitudesCederViaje", docId));
        }
    }, 1000);

    document.getElementById('btn-aceptar-ceder').onclick = async () => {
        clearInterval(interval);
        try {
            await updateDoc(doc(db, "solicitudesViaje", ceder.viajeId), {
                choferId: ceder.solicitanteId, choferNombre: ceder.solicitanteNombre,
                choferUnidad: ceder.solicitanteUnidad, choferTel: ceder.solicitanteTel
            });
            await deleteDoc(doc(db, "solicitudesCederViaje", docId));
            window.cerrarPantallaModal('modal-pedir-ceder');
            alert("✅ Viaje cedido con éxito.");
        } catch(e){}
    };

    document.getElementById('btn-rechazar-ceder').onclick = async () => {
        clearInterval(interval);
        window.cerrarPantallaModal('modal-pedir-ceder');
        await deleteDoc(doc(db, "solicitudesCederViaje", docId));
    };
}

function mostrarCredencialDigital() {
    const c = window.choferSesionActual; 
    if (!c) return;

    if (document.getElementById('cred-nombre')) document.getElementById('cred-nombre').textContent = c.nombre || "--";
    if (document.getElementById('cred-unidad')) document.getElementById('cred-unidad').textContent = `Unidad U-${c.unidad || '--'}`;
    if (document.getElementById('cred-codigo')) document.getElementById('cred-codigo').textContent = `CÓDIGO: ${c.codigoAcceso || '--'}`;
    
    const imgChofer = document.getElementById('cred-foto-chofer');
    const imgTrici = document.getElementById('cred-foto-trici');

    if (imgChofer) { imgChofer.src = c.fotoUrl || ""; }
    if (imgTrici) { imgTrici.src = c.fotoTriciUrl || ""; }

    const qrContainer = document.getElementById('cred-qr-container');
    if (qrContainer) {
        qrContainer.innerHTML = "";
        const qrData = `MOTO_SERVICIO_MAXCANU|UNIDAD:${c.unidad}|CHOFER:${c.nombre}|CODIGO:${c.codigoAcceso}`;
        if (window.QRCode) {
            new QRCode(qrContainer, {
                text: qrData,
                width: 90,
                height: 90,
                colorDark : "#09090b",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }
    }

    window.verPantallaModal('modal-credencial');
}

function abrirReporteUsuarioPostViaje(tel) {
    window.verPantallaModal('modal-reporte');
    document.getElementById('rep-tipo-entidad').value = 'usuario';
    window.toggleTipoReporte();
    document.getElementById('rep-usuario-tel').value = tel;
}

function inicializarMapaPasajero() {
    if (mapaPasajero) {
        mapaPasajero.invalidateSize();
        return;
    }
    const container = document.getElementById('mapa-pasajero');
    if (!container) return;

    mapaPasajero = L.map('mapa-pasajero').setView([20.5828, -90.0008], 15);
    L.tileLayer(TILE_URL_ESRI, { maxZoom: 19, attribution: '© Esri' }).addTo(mapaPasajero);
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((pos) => {
        mapaPasajero.setView([pos.coords.latitude, pos.coords.longitude], 16);
        marcadorPasajero = L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(mapaPasajero).bindPopup("Tu Ubicación").openPopup();
    });
}

function inicializarMapaConductor() {
    if (mapaConductor) {
        mapaConductor.invalidateSize();
        return;
    }
    const elMapa = document.getElementById('mapa-navegacion-chofer'); 
    if (!elMapa) return;
    mapaConductor = L.map('mapa-navegacion-chofer').setView([20.5828, -90.0008], 15);
    L.tileLayer(TILE_URL_ESRI, { maxZoom: 19, attribution: '© Esri' }).addTo(mapaConductor);
}

window.toggleTipoReporte = function() {
    const tipo = document.getElementById('rep-tipo-entidad').value;
    if (tipo === 'chofer') {
        document.getElementById('bloque-reportar-chofer').classList.remove('hidden');
        document.getElementById('bloque-reportar-usuario').classList.add('hidden');
    } else {
        document.getElementById('bloque-reportar-chofer').classList.add('hidden');
        document.getElementById('bloque-reportar-usuario').classList.remove('hidden');
    }
};

window.cargarDatalistChoferes = async function() {
    try {
        const snap = await getDocs(collection(db, "choferes"));
        const datalist = document.getElementById('lista-choferes-datalist');
        if (datalist) datalist.innerHTML = snap.docs.map(d => `<option value="Unidad ${d.data().unidad} - ${d.data().nombre}">`).join('');
    } catch(e){}
};

document.getElementById('form-reporte')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-enviar-reporte');
    btnSubmit.disabled = true; btnSubmit.textContent = "Subiendo Evidencia...";

    const tipo = document.getElementById('rep-tipo-entidad').value;
    const motivo = document.getElementById('rep-motivo').value;
    const desc = document.getElementById('rep-descripcion').value;
    const fileEvidencia = document.getElementById('rep-evidencia-file').files[0];
    
    let evidenciaBase64 = "";
    if (fileEvidencia) { evidenciaBase64 = await comprimirEvidencia(fileEvidencia); }

    const reporteRef = { tipoReporte: tipo, motivo: motivo, descripcion: desc, evidenciaUrl: evidenciaBase64, estado: 'PENDIENTE', fecha: new Date().toISOString() };

    if (tipo === 'chofer') {
        reporteRef.acusadoInfo = document.getElementById('rep-unidad-input').value;
        const sesionUser = JSON.parse(localStorage.getItem('maxcanu_pasajero_sesion') || "{}");
        reporteRef.reportadorInfo = sesionUser.telefono || "Anónimo";
    } else {
        reporteRef.acusadoInfo = document.getElementById('rep-usuario-tel').value;
        reporteRef.reportadorInfo = window.choferSesionActual ? `U-${window.choferSesionActual.unidad}` : "Anónimo";
    }

    try {
        await addDoc(collection(db, "reportesOficiales"), reporteRef);
        alert("🚨 Reporte enviado con éxito.");
        window.cerrarPantallaModal('modal-reporte'); document.getElementById('form-reporte').reset();
    } catch(e) { alert("Error al enviar reporte."); }
    btnSubmit.disabled = false; btnSubmit.textContent = "Enviar Reporte Oficial";
});

function comprimirEvidencia(file) {
    return new Promise((resolve) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = img.height * (600 / img.width);
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
        };
    });
}

// --- ESCUCHADOR GLOBAL DE CLICS PARA CERRAR SESIÓN ---
document.addEventListener('click', (e) => {
    // Si hace clic en el botón de cerrar sesión de pasajero
    if (e.target.closest('#btn-cerrar-sesion-pas')) {
        if (confirm("¿Deseas cerrar sesión? Se borrarán tus datos de acceso en este dispositivo.")) {
            localStorage.removeItem('maxcanu_pasajero_sesion');
            localStorage.removeItem('maxcanu_pedido_activo_id');
            window.location.reload();
        }
    }
    
    // Si hace clic en el botón de cerrar sesión de chofer
    if (e.target.closest('#btn-cerrar-sesion-cond')) {
        if (confirm("¿Deseas cerrar sesión de socio chofer?")) {
            localStorage.removeItem('maxcanu_chofer_sesion');
            window.location.reload();
        }
    }
});

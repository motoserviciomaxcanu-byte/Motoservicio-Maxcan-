// js/auth.js
// Módulo de Autenticación Local y Manejo de Sesiones

import { db, doc, getDoc, setDoc, getDocs, collection, query, where } from "./firebase-config.js";

const KEY_PASAJERO = "maxcanu_pasajero_sesion";
const KEY_CHOFER = "maxcanu_chofer_sesion";

// Validador de Teléfono a 10 dígitos
export function validarTelefono(telefono) {
  const regex = /^\d{10}$/;
  return regex.test(telefono);
}

// Sesión Pasajero
export function getPasajeroSesion() {
  const data = localStorage.getItem(KEY_PASAJERO);
  return data ? JSON.parse(data) : null;
}

export async function loginOAltaPasajero(nombre, telefono) {
  if (!validarTelefono(telefono)) {
    throw new Error("El número telefónico debe ser de exactamente 10 dígitos numéricos.");
  }
  if (!nombre || nombre.trim().length < 2) {
    throw new Error("Por favor ingresa un nombre válido.");
  }

  const userRef = doc(db, "usuarios", telefono);
  const snap = await getDoc(userRef);

  const userData = {
    nombre: nombre.trim(),
    telefono: telefono,
    fechaRegistro: snap.exists() ? snap.data().fechaRegistro : new Date().toISOString()
  };

  if (!snap.exists()) {
    await setDoc(userRef, userData);
  }

  localStorage.setItem(KEY_PASAJERO, JSON.stringify(userData));
  return userData;
}

// Sesión Chofer
export function getChoferSesion() {
  const data = localStorage.getItem(KEY_CHOFER);
  return data ? JSON.parse(data) : null;
}

export async function loginChofer(telefono, codigoAcceso) {
  if (!validarTelefono(telefono)) {
    throw new Error("Ingresa un número telefónico válido de 10 dígitos.");
  }
  if (!codigoAcceso || codigoAcceso.trim().length === 0) {
    throw new Error("Ingresa tu código de acceso alfanumérico.");
  }

  const q = query(
    collection(db, "choferes"),
    where("telefono", "==", telefono.trim()),
    where("codigoAcceso", "==", codigoAcceso.trim().toUpperCase())
  );

  const querySnap = await getDocs(q);

  if (querySnap.empty) {
    throw new Error("Credenciales incorrectas. Verifique su teléfono y clave.");
  }

  const choferDoc = querySnap.docs[0];
  const choferData = { id: choferDoc.id, ...choferDoc.data() };

  if (choferData.estatus === "SUSPENDIDO") {
    throw new Error("Su cuenta se encuentra SUSPENDIDA. Contacte a la administración.");
  }

  localStorage.setItem(KEY_CHOFER, JSON.stringify(choferData));
  return choferData;
}

export function cerrarSesion(tipo) {
  if (tipo === "pasajero") localStorage.removeItem(KEY_PASAJERO);
  if (tipo === "chofer") localStorage.removeItem(KEY_CHOFER);
}

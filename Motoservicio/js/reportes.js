// js/reportes.js
// Módulo de Reportes Oficiales, Quejas e Incidencias con Atención WhatsApp

import { db, collection, addDoc, onSnapshot, updateDoc, doc, query, orderBy } from "./firebase-config.js";
import { comprimirImagen } from "./credencial.js";

export async function crearReporteOficial({ tipoReporte, acusadoInfo, reportadorInfo, motivo, descripcion, evidenciaFile }) {
  let evidenciaUrl = "";
  if (evidenciaFile) {
    evidenciaUrl = await comprimirImagen(evidenciaFile, 600, 0.6);
  }

  const nuevoReporte = {
    tipoReporte,
    acusadoInfo,
    reportadorInfo,
    motivo,
    descripcion,
    evidenciaUrl,
    estado: "PENDIENTE",
    fecha: new Date().toISOString()
  };

  const docRef = await addDoc(collection(db, "reportesOficiales"), nuevoReporte);
  return docRef.id;
}

export function escucharReportesAdmin(callback) {
  const q = query(collection(db, "reportesOficiales"), orderBy("fecha", "desc"));
  return onSnapshot(q, (snapshot) => {
    const reportes = [];
    snapshot.forEach((docSnap) => {
      reportes.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(reportes);
  });
}

export async function resolverReporte(reporteId, nuevoEstado = "RESUELTO") {
  const repRef = doc(db, "reportesOficiales", reporteId);
  await updateDoc(repRef, { estado: nuevoEstado });
}

export function getWhatsAppLink(telefono, mensaje = "Hola, le contactamos de la Administración de Moto Servicio Maxcanú respecto a un reporte.") {
  const telLimpio = telefono.replace(/\D/g, "");
  const numFinal = telLimpio.length === 10 ? `52${telLimpio}` : telLimpio;
  return `https://wa.me/${numFinal}?text=${encodeURIComponent(mensaje)}`;
}

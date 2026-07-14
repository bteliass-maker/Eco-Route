/**
 * DB.js - Conexión a Base de Datos en la Nube (Firebase)
 * 
 * Cumplimiento RGPD: Los datos se envían de forma totalmente anónima. 
 * No se guarda IP, nombre de usuario ni dispositivo.
 */

// TODO: Reemplaza esta URL con la tuya cuando crees tu proyecto en Firebase
const FIREBASE_URL = 'https://ecoroute-33287-default-rtdb.europe-west1.firebasedatabase.app';

const DB = {
  async getRefuges() {
    try {
      const res = await fetch(`${FIREBASE_URL}/refuges.json`);
      const data = await res.json();
      if (!data) return [];
      // Firebase devuelve un objeto de objetos, lo convertimos a array
      return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    } catch (e) {
      console.warn("Aún no has configurado Firebase. Mostrando datos vacíos.");
      return [];
    }
  },

  async saveRefuge(refuge) {
    refuge.createdAt = new Date().toISOString();
    try {
      await fetch(`${FIREBASE_URL}/refuges.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refuge)
      });
      return refuge;
    } catch (e) {
      console.error("Error guardando refugio:", e);
      return null;
    }
  },

  async getManualRoutes() {
    try {
      const res = await fetch(`${FIREBASE_URL}/routes.json`);
      const data = await res.json();
      if (!data) return [];
      return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    } catch (e) {
      return [];
    }
  },

  async saveManualRoute(routeData) {
    routeData.createdAt = new Date().toISOString();
    try {
      await fetch(`${FIREBASE_URL}/routes.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeData)
      });
      return routeData;
    } catch (e) {
      console.error("Error guardando ruta:", e);
      return null;
    }
  }
};

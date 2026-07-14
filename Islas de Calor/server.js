const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Permitir trazos grandes de mapas

// Initialize DB file
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ refuges: [], manualRoutes: [] }), 'utf-8');
}

// Helper para leer/escribir DB
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ---- RUTAS (ENDPOINTS) ----

// Obtener refugios
app.get('/api/refuges', (req, res) => {
  const db = readDB();
  res.json(db.refuges);
});

// Guardar nuevo refugio (Anónimo)
app.post('/api/refuges', (req, res) => {
  const db = readDB();
  const newRefuge = {
    ...req.body,
    id: 'ref_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString()
  };
  db.refuges.push(newRefuge);
  writeDB(db);
  res.status(201).json(newRefuge);
});

// Obtener rutas
app.get('/api/routes', (req, res) => {
  const db = readDB();
  res.json(db.manualRoutes);
});

// Guardar nueva ruta (Anónimo)
app.post('/api/routes', (req, res) => {
  const db = readDB();
  const newRoute = {
    ...req.body,
    id: 'rt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString()
  };
  db.manualRoutes.push(newRoute);
  writeDB(db);
  res.status(201).json(newRoute);
});

// Iniciar Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor EcoRoute corriendo en http://localhost:${PORT}`);
  console.log(`✅ Base de datos alojada en ${DB_FILE}`);
  console.log(`🔒 Cumplimiento RGPD: Los datos se almacenan de forma totalmente anónima.`);
});

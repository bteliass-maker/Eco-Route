// EcoRoute - Main Application Logic

// App State
const state = {
  map: null,
  startMarker: null,
  endMarker: null,
  startCoords: null,
  endCoords: null,
  currentLocation: null,
  appMode: 'mobility', // 'mobility', 'copernicus'
  copernicusSubLayer: 'temperature', // 'temperature' (LST), 'vegetation' (NDVI), 'builtup' (NDBI), 'water' (NDWI)
  mapStyle: 'satellite', // 'satellite' by default
  streetTileLayer: null,
  satelliteTileLayer: null,
  refugePlacementActive: false,
  refugesLayer: null,
  refugePlacementActive: false,
  isDrawingManual: false,
  manualCoords: [],
  manualPolyline: null,
  manualStartCircle: null,
  manualEndCircle: null,
  savedManualRoutes: [],
  activeMode: 'foot',
  routeCache: {},
  drawnRoutes: {},
  copernicusLayer: null,
  loadedRasters: {},
  activeRasterLayer: null,
  copernicusWmsLayer: null,
  heatIslands: [], // Array of circle overlays (deprecated in favor of copernicusLayer)
  heatPoints: [],  // Raw coords and radius of heat zones
  stationMarkers: [], // Leaflet circle markers for transit stations
  
  // Rating values (1-5) per mode. Load from localStorage or defaults
  ratings: JSON.parse(localStorage.getItem('ecoroute_ratings')) || {
    foot: 4,
    bike: 4,
    transit: 3,
    car: 2
  },
  
  // Weights (0-100) for routing algorithm
  weights: {
    heat: 70,
    time: 50,
    cost: 30,
    eco: 60
  },
  
  // Touch dragging state for mobile bottom sheet
  touchStartY: 0,
  sheetStartY: 0,
  sheetState: 'half', // 'peak', 'half', 'full'
  deferredPrompt: null // For PWA installation
};

// Initialize Application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initLucide();
  setupEventListeners();
  setupI18nAndModals();
  if (window.DB) loadPersistedData();
  loadPreferences();
  initPWA();
});

function setupI18nAndModals() {
  const langContainer = document.getElementById('lang-dropdown-container');
  const langContent = document.querySelector('.lang-dropdown-content');
  
  if (langContainer && langContent) {
    langContainer.addEventListener('click', (e) => {
      // Prevent bubbling if clicking buttons inside
      if (!e.target.classList.contains('lang-btn')) {
        langContent.classList.toggle('hidden-dropdown');
      }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!langContainer.contains(e.target)) {
        langContent.classList.add('hidden-dropdown');
      }
    });
  }

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (typeof changeLanguage === 'function') {
        changeLanguage(e.target.dataset.lang);
        if (langContent) langContent.classList.add('hidden-dropdown');
      }
    });
  });
  
  const helpBtn = document.getElementById('btn-help');
  const closeHelpBtn = document.getElementById('btn-close-info');
  const infoModal = document.getElementById('info-modal');
  
  if (helpBtn) helpBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
  if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => infoModal.classList.add('hidden'));

  // Beta Badges
  document.querySelectorAll('.beta-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent tab switching
      showToast("La optimización de confort climático y registro de rutas aún se encuentra en fase de pruebas (BETA).");
    });
  });
}

async function loadPersistedData() {
  const refuges = await DB.getRefuges();
  refuges.forEach(r => {
    const marker = L.marker([r.lat, r.lng], {
      icon: L.divIcon({
        className: 'custom-refuge-pin',
        html: `<div style="background:${r.bgColor}; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:2.5px solid white; box-shadow:0 3px 6px rgba(0,0,0,0.35);"><i data-lucide="${r.iconName}" style="width:16px;height:16px;color:#ffffff;stroke-width:2.5px;"></i></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    }).addTo(state.refugesLayer);
    marker.bindPopup(`<strong>Refugio Climático Registrado</strong><br><strong>Nombre:</strong> ${r.name}<br><strong>Tipo:</strong> ${r.type}`);
  });
  
  const routes = await DB.getManualRoutes();
  routes.forEach(r => {
    const polyline = L.polyline(r.coords, {
      color: r.color, weight: 5, opacity: 0.8
    }).addTo(state.map);
    
    const startCircle = L.circleMarker(r.coords[0], {
      radius: 6, fillColor: r.color, color: '#ffffff', weight: 2, fillOpacity: 0.8
    }).addTo(state.map);
    
    const endCircle = L.circleMarker(r.coords[r.coords.length - 1], {
      radius: 6, fillColor: r.color, color: '#ffffff', weight: 2, fillOpacity: 0.8
    }).addTo(state.map);
    
    state.savedManualRoutes.push({
      id: r.id,
      medium: r.medium,
      polyline,
      startCircle,
      endCircle,
      coords: r.coords,
      color: r.color,
      ratings: r.ratings
    });
  });
  
  renderSavedManualRoutes();
  initLucide();
}

// 1. Map Initialization
function initMap() {
  // Center map on Spain (Madrid)
  const defaultCenter = [40.416775, -3.703790]; 
  
  state.map = L.map('map', {
    zoomControl: false // Position zoom controls differently
  }).setView(defaultCenter, 6);
  
  // Street tiles
  state.streetTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20
  });

  // Satellite tiles
  state.satelliteTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
  });
  
  // Default to satellite tiles
  state.satelliteTileLayer.addTo(state.map);
  
  // Position Zoom Control at bottom right (clear of mobile bottom sheet)
  L.control.zoom({
    position: 'bottomright'
  }).addTo(state.map);

  // Initialize Copernicus Layer (Hidden by default)
  state.copernicusLayer = L.layerGroup();

  // Initialize Refuges Layer (Always active)
  state.refugesLayer = L.layerGroup().addTo(state.map);

  // Try to locate user on startup
  tryLocateUser(false);

  // Map Click handler (set endpoints by clicking)
  state.map.on('click', onMapClick);
}

// Seeded random helper to keep coordinates persistent
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

let copernicusDebounceTimer = null;

// Toggles map street vs satellite views
function toggleMapStyle() {
  const btn = document.getElementById('btn-map-style');
  if (state.mapStyle === 'streets') {
    state.mapStyle = 'satellite';
    state.map.removeLayer(state.streetTileLayer);
    state.satelliteTileLayer.addTo(state.map);
    btn.innerHTML = '<i data-lucide="map"></i>';
    btn.title = "Cambiar a Calles";
  } else {
    state.mapStyle = 'streets';
    state.map.removeLayer(state.satelliteTileLayer);
    state.streetTileLayer.addTo(state.map);
    btn.innerHTML = '<i data-lucide="globe"></i>';
    btn.title = "Cambiar a Satélite";
  }
  initLucide();
}

function updateCopernicusOverlay() {
  if (state.appMode !== 'copernicus') return;
  
  if (state.copernicusSubLayer === 'none') {
    if (state.activeRasterLayer) {
      state.map.removeLayer(state.activeRasterLayer);
      state.activeRasterLayer = null;
    }
    state.copernicusLayer.clearLayers();
    return;
  }
  
  loadRasterLayer(state.copernicusSubLayer);
}

async function loadRasterLayer(layerType) {
  if (state.activeRasterLayer) {
    state.map.removeLayer(state.activeRasterLayer);
    state.activeRasterLayer = null;
  }
  state.copernicusLayer.clearLayers();

  if (state.loadedRasters[layerType]) {
    state.activeRasterLayer = state.loadedRasters[layerType];
    state.activeRasterLayer.addTo(state.map);
    return;
  }

  showToast(`Buscando archivo raster local: data/${layerType}.tif ...`);

  try {
    const response = await fetch(`data/${layerType}.tif`);
    if (!response.ok) throw new Error("Archivo no encontrado");
    
    const arrayBuffer = await response.arrayBuffer();
    
    // parseGeoraster is available globally from the georaster script
    const georaster = await parseGeoraster(arrayBuffer);

    // GeoRasterLayer is available globally from georaster-layer-for-leaflet
    let layer = new GeoRasterLayer({
      georaster: georaster,
      opacity: 0.7,
      resolution: 256,
      pixelValuesToColorFn: function(values) {
        const val = values[0];
        if (val === georaster.noDataValue || val === undefined || isNaN(val)) return null;

        if (layerType === 'temperature') {
          // Heatmap colors based on arbitrary expected values, you can adjust these based on your specific raster scaling
          if (val < 25) return '#3b82f6';
          if (val < 30) return '#facc15';
          if (val < 35) return '#ef4444';
          return '#991b1b';
        } else if (layerType === 'vegetation') {
          if (val > 0.6 || val > 60) return '#15803d';
          if (val > 0.3 || val > 30) return '#86efac';
          return null; 
        } else if (layerType === 'builtup') {
          if (val > 50 || val > 0.5) return '#ef4444';
          if (val > 20 || val > 0.2) return '#fca5a5';
          return null;
        } else if (layerType === 'water') {
          if (val > 0.5 || val > 50) return '#2563eb';
          return null;
        }
        return null;
      }
    });

    state.loadedRasters[layerType] = layer;
    state.activeRasterLayer = layer;
    layer.addTo(state.map);
    showToast(`Capa raster ${layerType} cargada con éxito.`);

  } catch (err) {
    console.warn('GeoTIFF no encontrado, usando fallback simulado (Grid Raster):', err);
    showToast(`Mostrando datos simulados para ${layerType} (prototipo)`);
    drawSimulatedRasterFallback(layerType);
  }
}

function drawSimulatedRasterFallback(layerType) {
  state.copernicusLayer.clearLayers();
  
  if (state.activeRasterLayer) {
    state.map.removeLayer(state.activeRasterLayer);
    state.activeRasterLayer = null;
  }

  // Draw a perfect grid of rectangles to simulate a raster
  const bounds = state.map.getBounds();
  const latSpan = bounds.getNorth() - bounds.getSouth();
  const lngSpan = bounds.getEast() - bounds.getWest();

  // Define grid resolution (e.g. 50x50 cells)
  const steps = 50;
  const latStep = latSpan / steps;
  const lngStep = lngSpan / steps;

  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      // Stable seeded random using coordinates
      const hash = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      const r = hash - Math.floor(hash);

      const lat1 = bounds.getSouth() + i * latStep;
      const lng1 = bounds.getWest() + j * lngStep;
      const lat2 = lat1 + latStep;
      const lng2 = lng1 + lngStep;
      
      let color = null;
      let opacity = 0.25; // Default grid opacity

      if (layerType === 'temperature') {
        if (r < 0.25) color = '#3b82f6'; // cool
        else if (r < 0.5) color = '#facc15'; // medium
        else if (r < 0.75) color = '#ef4444'; // hot
        else color = '#991b1b'; // extremely hot
        opacity = 0.35;
      } else if (layerType === 'vegetation') {
        if (r > 0.7) color = '#15803d'; // dense
        else if (r > 0.4) color = '#86efac'; // light
        else color = 'transparent';
      } else if (layerType === 'builtup') {
        if (r > 0.6) color = '#ef4444'; // dense
        else if (r > 0.3) color = '#fca5a5'; // sparse
        else color = 'transparent';
      } else if (layerType === 'water') {
        if (r > 0.8) color = '#2563eb'; // water
        else color = 'transparent';
      }

      if (color && color !== 'transparent') {
        L.rectangle([[lat1, lng1], [lat2, lng2]], {
          color: 'transparent',
          fillColor: color,
          fillOpacity: opacity,
          interactive: false
        }).addTo(state.copernicusLayer);
      }
    }
  }
}



function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// 2. Setup UI event handlers
function setupEventListeners() {
  // Input autocompletes
  setupSearchInput('input-start', 'autocomplete-start', 'start');
  setupSearchInput('input-end', 'autocomplete-end', 'end');
  
  // Swap locations button
  document.getElementById('btn-swap-locations').addEventListener('click', swapLocations);
  
  // Clear route button
  document.getElementById('btn-clear').addEventListener('click', resetRoute);
  
  // Get Current Location button
  document.getElementById('btn-current-location').addEventListener('click', () => tryLocateUser(true));
  
  // Tab selector for transit modes
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.mode;
      switchTransitMode(mode);
    });
  });

  // Slider controls for weights
  const sliders = ['heat', 'time', 'cost', 'eco'];
  sliders.forEach(id => {
    const slider = document.getElementById(`weight-${id}`);
    const display = document.getElementById(`val-weight-${id}`);
    
    if (slider && display) {
      slider.addEventListener('input', (e) => {
        const value = e.target.value;
        display.textContent = `${value}%`;
        state.weights[id] = parseInt(value);
        
        // Dynamic calculations update
        if (state.startCoords && state.endCoords) {
          recalculateAndRender();
        }
      });
    }
  });

  // Star ratings are rendered dynamically for each route segment
  
  // Directions Accordion toggle (if present in DOM)
  const accordionTrigger = document.getElementById('btn-toggle-directions');
  const accordionContent = document.getElementById('directions-list');
  if (accordionTrigger && accordionContent) {
    accordionTrigger.addEventListener('click', () => {
      accordionTrigger.classList.toggle('active');
      accordionContent.classList.toggle('hidden');
      if (!accordionContent.classList.contains('hidden') && state.sheetState !== 'full') {
        setBottomSheetState('full');
      }
    });
  }

  // Mobile Bottom Sheet Drag & Swipe handlers
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) {
    const dragHandle = sheet.querySelector('.sheet-drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('touchstart', onTouchStart, { passive: true });
      dragHandle.addEventListener('touchmove', onTouchMove, { passive: false });
      dragHandle.addEventListener('touchend', onTouchEnd, { passive: true });
      
      dragHandle.addEventListener('click', () => {
        if (state.sheetState === 'peak') setBottomSheetState('half');
        else if (state.sheetState === 'half') setBottomSheetState('full');
        else setBottomSheetState('peak');
      });
    }
  }

  // Close search suggestions on outer clicks
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-group')) {
      document.querySelectorAll('.autocomplete-dropdown').forEach(el => el.classList.add('hidden'));
    }
  });

  // Main App Mode Toggle (Movilidad vs Copernicus / Lugares)
  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const newMode = e.currentTarget.dataset.appMode;
      switchAppMode(newMode);
    });
  });

  // Map Style Switcher (Street vs Satellite)
  const mapStyleBtn = document.getElementById('btn-map-style');
  if (mapStyleBtn) {
    mapStyleBtn.addEventListener('click', toggleMapStyle);
  }

  // Copernicus Sub-layer button switches (None, LST, NDVI, NDBI, NDWI)
  const btnCopNone = document.getElementById('btn-cop-none');
  if (btnCopNone) {
    btnCopNone.addEventListener('click', () => {
      document.querySelectorAll('[data-copernicus-layer]').forEach(b => b.classList.remove('active'));
      btnCopNone.classList.add('active');
      switchCopernicusSubLayer('none');
    });
  }
  const btnCopTemp = document.getElementById('btn-cop-temp');
  if (btnCopTemp) {
    btnCopTemp.addEventListener('click', () => {
      document.querySelectorAll('[data-copernicus-layer]').forEach(b => b.classList.remove('active'));
      btnCopTemp.classList.add('active');
      switchCopernicusSubLayer('temperature');
    });
  }

  const btnCopVeg = document.getElementById('btn-cop-veg');
  if (btnCopVeg) {
    btnCopVeg.addEventListener('click', () => {
      document.querySelectorAll('[data-copernicus-layer]').forEach(b => b.classList.remove('active'));
      btnCopVeg.classList.add('active');
      switchCopernicusSubLayer('vegetation');
    });
  }

  const btnCopBuilt = document.getElementById('btn-cop-built');
  if (btnCopBuilt) {
    btnCopBuilt.addEventListener('click', () => {
      document.querySelectorAll('[data-copernicus-layer]').forEach(b => b.classList.remove('active'));
      btnCopBuilt.classList.add('active');
      switchCopernicusSubLayer('builtup');
    });
  }

  const btnCopWater = document.getElementById('btn-cop-water');
  if (btnCopWater) {
    btnCopWater.addEventListener('click', () => {
      document.querySelectorAll('[data-copernicus-layer]').forEach(b => b.classList.remove('active'));
      btnCopWater.classList.add('active');
      switchCopernicusSubLayer('water');
    });
  }

  // Live Thermometer Button
  const btnLiveThermo = document.getElementById('btn-live-thermo-map');
  if (btnLiveThermo) {
    btnLiveThermo.addEventListener('click', toggleLiveThermometer);
  }

  // Register Climate Refuge button click
  const addRefugeBtn = document.getElementById('btn-add-refuge');
  if (addRefugeBtn) {
    addRefugeBtn.addEventListener('click', () => {
      state.refugePlacementActive = true;
      document.getElementById('map').classList.add('map-refuge-cursor');
      showToast("Haz clic en el mapa para ubicar el refugio");
    });
  }

  // Manual Drawing Listeners
  const btnStartDraw = document.getElementById('btn-start-drawing');
  const btnClearDraw = document.getElementById('btn-clear-drawing');
  const btnSaveRoute = document.getElementById('btn-save-manual-route');

  if (btnStartDraw) btnStartDraw.addEventListener('click', toggleManualDrawing);
  if (btnClearDraw) btnClearDraw.addEventListener('click', clearManualDrawing);
  if (btnSaveRoute) btnSaveRoute.addEventListener('click', saveManualRoute);
}

function switchCopernicusSubLayer(layer) {
  state.copernicusSubLayer = layer;
  
  const headerIcon = document.getElementById('copernicus-header-icon');
  const headerSubtitle = document.getElementById('copernicus-header-subtitle');
  const introText = document.getElementById('copernicus-intro-text');
  
  const tempCard = document.getElementById('cop-temp-card');
  const tempInfo = document.getElementById('cop-temp-info');
  const vegCard = document.getElementById('cop-veg-card');
  const vegInfo = document.getElementById('cop-veg-info');
  const builtCard = document.getElementById('cop-built-card');
  const builtInfo = document.getElementById('cop-built-info');
  const waterCard = document.getElementById('cop-water-card');
  const waterInfo = document.getElementById('cop-water-info');
  
  // Hide all cards
  [tempCard, tempInfo, vegCard, vegInfo, builtCard, builtInfo, waterCard, waterInfo].forEach(el => {
    if (el) el.classList.add('hidden');
  });
  
  if (layer === 'temperature') {
    if (headerIcon) {
      headerIcon.setAttribute('data-lucide', 'thermometer');
      headerIcon.style.color = '#ef4444';
    }
    if (headerSubtitle) headerSubtitle.textContent = 'Temperatura Superficial (LST)';
    if (introText) introText.textContent = 'Observa el mapa térmico de España con datos inspirados en el programa espacial Copernicus. Identifica las islas de calor y zonas de alta radiación solar.';
    if (tempCard) tempCard.classList.remove('hidden');
    if (tempInfo) tempInfo.classList.remove('hidden');
  } else if (layer === 'none') {
    if (headerIcon) {
      headerIcon.setAttribute('data-lucide', 'eye-off');
      headerIcon.style.color = '#9ca3af';
    }
    if (headerSubtitle) headerSubtitle.textContent = 'Sin Indicador Copernicus';
    if (introText) introText.textContent = 'Las capas de análisis territorial están desactivadas. Selecciona un indicador arriba para explorar datos de vegetación, temperatura o suelo.';
  } else if (layer === 'vegetation') {
    if (headerIcon) {
      headerIcon.setAttribute('data-lucide', 'leaf');
      headerIcon.style.color = '#10b981';
    }
    if (headerSubtitle) headerSubtitle.textContent = 'Densidad de Vegetación (NDVI)';
    if (introText) introText.textContent = 'Observa la cobertura vegetal y zonas de absorción de carbono en España. Los parques y áreas boscosas ayudan a refrescar las áreas urbanas.';
    if (vegCard) vegCard.classList.remove('hidden');
    if (vegInfo) vegInfo.classList.remove('hidden');
  } else if (layer === 'builtup') {
    if (headerIcon) {
      headerIcon.setAttribute('data-lucide', 'building');
      headerIcon.style.color = '#b91c1c';
    }
    if (headerSubtitle) headerSubtitle.textContent = 'Área Construida (NDBI)';
    if (introText) introText.textContent = 'Visualiza la densidad de superficies artificiales, asfalto y hormigón en España. Estas zonas son los principales propulsores de calor urbano.';
    if (builtCard) builtCard.classList.remove('hidden');
    if (builtInfo) builtInfo.classList.remove('hidden');
  } else if (layer === 'water') {
    if (headerIcon) {
      headerIcon.setAttribute('data-lucide', 'droplet');
      headerIcon.style.color = '#2563eb';
    }
    if (headerSubtitle) headerSubtitle.textContent = 'Presencia de Agua (NDWI)';
    if (introText) introText.textContent = 'Identifica cuerpos de agua superficiales y humedad del terreno. Actúan como reguladores térmicos mitigando el calor circundante.';
    if (waterCard) waterCard.classList.remove('hidden');
    if (waterInfo) waterInfo.classList.remove('hidden');
  }
  
  // Re-create icons to apply correct lucide icon changes
  initLucide();
  
  // Update map overlay instantly
  updateCopernicusOverlay();
}

function switchAppMode(mode) {
  state.appMode = mode;
  const mobilityPanel = document.getElementById('mobility-search-panel');
  const copernicusPanel = document.getElementById('copernicus-search-panel');
  const bottomSheet = document.getElementById('bottom-sheet');
  
  // Hide all bottom sheet states
  document.querySelectorAll('.sheet-state').forEach(el => el.classList.add('hidden'));

  if (mode === 'copernicus') {
    // Hide mobility panel
    mobilityPanel.classList.add('hidden');
    
    // Hide bottom sheet completely
    bottomSheet.classList.add('hidden');
    
    // Show Copernicus panel
    copernicusPanel.classList.remove('hidden');
    
    // Add heat layer to map
    state.map.addLayer(state.copernicusLayer);
    
    // Bind moveend event to map to update dynamically
    state.map.on('moveend', updateCopernicusOverlay);
    updateCopernicusOverlay();
    
    // Hide current routes and markers
    if (state.startMarker) state.map.removeLayer(state.startMarker);
    if (state.endMarker) state.map.removeLayer(state.endMarker);
    if (state.manualPolyline) state.map.removeLayer(state.manualPolyline);
    if (state.manualStartCircle) state.map.removeLayer(state.manualStartCircle);
    if (state.manualEndCircle) state.map.removeLayer(state.manualEndCircle);
    state.savedManualRoutes.forEach(r => {
      if (r.polyline) state.map.removeLayer(r.polyline);
      if (r.startCircle) state.map.removeLayer(r.startCircle);
      if (r.endCircle) state.map.removeLayer(r.endCircle);
    });
    Object.values(state.drawnRoutes).flat().forEach(layer => {
      if (layer) state.map.removeLayer(layer);
    });
    if (state.stationMarkers) {
      state.stationMarkers.forEach(m => state.map.removeLayer(m));
    }
    
  } else {
    // Show mobility panel
    mobilityPanel.classList.remove('hidden');
    
    // Hide Copernicus panel
    copernicusPanel.classList.add('hidden');
    
    // Restore bottom sheet state
    bottomSheet.classList.remove('hidden');
    document.getElementById('sheet-route-state').classList.remove('hidden');
    
    // Unbind map moveend
    state.map.off('moveend', updateCopernicusOverlay);
    
    // Remove heat layer if it wasn't added by artificial thermo
    if (!state.liveThermoActive) {
      state.map.removeLayer(state.copernicusLayer);
    }
    
    // Restore routes and markers
    if (state.startMarker) state.map.addLayer(state.startMarker);
    if (state.endMarker) state.map.addLayer(state.endMarker);
    if (state.manualPolyline) state.map.addLayer(state.manualPolyline);
    if (state.manualStartCircle) state.map.addLayer(state.manualStartCircle);
    if (state.manualEndCircle) state.map.addLayer(state.manualEndCircle);
    state.savedManualRoutes.forEach(r => {
      if (r.polyline) state.map.addLayer(r.polyline);
      if (r.startCircle) state.map.addLayer(r.startCircle);
      if (r.endCircle) state.map.addLayer(r.endCircle);
    });
    drawRoutePolylines(state.activeMode);
  }
}

// 3. User Preferences Local Storage Setup
function loadPreferences() {
  // Load weights from local storage if existing
  const storedWeights = localStorage.getItem('ecoroute_weights');
  if (storedWeights) {
    state.weights = JSON.parse(storedWeights);
    Object.keys(state.weights).forEach(key => {
      const slider = document.getElementById(`weight-${key}`);
      const val = document.getElementById(`val-weight-${key}`);
      if (slider && val) {
        slider.value = state.weights[key];
        val.textContent = `${state.weights[key]}%`;
      }
    });
  }
}

function savePreferences() {
  localStorage.setItem('ecoroute_weights', JSON.stringify(state.weights));
  localStorage.setItem('ecoroute_ratings', JSON.stringify(state.ratings));
}

// 4. Geocoding autocomplete Search (Nominatim API)
function setupSearchInput(inputId, dropdownId, type) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let debounceTimeout;
  
  input.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    const query = input.value.trim();
    
    if (query.length < 3) {
      dropdown.innerHTML = '';
      dropdown.classList.add('hidden');
      return;
    }
    
    // Debounce to reduce API calls (300ms)
    debounceTimeout = setTimeout(() => {
      fetchGeocode(query, dropdown, type);
    }, 350);
  });
  
  input.addEventListener('focus', () => {
    if (dropdown.children.length > 0) {
      dropdown.classList.remove('hidden');
    }
    // Auto-collapse bottom-sheet when writing so it doesn't cover input or keyboard
    setBottomSheetState('peak');
  });
}

async function fetchGeocode(query, dropdown, type) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=es&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'Accept-Language': 'es' }
    });
    
    if (!response.ok) throw new Error('Geocoding search failed');
    const data = await response.json();
    
    renderAutocompleteResults(data, dropdown, type);
  } catch (err) {
    console.error('Geocoding error:', err);
  }
}

function renderAutocompleteResults(results, dropdown, type) {
  dropdown.innerHTML = '';
  
  if (results.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }
  
  results.forEach(item => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    
    // Short name & subtitle layout
    const name = item.display_name.split(',')[0];
    const address = item.display_name.split(',').slice(1).join(',').trim();
    
    div.innerHTML = `
      <i data-lucide="map-pin"></i>
      <div style="display:flex; flex-direction:column; gap:2px; text-align:left;">
        <strong>${name}</strong>
        <span style="font-size:11px; color:var(--text-secondary);">${address.substring(0, 50)}${address.length > 50 ? '...' : ''}</span>
      </div>
    `;
    
    div.addEventListener('click', () => {
      const coords = [parseFloat(item.lat), parseFloat(item.lon)];
      setMarker(type, coords, item.display_name);
      
      const input = document.getElementById(type === 'start' ? 'input-start' : 'input-end');
      input.value = name;
      
      dropdown.classList.add('hidden');
      triggerRouteCalculation();
    });
    
    dropdown.appendChild(div);
  });
  
  initLucide();
  dropdown.classList.remove('hidden');
}

// Set markers manually or programmatically
function setMarker(type, latlng, label) {
  const isStart = type === 'start';
  const markerName = isStart ? 'startMarker' : 'endMarker';
  const coordName = isStart ? 'startCoords' : 'endCoords';
  const pinClass = isStart ? 'custom-pin start' : 'custom-pin end';
  
  state[coordName] = latlng;
  
  // Remove existing marker
  if (state[markerName]) {
    state.map.removeLayer(state[markerName]);
  }
  
  // Custom Leaflet DivIcon
  const icon = L.divIcon({
    className: pinClass,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
  
  state[markerName] = L.marker(latlng, { icon: icon }).addTo(state.map);
  
  if (label) {
    state[markerName].bindPopup(`<strong>${isStart ? 'Origen' : 'Destino'}:</strong><br>${label}`).openPopup();
  }
  
  // Show/Hide Clear button
  if (state.startCoords || state.endCoords) {
    document.getElementById('btn-clear').classList.remove('hidden');
  }
}

// Map Click Handlers (sets point coordinates directly)
function onMapClick(e) {
  // Prevent dropping origin/destination markers while drawing manually
  if (state.isDrawingManual || isDrawingActive) return;
  
  const coords = [e.latlng.lat, e.latlng.lng];
  
  // Handle Climate Refuge placement
  if (state.refugePlacementActive) {
    // Remove crosshair cursor
    document.getElementById('map').classList.remove('map-refuge-cursor');
    state.refugePlacementActive = false;
    
    // Create a temporary Leaflet marker with '✕' text at coords
    const tempMarker = L.marker(coords, {
      icon: L.divIcon({
        className: 'temp-refuge-pin',
        html: '<div style="color:#ef4444; font-size:24px; font-weight:bold; line-height:1; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">✕</div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(state.map);
    
    // Create form content
    const formContent = `
      <div class="refuge-popup-form">
        <h4>Nuevo Refugio Climático</h4>
        <input type="text" id="pop-refuge-name" placeholder="Nombre (ej. Biblioteca, Parque)" required>
        <select id="pop-refuge-type">
          <option value="Sombra y Vegetación">Sombra y Vegetación</option>
          <option value="Aire Acondicionado">Aire Acondicionado</option>
          <option value="Fuente / Agua">Fuente / Agua</option>
        </select>
        <button id="pop-refuge-save-btn">Guardar Refugio</button>
      </div>
    `;
    
    // Bind form popup to the temporary marker and open it
    tempMarker.bindPopup(formContent, { closeOnClick: false }).openPopup();
    
    // If popup is closed by user without saving, remove temporary marker
    state.map.on('popupclose', function onPopupClose(e) {
      if (e.popup === tempMarker.getPopup()) {
        state.map.removeLayer(tempMarker);
        state.map.off('popupclose', onPopupClose);
      }
    });
      
    // Set timeout to ensure DOM is rendered before querySelector
    setTimeout(() => {
      const saveBtn = document.getElementById('pop-refuge-save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const nameInput = document.getElementById('pop-refuge-name');
          const typeSelect = document.getElementById('pop-refuge-type');
          
          if (!nameInput || !nameInput.value.trim()) {
            showToast("Por favor, introduce un nombre válido");
            return;
          }
          
          const name = nameInput.value.trim();
          const type = typeSelect.value;
          
          let iconName = 'home';
          let bgColor = '#009639';
          if (type === 'Sombra y Vegetación') {
            iconName = 'leaf';
            bgColor = '#15803d';
          } else if (type === 'Aire Acondicionado') {
            iconName = 'wind';
            bgColor = '#0284c7';
          } else if (type === 'Fuente / Agua') {
            iconName = 'droplet';
            bgColor = '#2563eb';
          }
          
          // Place permanent marker
          const marker = L.marker(coords, {
            icon: L.divIcon({
              className: 'custom-refuge-pin',
              html: `<div style="background:${bgColor}; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:2.5px solid white; box-shadow:0 3px 6px rgba(0,0,0,0.35);"><i data-lucide="${iconName}" style="width:16px;height:16px;color:#ffffff;stroke-width:2.5px;"></i></div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })
          }).addTo(state.refugesLayer);
          
          marker.bindPopup(`<strong>Refugio Climático Registrado</strong><br><strong>Nombre:</strong> ${name}<br><strong>Tipo:</strong> ${type}`).openPopup();
          
          if (window.DB) {
            DB.saveRefuge({ name, type, lat: coords.lat, lng: coords.lng, bgColor, iconName });
          }
          
          // Remove temporary marker and close form popup
          state.map.removeLayer(tempMarker);
          showToast("Refugio registrado con éxito");
          initLucide();
        });
      }
    }, 50);
    
    return;
  }
  
  // If we are in Copernicus mode and not placing a refuge, do nothing when clicking the map
  if (state.appMode === 'copernicus') return;
  
  if (!state.startCoords) {
    setMarker('start', coords, 'Punto de partida personalizado');
    document.getElementById('input-start').value = "Punto en el mapa";
    showToast("Origen fijado en el mapa");
  } else if (!state.endCoords) {
    setMarker('end', coords, 'Destino personalizado');
    document.getElementById('input-end').value = "Punto en el mapa";
    showToast("Destino fijado en el mapa");
    triggerRouteCalculation();
  } else {
    // Both already exist, reset and make click the start point
    resetRoute();
    setMarker('start', coords, 'Punto de partida personalizado');
    document.getElementById('input-start').value = "Punto en el mapa";
    showToast("Origen fijado en el mapa");
  }
}

// Location swaps
function swapLocations() {
  const startInput = document.getElementById('input-start');
  const endInput = document.getElementById('input-end');
  
  const tempVal = startInput.value;
  startInput.value = endInput.value;
  endInput.value = tempVal;
  
  const tempCoords = state.startCoords;
  state.startCoords = state.endCoords;
  state.endCoords = tempCoords;
  
  const tempMarker = state.startMarker;
  state.startMarker = state.endMarker;
  state.endMarker = tempMarker;
  
  // Re-style markers
  if (state.startMarker) {
    state.map.removeLayer(state.startMarker);
    const startIcon = L.divIcon({ className: 'custom-pin start', iconSize: [32, 32], iconAnchor: [16, 32] });
    state.startMarker = L.marker(state.startCoords, { icon: startIcon }).addTo(state.map);
  }
  
  if (state.endMarker) {
    state.map.removeLayer(state.endMarker);
    const endIcon = L.divIcon({ className: 'custom-pin end', iconSize: [32, 32], iconAnchor: [16, 32] });
    state.endMarker = L.marker(state.endCoords, { icon: endIcon }).addTo(state.map);
  }
  
  triggerRouteCalculation();
}

// browser Geolocation helper
function tryLocateUser(zoomToLocation = false) {
  if (!navigator.geolocation) {
    showToast("La geolocalización no está soportada por tu navegador");
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = [position.coords.latitude, position.coords.longitude];
      state.currentLocation = latlng;
      
      // Update start address
      setMarker('start', latlng, 'Tu ubicación actual');
      document.getElementById('input-start').value = "Mi ubicación";
      
      if (zoomToLocation) {
        state.map.setView(latlng, 15);
      }
      
      // Add pulsing location dot (if we don't have startCoords yet or just to show accuracy)
      L.marker(latlng, {
        icon: L.divIcon({
          className: 'pulse-location',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(state.map);
      
      showToast("Ubicación encontrada");
      triggerRouteCalculation();
    },
    (error) => {
      console.warn("Geolocation error:", error);
      if (zoomToLocation) {
        showToast("No pudimos obtener tu ubicación");
      }
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
}

// 5. Routing Logic (OSRM Integration & Simulated Transit)
function triggerRouteCalculation() {
  if (state.startCoords && state.endCoords) {
    // Generate simulated heat islands in the bounding area between endpoints
    generateHeatIslands(state.startCoords, state.endCoords);
    
    // Trigger route calculations
    calculateAllRoutes();
  }
}

// Generate Heat Islands dynamically around start & end route coordinates
function generateHeatIslands(start, end) {
  // Clear previous heat islands
  state.heatIslands.forEach(circle => state.map.removeLayer(circle));
  state.heatIslands = [];
  state.heatPoints = [];
  
  // Calculate bounding box center and variance
  const midLat = (start[0] + end[0]) / 2;
  const midLng = (start[1] + end[1]) / 2;
  const deltaLat = Math.abs(start[0] - end[0]);
  const deltaLng = Math.abs(start[1] - end[1]);
  
  // Create 3 heat island hotspots
  for (let i = 0; i < 3; i++) {
    // Place randomly within the bounding rectangle with some noise
    const latNoise = (Math.random() - 0.5) * (deltaLat + 0.01);
    const lngNoise = (Math.random() - 0.5) * (deltaLng + 0.01);
    const heatLat = midLat + latNoise;
    const heatLng = midLng + lngNoise;
    const radius = 300 + Math.floor(Math.random() * 400); // 300m - 700m radius
    
    // Add transparent red circular overlay representing Heat Island
    const circle = L.circle([heatLat, heatLng], {
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.15,
      weight: 1.5,
      dashArray: '4, 4',
      stroke: true
    }).addTo(state.map);
    
    // Add heat island indicator tooltips
    circle.bindTooltip("Isla de Calor (Zona Calurosa)", {
      sticky: true,
      className: 'heat-tooltip'
    });
    
    state.heatIslands.push(circle);
    state.heatPoints.push({ lat: heatLat, lng: heatLng, radius: radius });
  }
}

// Fetch routing profiles in parallel
// Fetch nearby transit stops (Metro, Bus, Railway) from Overpass API
async function fetchNearbyTransitStops(lat, lng) {
  // Query for stations, bus stops or platforms within 1000m
  const query = `[out:json][timeout:5];
    (
      node(around:1000, ${lat}, ${lng})[railway=station];
      node(around:1000, ${lat}, ${lng})[railway=halt];
      node(around:1000, ${lat}, ${lng})[highway=bus_stop];
      node(around:1000, ${lat}, ${lng})[public_transport=platform];
    );
    out tags limit 10;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.elements || [];
  } catch (err) {
    console.error('Overpass API error:', err);
    return [];
  }
}

// Fetch routing profiles in parallel
async function calculateAllRoutes() {
  showToast("Buscando las mejores rutas...");
  
  // Show route state panel in sheet
  const defaultSheet = document.getElementById('sheet-default-state');
  if (defaultSheet) defaultSheet.classList.add('hidden');
  const routeSheet = document.getElementById('sheet-route-state');
  if (routeSheet) routeSheet.classList.remove('hidden');
  setBottomSheetState('half');

  const modes = ['foot', 'bike'];
  const promises = modes.map(mode => fetchOSRMRoute(mode));
  
  // Fetch real stops near endpoints in parallel
  const stopsPromise = Promise.all([
    fetchNearbyTransitStops(state.startCoords[0], state.startCoords[1]),
    fetchNearbyTransitStops(state.endCoords[0], state.endCoords[1])
  ]);

  // Wait for standard OSRM routes and OSM Stops
  const [results, stopsResult] = await Promise.all([
    Promise.all(promises),
    stopsPromise
  ]);
  
  const [startStops, endStops] = stopsResult;
  
  // Handle Transit (Simulate transit using actual nearby stops if available)
  const transitRoute = simulateTransitRoute(results[0], startStops, endStops); 
  state.routeCache['transit'] = transitRoute;
  
  // Recalculate and rank based on weights
  recalculateAndRender();
}

async function fetchOSRMRoute(mode) {
  // Translate modes to OSRM profile names
  let osrmProfile = 'driving';
  if (mode === 'foot') osrmProfile = 'foot';
  if (mode === 'bike') osrmProfile = 'bicycle';
  
  const cacheKey = `${mode}_${state.startCoords.join(',')}_${state.endCoords.join(',')}`;
  
  if (state.routeCache[cacheKey]) {
    state.routeCache[mode] = state.routeCache[cacheKey];
    return state.routeCache[cacheKey];
  }
  
  try {
    const startLng = state.startCoords[1];
    const startLat = state.startCoords[0];
    const endLng = state.endCoords[1];
    const endLat = state.endCoords[0];
    
    // OSRM Public Routing URL
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true&annotations=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM request failed for mode ${mode}`);
    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error(`No route found for mode ${mode}`);
    }
    
    const route = data.routes[0];
    const processedRoute = {
      coordinates: route.geometry.coordinates.map(coord => [coord[1], coord[0]]), // Flip to lat,lon for Leaflet
      distance: route.distance, // meters
      duration: route.duration, // seconds
      steps: processSteps(route.legs[0].steps),
      mode: mode
    };
    
    state.routeCache[cacheKey] = processedRoute;
    state.routeCache[mode] = processedRoute;
    return processedRoute;
  } catch (err) {
    console.warn(`Routing API error for ${mode}, falling back to simulated straight lines:`, err);
    // Safe mock fallback if network is offline or API fails
    const fallback = generateMockFallbackRoute(mode);
    state.routeCache[mode] = fallback;
    return fallback;
  }
}

// Process OSRM detailed navigation instructions
function processSteps(steps) {
  if (!steps) return [];
  return steps.map((step, idx) => {
    let instruction = step.maneuver.instruction || 'Continúa';
    if (step.name && step.name !== '') {
      instruction += ` por ${step.name}`;
    }
    return {
      number: idx + 1,
      instruction: instruction,
      distance: step.distance
    };
  });
}

// Helper to parse address strings and extract clean station names (Google Maps style)
function extractStationName(addressString, defaultName) {
  if (!addressString || addressString === 'Punto en el mapa' || addressString === 'Mi ubicación') {
    return defaultName;
  }
  // Strip typical street prefix descriptors
  const prefixRegex = /^(Calle de|Calle|Avenida de|Avenida|Plaza de|Plaza|Paseo de|Paseo|Gran Vía de|Gran Vía|Ronda de|Ronda|Pasaje de|Pasaje|Travesía de|Travesía)\s+/i;
  let cleanStr = addressString.replace(prefixRegex, '');
  // Take first section before comma
  cleanStr = cleanStr.split(',')[0].trim();
  return cleanStr;
}

// Simulates realistic public transit route options (Metro and Bus alternatives)
function simulateTransitRoute(walkingData, startStops = [], endStops = []) {
  if (!walkingData) return generateMockFallbackRoute('transit');
  
  const coords = walkingData.coordinates;
  const len = coords.length;
  
  // Split coordinates: ~15% walk to station, ~70% transit ride, ~15% walk to destination
  const startIndex = Math.max(1, Math.floor(len * 0.15));
  const endIndex = Math.min(len - 2, Math.floor(len * 0.85));
  
  const walk1Coords = coords.slice(0, startIndex + 1);
  const transitCoords = coords.slice(startIndex, endIndex + 1);
  const walk2Coords = coords.slice(endIndex, len);
  
  // Try to find real stops near start and end coords from Overpass results
  const realMetroStart = startStops.find(s => s.tags && (s.tags.railway === 'station' || s.tags.subway === 'yes' || (s.tags.station && s.tags.station.includes('subway'))));
  const realBusStart = startStops.find(s => s.tags && (s.tags.highway === 'bus_stop' || s.tags.public_transport === 'platform'));
  const realMetroEnd = endStops.find(s => s.tags && (s.tags.railway === 'station' || s.tags.subway === 'yes' || (s.tags.station && s.tags.station.includes('subway'))));
  const realBusEnd = endStops.find(s => s.tags && (s.tags.highway === 'bus_stop' || s.tags.public_transport === 'platform'));
  
  // Station names
  const startInputVal = document.getElementById('input-start').value;
  const endInputVal = document.getElementById('input-end').value;
  
  const defaultStationA = extractStationName(startInputVal, 'Origen');
  const defaultStationB = extractStationName(endInputVal, 'Destino');
  
  const stationAMetro = realMetroStart ? realMetroStart.tags.name : `Metro ${defaultStationA}`;
  const stationBMetro = realMetroEnd ? realMetroEnd.tags.name : `Metro ${defaultStationB}`;
  const stationABus = realBusStart ? realBusStart.tags.name : `Parada ${defaultStationA}`;
  const stationBBus = realBusEnd ? realBusEnd.tags.name : `Parada ${defaultStationB}`;
  
  // Gather all unique real lines from Overpass results
  const uniqueMetro = new Set();
  const uniqueBus = new Set();
  
  startStops.concat(endStops).forEach(stop => {
    if (!stop || !stop.tags) return;
    const isSubway = stop.tags.railway === 'station' || stop.tags.subway === 'yes' || (stop.tags.station && stop.tags.station.includes('subway')) || stop.tags.subway;
    const refStr = stop.tags.route_ref || stop.tags.routes || stop.tags.line || stop.tags.ref;
    if (refStr) {
      refStr.split(/[;|,]/).forEach(r => {
        const val = r.trim().toUpperCase();
        if (val) {
          if (isSubway) uniqueMetro.add(val);
          else uniqueBus.add(val);
        }
      });
    }
  });

  // Fallback to real local lines if OSM tag list is empty
  let metroList = Array.from(uniqueMetro);
  let busList = Array.from(uniqueBus);
  
  if (metroList.length === 0) metroList = ['L1', 'L2', 'L3', 'L6', 'L10'];
  if (busList.length === 0) busList = ['14', '27', '45', '147', 'C1'];

  const transitDistance = getDistanceBetweenPoints(coords[startIndex], coords[endIndex]);
  const walkingDistance1 = getDistanceBetweenPoints(coords[0], coords[startIndex]);
  const walkingDistance2 = getDistanceBetweenPoints(coords[endIndex], coords[len - 1]);
  
  const walk1Duration = walkingDistance1 / 1.3;
  const walk2Duration = walkingDistance2 / 1.3;
  
  const metroTransitDuration = transitDistance / 10.0;
  const metroWaitDuration = 240;
  const metroTotalDuration = walk1Duration + metroTransitDuration + walk2Duration + metroWaitDuration;
  
  const busTransitDuration = transitDistance / 6.0;
  const busWaitDuration = 360;
  const busTotalDuration = walk1Duration + busTransitDuration + walk2Duration + busWaitDuration;

  const options = [];

  // Generate options for each metro line
  metroList.forEach((lineRef, idx) => {
    const metroLine = `Metro Línea ${lineRef}`;
    const metroLegs = [
      {
        type: 'walk',
        name: 'Caminata inicial',
        coordinates: walk1Coords,
        distance: walkingDistance1,
        duration: walk1Duration,
        instruction: `Camina hacia la estación de metro más cercana: <strong>${stationAMetro}</strong>`
      },
      {
        type: 'transit',
        name: metroLine,
        line: metroLine,
        color: '#009639',
        icon: 'subway',
        coordinates: transitCoords,
        distance: transitDistance,
        duration: metroTransitDuration,
        wait: metroWaitDuration,
        stationStart: stationAMetro,
        stationEnd: stationBMetro,
        stops: [{ name: stationAMetro, coords: coords[startIndex] }, { name: stationBMetro, coords: coords[endIndex] }],
        instruction: `Toma el <strong>${metroLine}</strong> en la estación <strong>${stationAMetro}</strong> y viaja hasta <strong>${stationBMetro}</strong>.`
      },
      {
        type: 'walk',
        name: 'Caminata final',
        coordinates: walk2Coords,
        distance: walkingDistance2,
        duration: walk2Duration,
        instruction: `Camina desde la estación <strong>${stationBMetro}</strong> hasta tu destino.`
      }
    ];

    options.push({
      id: `metro_${lineRef.toLowerCase()}_${idx}`,
      label: `Metro ${lineRef}`,
      line: metroLine,
      color: '#009639',
      icon: 'subway',
      distance: walkingData.distance,
      duration: metroTotalDuration,
      legs: metroLegs,
      coordinates: coords
    });
  });

  // Generate options for each bus line
  busList.forEach((lineRef, idx) => {
    const busLine = `Autobús Línea ${lineRef}`;
    const busLegs = [
      {
        type: 'walk',
        name: 'Caminata inicial',
        coordinates: walk1Coords,
        distance: walkingDistance1,
        duration: walk1Duration,
        instruction: `Camina hacia la parada de autobús más cercana: <strong>${stationABus}</strong>`
      },
      {
        type: 'transit',
        name: busLine,
        line: busLine,
        color: '#ef4444',
        icon: 'bus',
        coordinates: transitCoords,
        distance: transitDistance,
        duration: busTransitDuration,
        wait: busWaitDuration,
        stationStart: stationABus,
        stationEnd: stationBBus,
        stops: [{ name: stationABus, coords: coords[startIndex] }, { name: stationBBus, coords: coords[endIndex] }],
        instruction: `Toma el <strong>${busLine}</strong> en <strong>${stationABus}</strong> y viaja hasta <strong>${stationBBus}</strong>.`
      },
      {
        type: 'walk',
        name: 'Caminata final',
        coordinates: walk2Coords,
        distance: walkingDistance2,
        duration: walk2Duration,
        instruction: `Camina desde la parada <strong>${stationBBus}</strong> hasta tu destino.`
      }
    ];

    options.push({
      id: `bus_${lineRef.toLowerCase()}_${idx}`,
      label: `Bus ${lineRef}`,
      line: busLine,
      color: '#ef4444',
      icon: 'bus',
      distance: walkingData.distance,
      duration: busTotalDuration,
      legs: busLegs,
      coordinates: coords
    });
  });

  return {
    mode: 'transit',
    options: options,
    activeOptionIndex: 0,
    coordinates: coords,
    distance: walkingData.distance,
    duration: metroTotalDuration,
    legs: options[0] ? options[0].legs : [],
    steps: []
  };
}

// Switches between transit options (Metro vs Bus EMT) and updates the route variables
function selectTransitOption(optionId) {
  const route = state.routeCache['transit'];
  if (!route || !route.options) return;
  
  if (optionId.startsWith('MAD_') || optionId.startsWith('BCN_')) {
    // Construct dynamic predefined route if it doesn't exist yet
    let exists = route.options.findIndex(opt => opt.id === optionId);
    if (exists === -1) {
      const lineName = optionId.split('_').slice(1).join(' ');
      const isSubway = lineName.includes('Metro');
      const icon = isSubway ? 'subway' : 'bus';
      const color = isSubway ? '#009639' : '#ef4444';
      
      const baseOption = route.options[0];
      if (baseOption) {
        const newLegs = JSON.parse(JSON.stringify(baseOption.legs));
        const transitLeg = newLegs.find(l => l.type === 'transit');
        if (transitLeg) {
          transitLeg.name = lineName;
          transitLeg.line = lineName;
          transitLeg.color = color;
          transitLeg.icon = icon;
          transitLeg.instruction = `Toma el <strong>${lineName}</strong> en la parada y viaja hasta tu destino.`;
        }
        
        route.options.push({
          id: optionId,
          label: lineName,
          line: lineName,
          color: color,
          icon: icon,
          distance: baseOption.distance,
          duration: baseOption.duration,
          legs: newLegs,
          coordinates: baseOption.coordinates
        });
      }
    }
  }
  
  const index = route.options.findIndex(opt => opt.id === optionId);
  if (index === -1) return;
  
  route.activeOptionIndex = index;
  const option = route.options[index];
  
  // Mirror active option details to root levels of the route object
  route.legs = option.legs;
  route.duration = option.duration;
  route.distance = option.distance;
  
  // Sync the select dropdown value if called programmatically
  const selectDropdown = document.getElementById('transit-select-dropdown');
  if (selectDropdown && selectDropdown.value !== optionId) {
    selectDropdown.value = optionId;
  }

  // Redraw polylines and update UI summary panels
  recalculateAndRender();
}

// Fallback straight lines with noise (in case of total API/network failure)
function generateMockFallbackRoute(mode) {
  const start = state.startCoords;
  const end = state.endCoords;
  
  // Add some points to make it look like a route (not a straight diagonal line)
  const midPoint = [
    (start[0] + end[0]) / 2 + (Math.random() - 0.5) * 0.01,
    (start[1] + end[1]) / 2 + (Math.random() - 0.5) * 0.01
  ];
  
  const coords = [start, midPoint, end];
  
  // Estimate distance using flat-earth approximation
  const R = 6371e3; // metres
  const phi1 = start[0] * Math.PI/180;
  const phi2 = end[0] * Math.PI/180;
  const deltaPhi = (end[0]-start[0]) * Math.PI/180;
  const deltaLambda = (end[1]-start[1]) * Math.PI/180;
  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c * 1.25; // 1.25 winding factor
  
  let speed = 1.4; // walking
  if (mode === 'bike') speed = 4.5;
  if (mode === 'car') speed = 12;
  if (mode === 'transit') speed = 8;
  
  let duration = distance / speed;
  if (mode === 'transit') duration += 300; // Wait time
  
  return {
    coordinates: coords,
    distance: distance,
    duration: duration,
    steps: [
      { number: 1, instruction: `Sal de tu origen`, distance: distance / 3 },
      { number: 2, instruction: `Avanza por la avenida principal`, distance: distance / 3 },
      { number: 3, instruction: `Llega a tu destino final`, distance: distance / 3 }
    ],
    mode: mode
  };
}

// 6. Thermal Comfort / Heat Exposure Penalization Engine
function calculateHeatExposure(route) {
  if (!route || !route.coordinates || state.heatPoints.length === 0) return 0;
  
  let penaltyCount = 0;
  const coords = route.coordinates;
  
  // Check how many points along the route are inside any Heat Island circles
  coords.forEach(coord => {
    let inHeatIsland = false;
    for (let point of state.heatPoints) {
      const dist = getDistanceBetweenPoints(coord, [point.lat, point.lng]);
      if (dist <= point.radius) {
        inHeatIsland = true;
        break;
      }
    }
    if (inHeatIsland) penaltyCount++;
  });
  
  // Percent of the route spent in high-temperature zones
  return (penaltyCount / coords.length) * 100;
}

// Helper: Haversine distance in meters
function getDistanceBetweenPoints(p1, p2) {
  const R = 6371e3; // meters
  const phi1 = p1[0] * Math.PI/180;
  const phi2 = p2[0] * Math.PI/180;
  const dPhi = (p2[0]-p1[0]) * Math.PI/180;
  const dLam = (p2[1]-p1[1]) * Math.PI/180;
  const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLam/2) * Math.sin(dLam/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 7. Multi-Criteria Route Optimization Engine
function recalculateAndRender() {
  const modes = ['foot', 'bike', 'transit'];
  const scores = {};
  
  // Calculate durations for normalization (fastest/cheapest/etc)
  let minDuration = Infinity;
  let minCost = Infinity;
  
  modes.forEach(mode => {
    const route = state.routeCache[mode];
    if (route) {
      if (route.duration < minDuration) minDuration = route.duration;
      
      const cost = getCostForMode(mode, route.distance);
      if (cost < minCost) minCost = cost;
    }
  });

  // Calculate scores (0-100) for each mode
  modes.forEach(mode => {
    const route = state.routeCache[mode];
    if (!route) return;
    
    // Time Score: Fastest gets 100. Slower modes scaled inverse.
    const scoreTime = (minDuration / route.duration) * 100;
    
    // Cost Score: Cheapest gets 100. Cars/taxis scaled down.
    const cost = getCostForMode(mode, route.distance);
    const scoreCost = cost === 0 ? 100 : (minCost === 0 ? 30 : (minCost / cost) * 100);
    
    // Eco Score: Low carbon gets 100.
    let scoreEco = 100; // Walking & Cycling
    if (mode === 'transit') scoreEco = 75;
    if (mode === 'car') scoreEco = 20;
    
    // Heat/Comfort Score: Percent of route in shade/cooler areas.
    // Driving has AC (always high comfort, e.g. 90). Transit has climate control (80).
    // Walking/Cycling are fully exposed to heat islands.
    let scoreHeat = 100;
    if (mode === 'foot' || mode === 'bike') {
      const heatExposure = calculateHeatExposure(route);
      scoreHeat = Math.max(15, 100 - heatExposure); // 100 = no heat island, minimum 15
    } else if (mode === 'transit') {
      scoreHeat = 80; // Climate control but station walk
    } else if (mode === 'car') {
      scoreHeat = 95; // AC comfort
    }
    
    // User Star Rating Score (Rating: 1-5 scaled to 0-100)
    const ratingVal = state.ratings[mode] || 3;
    const scoreRating = ratingVal * 20;

    // Weight formulas
    const w = state.weights;
    const totalWeights = w.time + w.cost + w.eco + w.heat + 50; // Add fixed 50 rating weight
    
    const finalScore = Math.round(
      (w.time * scoreTime + 
       w.cost * scoreCost + 
       w.eco * scoreEco + 
       w.heat * scoreHeat + 
       50 * scoreRating) / totalWeights
    );
    
    scores[mode] = finalScore;
    
    // Update badge values in HTML selector
    const timeText = formatDuration(route.duration);
    document.getElementById(`tab-time-${mode}`).textContent = timeText;
    
    const badge = document.getElementById(`tab-score-${mode}`);
    badge.textContent = `${finalScore}%`;
    
    // Badge color reflecting optimization suitability
    if (finalScore >= 80) {
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = 'var(--eco)';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
    } else if (finalScore >= 55) {
      badge.style.background = 'rgba(234, 179, 8, 0.15)';
      badge.style.color = '#eab308';
      badge.style.borderColor = 'rgba(234, 179, 8, 0.2)';
    } else {
      badge.style.background = 'rgba(239, 68, 68, 0.1)';
      badge.style.color = 'var(--heat-hot)';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.15)';
    }
  });

  // Highlight recommended mode (highest scoring) on initial calculate
  let bestMode = 'foot';
  let highestScore = -1;
  modes.forEach(mode => {
    if (scores[mode] > highestScore) {
      highestScore = scores[mode];
      bestMode = mode;
    }
  });

  // Draw paths on Leaflet
  drawRoutePolylines(bestMode);
  switchTransitMode(bestMode, false); // Update active tab & side details
  
  savePreferences();
}

function getCostForMode(mode, distanceMeters) {
  if (mode === 'foot' || mode === 'bike') return 0;
  const km = distanceMeters / 1000;
  if (mode === 'transit') return 1.50; // flat ticket fee
  if (mode === 'car') return parseFloat((km * 0.18).toFixed(2)); // Fuel/wear costs
  return 0;
}

// 8. Map Layer Drawing
function drawRoutePolylines(selectedMode) {
  // Clear previous layers
  Object.keys(state.drawnRoutes).forEach(m => {
    if (Array.isArray(state.drawnRoutes[m])) {
      state.drawnRoutes[m].forEach(layer => state.map.removeLayer(layer));
    } else {
      state.map.removeLayer(state.drawnRoutes[m]);
    }
  });
  state.drawnRoutes = {};

  // Clear station markers
  if (state.stationMarkers) {
    state.stationMarkers.forEach(m => state.map.removeLayer(m));
  }
  state.stationMarkers = [];

  const modes = ['foot', 'bike', 'transit'];
  let boundsGroup = null;
  
  modes.forEach(mode => {
    const route = state.routeCache[mode];
    if (!route) return;
    
    const isSelected = mode === selectedMode;

    // TRANSIT with sub-legs: draw each leg separately when selected
    if (mode === 'transit' && isSelected && route.legs && route.legs.length > 0) {
      const transitLayers = [];
      
      route.legs.forEach(leg => {
        if (leg.type === 'walk') {
          // Walking segments: dotted line, subtle color
          const walkLine = L.polyline(leg.coordinates, {
            color: '#94a3b8',
            weight: 5,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '6, 10'
          }).addTo(state.map);
          walkLine.bringToFront();
          transitLayers.push(walkLine);
        } else if (leg.type === 'transit') {
          // Transit segment: bold solid line with the transit color (C-Buchanan style)
          const transitLine = L.polyline(leg.coordinates, {
            color: leg.color || '#3b82f6',
            weight: 10,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(state.map);
          transitLine.bringToFront();
          transitLayers.push(transitLine);

          // Station boarding marker (circle with white fill)
          if (leg.coordinates.length > 0) {
            const boardCoord = leg.coordinates[0];
            const boardMarker = L.circleMarker(boardCoord, {
              radius: 10,
              fillColor: '#ffffff',
              color: leg.color || '#3b82f6',
              weight: 4,
              fillOpacity: 1
            }).addTo(state.map);
            boardMarker.bindTooltip(leg.stationStart || 'Estación de embarque', {
              permanent: false, direction: 'top', className: 'station-tooltip'
            });
            state.stationMarkers.push(boardMarker);
          }

          // Station debarking marker
          if (leg.coordinates.length > 1) {
            const debarkCoord = leg.coordinates[leg.coordinates.length - 1];
            const debarkMarker = L.circleMarker(debarkCoord, {
              radius: 10,
              fillColor: '#ffffff',
              color: leg.color || '#3b82f6',
              weight: 4,
              fillOpacity: 1
            }).addTo(state.map);
            debarkMarker.bindTooltip(leg.stationEnd || 'Estación de descenso', {
              permanent: false, direction: 'top', className: 'station-tooltip'
            });
            state.stationMarkers.push(debarkMarker);
          }

          // Intermediate stop markers (small dots)
          if (leg.stops) {
            leg.stops.forEach(stop => {
              const stopMarker = L.circleMarker(stop.coords, {
                radius: 4,
                fillColor: '#ffffff',
                color: leg.color || '#3b82f6',
                weight: 2,
                fillOpacity: 1
              }).addTo(state.map);
              stopMarker.bindTooltip(stop.name, {
                permanent: false, direction: 'top', className: 'station-tooltip'
              });
              state.stationMarkers.push(stopMarker);
            });
          }
        }
      });

      state.drawnRoutes[mode] = transitLayers;
      
      // Build bounds from all transit layers
      const group = L.featureGroup(transitLayers);
      boundsGroup = group;

    } else {
      // Standard single polyline for non-transit or inactive transit
      let color = '#94a3b8'; // grey inactive
      let opacity = 0.35;
      let weight = 4;
      
      if (isSelected) {
        opacity = 0.95;
        weight = 6;
        if (mode === 'foot') color = '#10b981';
        if (mode === 'bike') color = '#f97316';
        if (mode === 'transit') color = '#38bdf8';
        if (mode === 'car') color = '#ef4444';
      }
      
      const polyline = L.polyline(route.coordinates, {
        color: color,
        weight: weight,
        opacity: opacity,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: (!isSelected && mode === 'transit') ? '4, 8' : null
      }).addTo(state.map);
      
      polyline.on('click', () => {
        switchTransitMode(mode);
      });
      
      polyline.bringToFront();
      state.drawnRoutes[mode] = polyline;
      
      if (isSelected) boundsGroup = polyline;
    }
  });

  // Fit map viewport
  if (boundsGroup) {
    state.map.fitBounds(boundsGroup.getBounds(), {
      padding: [60, 60],
      maxZoom: 16
    });
  }
}

// 9. UI Active Tab updates
function switchTransitMode(mode, adjustViewport = true) {
  state.activeMode = mode;
  
  // Show or hide manual drawing controls
  const manualControls = document.getElementById('manual-drawing-controls');
  if (manualControls) {
    if (mode === 'manual') {
      manualControls.classList.remove('hidden');
    } else {
      manualControls.classList.add('hidden');
      if (state.isDrawingManual) {
        toggleManualDrawing(); // turn off drawing if they switch mode
      }
    }
  }

  // Show or hide transit sub-options selector
  const transitSelector = document.getElementById('transit-options-container');
  if (transitSelector) {
    if (mode === 'transit') {
      transitSelector.classList.remove('hidden');
      const route = state.routeCache['transit'];
      if (route && route.options) {
        const selectContainer = document.getElementById('transit-select-dropdown');
        if (selectContainer) {
          selectContainer.innerHTML = '';
          const activeIndex = route.activeOptionIndex || 0;
          
          // Render each dynamically parsed OSM line + Predefined City Groups
          const optGroupAuto = document.createElement('optgroup');
          optGroupAuto.label = 'Rutas sugeridas en tu zona';
          route.options.filter(opt => !opt.id.startsWith('MAD_') && !opt.id.startsWith('BCN_')).forEach((opt) => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = opt.label;
            if (route.options[activeIndex] && route.options[activeIndex].id === opt.id) optionEl.selected = true;
            optGroupAuto.appendChild(optionEl);
          });
          selectContainer.appendChild(optGroupAuto);
          
          const optGroupMad = document.createElement('optgroup');
          optGroupMad.label = 'Madrid (Metro & EMT)';
          ['Metro L1', 'Metro L2', 'Metro L3', 'Metro L4', 'Metro L5', 'Metro L6', 'Metro L7', 'Metro L8', 'Metro L9', 'Metro L10', 'Metro L11', 'Metro L12', 'Metro Ramal', 'Bus EMT 27', 'Bus EMT 150', 'Bus EMT C1', 'Bus EMT C2'].forEach(line => {
            const optionEl = document.createElement('option');
            optionEl.value = 'MAD_' + line.replace(/\s+/g, '_');
            optionEl.textContent = line;
            if (route.options[activeIndex] && route.options[activeIndex].id === optionEl.value) optionEl.selected = true;
            optGroupMad.appendChild(optionEl);
          });
          selectContainer.appendChild(optGroupMad);
          
          const optGroupBcn = document.createElement('optgroup');
          optGroupBcn.label = 'Barcelona (TMB)';
          ['Metro L1', 'Metro L2', 'Metro L3', 'Metro L4', 'Metro L5', 'Metro L9S', 'Metro L9N', 'Metro L10N', 'Metro L11', 'Metro L12', 'Bus TMB V15', 'Bus TMB H12', 'Bus TMB D20'].forEach(line => {
            const optionEl = document.createElement('option');
            optionEl.value = 'BCN_' + line.replace(/\s+/g, '_');
            optionEl.textContent = line;
            if (route.options[activeIndex] && route.options[activeIndex].id === optionEl.value) optionEl.selected = true;
            optGroupBcn.appendChild(optionEl);
          });
          selectContainer.appendChild(optGroupBcn);
          
          // Re-bind change listener cleanly
          const newSelect = selectContainer.cloneNode(true);
          selectContainer.parentNode.replaceChild(newSelect, selectContainer);
          newSelect.addEventListener('change', (e) => {
            selectTransitOption(e.target.value);
          });
          
          // Add custom line button logic
          const addCustomBtn = document.getElementById('btn-add-custom-transit');
          const newCustomBtn = addCustomBtn.cloneNode(true);
          addCustomBtn.parentNode.replaceChild(newCustomBtn, addCustomBtn);
          
          newCustomBtn.addEventListener('click', () => {
            const customRef = prompt("Ingresa el número o nombre de la línea que deseas evaluar (ej. L10, 150, 27):");
            if (customRef) {
              const cleanRef = customRef.trim().toUpperCase();
              if (cleanRef) {
                const isSubway = cleanRef.startsWith('L') || cleanRef.includes('METRO') || cleanRef.includes('SUB');
                const lineName = isSubway ? `Metro Línea ${cleanRef}` : `Autobús Línea ${cleanRef}`;
                const icon = isSubway ? 'subway' : 'bus';
                const color = isSubway ? '#009639' : '#ef4444';
                
                const baseOption = route.options[0];
                if (baseOption) {
                  const newLegs = JSON.parse(JSON.stringify(baseOption.legs));
                  const transitLeg = newLegs.find(l => l.type === 'transit');
                  if (transitLeg) {
                    transitLeg.name = lineName;
                    transitLeg.line = lineName;
                    transitLeg.color = color;
                    transitLeg.icon = icon;
                    transitLeg.instruction = `Toma el <strong>${lineName}</strong> en la parada y viaja hasta tu destino.`;
                  }
                  
                  const customOpt = {
                    id: `custom_${cleanRef.toLowerCase()}_${Date.now()}`,
                    label: isSubway ? `Metro ${cleanRef}` : `Bus ${cleanRef}`,
                    line: lineName,
                    color: color,
                    icon: icon,
                    distance: baseOption.distance,
                    duration: baseOption.duration,
                    legs: newLegs,
                    coordinates: baseOption.coordinates
                  };
                  
                  route.options.push(customOpt);
                  
                  const newOptEl = document.createElement('option');
                  newOptEl.value = customOpt.id;
                  newOptEl.textContent = customOpt.label;
                  newSelect.appendChild(newOptEl);
                  
                  newSelect.value = customOpt.id;
                  selectTransitOption(customOpt.id);
                  showToast(`Línea ${cleanRef} agregada a la evaluación`);
                }
              }
            }
          });
          
          initLucide();
        }
      }
    } else {
      transitSelector.classList.add('hidden');
    }
  }

  // Highlight Tab Button
  document.querySelectorAll('.mode-tab').forEach(tab => {
    if (tab.dataset.mode === mode) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  if (mode === 'manual') {
    // Redraw Polylines to clear other modes and keep manual drawn line
    if (adjustViewport) {
      drawRoutePolylines('manual');
      if (state.manualPolyline) {
        state.manualPolyline.addTo(state.map);
      }
    }
    
    // Update Summary card for manual drawing
    document.getElementById('route-title').textContent = state.manualPolyline ? "Ruta Manual Ajustada" : "Trazo Manual";
    document.getElementById('route-distance-duration').textContent = state.manualPolyline ? document.getElementById('route-distance-duration').textContent : "Dibuja en el mapa para calcular...";
    return;
  }

  const route = state.routeCache[mode];
  if (!route) return;

  // Redraw Polylines with highlighted color
  if (adjustViewport) {
    drawRoutePolylines(mode);
  }

  // Update Summary card
  let title = "Ruta a pie";
  if (mode === 'bike') title = "Ruta ciclista";
  if (mode === 'transit') {
    const activeOption = (route.options && route.options[route.activeOptionIndex !== undefined ? route.activeOptionIndex : 0]) || null;
    title = activeOption ? activeOption.line : "Tránsito Público";
  }
  if (mode === 'car') title = "Ruta vehicular";
  
  document.getElementById('route-title').textContent = title;
  
  const distanceKm = (route.distance / 1000).toFixed(1);
  const timeStr = formatDuration(route.duration);
  document.getElementById('route-distance-duration').textContent = `${timeStr} (${distanceKm} km)`;
  
  // Overall score percentage
  const badgeText = document.getElementById(`tab-score-${mode}`).textContent;
  const scoreVal = document.getElementById('route-overall-score').querySelector('strong');
  scoreVal.textContent = badgeText;
  
  // Comfort Heat exposure warn box
  const heatWarn = document.getElementById('heat-island-warning');
  const heatExp = calculateHeatExposure(route);
  
  if ((mode === 'foot' || mode === 'bike') && heatExp > 30) {
    heatWarn.classList.remove('hidden');
    heatWarn.querySelector('p').textContent = `Esta ruta atraviesa zonas calurosas (${Math.round(heatExp)}% expuesta a islas de calor).`;
  } else {
    heatWarn.classList.add('hidden');
  }
  
  // Detailed Metric stats
  // 1. Heatcomfort status
  const valHeat = document.getElementById('val-metric-heat');
  if (mode === 'car') {
    valHeat.textContent = "Excelente (Aire Aco.)";
    valHeat.style.color = 'var(--primary)';
  } else if (mode === 'transit') {
    valHeat.textContent = "Bueno (Climatizado)";
    valHeat.style.color = 'var(--primary)';
  } else {
    if (heatExp < 15) {
      valHeat.textContent = "Fresco / Con Sombra";
      valHeat.style.color = 'var(--eco)';
    } else if (heatExp < 45) {
      valHeat.textContent = "Zonas Templadas";
      valHeat.style.color = 'var(--heat-warm)';
    } else {
      valHeat.textContent = "Muy Caluroso";
      valHeat.style.color = 'var(--heat-hot)';
    }
  }
  
  // 2. Eco metrics
  const valEco = document.getElementById('val-metric-eco');
  const co2 = Math.round(getCO2Emission(mode, route.distance));
  valEco.textContent = co2 === 0 ? "0g CO₂ (¡Eco!)" : `${co2}g CO₂`;
  valEco.style.color = co2 === 0 ? 'var(--eco)' : 'var(--text-primary)';
  
  // 3. Cost metrics
  const valCost = document.getElementById('val-metric-cost');
  const cost = getCostForMode(mode, route.distance);
  valCost.textContent = cost === 0 ? "Gratis" : `$${cost.toFixed(2)}`;
  
  // 4. Calorie metrics
  const valHealth = document.getElementById('val-metric-health');
  const calories = Math.round(getCaloriesBurned(mode, route.duration));
  valHealth.textContent = calories === 0 ? "--" : `${calories} kcal`;
  // Display active star ratings for current route segments
  renderModeRatings(mode);

  // Load step directions — use legs for transit, steps for others
  const accordionTrigger = document.getElementById('btn-toggle-directions');
  const accordionContent = document.getElementById('directions-list');
  
  if (mode === 'transit' && route.legs && route.legs.length > 0) {
    renderTransitTimeline(route);
    // Auto-expand directions for transit so the user sees the full itinerary
    accordionContent.classList.remove('hidden');
    accordionTrigger.classList.add('active');
  } else {
    renderSteps(route.steps);
  }
}

function getCO2Emission(mode, distanceMeters) {
  const km = distanceMeters / 1000;
  if (mode === 'foot' || mode === 'bike') return 0;
  if (mode === 'transit') return km * 45; // average transit emissions
  if (mode === 'car') return km * 140; // average petrol sedan
  return 0;
}

function getCaloriesBurned(mode, durationSeconds) {
  const minutes = durationSeconds / 60;
  if (mode === 'foot') return minutes * 4.5; // ~270 kcal/h
  if (mode === 'bike') return minutes * 8.0; // ~480 kcal/h
  if (mode === 'transit') return minutes * 1.5; // light walking between stations
  return 0;
}

function renderSteps(steps) {
  const list = document.getElementById('directions-list');
  list.innerHTML = '';
  
  if (!steps || steps.length === 0) {
    list.innerHTML = `<p style="font-size:12px; color:var(--text-secondary); text-align:center;">Instrucciones no disponibles</p>`;
    return;
  }
  
  steps.forEach(step => {
    const div = document.createElement('div');
    div.className = 'direction-step';
    
    const distText = step.distance > 0 ? (step.distance >= 1000 ? `${(step.distance/1000).toFixed(1)} km` : `${Math.round(step.distance)} m`) : '';
    
    div.innerHTML = `
      <div class="step-number">${step.number}</div>
      <div class="step-details">
        <span>${step.instruction}</span>
        ${distText ? `<span class="step-distance">${distText}</span>` : ''}
      </div>
    `;
    list.appendChild(div);
  });
}

// Render transit route as a Google Maps style vertical timeline
function renderTransitTimeline(route) {
  const list = document.getElementById('directions-list');
  list.innerHTML = '';

  if (!route.legs || route.legs.length === 0) {
    list.innerHTML = `<p style="font-size:12px; color:var(--text-secondary); text-align:center;">Instrucciones no disponibles</p>`;
    return;
  }

  const timeline = document.createElement('div');
  timeline.className = 'transit-timeline';

  route.legs.forEach((leg, index) => {
    const legDiv = document.createElement('div');
    legDiv.className = `timeline-leg timeline-leg--${leg.type}`;

    if (leg.type === 'walk') {
      const durationMin = Math.round(leg.duration / 60);
      const distText = leg.distance >= 1000 ? `${(leg.distance/1000).toFixed(1)} km` : `${Math.round(leg.distance)} m`;

      legDiv.innerHTML = `
        <div class="timeline-icon timeline-icon--walk">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="2"/><path d="m10 22 4-12m-4 0 2-3m-4 7 2 2m-2-2h3"/>
          </svg>
        </div>
        <div class="timeline-body">
          <div class="timeline-title">Caminar</div>
          <div class="timeline-desc">${leg.instruction}</div>
          <div class="timeline-meta">${durationMin} min · ${distText}</div>
        </div>
      `;
    } else if (leg.type === 'transit') {
      const durationMin = Math.round(leg.duration / 60);
      const waitMin = Math.round((leg.wait || 0) / 60);
      const distText = leg.distance >= 1000 ? `${(leg.distance/1000).toFixed(1)} km` : `${Math.round(leg.distance)} m`;
      
      const isBus = leg.icon === 'bus';
      const vehicleIcon = isBus
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6m8-6v6M3 11h18M3 6h18M3 16h18M3 6c0-2 1-3 3-3h12c2 0 3 1 3 3v10c0 2-1 3-3 3H6c-2 0-3-1-3-3V6zm4 14v1m10-1v1"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16m-8-8v16M4 15.5h16M4 6.5h16"/></svg>`;
      
      // Build stops list
      let stopsHTML = '';
      if (leg.stops && leg.stops.length > 0) {
        const stopsItems = leg.stops.map(s => `<li>${s.name}</li>`).join('');
        stopsHTML = `
          <div class="timeline-stops">
            <button class="stops-toggle" onclick="this.parentElement.classList.toggle('expanded')">
              <span>${leg.stops.length} paradas intermedias</span>
              <svg class="stops-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <ul class="stops-list">${stopsItems}</ul>
          </div>
        `;
      }

      legDiv.innerHTML = `
        <div class="timeline-icon timeline-icon--transit" style="background:${leg.color || '#3b82f6'}">
          ${vehicleIcon}
        </div>
        <div class="timeline-body">
          <div class="timeline-transit-badge" style="background:${leg.color || '#3b82f6'}">
            ${leg.line || 'Transporte Público'}
          </div>
          <div class="timeline-station">
            <div class="station-dot" style="border-color:${leg.color || '#3b82f6'}"></div>
            <span>Sube en <strong>${leg.stationStart}</strong></span>
          </div>
          ${stopsHTML}
          <div class="timeline-station">
            <div class="station-dot" style="border-color:${leg.color || '#3b82f6'}"></div>
            <span>Baja en <strong>${leg.stationEnd}</strong></span>
          </div>
          <div class="timeline-meta">
            ${waitMin > 0 ? `Espera ~${waitMin} min · ` : ''}${durationMin} min · ${distText}
          </div>
        </div>
      `;
    }

    timeline.appendChild(legDiv);
  });

  list.appendChild(timeline);
}

// 10. Dynamic Segment Star Ratings Interactions
function renderModeRatings(mode, targetContainerId = null) {
  let containerId = targetContainerId || (mode === 'manual' ? 'manual-mode-ratings-list' : 'mode-ratings-list');
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  
  const categories = [
    { id: 'temp', name: 'Temperatura' },
    { id: 'shade', name: 'Sombra y arbolado' },
    { id: 'water', name: 'Acceso a agua' }
  ];
  
  if (mode === 'transit') {
    // Solo temperatura en transporte público
    categories.length = 1;
  }

  categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'mode-rating-row';
    row.style.margin = '10px 0';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    
    const label = document.createElement('span');
    label.style.fontSize = '13px';
    label.style.color = 'var(--text-secondary)';
    label.style.fontWeight = '500';
    label.textContent = cat.name;
    row.appendChild(label);
    
    const starsDiv = document.createElement('div');
    starsDiv.className = 'stars';
    starsDiv.style.display = 'flex';
    starsDiv.style.gap = '4px';
    
    const currentRating = state.ratings[`${mode}_${cat.id}`] || 0;
    
    for (let i = 1; i <= 5; i++) {
      const starIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      starIcon.setAttribute('width', '20');
      starIcon.setAttribute('height', '20');
      starIcon.setAttribute('viewBox', '0 0 24 24');
      
      const isFilled = i <= currentRating;
      // "Estrellitas grises": unfilled are transparent with grey-300 stroke. Filled are solid grey-500.
      starIcon.setAttribute('fill', isFilled ? '#6b7280' : 'transparent');
      starIcon.setAttribute('stroke', isFilled ? '#6b7280' : '#d1d5db');
      starIcon.setAttribute('stroke-width', '2');
      starIcon.setAttribute('stroke-linecap', 'round');
      starIcon.setAttribute('stroke-linejoin', 'round');
      starIcon.style.cursor = 'pointer';
      starIcon.style.transition = 'transform 0.15s, fill 0.2s';
      
      starIcon.innerHTML = `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>`;
      
      starIcon.addEventListener('mouseenter', () => {
        starIcon.style.transform = 'scale(1.2)';
      });
      starIcon.addEventListener('mouseleave', () => {
        starIcon.style.transform = '';
      });
      
      starIcon.addEventListener('click', () => {
        state.ratings[`${mode}_${cat.id}`] = i;
        savePreferences();
        showToast(`Evaluaste "${cat.name}" con ${i} estrellas`);
        renderModeRatings(mode, targetContainerId);
      });
      
      starsDiv.appendChild(starIcon);
    }
    
    row.appendChild(starsDiv);
    container.appendChild(row);
  });
}

function getModeNameSpanish(mode) {
  if (mode === 'foot') return 'A pie';
  if (mode === 'bike') return 'Bicicleta';
  if (mode === 'transit') return 'Tránsito Público';
  if (mode === 'car') return 'Auto';
  return mode;
}

// 11. Helper formatting & toast prompts
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  
  if (h > 0) {
    return `${h} h ${m} min`;
  }
  return `${m} min`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  
  // Trigger animation reflow
  toast.offsetHeight;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 2500);
}

function resetRoute() {
  // Clear search inputs
  document.getElementById('input-start').value = '';
  document.getElementById('input-end').value = '';
  document.getElementById('btn-clear').classList.add('hidden');
  
  // Remove map points
  if (state.startMarker) state.map.removeLayer(state.startMarker);
  if (state.endMarker) state.map.removeLayer(state.endMarker);
  state.startCoords = null;
  state.endCoords = null;
  state.startMarker = null;
  state.endMarker = null;
  
  // Clear routing lines
  Object.keys(state.drawnRoutes).forEach(m => {
    if (Array.isArray(state.drawnRoutes[m])) {
      state.drawnRoutes[m].forEach(layer => state.map.removeLayer(layer));
    } else {
      state.map.removeLayer(state.drawnRoutes[m]);
    }
  });
  state.drawnRoutes = {};
  
  // Clear station markers
  if (state.stationMarkers) {
    state.stationMarkers.forEach(m => state.map.removeLayer(m));
    state.stationMarkers = [];
  }
  
  // Clear heat islands
  state.heatIslands.forEach(circle => state.map.removeLayer(circle));
  state.heatIslands = [];
  state.heatPoints = [];
  
  state.routeCache = {};

  // Reset UI metrics on the route sheet
  const ids = ['foot', 'bike', 'transit', 'manual'];
  ids.forEach(id => {
    const t = document.getElementById(`tab-time-${id}`);
    const s = document.getElementById(`tab-score-${id}`);
    if (t) t.textContent = "--";
    if (s) s.textContent = "--";
  });
  
  const rTitle = document.getElementById('route-title');
  if (rTitle) rTitle.textContent = "Selecciona origen y destino";
  
  const rDistDur = document.getElementById('route-distance-duration');
  if (rDistDur) rDistDur.textContent = "Calculando...";
  
  const rScore = document.getElementById('route-overall-score');
  if (rScore && rScore.querySelector('strong')) {
    rScore.querySelector('strong').textContent = "--";
  }
  
  const transitSelector = document.getElementById('transit-options-container');
  if (transitSelector) transitSelector.classList.add('hidden');
  setBottomSheetState('half');
}

// 12. Bottom Sheet Mobile Swipe & Touch Controls
function onTouchStart(e) {
  state.touchStartY = e.touches[0].clientY;
  const sheet = document.getElementById('bottom-sheet');
  const rect = sheet.getBoundingClientRect();
  state.sheetStartY = rect.top;
  
  // Add direct transitions bypass while dragging for speed
  sheet.style.transition = 'none';
}

function onTouchMove(e) {
  const currentY = e.touches[0].clientY;
  const diffY = currentY - state.touchStartY;
  const newTop = state.sheetStartY + diffY;
  
  const windowHeight = window.innerHeight;
  const minTop = windowHeight * 0.15; // Max expanded height (85vh)
  const maxTop = windowHeight - 110;  // Minimally collapsed (110px peak)
  
  if (newTop >= minTop && newTop <= maxTop) {
    const translateVal = newTop - (windowHeight - sheetHeightVal());
    const sheet = document.getElementById('bottom-sheet');
    sheet.style.transform = `translateY(${newTop - (windowHeight - sheet.offsetHeight)}px)`;
  }
}

function onTouchEnd(e) {
  const sheet = document.getElementById('bottom-sheet');
  sheet.style.transition = ''; // Restore smooth transitions
  
  const rect = sheet.getBoundingClientRect();
  const top = rect.top;
  const h = window.innerHeight;
  
  // Snap calculations
  const snapPeak = h - 110;
  const snapHalf = h * 0.5;
  const snapFull = h * 0.15;
  
  const diffToPeak = Math.abs(top - snapPeak);
  const diffToHalf = Math.abs(top - snapHalf);
  const diffToFull = Math.abs(top - snapFull);
  
  const minDiff = Math.min(diffToPeak, diffToHalf, diffToFull);
  
  if (minDiff === diffToPeak) {
    setBottomSheetState('peak');
  } else if (minDiff === diffToHalf) {
    setBottomSheetState('half');
  } else {
    setBottomSheetState('full');
  }
}

function sheetHeightVal() {
  return document.getElementById('bottom-sheet').offsetHeight;
}

function setBottomSheetState(targetState) {
  if (window.innerWidth >= 768) {
    // Desktop: No bottom sheet translation
    return;
  }
  
  state.sheetState = targetState;
  const sheet = document.getElementById('bottom-sheet');
  sheet.style.transform = ''; // Clear custom styles
  sheet.className = 'bottom-sheet';
  
  if (targetState === 'peak') {
    // Collapsed
    sheet.style.transform = 'translateY(calc(100% - 110px))';
  } else if (targetState === 'half') {
    // Half open
    sheet.style.transform = 'translateY(50%)';
  } else if (targetState === 'full') {
    // Fully open
    sheet.style.transform = 'translateY(0)';
  }
}

// 13. PWA Installation Setup
function initPWA() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
        .catch(err => console.warn('Fallo de registro de Service Worker:', err));
    });
  }

  // Handle installation prompt popup
  const banner = document.getElementById('pwa-install-banner');
  const btnInstall = document.getElementById('pwa-btn-install');
  const btnDismiss = document.getElementById('pwa-btn-dismiss');

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default browser banner
    e.preventDefault();
    // Cache the event so it can be triggered later
    state.deferredPrompt = e;
    
    // Show custom banner (if user hasn't dismissed it previously in this session)
    if (!sessionStorage.getItem('ecoroute_pwa_dismissed')) {
      banner.classList.remove('hidden');
    }
  });

  btnInstall.addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    
    // Show the installation prompt
    state.deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await state.deferredPrompt.userChoice;
    console.log(`PWA Installation outcome: ${outcome}`);
    
    // We no longer need the prompt
    state.deferredPrompt = null;
    banner.classList.add('hidden');
  });

  btnDismiss.addEventListener('click', () => {
    banner.classList.add('hidden');
    sessionStorage.setItem('ecoroute_pwa_dismissed', 'true');
  });
}

// 14. Manual Drawing & Road Snapping Features
let isDrawingActive = false;

function toggleManualDrawing() {
  const btn = document.getElementById('btn-start-drawing');
  if (!btn) return;
  
  if (!state.isDrawingManual) {
    // Start drawing mode
    state.isDrawingManual = true;
    btn.textContent = "Finalizar Trazo";
    btn.style.background = "#b91c1c"; // Red to indicate cancel/stop
    
    // Clear previous
    if (state.manualPolyline) {
      state.map.removeLayer(state.manualPolyline);
      state.manualPolyline = null;
    }
    state.manualCoords = [];
    document.getElementById('manual-comfort-rating').classList.add('hidden');
    
    // Disable map interaction while drawing
    state.map.dragging.disable();
    state.map.doubleClickZoom.disable();
    state.map.scrollWheelZoom.disable();
    
    // Bind mouse drawing triggers
    state.map.on('mousedown', startManualDraw);
    state.map.on('mousemove', manualDraw);
    state.map.on('mouseup', endManualDraw);
    
    // Mobile touch triggers
    state.map.on('touchstart', startManualDraw);
    state.map.on('touchmove', manualDraw);
    state.map.on('touchend', endManualDraw);
    
    showToast("Haz clic/pulsa y arrastra para dibujar tu ruta sobre el mapa");
  } else {
    // Stop drawing mode
    state.isDrawingManual = false;
    btn.textContent = "Iniciar Trazo";
    btn.style.background = "var(--primary)";
    
    // Restore map interactions
    state.map.dragging.enable();
    state.map.doubleClickZoom.enable();
    state.map.scrollWheelZoom.enable();
    
    // Unbind triggers
    state.map.off('mousedown', startManualDraw);
    state.map.off('mousemove', manualDraw);
    state.map.off('mouseup', endManualDraw);
    state.map.off('touchstart', startManualDraw);
    state.map.off('touchmove', manualDraw);
    state.map.off('touchend', endManualDraw);
    
    // Match route to streets using OSRM
    snapManualRouteToStreets();
  }
}

function getEventLatLng(e) {
  if (e.latlng) return e.latlng;
  if (e.originalEvent) {
    const touch = e.originalEvent.touches && e.originalEvent.touches.length > 0 ? e.originalEvent.touches[0] : (e.originalEvent.changedTouches && e.originalEvent.changedTouches.length > 0 ? e.originalEvent.changedTouches[0] : null);
    if (touch) {
      try {
        return state.map.mouseEventToLatLng(touch);
      } catch (err) {
        console.warn("Could not convert mouse event to LatLng:", err);
      }
    }
  }
  return null;
}

function startManualDraw(e) {
  isDrawingActive = true;
  const latlng = getEventLatLng(e);
  if (!latlng) return;
  
  if (e.originalEvent && e.originalEvent.preventDefault) {
    e.originalEvent.preventDefault();
  }
  
  // Append new point (allows both mouse dragging and consecutive clicking)
  state.manualCoords.push([latlng.lat, latlng.lng]);
  
  if (!state.manualPolyline) {
    state.manualPolyline = L.polyline(state.manualCoords, {
      color: '#009639',
      weight: 6,
      opacity: 0.85,
      dashArray: '8, 12'
    }).addTo(state.map);
  } else {
    state.manualPolyline.setLatLngs(state.manualCoords);
  }
}

function manualDraw(e) {
  if (!isDrawingActive || state.manualCoords.length === 0) return;
  
  if (e.originalEvent && e.originalEvent.preventDefault) {
    e.originalEvent.preventDefault();
  }
  
  const latlng = getEventLatLng(e);
  if (!latlng) return;
  
  // Prevent duplicate consecutive coordinates
  const lastCoord = state.manualCoords[state.manualCoords.length - 1];
  if (lastCoord[0] !== latlng.lat || lastCoord[1] !== latlng.lng) {
    state.manualCoords.push([latlng.lat, latlng.lng]);
    state.manualPolyline.setLatLngs(state.manualCoords);
  }
}

function endManualDraw() {
  isDrawingActive = false;
  
  if (state.manualCoords.length > 0) {
    const startCoord = state.manualCoords[0];
    const endCoord = state.manualCoords[state.manualCoords.length - 1];
    
    if (!state.manualStartCircle) {
      state.manualStartCircle = L.circleMarker(startCoord, {
        radius: 6, fillColor: '#009639', color: '#ffffff', weight: 2, fillOpacity: 0.8
      }).addTo(state.map);
    } else {
      state.manualStartCircle.setLatLng(startCoord);
    }
    
    if (!state.manualEndCircle) {
      state.manualEndCircle = L.circleMarker(endCoord, {
        radius: 6, fillColor: '#009639', color: '#ffffff', weight: 2, fillOpacity: 0.8
      }).addTo(state.map);
    } else {
      state.manualEndCircle.setLatLng(endCoord);
    }
  }
}

function clearManualDrawing() {
  if (state.manualPolyline) {
    state.map.removeLayer(state.manualPolyline);
    state.manualPolyline = null;
  }
  if (state.manualStartCircle) {
    state.map.removeLayer(state.manualStartCircle);
    state.manualStartCircle = null;
  }
  if (state.manualEndCircle) {
    state.map.removeLayer(state.manualEndCircle);
    state.manualEndCircle = null;
  }
  state.manualCoords = [];
  isDrawingActive = false;
  
  if (state.isDrawingManual) {
    toggleManualDrawing();
  }
  
  document.getElementById('manual-comfort-rating').classList.add('hidden');
  document.getElementById('tab-time-manual').textContent = "--";
  document.getElementById('tab-score-manual').textContent = "--";
  
  showToast("Trazo limpiado correctamente");
}

async function snapManualRouteToStreets() {
  if (state.manualCoords.length < 3) {
    showToast("Dibuja una línea más larga para poder identificar las calles");
    return;
  }
  
  // Sample a maximum of 30 points to comply with OSRM API URL length bounds
  const sampled = [];
  const step = Math.max(1, Math.floor(state.manualCoords.length / 25));
  for (let i = 0; i < state.manualCoords.length; i += step) {
    sampled.push(state.manualCoords[i]);
  }
  // Ensure last point is always included
  if (sampled[sampled.length - 1] !== state.manualCoords[state.manualCoords.length - 1]) {
    sampled.push(state.manualCoords[state.manualCoords.length - 1]);
  }
  
  const coordsString = sampled.map(pt => `${pt[1]},${pt[0]}`).join(';');
  const url = `https://router.project-osrm.org/match/v1/foot/${coordsString}?geometries=geojson&overview=full`;
  
  showToast("Ajustando ruta a las calles...");
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
      const snappedCoords = data.matchings[0].geometry.coordinates.map(c => [c[1], c[0]]);
      
      // Update polyline with snapped street path
      state.manualPolyline.setLatLngs(snappedCoords);
      state.manualPolyline.setStyle({
        color: '#009639',
        dashArray: null, // Solid line now
        weight: 6,
        opacity: 0.9
      });
      
      // Draw start and end circles
      if (state.manualStartCircle) state.map.removeLayer(state.manualStartCircle);
      if (state.manualEndCircle) state.map.removeLayer(state.manualEndCircle);
      
      state.manualStartCircle = L.circleMarker(snappedCoords[0], {
        radius: 7, fillColor: '#009639', color: '#ffffff', weight: 3, fillOpacity: 1
      }).addTo(state.map);
      
      state.manualEndCircle = L.circleMarker(snappedCoords[snappedCoords.length - 1], {
        radius: 7, fillColor: '#b91c1c', color: '#ffffff', weight: 3, fillOpacity: 1
      }).addTo(state.map);
      
      const matchDistance = data.matchings[0].distance;
      const matchDuration = data.matchings[0].duration;
      
      // Update UI values
      const timeText = formatDuration(matchDuration);
      document.getElementById('tab-time-manual').textContent = timeText;
      document.getElementById('tab-score-manual').textContent = "95%";
      
      // Update route summary card titles to match
      document.getElementById('route-title').textContent = "Ruta Manual Ajustada";
      document.getElementById('route-distance-duration').textContent = `${timeText} (${(matchDistance/1000).toFixed(1)} km)`;
      document.getElementById('route-overall-score').querySelector('strong').textContent = "95%";
      
      // Show rating form panel
      document.getElementById('manual-comfort-rating').classList.remove('hidden');
      
      const mediumSelect = document.getElementById('select-manual-medium');
      if (mediumSelect) {
        // Clone to remove previous event listeners
        const newSelect = mediumSelect.cloneNode(true);
        mediumSelect.parentNode.replaceChild(newSelect, mediumSelect);
        renderModeRatings(newSelect.value || 'foot', 'manual-mode-ratings-list');
        newSelect.addEventListener('change', (e) => {
          renderModeRatings(e.target.value, 'manual-mode-ratings-list');
        });
      } else {
        renderModeRatings('foot', 'manual-mode-ratings-list');
      }
      
      showToast("Ruta ajustada con éxito a las calles");
    } else {
      throw new Error("Match failed");
    }
  } catch (err) {
    
    // Rough simulation for distance
    let rawDist = 0;
    for (let i = 1; i < state.manualCoords.length; i++) {
      rawDist += getDistanceBetweenPoints(state.manualCoords[i-1], state.manualCoords[i]);
    }
    const duration = rawDist / 1.3; // walk speed
    
    const timeText = formatDuration(duration);
    document.getElementById('tab-time-manual').textContent = timeText;
    document.getElementById('tab-score-manual').textContent = "88%";
    document.getElementById('route-title').textContent = "Trazo Manual Libre";
    document.getElementById('route-distance-duration').textContent = `${timeText} (${(rawDist/1000).toFixed(1)} km)`;
    
    document.getElementById('manual-comfort-rating').classList.remove('hidden');
    
    const mediumSelect = document.getElementById('select-manual-medium');
    if (mediumSelect) {
      const newSelect = mediumSelect.cloneNode(true);
      mediumSelect.parentNode.replaceChild(newSelect, mediumSelect);
      renderModeRatings(newSelect.value || 'foot', 'manual-mode-ratings-list');
      newSelect.addEventListener('change', (e) => {
        renderModeRatings(e.target.value, 'manual-mode-ratings-list');
      });
    } else {
      renderModeRatings('foot', 'manual-mode-ratings-list');
    }
    
    // Hide save button initially just in case it bugs out, ensure it's visible if we snapped
    document.getElementById('btn-save-manual-route').style.display = 'block';
    showToast("Dibujo trazado con éxito");
  }
}

function toggleLiveThermometer() {
  if (typeof state.liveThermoActive === 'undefined') state.liveThermoActive = false;
  state.liveThermoActive = !state.liveThermoActive;
  
  const btn = document.getElementById('btn-live-thermo-map');
  if (!btn) return;
  
  if (state.liveThermoActive) {
    btn.style.background = '#ef4444'; // Red when active
    btn.style.borderColor = '#ef4444';
    btn.style.color = '#ffffff';
    btn.innerHTML = '<i data-lucide="thermometer"></i>';
    
    let tooltip = document.getElementById('live-thermo-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'live-thermo-tooltip';
      tooltip.style.position = 'absolute';
      tooltip.style.padding = '6px 12px';
      tooltip.style.background = 'rgba(0,0,0,0.85)';
      tooltip.style.color = '#fff';
      tooltip.style.borderRadius = '8px';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.zIndex = '9999';
      tooltip.style.fontFamily = 'monospace';
      tooltip.style.fontSize = '16px';
      tooltip.style.fontWeight = 'bold';
      tooltip.style.transform = 'translate(-50%, -150%)';
      tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      document.body.appendChild(tooltip);
    }
    tooltip.style.display = 'block';
    
    // Add background layer to show sector averages if in mobility mode
    if (state.appMode !== 'copernicus') {
      state.previousSubLayer = state.copernicusSubLayer;
      state.copernicusSubLayer = 'temperature';
      state.map.addLayer(state.copernicusLayer);
      updateCopernicusOverlay();
      state.map.on('moveend', updateCopernicusOverlay);
      state.artificialThermoLayer = true;
    }
    
    state.map.on('mousemove', onThermoMouseMove);
    showToast("Mueve el cursor por el mapa para ver la temperatura");
  } else {
    btn.style.background = '#ffffff';
    btn.style.borderColor = 'rgba(0,0,0,0.1)';
    btn.style.color = '#374151';
    btn.innerHTML = '<i data-lucide="thermometer"></i>';
    
    const tooltip = document.getElementById('live-thermo-tooltip');
    if (tooltip) tooltip.style.display = 'none';
    
    state.map.off('mousemove', onThermoMouseMove);
    
    // Remove artificial layer
    if (state.artificialThermoLayer && state.appMode !== 'copernicus') {
      state.map.removeLayer(state.copernicusLayer);
      state.map.off('moveend', updateCopernicusOverlay);
      state.copernicusSubLayer = state.previousSubLayer || 'none';
      state.artificialThermoLayer = false;
    }
  }
  
  if (window.lucide) window.lucide.createIcons();
}

function onThermoMouseMove(e) {
  const tooltip = document.getElementById('live-thermo-tooltip');
  if (!tooltip) return;
  
  const baseTemp = 31;
  const exactVariation = Math.sin(e.latlng.lat * 4000) * 5 + Math.cos(e.latlng.lng * 4000) * 4;
  const exactTemp = (baseTemp + exactVariation).toFixed(1);
  
  // Sector Average (approx 500m blocks)
  const zoneLat = Math.round(e.latlng.lat * 200) / 200;
  const zoneLng = Math.round(e.latlng.lng * 200) / 200;
  const sectorVariation = Math.sin(zoneLat * 4000) * 5 + Math.cos(zoneLng * 4000) * 4;
  const sectorTemp = (baseTemp + sectorVariation).toFixed(1);
  
  let colorExact = '#fff';
  if (exactTemp > 35) colorExact = '#ef4444'; 
  else if (exactTemp < 28) colorExact = '#3b82f6';
  else colorExact = '#facc15'; 

  let colorSector = '#fff';
  if (sectorTemp > 35) colorSector = '#ef4444'; 
  else if (sectorTemp < 28) colorSector = '#3b82f6';
  else colorSector = '#facc15'; 
  
  tooltip.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px; font-family:var(--font-body); font-weight:600;">
      <div style="display:flex; flex-direction:column; align-items:center;">
        <span style="font-size:11px; color:#aaa; text-transform:uppercase; letter-spacing:0.5px;">Punto Exacto</span>
        <span style="color:${colorExact}; font-size:18px;">${exactTemp} °C</span>
      </div>
      <div style="height:1px; width:100%; background:rgba(255,255,255,0.2);"></div>
      <div style="display:flex; flex-direction:column; align-items:center;">
        <span style="font-size:10px; color:#aaa; text-transform:uppercase; letter-spacing:0.5px;">Media Sector Cuadrante</span>
        <span style="color:${colorSector}; font-size:14px;">${sectorTemp} °C</span>
      </div>
    </div>
  `;
  
  // Adjust position to follow cursor or touch
  const pt = state.map.latLngToContainerPoint(e.latlng);
  tooltip.style.left = pt.x + 'px';
  tooltip.style.top = pt.y + 'px';
}

function saveManualRoute() {
  if (!state.manualPolyline) {
    showToast("No hay ningún trazo activo para guardar.");
    return;
  }
  
  const mediumSelect = document.getElementById('select-manual-medium');
  const medium = mediumSelect ? mediumSelect.value : 'foot';

  const t = state.ratings[`manual_temp`] || 0;
  const s = state.ratings[`manual_shade`] || 0;
  const w = state.ratings[`manual_water`] || 0;
  const avg = (t + s + w) / 3;
  
  let routeColor = '#eab308'; // Default yellow
  if (avg > 0.3) routeColor = '#10b981'; // Green
  else if (avg < -0.3) routeColor = '#ef4444'; // Red
  
  const savedPolyline = L.polyline(state.manualPolyline.getLatLngs(), {
    color: routeColor, weight: 5, opacity: 0.8
  }).addTo(state.map);
  
  let savedStartCircle = null;
  let savedEndCircle = null;
  
  if (state.manualStartCircle) {
    savedStartCircle = L.circleMarker(state.manualStartCircle.getLatLng(), {
      radius: 6, fillColor: routeColor, color: '#ffffff', weight: 2, fillOpacity: 0.8
    }).addTo(state.map);
  }
  
  if (state.manualEndCircle) {
    savedEndCircle = L.circleMarker(state.manualEndCircle.getLatLng(), {
      radius: 6, fillColor: routeColor, color: '#ffffff', weight: 2, fillOpacity: 0.8
    }).addTo(state.map);
  }

  const routeObj = {
    id: Date.now(),
    medium: medium,
    polyline: savedPolyline,
    startCircle: savedStartCircle,
    endCircle: savedEndCircle,
    coords: state.manualPolyline.getLatLngs(),
    color: routeColor,
    ratings: { temp: t, shade: s, water: w }
  };
  
  state.savedManualRoutes.push(routeObj);
  
  // Save to DB
  if (window.DB) {
    DB.saveManualRoute({
      medium: medium,
      coords: state.manualPolyline.getLatLngs(),
      color: routeColor,
      ratings: { temp: t, shade: s, water: w }
    });
  }
  
  showToast("¡Ruta guardada y registrada!");
  
  // Clear the active drawing so they can draw a new one
  clearManualDrawing();
  document.getElementById('manual-comfort-rating').classList.add('hidden');
  
  // Render the list
  renderSavedManualRoutes();
  showToast("Trazo guardado en el historial");
}

function renderSavedManualRoutes() {
  const container = document.getElementById('saved-manual-routes');
  const list = document.getElementById('saved-manual-routes-list');
  if (!container || !list) return;
  
  if (state.savedManualRoutes.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  list.innerHTML = '';
  
  state.savedManualRoutes.forEach((route, index) => {
    const div = document.createElement('div');
    div.style.padding = '10px';
    div.style.background = 'rgba(0,0,0,0.03)';
    div.style.border = '1px solid rgba(0,0,0,0.05)';
    div.style.borderRadius = '8px';
    div.style.fontSize = '12px';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    
    let mediumName = 'A pie';
    if (route.medium === 'bike') mediumName = 'Bicicleta';
    else if (route.medium === 'transit') mediumName = 'Transporte Público';
    
    div.innerHTML = `
      <div style="flex:1;">
        <strong style="color:var(--primary); font-size:13px;">Trazo #${index + 1} (${mediumName})</strong>
        <div style="color:var(--text-secondary); margin-top:4px; font-weight:500;">
          Temp: ${route.ratings.temp}★ | Sombra: ${route.ratings.shade}★ | Agua: ${route.ratings.water}★
        </div>
      </div>
      <button class="btn-delete-saved" data-id="${route.id}" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:6px; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='none'">
        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
      </button>
    `;
    list.appendChild(div);
  });
  
  // Bind delete buttons
  document.querySelectorAll('.btn-delete-saved').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.getAttribute('data-id'));
      const routeIndex = state.savedManualRoutes.findIndex(r => r.id === id);
      if (routeIndex > -1) {
        const r = state.savedManualRoutes[routeIndex];
        if (r.polyline) state.map.removeLayer(r.polyline);
        if (r.startCircle) state.map.removeLayer(r.startCircle);
        if (r.endCircle) state.map.removeLayer(r.endCircle);
        state.savedManualRoutes.splice(routeIndex, 1);
        renderSavedManualRoutes();
      }
    });
  });
  
  if (window.lucide) window.lucide.createIcons();
}

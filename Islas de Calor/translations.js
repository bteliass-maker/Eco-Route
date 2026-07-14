const translations = {
  es: {
    app_title: "Eco-Route: refugios climáticos y movilidad térmicamente confortable",
    tab_mobility: "Movilidad",
    tab_places: "Lugares",
    search_start: "Elige un punto de partida...",
    search_end: "Elige tu destino...",
    btn_foot: "A pie",
    btn_bike: "Bicicleta",
    btn_transit: "Transporte",
    btn_manual: "Trazo manual",
    beta_badge: "BETA",
    beta_alert_title: "Función en desarrollo",
    beta_alert_desc: "La optimización de rutas considerando variables climáticas (sombras, temperatura) se encuentra en fase de prueba (BETA).",
    route_title_default: "Dibuja en el mapa o busca destino",
    route_dist_default: "Distancia y tiempo aparecerán aquí",
    feedback_title: "¿Cómo sentiste el clima en esta ruta?",
    feedback_desc: "Valora tu percepción para ayudarnos a calibrar las rutas.",
    f_temp: "Temperatura",
    f_shade: "Sombra",
    f_wind: "Viento / Brisa",
    btn_save_route: "Guardar Ruta",
    btn_cancel_route: "Cancelar",
    refuge_title: "Registrar Refugio Climático",
    refuge_name: "Nombre del lugar (opcional)",
    refuge_type: "Tipo de Refugio",
    type_shade: "Sombra y Vegetación",
    type_ac: "Aire Acondicionado",
    type_water: "Fuente / Agua",
    btn_save_refuge: "Guardar Refugio",
    btn_cancel_refuge: "Cancelar",
    info_title: "¿Qué es EcoRoute y cómo funciona?",
    info_p1: "EcoRoute es una plataforma colaborativa y pionera que mapea el confort térmico urbano. Nuestro algoritmo analiza las sombras de los edificios, la densidad vegetal y la radiación solar para ofrecerte las rutas peatonales y ciclistas más frescas durante los episodios de calor extremo.",
    info_p2: "Además, fomentamos la resiliencia ciudadana: cualquier persona puede registrar de forma anónima 'Refugios Climáticos' (parques frondosos, fuentes de agua, edificios públicos con aire acondicionado) para que todos puedan protegerse de las olas de calor.",
    info_p3: "Privacidad garantizada (RGPD): El mapeo es 100% anónimo. No rastreamos identidades, solo recopilamos la valoración térmica de las calles para mejorar la calidad de vida en nuestra ciudad.",
    btn_close: "Cerrar"
  },
  ca: {
    app_title: "Eco-Route: refugis climàtics i mobilitat tèrmicament confortable",
    tab_mobility: "Mobilitat",
    tab_places: "Llocs",
    search_start: "Tria un punt de partida...",
    search_end: "Tria la teva destinació...",
    btn_foot: "A peu",
    btn_bike: "Bicicleta",
    btn_transit: "Transport",
    btn_manual: "Traç manual",
    beta_badge: "BETA",
    beta_alert_title: "Funció en desenvolupament",
    beta_alert_desc: "L'optimització de rutes considerant variables climàtiques (ombres, temperatura) es troba en fase de prova (BETA).",
    route_title_default: "Dibuixa al mapa o busca destinació",
    route_dist_default: "Distància i temps apareixeran aquí",
    feedback_title: "Com has sentit el clima en aquesta ruta?",
    feedback_desc: "Valora la teva percepció per ajudar-nos a calibrar les rutes.",
    f_temp: "Temperatura",
    f_shade: "Ombra",
    f_wind: "Vent / Brisa",
    btn_save_route: "Guardar Ruta",
    btn_cancel_route: "Cancel·lar",
    refuge_title: "Registrar Refugi Climàtic",
    refuge_name: "Nom del lloc (opcional)",
    refuge_type: "Tipus de Refugi",
    type_shade: "Ombra i Vegetació",
    type_ac: "Aire Condicionat",
    type_water: "Font / Aigua",
    btn_save_refuge: "Guardar Refugi",
    btn_cancel_refuge: "Cancel·lar",
    info_title: "Què és EcoRoute i com funciona?",
    info_p1: "EcoRoute és una plataforma col·laborativa que mapeja el confort tèrmic urbà. El nostre algoritme analitza les ombres i la radiació solar per oferir-te les rutes més fresques durant els episodis de calor.",
    info_p2: "A més, fomentem la resiliència ciutadana: qualsevol persona pot registrar de forma anònima 'Refugis Climàtics' perquè tothom pugui protegir-se de les onades de calor.",
    info_p3: "Privacitat garantida (RGPD): El mapeig és 100% anònim. No rastregem identitats, només recopilem la valoració tèrmica per millorar la ciutat.",
    btn_close: "Tancar"
  },
  en: {
    app_title: "Eco-Route: Climate shelters & thermally comfortable mobility",
    tab_mobility: "Mobility",
    tab_places: "Places",
    search_start: "Choose starting point...",
    search_end: "Choose destination...",
    btn_foot: "Walking",
    btn_bike: "Cycling",
    btn_transit: "Transit",
    btn_manual: "Manual Draw",
    beta_badge: "BETA",
    beta_alert_title: "Feature in development",
    beta_alert_desc: "Route optimization based on climate variables (shade, temperature) is currently in testing phase (BETA).",
    route_title_default: "Draw on map or search destination",
    route_dist_default: "Distance and time will appear here",
    feedback_title: "How did the weather feel on this route?",
    feedback_desc: "Rate your perception to help us calibrate the routes.",
    f_temp: "Temperature",
    f_shade: "Shade",
    f_wind: "Wind / Breeze",
    btn_save_route: "Save Route",
    btn_cancel_route: "Cancel",
    refuge_title: "Register Climate Shelter",
    refuge_name: "Place name (optional)",
    refuge_type: "Shelter Type",
    type_shade: "Shade & Vegetation",
    type_ac: "Air Conditioning",
    type_water: "Water Fountain",
    btn_save_refuge: "Save Shelter",
    btn_cancel_refuge: "Cancel",
    info_title: "What is EcoRoute and how does it work?",
    info_p1: "EcoRoute is a collaborative platform that maps urban thermal comfort. Our algorithm analyzes building shadows, vegetation density, and solar radiation to provide you with the coolest walking and cycling routes during extreme heat episodes.",
    info_p2: "Furthermore, we foster civic resilience: anyone can anonymously register 'Climate Shelters' (leafy parks, water fountains, air-conditioned public buildings) so that everyone can protect themselves from heatwaves.",
    info_p3: "Privacy guaranteed (GDPR): Mapping is 100% anonymous. We don't track identities; we only collect thermal ratings of streets to improve the quality of life in our city.",
    btn_close: "Close"
  }
};

let currentLang = 'es';

function changeLanguage(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  
  // Update buttons state
  document.querySelectorAll('.lang-btn').forEach(btn => {
    if (btn.dataset.lang === lang) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // Update text contents
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (translations[lang][key]) {
      // If it's an input/textarea with placeholder, update placeholder instead
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[lang][key];
      } else {
        el.textContent = translations[lang][key];
      }
    }
  });
}

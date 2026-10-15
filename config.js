// frontend/config.js
// Configuración global de GasGuarenas

window.GAS_CONFIG = {
  // URL de PocketBase en Railway
  POCKETBASE_URL: "https://pocketbase-railway-production-3002.up.railway.app",

  // Nombre de la app
  APP_NAME: "GasGuarenas",
  APP_VERSION: "1.0.0",

  // Municipio por defecto
  MUNICIPIO_DEFAULT: "Municipio Plaza",

  // Google Maps API Key (opcional por ahora, la app funciona sin ella)
  GOOGLE_MAPS_API_KEY: "TU_GOOGLE_MAPS_API_KEY",

  // Cilindros disponibles
  CILINDROS: [
    { id: "10kg", label: "Cilindro 10 kg" },
    { id: "18kg", label: "Cilindro 18 kg" },
  ],

  // Colores (paleta azul)
  COLORS: {
    primary: "#0d6efd",
    primaryDark: "#0a58ca",
    primaryLight: "#4dabf7",
    accent: "#00d4ff",
    bg: "#0a1929",
    bgCard: "#132f4c",
    text: "#e7f1ff",
    textMuted: "#8fa8c8",
    danger: "#ff4d4f",
    success: "#52c41a",
  },

  // Intervalos
  HISTORIAL_MESES: 3,
  CHAT_POLL_MS: 5000,
  USUARIOS_ACTIVOS_POLL_MS: 10000,
};

console.log("✅ config.js cargado:", window.GAS_CONFIG.APP_NAME);
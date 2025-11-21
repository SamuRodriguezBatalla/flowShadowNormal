const fs = require('fs');
const path = require('path');

// Ruta absoluta al archivo config.json
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// Variable de caché en memoria
let configCache = null;

function loadConfig() {
    // 1. Si existe en caché, devolverlo directamente (Velocidad ⚡)
    if (configCache) return configCache;

    try {
        // 2. Si no, leer del disco
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            configCache = JSON.parse(data); // Guardar en caché
            return configCache;
        }
        return null;
    } catch (error) {
        console.error("Error cargando config.json:", error);
        return null;
    }
}

function saveConfig(newConfig) {
    try {
        // Guardamos con formato bonito
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 4), 'utf8');
        configCache = newConfig; // Actualizar caché al guardar
        return true;
    } catch (error) {
        console.error("Error guardando config.json:", error);
        return false;
    }
}

module.exports = { loadConfig, saveConfig };
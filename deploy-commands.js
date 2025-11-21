// deploy-commands.js (Versión Corregida)
require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ====================================================
// 1. GENERAR OPCIONES DE TEMPORADA (Misma lógica, Correcto)
// ====================================================
const HISTORY_PATH = path.join(__dirname, "data", "history");
let seasonChoices = [];

if (fs.existsSync(HISTORY_PATH)) {
    const historyFiles = fs.readdirSync(HISTORY_PATH).filter(file => file.endsWith(".json"));

    seasonChoices = historyFiles.map(file => {
        const match = file.match(/season_(\d+)\.json/i);
        if (match) {
            const seasonNumber = match[1];
            return { name: `Season ${seasonNumber}`, value: seasonNumber };
        }
        return null;
    }).filter(choice => choice !== null);
}
console.log(`✅ ${seasonChoices.length} temporadas históricas detectadas.`);

// ====================================================
// 2. CARGAR Y PREPARAR COMANDOS
// ====================================================
const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ("data" in command && "execute" in command) {
        let commandData;

        // 👇 AHORA COMPROBAMOS SI EL COMANDO NECESITA INYECTAR OPCIONES DINÁMICAS
        if (typeof command.createData === 'function') {
            // Si tiene createData, la usamos (ej: /checkout)
            commandData = command.createData(seasonChoices);
            console.log(`⚙️  Ajustando opciones dinámicas para /${commandData.name}`);
        } else {
            // Si no, usamos la estructura 'data' estándar (ej: /warn, /unwarn)
            commandData = command.data;
        }

        commands.push(commandData.toJSON());

    } else {
        console.log(`⚠️ El comando ${file} no tiene "data" o "execute"`);
    }
}

console.log(`Registrando ${commands.length} comandos...`);

// Crear REST client
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

// Registrar comandos SOLO EN EL GUILD (para desarrollo)
(async () => {
    try {
        if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
            console.log("❌ Falta CLIENT_ID o GUILD_ID en el .env");
            return;
        }

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        console.log(`✅ Comandos registrados correctamente. (${data.length} comandos)`);
    } catch (error) {
        console.error("❌ Error al registrar comandos:", error);
    }
})();
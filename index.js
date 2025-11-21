// index.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const config = require("./config.json"); // 💡 AÑADIDO: Importar configuración

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Requerido para fetch() en ready.js
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration, 
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel],
});

// 💡 AÑADIDO: Adjuntar la configuración al cliente para acceso global
client.config = config;

// ====================================================
// 1. CARGADOR DE COMANDOS
// ====================================================
client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");

// Verificamos que la carpeta exista
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        // Verificamos estructura del comando
        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ Comando cargado: ${command.data.name}`);
        } else {
            console.log(`⚠️ [ADVERTENCIA] El comando en ${filePath} le falta "data" o "execute".`);
        }
    }
}

// ====================================================
// 2. CARGADOR DE EVENTOS
// ====================================================
const eventsPath = path.join(__dirname, "events");

if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

client.login(process.env.BOT_TOKEN);
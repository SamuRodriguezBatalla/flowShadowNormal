// utils/historyLogger.js
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const HISTORY_DIR = path.join(__dirname, '..', 'data', 'history');
const ITEMS_PER_PAGE = 25; // Límite de campos por Embed

function logHistoricalData(seasonNumber) {
    const archivePath = path.join(HISTORY_DIR, `season_${seasonNumber}.json`);

    if (!fs.existsSync(archivePath)) {
        return null;
    }

    // 1. Cargar el archivo de historia
    const rawData = fs.readFileSync(archivePath, 'utf8');
    const tribes = JSON.parse(rawData);

    const sortedTribes = Object.keys(tribes).sort((a, b) => a.localeCompare(b));
    const totalPages = Math.ceil(sortedTribes.length / ITEMS_PER_PAGE) || 1;
    const embeds = [];

    // 2. Generar Embeds
    for (let i = 0; i < totalPages; i++) {
        const embed = new EmbedBuilder()
            .setColor('#4B0082') // Índigo (Color histórico)
            .setTitle(`📜 REGISTRO ARCHIVADO | SEASON ${seasonNumber}`)
            .setDescription('Datos finales de las tribus al finalizar la temporada.')
            .setFooter({ text: `Página ${i + 1} de ${totalPages} | Cierre de Season ${seasonNumber}` })
            .setTimestamp();

        // Obtener el fragmento de datos para la página actual
        const start = i * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const currentTribes = sortedTribes.slice(start, end);

        // Llenar los campos
        for (const tName of currentTribes) {
            const tData = tribes[tName];
            
            // Generar lista de miembros (Solo nombre, ID de Play y Rango)
            const memberList = tData.members.map(m => {
                const rankIcon = m.rango === 'Líder' ? '👑' : '👤';
                return `> ${rankIcon} **${m.username}** (ID: ${m.idPlay})`;
            }).join('\n');

            const tribeScore = tData.warnings || 0;
            const fieldTitle = `🛡️ ${tName} (Puntos Finales: ${tribeScore})`; 
            
            embed.addFields({ 
                name: fieldTitle, 
                value: memberList || "> *Sin miembros registrados.*", 
                inline: true 
            });
        }
        embeds.push(embed);
    }
    return embeds;
}

module.exports = { logHistoricalData };
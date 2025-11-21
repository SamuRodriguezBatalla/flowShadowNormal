const { EmbedBuilder } = require('discord.js');
const { loadTribes } = require('./tribes');
const config = require('../config.json');
const { BAN_THRESHOLD } = require('./constants'); 
const { loadMetadata } = require('./metadata');

async function updateLog(guild, client) {
    const logChannel = guild.channels.cache.find(c => c.name === config.channels.log);
    if (!logChannel) return console.log("❌ No se encontró el canal de log para actualizar.");

    const tribes = loadTribes();
    const sortedTribes = Object.keys(tribes).sort((a, b) => a.localeCompare(b));
    const { season } = loadMetadata(); 

    // ====================================================
    // LÓGICA DE PAGINACIÓN Y CONSTRUCCIÓN DE EMBEDS
    // ====================================================
    const itemsPerPage = 25;
    const totalPages = Math.ceil(sortedTribes.length / itemsPerPage) || 1;
    
    const embeds = [];

    for (let i = 0; i < totalPages; i++) {
        const embed = new EmbedBuilder()
            .setColor('#9B59B6');

        if (i === 0) {
            embed.setTitle(`📜 Registro de Tribus | Season ${season}`);
            embed.setDescription('Lista actualizada de todas las tribus y sus supervivientes.');
            embed.setThumbnail(guild.iconURL());
            embed.setTimestamp();
        } else {
            embed.setTitle(`📜 Registro de Tribus | S${season} (Continuación)`);
        }

        embed.setFooter({ 
            text: `Página ${i + 1} de ${totalPages} • Sistema de Tribus`, 
            iconURL: client.user.displayAvatarURL() 
        });

        const start = i * itemsPerPage;
        const end = start + itemsPerPage;
        const currentTribes = sortedTribes.slice(start, end);

        // Añadimos los campos de esta página
        for (const tName of currentTribes) {
            const tData = tribes[tName];
            const tRole = guild.roles.cache.find(r => r.name === tName);
            
            const tribeWarnings = tData.warnings || 0;
            const fieldTitle = `🛡️ ${tName} (Puntos Tribu: ${tribeWarnings})`; 
            
            let content = tRole ? `${tRole}\n` : ''; 
            
            // Ordenamos: Primero Líderes, luego Miembros
            const sortedMembers = tData.members.sort((a, b) => {
                if (a.rango === 'Líder' && b.rango !== 'Líder') return -1;
                if (a.rango !== 'Líder' && b.rango === 'Líder') return 1;
                return 0;
            });

            const memberList = sortedMembers.map(m => {
                const kitStatus = m.hasKit ? "✅ Entregado" : "❌ Pendiente";
                
                // ICONO DE RANGO (AQUÍ ESTÁ EL CAMBIO)
                const rankIcon = m.rango === 'Líder' ? '👑' : '👤';
                
                const totalWarnings = (m.warnings || 0) + tribeWarnings;
                const punishmentStatus = totalWarnings >= BAN_THRESHOLD ? `🚨 ¡PELIGRO! (>=${BAN_THRESHOLD})` : 'OK';

                return `> ${rankIcon} **${m.username}**\n> 🆔 \`${m.idPlay}\`\n> 📦 Kit: ${kitStatus}\n> ⚠️ Personal: ${m.warnings || 0} | Total Efectivo: **${totalWarnings}** (${punishmentStatus})`;
            }).join('\n\n');

            content += memberList || "> *Tribu vacía*";

            embed.addFields({ 
                name: fieldTitle, 
                value: content, 
                inline: true 
            });
        }

        embeds.push(embed);
    }

    // ====================================================
    // ENVIAR / EDITAR MENSAJE
    // ====================================================
    try {
        const messages = await logChannel.messages.fetch({ limit: 10 });
        
        const logMessage = messages.find(msg => 
            msg.author.id === client.user.id && 
            (
                (msg.embeds.length > 0 && msg.embeds[0].title.includes('📜 Registro de Tribus')) || 
                msg.content.includes("📜 **REGISTRO DE TRIBUS**")
            )
        );

        if (logMessage) {
            await logMessage.edit({ content: '', embeds: embeds });
        } else {
            await logChannel.send({ embeds: embeds });
        }
        console.log(`✅ Log actualizado (${totalPages} páginas).`);
    } catch (error) {
        console.error("Error al actualizar el log paginado:", error);
    }
}

module.exports = { updateLog };
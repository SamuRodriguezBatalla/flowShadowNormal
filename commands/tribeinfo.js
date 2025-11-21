const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { loadTribes } = require('../utils/tribes');
const { updateLog } = require('../utils/logger'); // Importado para consistencia (aunque no se usa aquí)


module.exports = {
    data: new SlashCommandBuilder()
        .setName('tribeinfo')
        .setDescription('Muestra información detallada de una tribu específica.')
        // CAMBIO: Ahora acepta un rol para identificar la tribu
        .addRoleOption(option => 
            option.setName('rol_tribu')
                .setDescription('Menciona el rol de la tribu a consultar.')
                .setRequired(true)
        )
        .setDMPermission(false), 

    async execute(interaction) {
        // 1. Obtener el rol mencionado
        const targetRole = interaction.options.getRole('rol_tribu');
        
        // El nombre de la tribu es el nombre del rol (ej: "Los Payos")
        const tribeNameInput = targetRole.name; 
        
        const tribes = loadTribes();
        
        // 2. Buscar la tribu por nombre (sin ser case-sensitive)
        const foundTribeName = Object.keys(tribes).find(key => 
            key.toLowerCase() === tribeNameInput.toLowerCase()
        );

        if (!foundTribeName) {
            return interaction.reply({ 
                content: `❌ No se encontró la tribu registrada bajo el nombre **${tribeNameInput}**.`, 
                flags: MessageFlags.Ephemeral
            });
        }

        const myTribeData = tribes[foundTribeName];

        // 3. Construir la lista de miembros
        const membersList = myTribeData.members.map(m => {
            const icon = (m.rango === 'Líder') ? '👑' : '👤';
            return `${icon} **${m.username}** (${m.rango || 'Miembro'}) - ID Play: *${m.idPlay}*`; 
        }).join('\n');
        
        // 4. Incluir estado de votación si aplica
        let voteStatus = "";
        const totalVotes = myTribeData.votes ? Object.keys(myTribeData.votes).length : 0;
        if (totalVotes > 0) {
             voteStatus = `\n\n🗳️ **Votación Secreta Activa:** Hay ${totalVotes} votos registrados.`;
        }

        // 5. RESPUESTA PÚBLICA con la etiqueta corregida
        return interaction.reply({
            content: `**-- 🛡️ FICHA PÚBLICA DE LA TRIBU ${foundTribeName.toUpperCase()} 🛡️ --**\n\n` +
                     `**⚠️ Puntos de Advertencia:** ${myTribeData.warnings || 0} puntos.\n` + // ETIQUETA CORREGIDA
                     `**📍 Canal Base:** <#${myTribeData.channelId || 'No Asignado'}>\n\n` +
                     `**👥 Miembros:**\n${membersList}${voteStatus}`,
        });
    },
};
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { loadTribes } = require('../utils/tribes');
const { BAN_THRESHOLD } = require('../utils/constants'); // Asegúrate de que constants.js existe
const config = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infoplayer')
        .setDescription('🔍 Muestra la ficha de un superviviente (Tribu, Advertencias, Kit).')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario a investigar (Si lo dejas vacío, muestra tu ficha)')
                .setRequired(false)), // Opcional: si no pone nada, se ve a sí mismo

    async execute(interaction) {
        // ====================================================
        // 🛡️ VERIFICACIÓN DE PERMISO (Rol Superviviente)
        // ====================================================
        // Buscamos el rol en la config
        const survivorRoleName = config.roles.survivor; 
        
        // Comprobamos si el usuario que ejecuta el comando tiene ese rol
        const hasPermission = interaction.member.roles.cache.some(r => r.name === survivorRoleName);

        // También permitimos a los Admins usarlo aunque no tengan el rol de superviviente
        const isAdmin = interaction.member.permissions.has('Administrator');

        if (!hasPermission && !isAdmin) {
            return interaction.reply({ 
                content: `❌ Solo los usuarios con el rol **${survivorRoleName}** pueden usar este comando.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        // ====================================================
        // 🔍 LÓGICA DEL COMANDO
        // ====================================================
        // Si puso usuario, usamos ese. Si no, usamos al que ejecutó el comando.
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const tribes = loadTribes();
        
        let memberData = null;
        let tribeNameFound = null;
        let tribeData = null;

        // Buscar al usuario en el JSON
        for (const tName in tribes) {
            const member = tribes[tName].members.find(m => m.discordId === targetUser.id);
            if (member) {
                memberData = member;
                tribeNameFound = tName;
                tribeData = tribes[tName];
                break;
            }
        }

        if (!memberData) {
            return interaction.reply({ 
                content: `❌ El usuario ${targetUser} no está registrado en ninguna tribu de la base de datos.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Cálculos de advertencias
        const personalWarns = memberData.warnings || 0;
        const tribeWarns = tribeData.warnings || 0;
        const effectiveWarns = personalWarns + tribeWarns;
        
        // Estado de riesgo visual
        let statusEmoji = '🟢';
        let statusText = 'Limpio';
        
        if (effectiveWarns > 0 && effectiveWarns < BAN_THRESHOLD) {
            statusEmoji = '⚠️';
            statusText = 'En Riesgo';
        } else if (effectiveWarns >= BAN_THRESHOLD) {
            statusEmoji = '💀';
            statusText = 'Debería estar BANEADO';
        }

        // Construcción del Embed
        const infoEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📂 Ficha de Superviviente`)
            .setDescription(`Datos del usuario ${targetUser}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🆔 ID PlayStation', value: `\`${memberData.idPlay}\``, inline: true },
                { name: '🛡️ Tribu', value: tribeNameFound, inline: true },
                { name: '📦 Estado del Kit', value: memberData.hasKit ? '✅ Entregado' : '❌ Pendiente', inline: true },
                
                { name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━' }, // Separador estético
                
                { name: '⚠️ Warns Personales', value: `${personalWarns}`, inline: true },
                { name: '☢️ Warns de Tribu', value: `${tribeWarns}`, inline: true },
                { name: '📉 Total Acumulado', value: `**${effectiveWarns}** / ${BAN_THRESHOLD}`, inline: true },
                
                { name: 'Estado Actual', value: `${statusEmoji} **${statusText}**`, inline: false }
            )
            .setFooter({ text: `Sistema de Fichas • ${interaction.guild.name}`, iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [infoEmbed] });
    },
};
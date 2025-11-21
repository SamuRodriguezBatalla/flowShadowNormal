const { Events, EmbedBuilder, ChannelType } = require('discord.js'); // 💡 AÑADIDO: ChannelType
const config = require('../config.json');
const { loadTribes, saveTribes } = require('../utils/tribes'); 
const { updateLog } = require('../utils/logger'); 

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        const guild = member.guild;
        const client = member.client;

        // ==========================================
        // 0. LIMPIEZA DE CANAL DE REGISTRO ACTIVO (CORREGIDO)
        // ==========================================
        // La forma más fiable de buscar un canal creado por guildMemberAdd.js es con el sufijo ID.
        const memberIdSuffix = member.id.slice(-4);
        
        const registerChannel = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildText && // Asegurar que sea de texto
            c.name.startsWith('registro-') && 
            (
                // Búsqueda robusta por el sufijo del ID
                c.name.includes(`-${memberIdSuffix}`) || 
                // Búsqueda original por anulación de permiso (como respaldo)
                c.permissionOverwrites.cache.has(member.id) 
            )
        );
        
        if (registerChannel) {
            try {
                // Al eliminar el canal aquí, el MessageCollector en guildMemberAdd.js
                // terminará con la razón 'channelDelete', deteniendo el registro sin mensaje de error.
                await registerChannel.delete('Miembro salió del servidor durante el registro.');
                console.log(`🗑️ Canal de registro temporal borrado para ${member.user.tag}.`);
            } catch (error) {
                console.error(`⚠️ Error al borrar canal de registro para ${member.user.tag}:`, error.message);
            }
        }
        
        // ==========================================
        // 1. MÓDULO DE DESPEDIDA (VISUAL)
        // ==========================================
        const goodbyeChannel = guild.channels.cache.find(c => c.name === config.channels.goodbye);

        if (goodbyeChannel) {
            const goodbyeEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Un Superviviente ha caído...')
                .setDescription(`${member.user.tag} ha abandonado el servidor.`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👋 Hasta la próxima', value: 'Esperamos verte de nuevo.', inline: false },
                    { name: '👥 Miembros Restantes', value: `${guild.memberCount} Supervivientes`, inline: true }
                )
                .setFooter({ text: 'FlowShadow - Sistema de Salidas', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            try {
                await goodbyeChannel.send({ embeds: [goodbyeEmbed] });
            } catch (error) {
                console.error("Error al enviar despedida:", error);
            }
        }
        
        // ==========================================
        // 2. LIMPIEZA DE DATOS, ROLES Y CANALES (Lógica de Tribus)
        // ==========================================
        
        try {
            let tribes = loadTribes();
            let memberRemoved = false;

            for (const tName in tribes) {
                const tribe = tribes[tName];
                const memberIndex = tribe.members.findIndex(m => m.discordId === member.id);
                
                if (memberIndex !== -1) {
                    // Encontrado: Lo sacamos del array
                    tribe.members.splice(memberIndex, 1);
                    memberRemoved = true;

                    // --- VERIFICACIÓN: ¿LA TRIBU SE HA QUEDADO VACÍA? ---
                    const tribeRole = guild.roles.cache.find(r => r.name === tName);
                    
                    const isJsonEmpty = tribe.members.length === 0;
                    const isRoleEmpty = tribeRole ? tribeRole.members.size === 0 : true;

                    if (isJsonEmpty || isRoleEmpty) {
                        console.log(`🧹 Iniciando borrado de tribu vacía: ${tName}`);

                        // A. BORRAR ROL
                        if (tribeRole) {
                            await tribeRole.delete(`Limpieza: Último miembro (${member.user.tag}) salió.`)
                                .catch(err => console.error(`⚠️ Error borrando rol "${tName}": ${err.message}`));
                            console.log(`🗑️ Rol eliminado: ${tName}`);
                        }

                        // B. BORRAR CANAL PRIVADO
                        if (tribe.channelId) {
                            const tribeChannel = guild.channels.cache.get(tribe.channelId);
                            if (tribeChannel) {
                                await tribeChannel.delete('Tribu disuelta (sin miembros).')
                                    .catch(err => console.error(`⚠️ Error borrando canal: ${err.message}`));
                                console.log(`🗑️ Canal eliminado: ${tName}`);
                            }
                        }

                        // C. BORRAR DEL REGISTRO
                        delete tribes[tName];
                        console.log(`🗑️ Tribu eliminada del JSON: ${tName}`);
                    }
                    
                    break; 
                }
            }

            if (memberRemoved) {
                saveTribes(tribes);
                await updateLog(guild, client);
                console.log(`✅ Base de datos actualizada tras la salida de ${member.user.tag}`);
            }

        } catch (error) {
            console.error("Error crítico en limpieza de salida:", error);
        }
    },
};
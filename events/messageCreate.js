// events/messageCreate.js
const { Events, MessageFlags, ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Ignorar bots, DMs y mensajes que no están en un servidor
        if (message.author.bot || !message.guild) return;

        const guild = message.guild;
        const member = message.member;

        // 1. Obtener el rol "No verificado"
        const unverifiedRoleName = config.roles.unverified;
        const unverifiedRole = guild.roles.cache.find(r => r.name === unverifiedRoleName);

        // Si el usuario no tiene el rol, o si el rol no está configurado, ignoramos
        if (!unverifiedRole || !member.roles.cache.has(unverifiedRole.id)) {
            return;
        }

        // 2. EXCEPCIÓN: Permitir escribir en el canal de registro
        // Si el canal actual empieza por 'registro-', es el canal privado, así que permitimos.
        if (message.channel.name.startsWith('registro-')) {
            return; 
        }

        // 3. Acción: Bloquear, borrar y notificar
        try {
            const channelNameBase = `registro-${member.user.username.toLowerCase().replace(/[^a-z0-9\-_]/g, '')}`;

            // A. Borrar el mensaje no autorizado
            await message.delete().catch(e => console.log(`No pude borrar mensaje de ${member.user.tag}:`, e.message));

            // B. Buscar el canal privado (ya que el usuario ya ha intentado unirse)
            // Se asume que el canal debe estar en la categoría de registro
            const regCategory = guild.channels.cache.find(c => c.name === config.categories.registration && c.type === ChannelType.GuildCategory);
            
            // Búsqueda robusta por nombre dentro de la categoría/guild
            let regChannel = guild.channels.cache.find(c => c.name.includes(channelNameBase.substring(0, 10)) && c.type === ChannelType.GuildText);
            
            if (regCategory) {
                 regChannel = regCategory.children.cache.find(c => c.name.includes(channelNameBase.substring(0, 10)));
            }
            
            // C. Notificar y redirigir
            const redirectText = regChannel ? `Continúa en tu canal privado: ${regChannel}` : 'Por favor, contacta a un administrador.';

            // Intento 1: Envío por DM (Para no spamear el canal público)
            await message.author.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🛑 Mensaje Bloqueado')
                        .setDescription(`Debes completar tu registro para poder escribir en canales públicos.`)
                        .addFields(
                            { name: 'Canal de Registro', value: redirectText, inline: false },
                            { name: 'Motivo', value: 'Rol "No verificado" detectado.' }
                        )
                        .setColor('#ffaa00')
                ]
            }).catch(e => {
                // Intento 2: Envío Ephemeral si los DMs están cerrados
                message.reply({ 
                    content: `⚠️ **¡ATENCIÓN ${member}!** Tu mensaje fue borrado. Debes registrarte en tu canal privado para poder chatear.`,
                    flags: MessageFlags.Ephemeral
                }).catch(console.error);
            });

        } catch (error) {
            console.error('Error en messageCreate:', error);
        }
    },
};
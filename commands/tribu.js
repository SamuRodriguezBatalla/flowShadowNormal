// commands/tribu.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { loadTribes, saveTribes } = require('../utils/tribes');
const { updateLog } = require('../utils/logger');
const { logToTribe } = require('../utils/tribeLog'); 
const { generateTribeHelpEmbed } = require('../utils/helpGenerator'); // <--- NUEVO: Importar generador de ayuda
const config = require('../config.json');

// ==================================================================
// FUNCIONES AUXILIARES DE VOTO
// ==================================================================

function generateVoteEmbed(tribeData, tribeName, interactionClient) {
    const totalMembers = tribeData.members.length;
    const votesNeeded = Math.floor(totalMembers / 2) + 1;
    const voteCounts = {};
    const votes = tribeData.votes || {};

    Object.values(votes).forEach(candidateId => {
        voteCounts[candidateId] = (voteCounts[candidateId] || 0) + 1;
    });

    const selectOptions = [];
    let voteStatusDescription = `Miembros Totales: **${totalMembers}** | Mayoría Necesaria: **${votesNeeded}**\n\n`;
    const candidates = tribeData.members; 

    candidates.forEach(m => {
        const currentVotes = voteCounts[m.discordId] || 0;
        const percentage = Math.round((currentVotes / totalMembers) * 100);
        const bar = "█".repeat(Math.floor(percentage / 10));
        const isLeader = m.rango === 'Líder';

        voteStatusDescription += 
            `${isLeader ? '👑' : '👤'} **${m.username}** (${currentVotes} votos) [${percentage}%]\n` +
            `┕ **[${bar}${' '.repeat(10 - bar.length)}]**\n`;

        selectOptions.push({
            label: `${m.username} (${currentVotes} votos)`,
            value: m.discordId,
            description: m.rango === 'Líder' ? 'Líder Actual' : 'Miembro'
        });
    });

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`🗳️ Elecciones de Liderazgo — Tribu: ${tribeName}`)
        .setDescription(voteStatusDescription)
        .setFooter({ text: 'Selecciona tu candidato en el menú de abajo. Tu voto es secreto.' })
        .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`tribe_vote_${tribeName}`)
        .setPlaceholder('Elige un miembro para Líder...')
        .addOptions(selectOptions);

    const actionRow = new ActionRowBuilder().addComponents(selectMenu);

    return { embed, actionRow };
}

// ==================================================================
// DEFINICIÓN Y LÓGICA DEL COMANDO
// ==================================================================

const createData = (seasonChoices = []) => {
    const builder = new SlashCommandBuilder()
        .setName('tribu')
        .setDescription('Gestión de tu tribu.');

    builder.addSubcommand(sub =>
        sub.setName('info')
            .setDescription('Muestra información de tu tribu y sus líderes.'))
    .addSubcommand(sub =>
        sub.setName('checkin') // <--- NUEVO
            .setDescription('🕒 Renueva la actividad de tu tribu para evitar el borrado por inactividad.'))
    .addSubcommand(sub =>
        sub.setName('votar')
            .setDescription('Inicia el proceso de votación interactivo.'))
    .addSubcommand(sub =>
        sub.setName('ascender') 
            .setDescription('Asigna el liderazgo a un miembro y se lo quita al líder actual.')
            .addUserOption(option => option.setName('usuario').setDescription('El nuevo líder').setRequired(true)))
    .addSubcommand(sub =>
        sub.setName('kick')
            .setDescription('Expulsa a un miembro de tu tribu (Solo Líderes).')
            .addUserOption(option => option.setName('usuario').setDescription('El miembro a expulsar').setRequired(true)))
    .addSubcommand(sub =>
        sub.setName('rename')
            .setDescription('👑 Cambia el nombre de tu tribu (Solo Líderes).')
            .addStringOption(option => option.setName('nuevo_nombre')
                .setDescription('El nuevo nombre para la tribu')
                .setRequired(true)))
    .addSubcommand(sub => // <--- NUEVO (ADMIN)
        sub.setName('updatehelp')
            .setDescription('👮 ADMIN: Actualiza el mensaje de ayuda en los canales de tribu.'));

    return builder;
};


module.exports = {
    createData,
    data: createData(), 
    generateVoteEmbed, 

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const tribes = loadTribes();
        const executorId = interaction.user.id;
        const isServerAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const leaderRole = interaction.guild.roles.cache.find(r => r.name === config.roles.leader);
        const unverifiedRole = interaction.guild.roles.cache.find(r => r.name === config.roles.unverified);


        // 1. BUSCAR LA TRIBU DEL EJECUTOR
        let myTribeName = null;
        let myMemberData = null;
        let myTribeData = null;

        for (const tName in tribes) {
            const member = tribes[tName].members.find(m => m.discordId === executorId);
            if (member) {
                myTribeName = tName;
                myMemberData = member;
                myTribeData = tribes[tName];
                break;
            }
        }

        // --- COMANDO DE ADMINISTRADOR: UPDATEHELP ---
        if (subcommand === 'updatehelp') {
            if (!isServerAdmin) {
                return interaction.reply({ content: '❌ Solo administradores.', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const helpEmbed = generateTribeHelpEmbed();
            let count = 0;

            for (const tName in tribes) {
                const t = tribes[tName];
                // Verificamos que la tribu tenga guardado el ID del mensaje de instrucciones
                if (t.channelId && t.instructionMessageId) {
                    try {
                        const channel = interaction.guild.channels.cache.get(t.channelId);
                        if (channel) {
                            const msg = await channel.messages.fetch(t.instructionMessageId).catch(() => null);
                            if (msg) {
                                // Editamos el mensaje existente con el nuevo Embed de ayuda
                                await msg.edit({ embeds: [helpEmbed] });
                                count++;
                            }
                        }
                    } catch (e) { console.error(`Error updatehelp ${tName}:`, e.message); }
                }
            }
            return interaction.editReply(`✅ Guía actualizada en **${count}** canales de tribu.`);
        }

        // --- VERIFICACIONES GENERALES ---
        const myRank = myMemberData ? (myMemberData.rango || 'Miembro') : 'Miembro';
        const isLeader = myRank === 'Líder';
        
        if (!myTribeData && !isServerAdmin) {
            return interaction.reply({ content: '❌ No perteneces a ninguna tribu.', flags: MessageFlags.Ephemeral });
        }

        // --- AUTO-RENOVACIÓN DE ACTIVIDAD ---
        // Cada vez que un miembro usa un comando de tribu, actualizamos la fecha.
        if (myTribeData) {
            myTribeData.lastActive = Date.now();
            // No guardamos 'saveTribes' aquí inmediatamente para todos los comandos para no saturar el disco,
            // excepto en 'checkin' o comandos que modifican datos críticos.
        }

        if (myTribeData) {
            if (myTribeData.channelId) {
                if (interaction.channelId !== myTribeData.channelId && !isServerAdmin) {
                     return interaction.reply({ 
                         content: `🔒 **Acceso Denegado:** Los comandos de gestión de tribu solo funcionan en vuestra base: <#${myTribeData.channelId}>`, 
                         flags: MessageFlags.Ephemeral 
                     });
                }
            }
        }

        const requiresLeadership = ['ascender', 'kick', 'rename'];
        if (requiresLeadership.includes(subcommand) && !isLeader && !isServerAdmin) {
            return interaction.reply({ content: '❌ Solo el **Líder** de la tribu puede realizar esta acción.', flags: MessageFlags.Ephemeral });
        }

        // ==================================================================
        // 0. COMANDO CHECKIN
        // ==================================================================
        if (subcommand === 'checkin') {
            saveTribes(tribes); // Aquí sí forzamos guardado para persistir la fecha
            return interaction.reply({ 
                content: `🕒 **Check-in completado.**\nLa actividad de la tribu **${myTribeName}** ha sido renovada. Tenéis 7 días más antes de ser marcados como inactivos.`,
                flags: MessageFlags.Ephemeral 
            });
        }

        // ==================================================================
        // 1. LÓGICA DE RENAME (Cambiar Nombre)
        // ==================================================================
        if (subcommand === 'rename') {
            await interaction.deferReply();
            const newTribeName = interaction.options.getString('nuevo_nombre').trim();
            const oldTribeName = myTribeName;

            if (tribes[newTribeName]) {
                 return interaction.followUp({ content: `❌ El nombre **${newTribeName}** ya está siendo usado por otra tribu.`, ephemeral: true });
            }

            const tribeRole = interaction.guild.roles.cache.find(r => r.name === oldTribeName);
            const tribeChannel = interaction.guild.channels.cache.get(myTribeData.channelId);
            // Nota: Al renombrar no editamos el mensaje de ayuda/instrucciones, ese se queda estático o se actualiza con /updatehelp

            try {
                if (tribeRole) {
                    await tribeRole.setName(newTribeName, `Renombrado por el Líder ${interaction.user.tag}`).catch(console.error);
                }
                if (tribeChannel) {
                    await tribeChannel.setName(newTribeName, `Renombrado por el Líder ${interaction.user.tag}`).catch(console.error);
                }
            } catch (error) {
                console.error(`Error al renombrar recursos de Discord para ${oldTribeName}:`, error);
                return interaction.followUp(`❌ Error al renombrar los recursos de Discord (Rol/Canal). Verifica permisos.`);
            }

            const newTribeData = { 
                ...myTribeData, 
                channelId: tribeChannel ? tribeChannel.id : null,
            };
            
            delete tribes[oldTribeName];
            tribes[newTribeName] = newTribeData;
            
            saveTribes(tribes);
            await updateLog(interaction.guild, interaction.client);
            
            // LOG AUDITORÍA
            if (logToTribe) await logToTribe(interaction.guild, newTribeData, '✏️ TRIBU RENOMBRADA', `El nombre de la tribu ha cambiado de **${oldTribeName}** a **${newTribeName}**.`);

            return interaction.followUp(`✅ **¡Tribu Renombrada!**\n\nEl nombre **${oldTribeName}** ha sido cambiado a **${newTribeName}**.`);
        }


        // ==================================================================
        // 2. LÓGICA DE INFO
        // ==================================================================
        if (subcommand === 'info') {
            const membersList = myTribeData.members.map(m => {
                const icon = (m.rango === 'Líder') ? '👑' : '👤';
                return `${icon} **${m.username}** (${m.rango || 'Miembro'})`;
            }).join('\n');

            let voteStatus = "";
            const totalVotes = myTribeData.votes ? Object.keys(myTribeData.votes).length : 0;
            if (totalVotes > 0) voteStatus = `\n\n🗳️ **Votación Secreta Activa:** ${totalVotes} votos registrados.`;

            return interaction.reply({
                content: `🛡️ **Tribu: ${myTribeName}**\n\n${membersList}${voteStatus}`,
            });
        }

        // ==================================================================
        // 3. LÓGICA DE VOTAR
        // ==================================================================
        if (subcommand === 'votar') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
            const tribeChannel = interaction.guild.channels.cache.get(myTribeData.channelId);
            if (!tribeChannel) return interaction.followUp({ content: '❌ El canal de tu tribu no fue encontrado.', flags: MessageFlags.Ephemeral });

            const { embed, actionRow } = generateVoteEmbed(myTribeData, myTribeName, interaction.client);
            
            await tribeChannel.send({
                content: `🗳️ **¡El Líder ${interaction.user} ha iniciado una votación!**`,
                embeds: [embed],
                components: [actionRow]
            });
            
            saveTribes(tribes); // Guardamos para registrar que hubo actividad
            return interaction.followUp({ content: '✅ Votación iniciada/actualizada en este canal.', flags: MessageFlags.Ephemeral });
        }
        
        // --- GESTIÓN DE MIEMBROS ---
        const targetUser = interaction.options.getUser('usuario');
        const targetMemberIndex = myTribeData.members.findIndex(m => m.discordId === targetUser.id);
        
        if (targetMemberIndex === -1) {
            return interaction.reply({ content: `❌ El usuario ${targetUser} no está en tu tribu.`, flags: MessageFlags.Ephemeral });
        }
        
        const targetMemberData = myTribeData.members[targetMemberIndex];

        // ==================================================================
        // 4. LÓGICA DE ASCENSO (/tribu ascender)
        // ==================================================================
        if (subcommand === 'ascender') {
            
            for (const m of myTribeData.members) {
                if (m.rango === 'Líder') {
                    m.rango = 'Miembro';
                    const oldLeaderMember = await interaction.guild.members.fetch(m.discordId).catch(() => null);
                    if (oldLeaderMember && leaderRole) await oldLeaderMember.roles.remove(leaderRole).catch(console.error);
                }
            }

            myTribeData.members[targetMemberIndex].rango = 'Líder';
            const targetMemberDiscord = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (targetMemberDiscord && leaderRole) await targetMemberDiscord.roles.add(leaderRole).catch(console.error);
            
            saveTribes(tribes);
            await updateLog(interaction.guild, interaction.client);
            
            // LOG AUDITORÍA
            if (logToTribe) await logToTribe(interaction.guild, myTribeData, '👑 CAMBIO DE LÍDER', `El liderazgo ha sido transferido a ${targetUser}.`);
            
            return interaction.reply(`👑 **¡Liderazgo traspasado!** **${targetUser}** es ahora el único Líder de **${myTribeName}**.`);
        }

        // ==================================================================
        // 5. LÓGICA DE KICK (Expulsar)
        // ==================================================================
        if (subcommand === 'kick') {
            
            if (targetUser.id === executorId) {
                return interaction.reply({ content: '❌ No puedes auto-expulsarte. Pide a otro líder que lo haga.', flags: MessageFlags.Ephemeral });
            }
            if (!isServerAdmin && targetMemberData.rango === 'Líder') {
                return interaction.reply({ content: '❌ No puedes expulsar a otro líder directamente. Debes usar el comando de votación.', flags: MessageFlags.Ephemeral });
            }

            const targetDiscordMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (targetDiscordMember) {
                const tribeRole = interaction.guild.roles.cache.find(r => r.name === myTribeName);
                if (tribeRole) await targetDiscordMember.roles.remove(tribeRole).catch(console.error);
                if (leaderRole) await targetDiscordMember.roles.remove(leaderRole).catch(console.error);
                if (unverifiedRole) await targetDiscordMember.roles.add(unverifiedRole).catch(console.error);
            }

            myTribeData.members.splice(targetMemberIndex, 1);
            saveTribes(tribes);
            await updateLog(interaction.guild, interaction.client);
            
            // LOG AUDITORÍA
            if (logToTribe) await logToTribe(interaction.guild, myTribeData, '👢 MIEMBRO EXPULSADO', `**${targetUser.tag}** ha sido expulsado de la tribu por la administración.`);
            
            return interaction.reply(`🔨 **${targetUser}** ha sido expulsado de la tribu **${myTribeName}**. Se le ha asignado el rol "No verificado".`);
        }
        
        return interaction.reply({ content: 'Error desconocido en subcomando.', ephemeral: true });
    },
};
const { Events, MessageFlags } = require('discord.js');
const { loadTribes, saveTribes } = require('../utils/tribes'); 
const { updateLog } = require('../utils/logger'); 
const { generateVoteEmbed } = require('../commands/tribu'); 
const config = require('../config.json'); 

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        
        // ==================================================================
        // 1. MANEJO DE AUTOCOMPLETADO (NUEVO CÓDIGO)
        // ==================================================================
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No se encontró comando para autocompletar: ${interaction.commandName}`);
                return;
            }

            try {
                if (command.autocomplete) {
                    await command.autocomplete(interaction);
                }
            } catch (error) {
                console.error('Error en autocomplete:', error);
            }
            return;
        }

        // ==================================================================
        // 2. MANEJO DE COMANDOS DE BARRA (/)
        // ==================================================================
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No se encontró el comando ${interaction.commandName}.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error al ejecutar el comando ${interaction.commandName}:`, error);
                const errorContent = { content: 'Hubo un error al ejecutar este comando.', flags: MessageFlags.Ephemeral };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorContent);
                } else {
                    await interaction.reply(errorContent);
                }
            }
            return;
        }

        // ==================================================================
        // 3. MANEJO DE VOTACIÓN INTERACTIVA (Select Menu)
        // ==================================================================
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tribe_vote_')) {
            const tribeName = interaction.customId.split('_')[2]; 
            const candidateId = interaction.values[0]; 
            const voterId = interaction.user.id;
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            let tribes = loadTribes();
            const myTribeData = tribes[tribeName];
            
            if (!myTribeData) {
                return interaction.followUp('❌ Error: La tribu ya no existe.');
            }

            // 1. Validar que el votante es miembro
            const isVoterInTribe = myTribeData.members.some(m => m.discordId === voterId);
            if (!isVoterInTribe) {
                 return interaction.followUp('❌ No puedes votar, no eres miembro de esta tribu.');
            }
            
            // 2. Registrar el voto secreto
            if (!myTribeData.votes) myTribeData.votes = {};
            myTribeData.votes[voterId] = candidateId; 
            
            // 3. Calcular umbral de victoria
            const totalVotesForCandidate = Object.values(myTribeData.votes).filter(id => id === candidateId).length;
            const totalMembers = myTribeData.members.length;
            const votesNeeded = Math.floor(totalMembers / 2) + 1;
            
            // 4. Lógica de Golpe de Estado (Victoria)
            if (totalVotesForCandidate >= votesNeeded) {
                const guild = interaction.guild;
                const leaderRole = guild.roles.cache.find(r => r.name === config.roles.leader);
                
                // Limpiar líderes anteriores y asignar rol
                for (const m of myTribeData.members) {
                    if (m.rango === 'Líder') {
                        m.rango = 'Miembro';
                        const oldLeaderMember = await guild.members.fetch(m.discordId).catch(() => null);
                        if (oldLeaderMember && leaderRole) await oldLeaderMember.roles.remove(leaderRole).catch(console.error);
                    }
                }
                
                // Asignar Liderazgo al ganador
                const winnerMemberIndex = myTribeData.members.findIndex(m => m.discordId === candidateId);
                myTribeData.members[winnerMemberIndex].rango = 'Líder';
                const newLeaderMember = await guild.members.fetch(candidateId).catch(() => null);
                if (newLeaderMember && leaderRole) await newLeaderMember.roles.add(leaderRole).catch(console.error);

                myTribeData.votes = {}; // Borrar votos tras la victoria
                saveTribes(tribes);
                await updateLog(guild, interaction.client);

                // Anuncio público en el canal de la tribu
                interaction.channel.send(`🚨 **¡GOLPE DE ESTADO en ${tribeName}!** 🚨\n\nCon **${totalVotesForCandidate}** votos (Mayoría absoluta), el poder ha cambiado de manos.\n👑 **Nuevo Líder:** <@${candidateId}>.`);

                // Actualizar el Embed con el resultado final
                const { embed, actionRow } = generateVoteEmbed(myTribeData, tribeName, interaction.client);
                await interaction.message.edit({ embeds: [embed], components: [actionRow] });

                return interaction.deleteReply(); // Borrar respuesta temporal
                
            } else {
                // 5. No hay victoria, actualizar el embed con el nuevo voto
                saveTribes(tribes);

                const { embed, actionRow } = generateVoteEmbed(myTribeData, tribeName, interaction.client);
                
                await interaction.message.edit({ embeds: [embed], components: [actionRow] });

                return interaction.followUp(`✅ Tu voto por **<@${candidateId}>** ha sido registrado. Faltan **${votesNeeded - totalVotesForCandidate}** votos para la victoria.`);
            }
        }
    },
};
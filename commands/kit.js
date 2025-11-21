const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { loadTribes, saveTribes } = require('../utils/tribes');
const { updateLog } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kit')
        .setDescription('Marca si un usuario ha recibido o no su kit inicial.')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario a actualizar.')
                .setRequired(true))
        .addStringOption(option => // 💡 Tipo String para usar emojis/texto
            option.setName('estado')
                .setDescription('Selecciona el estado del kit.')
                .setRequired(true)
                .addChoices( // 💡 Opciones con emojis
                    { name: '✅ Entregado', value: 'true' },
                    { name: '❌ Pendiente', value: 'false' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario');
        // El valor retornado será 'true' o 'false' (string), lo convertimos a booleano.
        const isDelivered = interaction.options.getString('estado') === 'true'; 
        
        const tribes = loadTribes();
        let found = false;
        let tribeFound = null;

        for (const tribeName in tribes) {
            const memberIndex = tribes[tribeName].members.findIndex(m => m.discordId === targetUser.id);
            
            if (memberIndex !== -1) {
                // Aplicar el estado booleano
                tribes[tribeName].members[memberIndex].hasKit = isDelivered;
                found = true;
                tribeFound = tribeName;
                break;
            }
        }

        if (!found) {
            return interaction.reply({ 
                content: `❌ El usuario ${targetUser} no está registrado en ninguna tribu.`, 
                flags: MessageFlags.Ephemeral
            });
        }

        saveTribes(tribes);
        await updateLog(interaction.guild, interaction.client);

        const statusText = isDelivered ? '✅ Entregado' : '❌ Pendiente';
        
        return interaction.reply({ 
            content: `**Estado de Kit Actualizado:** El estado de kit de ${targetUser} (Tribu: ${tribeFound}) ahora es **${statusText}**.`
        });
    },
};
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { loadTribes, saveTribes } = require('../utils/tribes');
const { updateLog } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setid')
        .setDescription('👮 ADMIN: Cambia manualmente el ID de PlayStation de un usuario.')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario a corregir')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('nuevo_id')
                .setDescription('El ID de PlayStation correcto')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario');
        const newId = interaction.options.getString('nuevo_id');
        const tribes = loadTribes();
        
        let found = false;
        let tribeNameFound = null;

        // Buscar y actualizar en todas las tribus
        for (const tName in tribes) {
            const member = tribes[tName].members.find(m => m.discordId === targetUser.id);
            if (member) {
                member.idPlay = newId; // Actualizamos el ID
                tribeNameFound = tName;
                found = true;
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
        // Actualizamos el log global para que refleje el cambio inmediatamente
        await updateLog(interaction.guild, interaction.client);

        return interaction.reply({ 
            content: `✅ **ID Actualizado:** El ID de ${targetUser} (Tribu: ${tribeNameFound}) ha sido cambiado a: \`${newId}\`.`
        });
    },
};
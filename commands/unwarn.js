const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { removeWarning } = require('../utils/warnings');
const { loadTribes } = require('../utils/tribes'); // IMPORTANTE

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Remueve una advertencia (puntos) a un usuario o tribu.')
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de advertencia a remover')
                .setRequired(true)
                .addChoices(
                    { name: 'Leve (-1 punto)', value: 'leve' },
                    { name: 'Media (-2 puntos)', value: 'media' },
                    { name: 'Grave (-4 puntos)', value: 'grave' }
                ))
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a quitar el warn (Individual)')
                .setRequired(false))
        .addRoleOption(option => 
            option.setName('rol_tribu')
                .setDescription('Menciona el rol de la tribu para quitar puntos colectivos')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('nombre_tribu')
                .setDescription('Escribir el nombre de la tribu manualmente')
                .setAutocomplete(true) // <--- ACTIVADO
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), 

    // --- LÓGICA DE AUTOCOMPLETADO ---
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const tribes = loadTribes();
        const choices = Object.keys(tribes);
        
        const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
        
        await interaction.respond(
            filtered.slice(0, 25).map(choice => ({ name: choice, value: choice })),
        );
    },

    async execute(interaction) {
        const warningType = interaction.options.getString('tipo');
        const targetUser = interaction.options.getUser('usuario');
        const targetRole = interaction.options.getRole('rol_tribu');
        const targetString = interaction.options.getString('nombre_tribu');
        
        const inputs = [targetUser, targetRole, targetString].filter(i => i !== null);
        
        if (inputs.length !== 1) {
            return interaction.reply({ 
                content: '❌ Por favor, elige **solo uno**: un usuario, un rol de tribu O un nombre de tribu para remover la advertencia.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let result;

        if (targetUser) {
            result = await removeWarning(interaction.guild, 'member', targetUser.id, warningType);
        } else {
            const tribeName = targetRole ? targetRole.name : targetString;
            result = await removeWarning(interaction.guild, 'tribe', tribeName, warningType);
        }
        
        if (result.success) {
            await interaction.followUp(`💚 Advertencia removida con éxito. ${result.message}`);
        } else {
            await interaction.followUp(`❌ Error al remover la advertencia: ${result.message}`);
        }
    },
};
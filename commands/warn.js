const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { applyWarning, BAN_THRESHOLD } = require('../utils/warnings');
const { loadTribes } = require('../utils/tribes'); // IMPORTANTE: Cargar tribus para la lista

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Aplica una advertencia a un usuario o tribu.')
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de advertencia')
                .setRequired(true)
                .addChoices(
                    { name: 'Leve (+1 punto)', value: 'leve' },
                    { name: 'Media (+2 puntos)', value: 'media' },
                    { name: 'Grave (+4 puntos)', value: 'grave' }
                ))
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a advertir (Individual)')
                .setRequired(false))
        .addRoleOption(option => 
            option.setName('rol_tribu')
                .setDescription('Menciona el rol de la tribu para advertir a todos')
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
        
        // Filtrar tribus que contengan lo que el usuario escribe
        const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()));
        
        // Discord permite máximo 25 opciones
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
                content: '❌ Por favor, elige **solo uno**: un usuario, un rol de tribu O un nombre de tribu.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let result;

        if (targetUser) {
            result = await applyWarning(interaction.guild, 'member', targetUser.id, warningType);
        } else {
            const tribeName = targetRole ? targetRole.name : targetString;
            result = await applyWarning(interaction.guild, 'tribe', tribeName, warningType);
        }
        
        if (result.banned) {
            await interaction.followUp(`🚨 **¡BANEADO!** El objetivo ha superado el umbral de **${BAN_THRESHOLD}** puntos. ${result.message}`);
        } else if (result.success) {
            await interaction.followUp(`✅ Advertencia aplicada. ${result.message}`);
        } else {
            await interaction.followUp(`❌ Error: ${result.message}`);
        }
    },
};
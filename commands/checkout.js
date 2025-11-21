const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logHistoricalData } = require('../utils/historyLogger'); 
const { loadConfig } = require('../utils/configManager'); 

// Función que construye el objeto SlashCommandData. Recibe las opciones de temporadas.
const createData = (seasonChoices = []) => {
    return new SlashCommandBuilder()
        .setName('checkout')
        .setDescription('💾 Consulta el registro de tribus de una Season archivada.')
        .addStringOption(option => option.setName('season_number')
            .setDescription('El número de Season a consultar.')
            .setRequired(true)
            .addChoices(...seasonChoices)) // INYECCIÓN DINÁMICA
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
};

// Exportamos la función createData para que deploy-commands.js la use
module.exports = {
    createData,
    data: createData(), // Objeto base para el runtime

    async execute(interaction) {
        // VERIFICACIÓN DE PERMISOS (aunque ya está en data, es buena práctica)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '❌ Solo los **Administradores** pueden consultar registros históricos.', 
                ephemeral: true 
            });
        }

        const seasonNumber = interaction.options.getString('season_number');
        await interaction.deferReply(); 

        try {
            const historyEmbeds = logHistoricalData(seasonNumber);
            
            if (!historyEmbeds || historyEmbeds.length === 0) {
                return interaction.editReply(`❌ No se encontraron datos para la Season ${seasonNumber}.`);
            }

            return interaction.editReply({ 
                content: `📜 **REGISTRO ARCHIVADO:** Temporada ${seasonNumber}`,
                embeds: historyEmbeds,
            });

        } catch (error) {
            console.error(`Error al procesar checkout para Season ${seasonNumber}:`, error);
            return interaction.editReply('❌ Hubo un error al leer los datos de la temporada. Revisa los logs.');
        }
    },
};
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { loadConfig, saveConfig } = require('../utils/configManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createprotected')
        .setDescription('Crea un rol especial, lo asigna y lo protege del reinicio de Season.')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario que recibirá el rol')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('nombre_rol')
                .setDescription('El nombre del nuevo rol (Ej: Ganador Evento PVP)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('color')
                .setDescription('Color en Hexadecimal (Ej: #FF0000) o nombre en inglés (Gold, Red)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // 1. Recoger datos
        const targetMember = interaction.options.getMember('usuario'); // Usamos getMember para poder asignar roles
        const roleName = interaction.options.getString('nombre_rol');
        const roleColor = interaction.options.getString('color') || 'Gold'; // Color por defecto

        // Validación básica
        if (!targetMember) {
            return interaction.reply({ content: '❌ El usuario no está en el servidor.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        try {
            const guild = interaction.guild;

            // 2. Crear el Rol en Discord
            // Le ponemos posición 0 para que se cree abajo y no rompa la jerarquía, luego el admin lo sube si quiere
            const newRole = await guild.roles.create({
                name: roleName,
                color: roleColor,
                reason: `Rol protegido creado por ${interaction.user.tag} mediante comando`,
                permissions: [] // Sin permisos administrativos por seguridad
            });

            // 3. Asignar el Rol al usuario
            await targetMember.roles.add(newRole);

            // 4. Guardar en la Lista Blanca (Configuración)
            const currentConfig = loadConfig();
            
            if (currentConfig) {
                // Asegurar que la estructura existe
                if (!currentConfig.roles.protected) {
                    currentConfig.roles.protected = [];
                }

                // Evitar duplicados en la lista
                if (!currentConfig.roles.protected.includes(roleName)) {
                    currentConfig.roles.protected.push(roleName);
                    
                    const saved = saveConfig(currentConfig);
                    
                    if (saved) {
                        await interaction.editReply(`✅ **¡Operación Completada!**\n\n🎨 **Rol creado:** \`${newRole.name}\`\n👤 **Asignado a:** ${targetMember}\n🛡️ **Protección:** Activada (No se borrará en la próxima Season).`);
                    } else {
                        await interaction.editReply(`⚠️ El rol se creó y asignó, pero **falló al guardar en config.json**. Por favor, añádelo manualmente a la lista "protected".`);
                    }
                } else {
                    await interaction.editReply(`✅ El rol **${newRole.name}** se ha creado y asignado. (Ya estaba en la lista de protegidos).`);
                }
            } else {
                await interaction.editReply(`❌ Error crítico: No se pudo leer el archivo de configuración.`);
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ **Error:** ${error.message}\n*(Verifica que el color sea válido y que el bot tenga permisos)*.`);
        }
    },
};
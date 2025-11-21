const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadTribes, saveTribes } = require('../utils/tribes');
const { loadMetadata, saveMetadata } = require('../utils/metadata');
const { updateLog } = require('../utils/logger');
const { loadConfig } = require('../utils/configManager');
const { iniciarRegistro } = require('../events/guildMemberAdd'); 

const HISTORY_DIR = path.join(__dirname, '..', 'data', 'history');
const TRIBES_FILE = path.join(__dirname, '..', 'data', 'tribes.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('newseason')
        .setDescription('🚀 Inicia una nueva season: WIPE TOTAL de roles no protegidos y reinicio.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guild = interaction.guild;
        
        const config = loadConfig();
        if (!config) return interaction.followUp({ content: '❌ Error crítico: No se pudo leer config.json.', flags: MessageFlags.Ephemeral });
        
        const unverifiedRole = guild.roles.cache.find(r => r.name === config.roles.unverified);
        const survivorRole = guild.roles.cache.find(r => r.name === config.roles.survivor);
        let leaderRole = guild.roles.cache.find(r => r.name === config.roles.leader);

        if (!leaderRole) {
            try {
                leaderRole = await guild.roles.create({
                    name: config.roles.leader,
                    color: 'Gold',
                    permissions: [],
                    reason: 'Restaurado por New Season'
                });
            } catch (error) { console.error(error); }
        }
        
        if (!unverifiedRole || !survivorRole) return interaction.followUp({ content: '❌ Faltan roles base.', flags: MessageFlags.Ephemeral });
        
        // 1. GESTIÓN DE DATOS Y BACKUP
        const metadata = loadMetadata();
        const oldSeason = metadata.season;
        metadata.season += 1;
        const newSeason = metadata.season;

        if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
        const oldTribesData = loadTribes();
        
        if (Object.keys(oldTribesData).length > 0) {
            // Archivo histórico de la season
            fs.copyFileSync(TRIBES_FILE, path.join(HISTORY_DIR, `season_${oldSeason}.json`));
            
            // --- NUEVO: BACKUP DE SEGURIDAD PRE-WIPE ---
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(TRIBES_FILE, path.join(HISTORY_DIR, `BACKUP_SAFETY_${timestamp}.json`));
            console.log(`📦 Backup de seguridad creado: BACKUP_SAFETY_${timestamp}.json`);
        }

        saveTribes({});
        saveMetadata(metadata);

        // 2. AMNISTÍA DE BANEOS
        let unbannedCount = 0;
        try {
            const bans = await guild.bans.fetch();
            await interaction.editReply(`🔎 Procesando Season ${newSeason}... Limpiando baneos...`);
            for (const [userId, ban] of bans) {
                if (ban.reason && ban.reason.includes('[SISTEMA DE WARNS]')) {
                    await guild.bans.remove(userId, `Amnistía Season ${newSeason}`);
                    unbannedCount++;
                }
            }
        } catch (e) {}

        // ==================================================================
        // 3. WIPE TOTAL DE ROLES (LÓGICA DE LISTA BLANCA)
        // ==================================================================
        let rolesDeleted = 0;
        let membersReset = 0;

        await interaction.editReply(`🔥 **Purgando roles sobrantes del servidor...**`);

        const allRoles = await guild.roles.fetch();
        const safeRoleIds = new Set([
            guild.id, 
            unverifiedRole.id, 
            survivorRole.id, 
            leaderRole ? leaderRole.id : null
        ]);

        const rolesToDelete = allRoles.filter(role => {
            if (safeRoleIds.has(role.id)) return false;
            if (role.managed) return false;
            if (role.permissions.has(PermissionFlagsBits.Administrator)) return false;
            if (config.roles.protected && config.roles.protected.includes(role.name)) return false;
            return true;
        });

        for (const [id, role] of rolesToDelete) {
            try {
                await role.delete(`Wipe de Season ${newSeason}`).catch(e => console.log(`⚠️ Skip ${role.name}: Jerarquía superior o error.`));
                rolesDeleted++;
            } catch (e) { console.error(`Error borrando ${role.name}`); }
        }

        // ==================================================================
        // 4. LIMPIEZA DE USUARIOS Y REGISTRO MASIVO
        // ==================================================================
        await interaction.editReply(`⚙️ Reseteando usuarios e iniciando registros...`);

        let members;
        try {
            members = await guild.members.fetch({ time: 60000 });
        } catch (error) {
            console.log("⚠️ Timeout. Usando caché.");
            members = guild.members.cache;
        }

        let delayCounter = 0;

        for (const member of members.values()) {
            if (member.user.bot) continue; 
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.some(r => r.name === 'ADMIN');
            if (isAdmin) continue; 

            const userRoles = member.roles.cache;
            const rolesToStrip = userRoles.filter(role => {
                if (role.id === guild.id) return false;
                if (role.managed) return false;
                if (config.roles.protected && config.roles.protected.includes(role.name)) return false;
                return true; 
            });

            let needsRegister = false;

            if (rolesToStrip.size > 0) {
                await member.roles.remove(rolesToStrip).catch(() => {});
                await member.roles.add(unverifiedRole).catch(() => {});
                membersReset++;
                needsRegister = true;
            } else if (!member.roles.cache.has(unverifiedRole.id)) {
                await member.roles.add(unverifiedRole).catch(() => {});
                membersReset++;
                needsRegister = true;
            }

            if (needsRegister) {
                setTimeout(() => {
                    iniciarRegistro(member).catch(e => console.log(`Error registro auto ${member.user.tag}: ${e.message}`));
                }, delayCounter * 2000);
                delayCounter++;
            }
        }

        // 5. REINICIO DE CATEGORÍA
        await interaction.editReply(`🔥 **Purgando canales...**`);
        const tribeCategory = guild.channels.cache.find(c => c.name === config.categories.tribes && c.type === ChannelType.GuildCategory);
        let savedPosition = null; 

        if (tribeCategory) {
            savedPosition = tribeCategory.position;
            try {
                const channels = tribeCategory.children.cache;
                for (const [id, channel] of channels) await channel.delete('Reinicio de Season');
                await tribeCategory.delete('Reinicio de Season');
            } catch (error) { console.error(error); }
        }

        try {
            await guild.channels.create({
                name: config.categories.tribes,
                type: ChannelType.GuildCategory,
                position: savedPosition,
                permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
            });
        } catch (error) { console.error(error); }

        // 6. FINALIZACIÓN
        await updateLog(guild, interaction.client);

        await interaction.editReply({ 
            content: `✅ **Operación completada.**\nLogs internos:\n- Desbaneados: ${unbannedCount}\n- Roles purgados (Total): ${rolesDeleted}\n- Usuarios reseteados: ${membersReset}\n- **Registros lanzados:** ${delayCounter}\n- **Backup:** Creado en /history`,
            flags: MessageFlags.Ephemeral
        });

        const publicEmbed = new EmbedBuilder()
            .setTitle(`🚀 ¡NUEVA SEASON ${newSeason} INICIADA!`)
            .setDescription(`El servidor ha sido reiniciado.`)
            .setColor('#00FF00') 
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '📅 Season', value: `${newSeason}`, inline: true },
                { name: '📝 Estado', value: 'Registros Abiertos', inline: true },
                { name: '⚠️ Atención', value: 'Se os ha abierto un canal privado para registraros de nuevo.' }
            )
            .setFooter({ text: 'Sistema Automático de Seasons' })
            .setTimestamp();

        await interaction.channel.send({ content: '@everyone', embeds: [publicEmbed] });
    },
};
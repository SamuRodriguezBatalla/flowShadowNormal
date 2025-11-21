const { Events, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { loadTribes, saveTribes } = require('../utils/tribes');
const { updateLog } = require('../utils/logger');
const { iniciarRegistro } = require('./guildMemberAdd');
const { loadConfig } = require('../utils/configManager'); 

// Variable para evitar que se solapen ejecuciones si hay lag
let isSyncing = false;

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`✅ Bot iniciado como ${client.user.tag}`);

        // 1. Ejecución inicial inmediata
        await ejecutarSincronizacionGlobal(client);

        // 2. Bucle infinito (Cada 5 minutos)
        setInterval(async () => {
            if (!isSyncing) {
                await ejecutarSincronizacionGlobal(client);
            } else {
                console.log("⚠️ Saltando ciclo de sincronización: El anterior aún no ha terminado.");
            }
        }, 300000); 
    },
};

async function ejecutarSincronizacionGlobal(client) {
    isSyncing = true;
    try {
        for (const guild of client.guilds.cache.values()) {
            await sincronizarTodo(guild, client);
        }
    } catch (error) {
        console.error("Error en el ciclo de sincronización:", error);
    } finally {
        isSyncing = false;
    }
}

// =========================================================
// FUNCIÓN AUXILIAR: LIMPIEZA DE CANALES ZOMBIE Y ESTANCADOS (MODIFICADA)
// =========================================================
async function cleanupRegistrationChannels(guild) {
    const config = loadConfig ? loadConfig() : guild.client.config; 
    const regCategory = guild.channels.cache.find(c => c.name === config.categories.registration && c.type === ChannelType.GuildCategory);
    const survivorRole = guild.roles.cache.find(r => r.name === config.roles.survivor);
    
    if (!regCategory) return 0;

    let deletedCount = 0;
    // 30 minutos es un tiempo prudente para considerar que un registro está abandonado
    const THIRTY_MINUTES_AGO = Date.now() - (30 * 60 * 1000); 
    
    // Filtramos canales que están en la categoría de registro y empiezan por 'registro-'
    const channelsToScan = guild.channels.cache.filter(c => 
        c.parentId === regCategory.id && c.type === ChannelType.GuildText && c.name.startsWith('registro-')
    );

    for (const channel of channelsToScan.values()) {
        
        // Buscamos el permiso de sobrescritura para encontrar al dueño del canal
        const targetUserOverwrite = channel.permissionOverwrites.cache.find(ow => 
             ow.type === 1 && guild.members.cache.has(ow.id) && ow.allow.has(PermissionFlagsBits.ViewChannel)
        );

        if (targetUserOverwrite) {
            const targetMember = guild.members.cache.get(targetUserOverwrite.id);
            const isVerified = targetMember && survivorRole && targetMember.roles.cache.has(survivorRole.id);
            const isStale = channel.createdAt && channel.createdAt.getTime() < THIRTY_MINUTES_AGO;
            
            // Condición 1: Canal Zombie (Usuario verificado)
            if (isVerified) {
                await channel.delete('Canal zombie: Usuario ya registrado.').catch(console.error);
                deletedCount++;
                continue; 
            } 
            
            // Condición 2: Canal ESTANCADO (No verificado Y viejo)
            // Esto corrige el problema de los canales que sobreviven al reinicio/abandono del registro.
            if (!isVerified && isStale) {
                await channel.delete('Canal estancado: Registro iniciado hace más de 30 min y no completado.').catch(console.error);
                deletedCount++;
                continue;
            }
        } else if (channel.createdAt && channel.createdAt.getTime() < THIRTY_MINUTES_AGO) {
            // Condición 3: Canal sin dueño (el miembro salió o fue expulsado sin limpiar) Y es viejo
            await channel.delete('Canal zombie sin dueño: Estancado.').catch(console.error);
            deletedCount++;
        }
    }
    return deletedCount;
}


async function sincronizarTodo(guild, client) {
    console.log(`🔄 [Auto-Sync] Revisando estado del servidor: ${guild.name}...`);

    // 1. CARGA MASIVA DE DATOS
    await guild.members.fetch(); 
    await guild.roles.fetch();   
    const bans = await guild.bans.fetch().catch(() => new Map());
    
    let tribes = loadTribes();
    let changesMade = false;
    let newUsersFound = 0;
    const tribesToRemove = []; 

    // --- FASE DE LIMPIEZA (Canales Zombie y Estancados) ---
    const deletedZombies = await cleanupRegistrationChannels(guild);
    if (deletedZombies > 0) {
        console.log(`🧹 [Auto-Sync] Limpiados ${deletedZombies} canales de registro cerrados/estancados.`);
    }
    // ----------------------------------------------

    // Roles clave
    const config = client.config;
    const unverifiedRole = guild.roles.cache.find(r => r.name === config.roles.unverified);
    const survivorRole = guild.roles.cache.find(r => r.name === config.roles.survivor);
    
    if (!unverifiedRole) {
        console.error("❌ Error: No existe el rol 'No verificado'.");
        return;
    }

    // Preparación de datos de la DB
    const cleanTribes = loadTribes();
    const cleanTribeNames = Object.keys(cleanTribes);
    const registeredIds = new Set();
    for (const t in cleanTribes) {
        cleanTribes[t].members.forEach(m => registeredIds.add(m.discordId));
    }

    // =====================================================
    // FASE 1: PURGA DE TRIBUS Y MIEMBROS FANTASMA
    // ... (Tu código de purga de tribus es correcto, no se toca)
    // =====================================================
    for (const tName of Object.keys(tribes)) {
        const tribe = tribes[tName];
        const tribeRole = guild.roles.cache.find(r => r.name === tName);

        // A. Verificar si la tribu está "muerta"
        const roleExistsAndEmpty = tribeRole && tribeRole.members.size === 0;
        const roleDoesNotExist = !tribeRole;

        if (roleExistsAndEmpty || roleDoesNotExist) {
            console.log(`📉 Auto-limpieza: Tribu vacía "${tName}". Eliminando...`);
            tribesToRemove.push(tName);
            
            if (tribeRole) await tribeRole.delete('Auto-Sync: Rol vacío.').catch(() => {});
            if (tribe.channelId) {
                const channel = guild.channels.cache.get(tribe.channelId);
                if (channel) await channel.delete('Auto-Sync: Tribu vacía.').catch(() => {});
            }
            continue; 
        }

        // B. Verificar miembros fantasma (En JSON pero no en Discord)
        const activeMembers = [];
        for (const memberData of tribe.members) {
            const sigueEnElServidor = guild.members.cache.has(memberData.discordId);

            if (!sigueEnElServidor) {
                changesMade = true;
                console.log(`👻 Auto-limpieza: Usuario fantasma ${memberData.username} sacado de ${tName}`);

                const isBanned = bans.has(memberData.discordId);
                const channel = isBanned ? guild.channels.cache.find(c => c.name === config.channels.ban_notifications) : guild.channels.cache.find(c => c.name === config.channels.goodbye);

                if (channel) {
                    const message = isBanned ? `🛑 **Sincronización:** Detectado baneo offline de **${memberData.username}**.` : `👋 **Sincronización:** **${memberData.username}** ya no está en el servidor.`;
                    channel.send(message).catch(() => {});
                }
            } else {
                activeMembers.push(memberData);
            }
        }
        tribe.members = activeMembers;
        
        if (tribe.members.length === 0 && !tribesToRemove.includes(tName)) {
            tribesToRemove.push(tName);
        }
    }

    for (const tName of tribesToRemove) {
        delete tribes[tName];
        changesMade = true;
    }

    if (changesMade) {
        saveTribes(tribes);
        await updateLog(guild, client); 
    }
    
    // =====================================================
    // FASE 2: INICIAR REGISTRO Y POLICÍA DE ROLES A MIEMBROS EXISTENTES
    // =====================================================
    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;

        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || 
                         member.roles.cache.some(r => r.name === 'ADMIN');
        if (isAdmin) continue;
        
        const isRegisteredInDb = registeredIds.has(member.id);
        const hasUnverifiedRole = member.roles.cache.has(unverifiedRole.id);

        // 1. Policía de Roles 
        const hasTribeRole = member.roles.cache.some(role => cleanTribeNames.includes(role.name));
        const hasOtherRoles = member.roles.cache.filter(r => r.id !== guild.id && r.id !== unverifiedRole.id).size > 0;

        if (hasTribeRole && !isRegisteredInDb) {
            console.log(`⚠️ ${member.user.tag} tiene rol de tribu pero no está en DB. Reseteando...`);
            await member.roles.remove(member.roles.cache.filter(r => cleanTribeNames.includes(r.name))).catch(() => {});
        }
        
        if (!isRegisteredInDb) {
            if (hasOtherRoles && !hasTribeRole) {
                 console.log(`🧹 Auto-Sync: Limpiando roles a ${member.user.tag} (Sin tribu).`);
                 await member.roles.set([unverifiedRole.id]).catch(() => {});
            } else if (!hasUnverifiedRole) {
                await member.roles.add(unverifiedRole).catch(() => {});
            }
        }
        
        const finalHasUnverifiedRole = member.roles.cache.has(unverifiedRole.id);
        
        // 2. Comprobación de canal abierto (usando el sufijo de ID, que es el más fiable)
        const hasOpenChannel = guild.channels.cache.some(c => 
            c.type === ChannelType.GuildText &&
            c.name.includes(`-${member.id.slice(-4)}`)
        );
        
        // 3. Lógica de INICIO de REGISTRO
        if (finalHasUnverifiedRole && !isRegisteredInDb && !hasOpenChannel) {
            console.log(`📢 Auto-Sync: Iniciando registro para ${member.user.tag} (Rol No Verificado).`);
            
            // Retraso para evitar inundar el log o la API
            await new Promise(resolve => setTimeout(resolve, 500)); 
            
            await iniciarRegistro(member).catch(e => console.error(`Error registro auto para ${member.user.tag}: ${e.message}`));
            newUsersFound++;
        }
    }

    if (changesMade || newUsersFound > 0) {
        console.log(`✅ [Auto-Sync] Ciclo finalizado. Cambios realizados. Registros iniciados: ${newUsersFound}`);
    } else {
        console.log(`✅ [Auto-Sync] Servidor limpio.`);
    }
}
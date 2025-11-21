// utils/warnings.js
const { loadTribes, saveTribes } = require('./tribes');
const { updateLog } = require('./logger');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.json'); 
const { WARNING_POINTS, BAN_THRESHOLD } = require('./constants');

/**
 * Banea a un miembro individual y envía notificación al canal de baneos y al canal de la tribu.
 */
async function banMember(guild, memberId, reason) {
    const member = await guild.members.fetch(memberId).catch(() => null);
    
    // Canales de notificación
    const banChannel = guild.channels.cache.find(c => c.name === config.channels.ban_notifications);
    
    if (member) {
        // 1. NOTIFICACIÓN AL LOG GLOBAL (Para Admins)
        if (banChannel) {
            const banEmbed = new EmbedBuilder()
                .setColor('#FF0000') 
                .setTitle('🛑 MIEMBRO BANEADO POR EL SISTEMA')
                .setDescription(`**Usuario:** ${member.user.tag} (${member.id})\n**Razón:** ${reason}`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({ text: 'Sistema de Advertencias Automatizado' });
                
            await banChannel.send({ embeds: [banEmbed] }).catch(console.error);
        }

        // 2. NOTIFICACIÓN A LA TRIBU
        const tribes = loadTribes();
        let tribeData = null;

        for (const tName in tribes) {
            const found = tribes[tName].members.find(m => m.discordId === memberId);
            if (found) {
                tribeData = tribes[tName];
                break;
            }
        }
        
        if (tribeData && tribeData.channelId) {
            const tribeChannel = guild.channels.cache.get(tribeData.channelId);
            if (tribeChannel) {
                const tribeAlertEmbed = new EmbedBuilder()
                    .setColor('#8B0000') // Rojo oscuro
                    .setTitle('💀 BAJA EN LA TRIBU')
                    .setDescription(`Un miembro de vuestra tribu ha sido **BANEADO** del servidor.`)
                    .addFields(
                        { name: '👤 Miembro', value: `${member.user.tag}`, inline: true },
                        { name: '📝 Motivo', value: reason, inline: true }
                    )
                    .setFooter({ text: 'El cumplimiento de las normas es responsabilidad de todos.' })
                    .setTimestamp();

                await tribeChannel.send({ content: '@here', embeds: [tribeAlertEmbed] }).catch(console.error);
            }
        }
        
        // 3. EJECUTAR EL BANEO
        await member.ban({ reason: `[SISTEMA DE WARNS] ${reason}` }).catch(console.error);
        return true;
    }
    return false;
}

/**
 * Banea a todos los miembros de una tribu y borra el rol.
 */
async function banTribe(guild, tribeName, reason) {
    const tribes = loadTribes();
    const tribe = tribes[tribeName];
    let banCount = 0;

    if (!tribe) return false;

    for (const m of tribe.members) {
        const isBanned = await banMember(guild, m.discordId, `BANEO DE TRIBU COMPLETO: ${tribeName} - ${reason}`);
        if (isBanned) banCount++;
    }

    const tribeRole = guild.roles.cache.find(r => r.name === tribeName);
    if (tribeRole) {
        await tribeRole.delete(`Tribu ${tribeName} baneada por ${reason}`).catch(console.error);
    }

    delete tribes[tribeName];
    saveTribes(tribes);

    return banCount > 0;
}

/**
 * Envía la notificación de advertencia al canal privado de la tribu.
 */
async function sendTribeWarningNotification(guild, tribeName, warningType, points, totalScore, isTribeWarn, targetUsername = null, isRemoval = false) {
    const tribes = loadTribes(); 
    const tribeData = tribes[tribeName];

    if (!tribeData || !tribeData.channelId) return;

    const tribeChannel = guild.channels.cache.get(tribeData.channelId);
    if (!tribeChannel) return;
    
    const actionColor = isRemoval ? '#3CB371' : (isTribeWarn ? '#FFA500' : '#8A2BE2'); // Verde para quitar, Naranja/Púrpura para poner
    const actionTitle = isRemoval ? '✅ SANCIÓN RETIRADA' : (isTribeWarn ? '⚠️ ADVERTENCIA COLECTIVA' : '⚠️ ADVERTENCIA PERSONAL');
    const pointsSign = isRemoval ? '-' : '+';
    
    const embed = new EmbedBuilder()
        .setColor(actionColor)
        .setTitle(actionTitle)
        .setDescription(isTribeWarn 
            ? `La tribu ha recibido un ${isRemoval ? 'ajuste favorable.' : 'sanción directa por **' + warningType + '**.'}`
            : `${targetUsername} ha recibido un ${isRemoval ? 'ajuste' : 'sanción individual'}.`
        )
        .addFields(
            { name: 'Tipo de Falta', value: warningType.toUpperCase(), inline: true },
            { name: `Puntos ${isRemoval ? 'Restados' : 'Sumados'}`, value: `${pointsSign}${points}`, inline: true },
            { name: isTribeWarn ? 'Puntos Tribu Total' : 'Puntos Efectivos Total', value: `${totalScore} / ${BAN_THRESHOLD}`, inline: true }
        )
        .setFooter({ text: `Tribu: ${tribeName}` })
        .setTimestamp();

    await tribeChannel.send({ embeds: [embed] }).catch(console.error);
}


/**
 * Aplica una advertencia a un miembro o tribu y verifica el umbral de baneo.
 */
async function applyWarning(guild, targetType, targetId, warningType) {
    const points = WARNING_POINTS[warningType];
    const tribes = loadTribes();
    let isBanned = false;
    let tribeName = null;
    let totalWarnings = 0; 
    let member = null; 
    let targetUsername = null;

    if (!points) {
        return { success: false, message: 'Tipo de advertencia no válido.' };
    }

    // Obtener Target Username para las notificaciones
    if (targetType === 'member') {
        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        targetUsername = targetMember ? targetMember.user.tag : 'Usuario Desconocido';
    } else {
        tribeName = targetId;
    }


    if (targetType === 'tribe') {
        tribeName = targetId;
        const tribe = tribes[tribeName];

        if (!tribe) return { success: false, message: `La tribu "${tribeName}" no existe.` };

        // 1. Aplicar puntos
        tribe.warnings = (tribe.warnings || 0) + points;
        const currentTribeWarnings = tribe.warnings;
        
        // --- NOTIFICACIÓN DE ADVERTENCIA COLECTIVA ---
        await sendTribeWarningNotification(guild, tribeName, warningType, points, currentTribeWarnings, true);
        // ----------------------------------------------------

        // 2. Comprobar baneo
        if (currentTribeWarnings >= BAN_THRESHOLD) {
            isBanned = await banTribe(guild, tribeName, `Tribu supera ${BAN_THRESHOLD} puntos`);
        } 
        
        // 3. Aplicar herencia (y comprobar baneo individual por herencia)
        tribe.members.forEach(m => {
            const totalMemberWarnings = (m.warnings || 0) + currentTribeWarnings;
            
            if (totalMemberWarnings >= BAN_THRESHOLD && !isBanned) {
                banMember(guild, m.discordId, `Baneo individual por herencia de tribu (${totalMemberWarnings})`);
            }
        });


    } else if (targetType === 'member') {
        const memberId = targetId;
        
        for (const tName in tribes) {
            const index = tribes[tName].members.findIndex(m => m.discordId === memberId);
            if (index !== -1) {
                tribeName = tName;
                member = tribes[tName].members[index];
                member.warnings = (member.warnings || 0) + points;
                break;
            }
        }

        if (!member) return { success: false, message: `Miembro no registrado en ninguna tribu.` };
        
        const tribeWarnings = tribes[tribeName].warnings || 0;
        totalWarnings = member.warnings + tribeWarnings;

        if (totalWarnings >= BAN_THRESHOLD) {
            isBanned = await banMember(guild, memberId, `Baneo individual (Total: ${totalWarnings})`);
        }
        
        // --- NOTIFICACIÓN DE ADVERTENCIA INDIVIDUAL ---
        if (!isBanned) {
            await sendTribeWarningNotification(guild, tribeName, warningType, points, totalWarnings, false, targetUsername);
        }
        // ----------------------------------------------------
    }

    saveTribes(tribes);
    await updateLog(guild, guild.client);

    return { 
        success: true, 
        message: `Advertencia ${warningType} aplicada. Total de puntos: ${totalWarnings}. Baneo: ${isBanned ? 'SÍ' : 'NO'}.`, 
        banned: isBanned 
    };
}


/**
 * Remueve una advertencia de un miembro o tribu y actualiza los puntos.
 */
async function removeWarning(guild, targetType, targetId, warningType) {
    const pointsToRemove = WARNING_POINTS[warningType];
    const tribes = loadTribes();
    let tribeName = null;
    let totalWarnings = 0; 
    let member = null; 
    let targetUsername = null;
    let message = '';

    if (!pointsToRemove) {
        return { success: false, message: 'Tipo de advertencia no válido.' };
    }

    // Obtener Target Username para las notificaciones
    if (targetType === 'member') {
        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        targetUsername = targetMember ? targetMember.user.tag : 'Usuario Desconocido';
    } else {
        tribeName = targetId;
    }


    if (targetType === 'tribe') {
        tribeName = targetId;
        const tribe = tribes[tribeName];

        if (!tribe) return { success: false, message: `La tribu "${tribeName}" no existe.` };

        // 1. Quitar puntos (Mínimo 0)
        const currentWarnings = tribe.warnings || 0;
        tribe.warnings = Math.max(0, currentWarnings - pointsToRemove);
        const newTribeWarnings = tribe.warnings;
        
        message = `Puntos de tribu actualizados a ${newTribeWarnings}.`;
        
        // 2. Notificación de remoción colectiva
        await sendTribeWarningNotification(guild, tribeName, warningType, pointsToRemove, newTribeWarnings, true, null, true);
        
        // 3. La herencia se mantiene automáticamente ya que el valor de tribe.warnings baja.


    } else if (targetType === 'member') {
        const memberId = targetId;
        
        for (const tName in tribes) {
            const index = tribes[tName].members.findIndex(m => m.discordId === memberId);
            if (index !== -1) {
                tribeName = tName;
                member = tribes[tName].members[index];
                
                // 1. Quitar puntos (Mínimo 0)
                const currentWarnings = member.warnings || 0;
                member.warnings = Math.max(0, currentWarnings - pointsToRemove);
                totalWarnings = member.warnings + (tribes[tribeName].warnings || 0);
                
                message = `Puntos individuales actualizados a ${member.warnings} (Total efectivo: ${totalWarnings}).`;
                break;
            }
        }

        if (!member) return { success: false, message: `Miembro no registrado en ninguna tribu.` };
        
        // 2. Notificación de remoción individual
        await sendTribeWarningNotification(guild, tribeName, warningType, pointsToRemove, totalWarnings, false, targetUsername, true);
    }

    saveTribes(tribes);
    await updateLog(guild, guild.client);

    return { 
        success: true, 
        message: `Advertencia ${warningType} removida. ${message}`, 
        removed: true 
    };
}


module.exports = { applyWarning, removeWarning, WARNING_POINTS, BAN_THRESHOLD };
const { Events } = require('discord.js');
const config = require('../config.json');
const { loadTribes, saveTribes } = require('../utils/tribes');
const { updateLog } = require('../utils/logger');
const { iniciarRegistro } = require('./guildMemberAdd'); // Necesario para llamar al registro

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        // Ignorar cambios en bots
        if (newMember.user.bot) return;

        const guild = newMember.guild;
        const unverifiedRole = guild.roles.cache.find(r => r.name === config.roles.unverified);
        const survivorRole = guild.roles.cache.find(r => r.name === config.roles.survivor);

        if (!unverifiedRole || !survivorRole) return;

        // ==================================================================
        // 1. SINCRONIZACIÓN: DETECTAR SI SE LE QUITÓ UN ROL DE TRIBU MANUALMENTE
        // ==================================================================
        
        const lostRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
        
        if (lostRoles.size > 0) {
            let tribes = loadTribes();
            let jsonUpdated = false;

            for (const [roleId, role] of lostRoles) {
                const tName = role.name;

                if (tribes[tName]) {
                    console.log(`📉 Detectado borrado manual de rol de tribu: "${tName}" a ${newMember.user.tag}`);
                    
                    const tribe = tribes[tName];
                    const memberIndex = tribe.members.findIndex(m => m.discordId === newMember.id);

                    if (memberIndex !== -1) {
                        tribe.members.splice(memberIndex, 1);
                        jsonUpdated = true;

                        if (tribe.members.length === 0) {
                            if (tribe.channelId) {
                                const channel = guild.channels.cache.get(tribe.channelId);
                                if (channel) {
                                    await channel.delete('Limpieza Manual: Tribu vacía.').catch(console.error);
                                    console.log(`🗑️ Canal eliminado: ${tName}`);
                                }
                            }

                            const tribeRole = guild.roles.cache.find(r => r.name === tName);
                            if (tribeRole) {
                                await tribeRole.delete('Limpieza Manual: Tribu vacía.').catch(console.error);
                                console.log(`🗑️ Rol eliminado: ${tName}`);
                            }

                            delete tribes[tName];
                            console.log(`🗑️ Tribu eliminada del registro: ${tName}`);
                        }
                    }
                }
            }

            if (jsonUpdated) {
                saveTribes(tribes);
                await updateLog(guild, newMember.client);
            }
        }

        // ==================================================================
        // 2. INICIO DE REGISTRO MANUAL (Si un admin le pone "No Verificado")
        // ==================================================================
        const oldHasUnverified = oldMember.roles.cache.has(unverifiedRole.id);
        const newHasUnverified = newMember.roles.cache.has(unverifiedRole.id);
        
        const isInitialJoin = oldMember.roles.cache.size === 1;

        if (!oldHasUnverified && newHasUnverified) {
            
            if (isInitialJoin) {
                console.log(`ℹ️ [UPDATE SKIP] Saltando registro por actualización: Usuario ${newMember.user.tag} acaba de unirse.`);
                return; 
            }
            
            console.log(`👀 Registro manual iniciado para: ${newMember.user.tag}`);
            try {
                await iniciarRegistro(newMember);
            } catch (error) { console.error("Error iniciando registro manual:", error); }
            return; 
        }

        // ==================================================================
        // 3. POLICÍA DE TRIBUS (Si se queda sin tribu -> Reset FORZADO TOTAL)
        //    (La función de registro se llama directamente aquí)
        // ==================================================================
        const isSurvivor = newMember.roles.cache.has(survivorRole.id);
        const isAdmin = newMember.permissions.has('Administrator') || newMember.roles.cache.some(r => r.name === 'ADMIN');

        if (isSurvivor && !isAdmin) {
            const currentTribes = loadTribes();
            const tribeNames = Object.keys(currentTribes);
            const hasTribeRole = newMember.roles.cache.some(r => tribeNames.includes(r.name));

            if (!hasTribeRole) {
                console.log(`📉 ALERTA: ${newMember.user.tag} es Superviviente sin tribu. Reseteando y abriendo canal...`);
                
                // Roles a quitar: Superviviente + Líder (si lo tenía)
                const leaderRole = guild.roles.cache.find(r => r.name === config.roles.leader);
                const rolesToStrip = [survivorRole.id];
                if (leaderRole && newMember.roles.cache.has(leaderRole.id)) {
                    rolesToStrip.push(leaderRole.id);
                }
                
                try {
                    // Quitamos Superviviente y Líder
                    await newMember.roles.remove(rolesToStrip);
                    
                    // LLAMAMOS DIRECTO: iniciarRegistro se encargará de poner No Verificado y abrir el canal
                    await iniciarRegistro(newMember); 
                } catch (error) { console.error("Error reseteando usuario sin tribu:", error); }
            }
        }
    },
};
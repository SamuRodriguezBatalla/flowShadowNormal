const { Events, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const { loadTribes, saveTribes } = require('../utils/tribes');
const { updateLog } = require('../utils/logger');
const { loadMetadata } = require('../utils/metadata');
const { generateTribeHelpEmbed } = require('../utils/helpGenerator'); // <--- NUEVO IMPORT
const config = require('../config.json');

module.exports = {
    name: Events.GuildMemberAdd,
    execute: async (member) => await iniciarRegistro(member),
    iniciarRegistro 
};

async function iniciarRegistro(member) {
    // 🛡️ FILTRO DE EXCLUSIÓN
    if (member.user.bot) return;

    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                     member.roles.cache.some(r => r.name === 'ADMIN');

    if (isAdmin) {
        console.log(`⏩ Omitiendo registro para el administrador: ${member.user.tag}`);
        return;
    }

    const guild = member.guild;
    const client = member.client;
    const { season } = loadMetadata();

    const unverifiedRole = guild.roles.cache.find(r => r.name === config.roles.unverified);
    const survivorRole = guild.roles.cache.find(r => r.name === config.roles.survivor);
    
    if (!unverifiedRole || !survivorRole) {
        return console.log("❌ Error de configuración: Faltan roles básicos.");
    }

    // Asignar rol No Verificado
    await member.roles.add(unverifiedRole).catch(e => console.error("Error asignando rol:", e.message));

    // ----------------------------------------------------------------
    // 1. GESTIÓN DE CANALES DE REGISTRO (LIMPIEZA DE DUPLICADOS)
    // ----------------------------------------------------------------
    const regCategory = guild.channels.cache.find(c => c.name === config.categories.registration && c.type === ChannelType.GuildCategory);
    
    const normalizedUsername = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
    const expectedChannelName = `registro-${normalizedUsername}-${member.id.slice(-4)}`;

    const existingChannel = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText &&
        c.parentId === (regCategory ? regCategory.id : null) && 
        (
            c.name.includes(`-${member.id.slice(-4)}`) || 
            c.permissionOverwrites.cache.has(member.id) 
        )
    );

    if (existingChannel) {
        try {
            await existingChannel.delete('Reinicio de registro: Sesión anterior interrumpida.');
            console.log(`🧹 Canal duplicado borrado para: ${member.user.tag}`);
        } catch (e) { console.error(`⚠️ Error borrando canal duplicado:`, e.message); }
    }

    // 2. CREAR CANAL NUEVO DE REGISTRO
    const channel = await guild.channels.create({
        name: expectedChannelName, 
        type: ChannelType.GuildText,
        parent: regCategory ? regCategory.id : null,
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
    });

    // --- PREGUNTA 1: ID ---
    await channel.send(`¡Hola ${member}! 👋\nBienvenido a la **Season ${season}**. Para registrarte necesito tu **ID de PlayStation**.\n*(Tómate tu tiempo, no hay límite de tiempo para responder)*`);
    const idRespuesta = await recibirRespuesta(member, channel);
    if (!idRespuesta) return; 
    const idPlay = idRespuesta.content;

    // --- PREGUNTA 2: TRIBU ---
    await channel.send(`Perfecto. Ahora dime el **nombre de tu Tribu**.`);
    let tribeRespuesta = await recibirRespuesta(member, channel);
    if (!tribeRespuesta) return;
    
    let tribeName = tribeRespuesta.content.trim();
    let tribes = loadTribes();

    // LÓGICA ANTI-DUPLICADOS DE NOMBRE DE TRIBU
    while (true) {
        tribes = loadTribes();
        const inputName = tribeRespuesta.content.trim();
        
        const exactTribeKey = findTribeKey(inputName, tribes);

        if (exactTribeKey) {
            await channel.send(`La tribu **${exactTribeKey}** ya existe. ¿Perteneces a esa tribu? (sí / no)`);
            const confirm = await recibirRespuesta(member, channel);
            if (!confirm) return;

            if (['sí', 'si', 'yes'].includes(confirm.content.toLowerCase())) {
                tribeName = exactTribeKey;
                break;
            } else {
                await channel.send("Entendido. Ese nombre está ocupado. Por favor, elige otro.");
                tribeRespuesta = await recibirRespuesta(member, channel); 
                if (!tribeRespuesta) return;
                continue;
            }
        }

        const similarTribe = findSimilarTribe(inputName, Object.keys(tribes));
        if (similarTribe) {
            await channel.send(`He encontrado una tribu con un nombre muy parecido: **${similarTribe}**. ¿Te referías a esa? (sí / no)`);
            const confirm = await recibirRespuesta(member, channel);
            if (!confirm) return;

            if (['sí', 'si', 'yes'].includes(confirm.content.toLowerCase())) {
                tribeName = similarTribe;
                break;
            } else {
                await channel.send(`🤔 El nombre **${inputName}** es muy parecido a **${similarTribe}**.\n\n¿Estás **ABSOLUTAMENTE SEGURO** de que quieres crear una nueva tribu llamada **${inputName}**? (sí / no)`);
                const sureConfirm = await recibirRespuesta(member, channel);
                if (!sureConfirm) return;

                if (['sí', 'si', 'yes'].includes(sureConfirm.content.toLowerCase())) {
                    tribeName = inputName;
                    break;
                } else {
                    await channel.send("Por favor, elige un nombre que sea más distintivo.");
                    tribeRespuesta = await recibirRespuesta(member, channel);
                    if (!tribeRespuesta) return;
                    continue;
                }
            }
        }

        tribeName = inputName;
        break;
    }

    // =====================================================
    // 🏗️ GESTIÓN DE LA TRIBU
    // =====================================================
    let tribeRole = guild.roles.cache.find(r => r.name === tribeName);

    if (!tribes[tribeName]) {
        
        // A. Crear Rol de Tribu
        if (!tribeRole) {
            try {
                tribeRole = await guild.roles.create({
                    name: tribeName,
                    color: Math.floor(Math.random() * 16777215),
                    reason: "Nueva tribu registrada"
                });
                await tribeRole.setPosition(survivorRole.position + 1).catch(() => {});
            } catch (err) {
                tribeRole = await guild.roles.create({ name: tribeName });
            }
        }

        // B. Crear Canal Privado de la Tribu (MODIFICADO PARA HELP Y WARNING)
        const tribeCategory = guild.channels.cache.find(c => c.name === config.categories.tribes && c.type === ChannelType.GuildCategory);
        let tribeChannelId = null;
        let instructionMessageId = null;

        try {
            const tribeChannel = await guild.channels.create({
                name: tribeName, 
                type: ChannelType.GuildText,
                parent: tribeCategory ? tribeCategory.id : null,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, 
                    { id: tribeRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }, 
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ],
            });
            tribeChannelId = tribeChannel.id;

            // --- GENERAR MENSAJE DE BIENVENIDA + GUÍA + WARNING ---
            const helpEmbed = generateTribeHelpEmbed();
            
            // Construir el texto de bienvenida y advertencia
            const warningHeader = `⛺ **¡Bienvenidos a la Base de ${tribeName}!**\n\n` +
                                  `⚠️ **IMPORTANTE: MANTENIMIENTO DE BASE** ⚠️\n` +
                                  `Debéis usar el comando \`/tribu checkin\` al menos **una vez a la semana**.\n` +
                                  `Si no lo hacéis, el sistema entenderá que habéis abandonado el servidor y borrará la tribu.\n\n` +
                                  `👇 **GUÍA RÁPIDA DE COMANDOS** 👇\n`;
            
            // Insertarlo al principio de la descripción del embed
            helpEmbed.setDescription(warningHeader + (helpEmbed.data.description || ''));

            const sentMessage = await tribeChannel.send({ embeds: [helpEmbed] });
            instructionMessageId = sentMessage.id;
            
        } catch (error) { console.error("Error creando canal de tribu:", error); }

        // C. Inicializar objeto de tribu (AÑADIDO lastActive)
        tribes[tribeName] = {
            members: [],
            warnings: 0,
            channelId: tribeChannelId,
            instructionMessageId: instructionMessageId,
            lastActive: Date.now() // <--- INICIALIZAR TEMPORIZADOR DE DECAY
        };
        saveTribes(tribes);
        await channel.send(`Creando la tribu **${tribeName}** y vuestro canal privado...`);

    } else {
        if (!tribeRole) tribeRole = await guild.roles.cache.find(r => r.name === tribeName);
    }

    // =====================================================
    // 🛡️ ASIGNACIÓN DE ROLES Y LÓGICA DE LÍDER
    // =====================================================
    const isFirstMember = tribes[tribeName].members.length === 0;
    const userRank = isFirstMember ? 'Líder' : 'Miembro';

    await member.roles.add(tribeRole).catch(console.error);
    await member.roles.remove(unverifiedRole).catch(console.error);
    await member.roles.add(survivorRole).catch(console.error);

    // --- GESTIÓN ESPECIAL PARA LÍDERES ---
    if (isFirstMember) {
        let leaderGlobalRole = guild.roles.cache.find(r => r.name === config.roles.leader);
        
        // 1. Crear Rol Global de Líder si falta
        if (!leaderGlobalRole) {
            try {
                leaderGlobalRole = await guild.roles.create({
                    name: config.roles.leader,
                    color: 'Gold',
                    reason: 'Auto-creación: Primer líder de la season'
                });
            } catch (e) { console.error(e); }
        }

        if (leaderGlobalRole) {
            await member.roles.add(leaderGlobalRole).catch(console.error);

            // 2. GESTIÓN DEL CANAL DE LÍDERES
            const tribeCategory = guild.channels.cache.find(c => c.name === config.categories.tribes && c.type === ChannelType.GuildCategory);
            
            if (tribeCategory) {
                const leaderChannelName = config.channels.leader_channel.toLowerCase();
                
                const existingLeaderChannel = guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildText &&
                    c.parentId === tribeCategory.id &&
                    c.name.toLowerCase() === leaderChannelName
                );

                if (!existingLeaderChannel) {
                    try {
                        await guild.channels.create({
                            name: config.channels.leader_channel,
                            type: ChannelType.GuildText,
                            parent: tribeCategory.id,
                            permissionOverwrites: [
                                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                                { id: leaderGlobalRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                            ]
                        });
                        console.log("👑 Canal de Líderes creado automáticamente (Único).");
                    } catch (error) {
                        console.error("Error creando canal de líderes:", error);
                    }
                }
            }
        }
    }

    // Guardar y Finalizar
    tribes = loadTribes();
    tribes[tribeName].members.push({
        username: member.user.username,
        idPlay: idPlay,
        discordId: member.id,
        hasKit: false,
        warnings: 0,
        rango: userRank
    });
    saveTribes(tribes);

    await updateLog(guild, client);

    // Bienvenida Pública
    const welcomeChannel = guild.channels.cache.find(c => c.name === config.channels.welcome);
    if (welcomeChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#7700ff')
            .setTitle(`Bienvenido a la Season ${season} de ${guild.name}`)
            .setDescription(`¡Demos una cálida bienvenida a ${member} al servidor!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🎮 ID PlayStation', value: idPlay, inline: true },
                { name: '🛡️ Tribu', value: tribeName, inline: true },
                { name: '👥 Miembros', value: `${guild.memberCount} Supervivientes`, inline: true },
                { name: '📅 Fecha', value: new Date().toLocaleDateString('es-ES'), inline: false }
            )
            .setFooter({ text: 'FlowShadow - Registro Automático', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        await welcomeChannel.send({ embeds: [welcomeEmbed] });
    }

    // El canal se cierra 5 segundos después de la finalización
    setTimeout(() => channel.delete().catch(() => {}), 5000);
}

function recibirRespuesta(member, channel) {
    return new Promise(resolve => {
        const collector = channel.createMessageCollector({
            filter: m => m.author.id === member.id,
            max: 1,
        });

        collector.on("collect", msg => resolve(msg));

        collector.on("end", (collected, reason) => {
            if (reason === 'channelDelete' || collected.size === 0) {
                resolve(null); 
                return; 
            }
            resolve(null);
        });
    });
}

// Funciones Auxiliares de Similitud
function findTribeKey(inputName, tribes) {
    const lowerInput = inputName.toLowerCase();
    for (const key in tribes) {
        if (key.toLowerCase() === lowerInput) return key;
    }
    return null;
}

function findSimilarTribe(input, tribeNames) {
    const threshold = 2; 
    const lowerInput = input.toLowerCase();

    for (const name of tribeNames) {
        const lowerName = name.toLowerCase();
        
        if (levenshtein(lowerInput, lowerName) <= threshold) return name;
    }
    return null;
}

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}
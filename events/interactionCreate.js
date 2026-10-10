const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const userRequests = new Map();
const ticketCreationLock = new Set();

function safeInteractionReply(interaction, options) {
    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(options);
    } else {
        return interaction.reply(options);
    }
}

function safeInteractionUpdate(interaction, options) {
    if (interaction.replied || interaction.deferred) {
        return interaction.editReply(options);
    } else {
        return interaction.update(options);
    }
}

function checkRateLimit(userId) {
    const now = Date.now();
    const userRequestData = userRequests.get(userId) || { count: 0, lastReset: now };
    if (now - userRequestData.lastReset > 10000) {
        userRequestData.count = 0;
        userRequestData.lastReset = now;
    }
    if (userRequestData.count >= 3) {
        return false;
    }

    userRequestData.count++;
    userRequests.set(userId, userRequestData);
    return true;
}

function acquireTicketLock(userId) {
    if (ticketCreationLock.has(userId)) {
        return false;
    }
    ticketCreationLock.add(userId);
    return true;
}

function releaseTicketLock(userId) {
    ticketCreationLock.delete(userId);
}

function createTicketEmbed(kategori, user, channel, guild) {
    const serverIcon = guild.iconURL({ dynamic: true }) || '';

    return new EmbedBuilder()
        .setTitle('🎫 **Ticket Destek Talebi**')
        .setDescription(`## 🎉 Hoş Geldiniz!\n\n> **Destek talebiniz başarıyla oluşturuldu.** Ekibimiz en kısa sürede size yardımcı olacaktır.`)
        .addFields(
            { name: '📋 **Kategori**', value: `\`${kategori.isim}\``, inline: true },
            { name: '👤 **Ticket Sahibi**', value: user.toString(), inline: true },
            { name: '📅 **Oluşturulma**', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '🏆 **Durum**', value: '`🟢 Aktif`', inline: true }
        )
        .setColor('#9333EA')
        .setTimestamp()
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setFooter({ 
            text: 'Lashk • Ticket Sistemi', 
            iconURL: serverIcon
        });
}

function createLogEmbed(ticketData, ticketOwner, closer, messageCount, hours, minutes, guild) {
    const serverIcon = guild.iconURL({ dynamic: true }) || '';

    return new EmbedBuilder()
        .setTitle('🔒 **Ticket Kapatıldı & Transcript**')
        .setDescription(`> **${ticketData.ticketNumarasi}** adlı ticket kapatıldı. Mesaj geçmişi dosyası ektedir.`)
        .addFields(
            { name: '👤 Ticket Sahibi', value: ticketOwner ? `${ticketOwner.user.tag} (${ticketOwner.user.id})` : 'Bilinmiyor', inline: true },
            { name: '🔒 Kapatan Yetkili', value: `${closer.tag} (${closer.id})`, inline: true },
            { name: '📋 Kategori', value: `\`${ticketData.kategori}\``, inline: true },
            { name: '💬 Toplam Mesaj', value: `\`${messageCount}\` mesaj`, inline: true },
            { name: '⏱️ Açık Kalma Süresi', value: `\`${hours}\` saat \`${minutes}\` dakika`, inline: true },
            { name: '📅 Açılış Tarihi', value: `<t:${Math.floor(ticketData.createdAt / 1000)}:F>`, inline: true }
        )
        .setColor('#EF4444')
        .setTimestamp()
        .setFooter({ 
            text: 'Lashk • Ticket Log', 
            iconURL: serverIcon
        });
}

async function generateTranscript(channel, messages, ticketOwner) {
    const messagesArray = Array.from(messages.values()).reverse();
    let html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Transcript - ${channel.name}</title>
    <style>
        body { font-family: Arial, sans-serif; background: #0f0f23; color: #fff; padding: 20px; }
        .msg { background: #1a1a2e; padding: 10px 15px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid #9333ea; }
        .author { font-weight: bold; color: #a855f7; }
        .time { font-size: 0.8em; color: #888; margin-left: 10px; }
        .content { margin-top: 5px; color: #ddd; }
    </style></head><body>`;
    html += `<h2>🎫 Transcript - ${channel.name}</h2>`;
    html += `<p><strong>Ticket Sahibi:</strong> ${ticketOwner ? ticketOwner.user.tag : 'Bilinmiyor'}</p><hr><br>`;

    messagesArray.forEach(msg => {
        html += `<div class="msg">
            <span class="author">${msg.author.tag}</span>
            <span class="time">${msg.createdAt.toLocaleString('tr-TR')}</span>
            <div class="content">${msg.content || '<em>[Görsel / Ek İçerik]</em>'}</div>
        </div>`;
    });

    html += `</body></html>`;
    return html;
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            const data = interaction.client.data.load();
            const guildId = interaction.guild.id;
            const config = interaction.client.config;

            if (!data.guilds) data.guilds = {};
            if (!data.guilds[guildId]) {
                data.guilds[guildId] = { adminRol: null, logKanal: null, ticketKanallari: [] };
                interaction.client.data.save(data);
            }

            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (command) await command.execute(interaction);
            }

            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'setup_admin_rol' || interaction.customId === 'setup_log_kanal') {
                    await handleSelectMenus(interaction, data, guildId);
                } else if (interaction.customId === 'ticket_kategori_sec') {
                    await handleTicketCategorySelection(interaction, data, guildId, config);
                }
            }

            if (interaction.isButton() && interaction.customId === 'ticket_kapat') {
                await handleTicketClose(interaction, data, guildId, config);
            }
        } catch (error) {
            console.error('Interaction handler error:', error);
        }
    },
};

async function handleTicketCategorySelection(interaction, data, guildId, config) {
    const userId = interaction.user.id;

    try {
        if (!checkRateLimit(userId) || !acquireTicketLock(userId)) {
            return await safeInteractionReply(interaction, { content: '⚠️ Lütfen biraz bekleyin.', flags: ['Ephemeral'] });
        }

        const kategoriId = interaction.values[0];
        const kategori = config.kategoriler.find(kat => kat.id === kategoriId);

        if (!kategori) {
            releaseTicketLock(userId);
            return await safeInteractionReply(interaction, { content: '❌ Kategori bulunamadı!', flags: ['Ephemeral'] });
        }

        const aktifTicketler = interaction.guild.channels.cache.filter(ch => 
            ch.topic && ch.topic.includes(`Ticket sahibi: ${userId}`)
        );

        if (aktifTicketler.size >= 1) {
            releaseTicketLock(userId);
            return await safeInteractionReply(interaction, { content: '🚫 Zaten açık bir ticketiniz bulunmaktadır!', flags: ['Ephemeral'] });
        }

        await interaction.deferReply({ flags: ['Ephemeral'] });

        const parentCategoryId = interaction.channel.parentId || null;
        const kullaniciAdi = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `📌・${kullaniciAdi}`;
        
        const ticketKanali = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: parentCategoryId,
            topic: `Ticket sahibi: ${userId} | Kategori: ${kategori.isim} | Oluşturulma: ${Date.now()}`,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                {
                    id: userId,
                    allow: [
                        PermissionFlagsBits.ViewChannel, 
                        PermissionFlagsBits.SendMessages, 
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                }
            ]
        });

        if (data.guilds[guildId]?.adminRol) {
            await ticketKanali.permissionOverwrites.create(data.guilds[guildId].adminRol, {
                ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true
            }).catch(() => {});
        }

        const ticketEmbed = createTicketEmbed(kategori, interaction.user, ticketKanali, interaction.guild);
        
        // Yalnızca KAPAT butonu ekledik
        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_kapat')
                .setLabel('🔒 Kapat')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketKanali.send({ embeds: [ticketEmbed], components: [buttonRow] });

        if (!data.tickets) data.tickets = {};
        data.tickets[ticketKanali.id] = {
            userId: userId,
            kategori: kategori.isim,
            kategoriId: kategori.id,
            createdAt: Date.now(),
            guildId: interaction.guild.id,
            ticketNumarasi: channelName
        };
        interaction.client.data.save(data);

        await interaction.editReply({ content: `✅ Ticket kanalınız açıldı: ${ticketKanali.toString()}` });

    } catch (error) {
        console.error('Ticket hatası:', error);
    } finally {
        releaseTicketLock(userId);
    }
}

async function handleTicketClose(interaction, data, guildId, config) {
    const adminRol = data.guilds[guildId]?.adminRol;
    const hasPermission = 
        interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
        (adminRol && interaction.member.roles.cache.has(adminRol)) ||
        interaction.channel.topic?.includes(`Ticket sahibi: ${interaction.user.id}`);

    if (!hasPermission) {
        return await safeInteractionReply(interaction, { content: '🚫 Yetkiniz yok!', flags: ['Ephemeral'] });
    }

    const ticketVerisi = data.tickets?.[interaction.channel.id];
    
    await safeInteractionReply(interaction, {
        content: '🔒 Ticket kapatılıyor, log ve transcript kaydediliyor...',
        flags: ['Ephemeral']
    });

    try {
        // Loglama işlemleri ve Transcript oluşturma
        let messages = new Map();
        try {
            messages = await interaction.channel.messages.fetch({ limit: 100 });
        } catch (e) {}

        let ticketOwner = null;
        if (ticketVerisi?.userId) {
            try { ticketOwner = await interaction.guild.members.fetch(ticketVerisi.userId); } catch (e) {}
        }

        const logKanalId = data.guilds[guildId]?.logKanal;
        const logKanali = interaction.guild.channels.cache.get(logKanalId);

        if (logKanali && ticketVerisi) {
            const sure = Date.now() - ticketVerisi.createdAt;
            const saat = Math.floor(sure / (1000 * 60 * 60));
            const dakika = Math.floor((sure % (1000 * 60 * 60)) / (1000 * 60));

            const logEmbed = createLogEmbed(ticketVerisi, ticketOwner, interaction.user, messages.size, saat, dakika, interaction.guild);
            const transcriptHtml = await generateTranscript(interaction.channel, messages, ticketOwner);

            const attachment = {
                attachment: Buffer.from(transcriptHtml, 'utf-8'),
                name: `transcript-${interaction.channel.name}.html`
            };

            await logKanali.send({ embeds: [logEmbed], files: [attachment] });
        }
    } catch (logError) {
        console.error('Log ve Transcript hatası:', logError);
    }

    setTimeout(async () => {
        try {
            if (data.tickets?.[interaction.channel.id]) {
                delete data.tickets[interaction.channel.id];
                interaction.client.data.save(data);
            }
            await interaction.channel.delete();
        } catch (err) {
            console.error('Kanal silinemedi:', err);
        }
    }, 3000);
}

async function handleSelectMenus(interaction, data, guildId) {
    if (interaction.customId === 'setup_admin_rol') {
        data.guilds[guildId].adminRol = interaction.values[0];
        interaction.client.data.save(data);
        await safeInteractionReply(interaction, { content: '✅ Admin rolü güncellendi.', flags: ['Ephemeral'] });
    } else if (interaction.customId === 'setup_log_kanal') {
        data.guilds[guildId].logKanal = interaction.values[0];
        interaction.client.data.save(data);
        await safeInteractionReply(interaction, { content: '✅ Log kanalı güncellendi.', flags: ['Ephemeral'] });
    }
}
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

function saatKontrol(acilisSaati, kapanisSaati) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const [acilisHour, acilisMin] = acilisSaati.split(':').map(Number);
    const [kapanisHour, kapanisMin] = kapanisSaati.split(':').map(Number);

    const acilisZamani = acilisHour * 60 + acilisMin;
    const kapanisZamani = kapanisHour * 60 + kapanisMin;

    if (kapanisZamani < acilisZamani) {
        return currentTime >= acilisZamani || currentTime <= kapanisZamani;
    }
    return currentTime >= acilisZamani && currentTime <= kapanisZamani;
}

function aktifTicketSayisi(guild, kategoriAdi) {
    if (!guild || !kategoriAdi) return 0;

    const category = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        (c.name === kategoriAdi.toUpperCase() || c.name.startsWith(kategoriAdi.toUpperCase() + ' ['))
    );

    if (!category) return 0;

    return category.children.cache.filter(ch => 
        ch.type === ChannelType.GuildText && 
        (ch.name.includes('-ticket') || ch.name.startsWith('ticket-')) &&
        !ch.deleted
    ).size;
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

async function kategoriAdiniGuncelle(guild, kategoriAdi, excludeChannelId = null) {
    if (!guild || !kategoriAdi) return;

    try {
        const category = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && 
            (c.name === kategoriAdi.toUpperCase() || c.name.startsWith(kategoriAdi.toUpperCase() + ' ['))
        );
        
        if (!category) return;

        let count = 0;
        category.children.cache.forEach(ch => {
            if (ch && 
                ch.type === ChannelType.GuildText && 
                (ch.name.includes('-ticket') || ch.name.startsWith('ticket-')) &&
                !ch.deleted &&
                ch.id !== excludeChannelId) {
                count++;
            }
        });
        
        const yeniAd = count > 0 ? `${kategoriAdi.toUpperCase()} [${count}]` : kategoriAdi.toUpperCase();
        
        if (category.name !== yeniAd) {
            await category.setName(yeniAd);
            console.log(`Kategori adı güncellendi: ${category.name} -> ${yeniAd}`);
        }
    } catch (error) {
        console.error('Kategori adı güncellenirken hata:', error);
    }
}

function createTicketEmbed(kategori, user, channel, ticketNumarasi, guild) {
    const serverIcon = guild.iconURL({ dynamic: true }) || '';

    return new EmbedBuilder()
        .setTitle('🎫 **𝗭𝘆𝗽𝗵𝗲𝗿𝗶𝘀 𝗧𝗶𝗰𝗸𝗲𝘁 𝗦𝗶𝘀𝘁𝗲𝗺𝗶**')
        .setDescription(`## 🎉 Hoş Geldiniz!\n\n> **Destek talebiniz başarıyla oluşturuldu.** Ekibimiz en kısa sürede size yardımcı olacaktır.\n\n### 💡 **Bilgi**\n> Aşağıdaki **Bilgilendirme** butonuna tıklayarak detaylı yardım rehberini görüntüleyebilirsiniz.`)
        .addFields(
            { name: '📋 **Kategori**', value: `\`${kategori.isim}\``, inline: true },
            { name: '👤 **Ticket Sahibi**', value: user.toString(), inline: true },
            { name: '📅 **Oluşturulma**', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '📂 **Kanal**', value: channel.toString(), inline: true },
            { name: '🏆 **Durum**', value: '`🟢 Aktif`', inline: true },
            { name: '⏰ **Yanıt Süresi**', value: '`⚡ Hızlı`', inline: true }
        )
        .setColor('#9333EA')
        .setTimestamp()
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setFooter({ 
            text: 'Lashk • ticket sistem', 
            iconURL: serverIcon
        });
}

function createInfoEmbed(kategori, guild) {
    const serverIcon = guild.iconURL({ dynamic: true }) || '';
    
    return new EmbedBuilder()
        .setTitle('📚 **𝗧𝗶𝗰𝗸𝗲𝘁 Bilgilendirfmesi𝗶**')
        .setDescription(`## 🎯 **${kategori.isim}** Kategori Bilgilendirmesi\n\n### 📝 **Nasıl Yardım Alırsınız?**\n\n> **1️⃣ Sorununuzu Detaylandırın**\n> • Hangi konuda yardıma ihtiyacınız olduğunu açık bir şekilde belirtin\n> • Mümkün olduğunca daha detaylı bilgi vermeye çalış\n\n> **2️⃣ Gerekli Bilgileri Sağlayın**\n> • Hata mesajları varsa ekran görüntüsü paylaşın\n> • Problemi yaşadığınız zamanı belirtin\n> • Hangi adımları denediğinizi yazın\n\n> **3️⃣ Sabırlı Olun**\n> •  lashk sorununuzu en kısa sürede yanıtlıcaktır\n> • gereksiz ping atma Gereksiz pinglerde bot sağlam bir beddua edecektir ebeni tersten görürsün\n> • Ticket'ı kapatmayın, çözüm bulana kadar bekleyin`)
        .addFields(
            { name: '🕐 **Çalışma Saatleri**', value: `\`${kategori.acilisSaati} - ${kategori.kapanisSaati}\``, inline: true },
            { name: '⚡ **Ortalama Yanıt Süresi**', value: '`15-30 dakika`', inline: true },
            { name: '📊 **Kategori**', value: `\`${kategori.isim}\``, inline: true }
        )
        .setColor('#3B82F6')
        .setTimestamp()
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ 
            text: 'Lashk • Bilgilendirme sistemi', 
            iconURL: serverIcon
        });
}

function createLogEmbed(ticketData, ticketOwner, closer, messageCount, hours, minutes, guild) {
    const serverIcon = guild.iconURL({ dynamic: true }) || '';

    return new EmbedBuilder()
        .setTitle('🔒 **𝗧𝗶𝗰𝗸𝗲𝘁 𝗞𝗮𝗽𝗮𝘁ı𝗹𝗱ı**')
        .setDescription(`> **${ticketData.ticketNumarasi}** numaralı ticket başarıyla kapatıldı.`)
        .addFields(
            { name: '👤 Ticket Sahibi', value: ticketOwner ? `${ticketOwner.user.tag} (${ticketOwner.user.id})` : 'Kullanıcı Bulunamadı', inline: true },
            { name: '🔒 Kapatan Yetkili', value: `${closer.tag} (${closer.id})`, inline: true },
            { name: '📋 Kategori', value: `\`${ticketData.kategori}\``, inline: true },
            { name: '💬 Toplam Mesaj', value: `\`${messageCount}\` mesaj`, inline: true },
            { name: '⏱️ Açık Kalma Süresi', value: `\`${hours}\` saat \`${minutes}\` dakika`, inline: true },
            { name: '📅 Açılış Tarihi', value: `<t:${Math.floor(ticketData.createdAt / 1000)}:F>`, inline: true },
            { name: '📅 Kapatılış Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '📊 İstatistik', value: `Ortalama yanıt: \`${Math.floor(messageCount / Math.max(hours, 1))}\` msg/saat`, inline: true }
        )
        .setColor('#EF4444')
        .setTimestamp()
        .setThumbnail(closer.displayAvatarURL({ dynamic: true }))
        .setFooter({ 
            text: 'lashk• Ticket sistem', 
            iconURL: serverIcon
        });
}

async function generateAdvancedTranscript(channel, ticketData, ticketOwner, messages, messageCount, hours, minutes) {
    try {
        const messagesArray = Array.from(messages.values()).reverse();
        const serverIcon = channel.guild.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const ticketOwnerAvatar = ticketOwner ? ticketOwner.user.displayAvatarURL({ dynamic: true }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
        const imageMessages = messagesArray.filter(msg => 
            msg.attachments && msg.attachments.size > 0 && 
            msg.attachments.some(att => att.contentType && att.contentType.startsWith('image/'))
        );

        return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>𝗭𝘆𝗽𝗵𝗲𝗿𝗶𝘀 Transcript - ${channel.name}</title>
    <style>
        :root {
            --primary: #9333EA;
            --primary-dark: #7C3AED;
            --primary-light: #A855F7;
            --secondary: #EC4899;
            --accent: #F59E0B;
            --success: #10B981;
            --warning: #F59E0B;
            --danger: #EF4444;
            --info: #3B82F6;
            --owner: #FFD700;

            --bg-primary: #0F0F23;
            --bg-secondary: #1A1A2E;
            --bg-tertiary: #16213E;
            --bg-card: #1E1E3F;
            --bg-hover: #2A2A4A;
            
            --text-primary: #FFFFFF;
            --text-secondary: #B4B4D6;
            --text-muted: #8B8BA6;
            --text-inverse: #0F0F23;
            
            --border: #2D2D52;
            --border-light: #404066;
            
            --shadow-sm: 0 2px 4px rgba(0,0,0,0.3);
            --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
            --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
            --shadow-xl: 0 16px 48px rgba(0,0,0,0.6);
            
            --gradient-primary: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
            --gradient-owner: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            --gradient-bg: linear-gradient(135deg, #0F0F23 0%, #1A1A2E 50%, #16213E 100%);
            --gradient-card: linear-gradient(145deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--gradient-bg);
            min-height: 100vh;
            color: var(--text-primary);
            line-height: 1.6;
            overflow-x: hidden;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            min-height: 100vh;
            position: relative;
        }

        .background-pattern {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
                radial-gradient(circle at 20% 80%, rgba(147, 51, 234, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(236, 72, 153, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(245, 158, 11, 0.05) 0%, transparent 50%);
            z-index: -1;
        }

        .hero-section {
            background: var(--gradient-primary);
            padding: 4rem 2rem;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .hero-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.08'%3E%3Cpath d='m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") repeat;
            opacity: 0.1;
        }

        .hero-content {
            position: relative;
            z-index: 1;
        }

        .hero-title {
            font-size: clamp(2.5rem, 5vw, 4rem);
            font-weight: 900;
            margin-bottom: 1rem;
            background: linear-gradient(45deg, #FFFFFF, #E5E7EB);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            text-shadow: 0 4px 8px rgba(0,0,0,0.3);
            letter-spacing: -0.02em;
        }

        .hero-subtitle {
            font-size: 1.5rem;
            font-weight: 500;
            opacity: 0.9;
            margin-bottom: 2rem;
        }

        .hero-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(10px);
            padding: 0.75rem 1.5rem;
            border-radius: 50px;
            font-weight: 700;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            padding: 3rem 2rem;
            background: var(--bg-secondary);
        }

        .stat-card {
            background: var(--gradient-card);
            padding: 2rem;
            border-radius: 24px;
            border: 1px solid var(--border);
            position: relative;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: var(--gradient-primary);
            border-radius: 0 0 12px 12px;
        }

        .stat-card::after {
            content: '';
            position: absolute;
            top: 50%;
            right: -50px;
            width: 100px;
            height: 100px;
            background: var(--gradient-primary);
            border-radius: 50%;
            opacity: 0.05;
            transform: translateY(-50%);
        }

        .stat-card:hover {
            transform: translateY(-8px);
            box-shadow: var(--shadow-xl);
            border-color: var(--primary);
        }

        .stat-header {
            display: flex;
            align-items: center;
            gap: 1.5rem;
            margin-bottom: 1rem;
        }

        .stat-avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            border: 4px solid var(--primary);
            flex-shrink: 0;
            box-shadow: var(--shadow-lg);
            transition: all 0.3s ease;
        }

        .stat-card:hover .stat-avatar {
            transform: scale(1.05);
            border-color: var(--primary-light);
        }

        .server-avatar {
            border-color: var(--secondary);
        }

        .stat-card:hover .server-avatar {
            border-color: var(--secondary);
        }

        .stat-icon {
            width: 56px;
            height: 56px;
            background: var(--gradient-primary);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            color: white;
            box-shadow: var(--shadow-md);
            flex-shrink: 0;
        }

        .stat-content {
            flex: 1;
            min-width: 0;
        }

        .stat-content h3 {
            font-size: 0.875rem;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 0.5rem;
        }

        .stat-content p {
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--text-primary);
            word-wrap: break-word;
        }

        .messages-section {
            padding: 3rem 2rem;
            background: var(--bg-primary);
        }

        .section-header {
            text-align: center;
            margin-bottom: 3rem;
        }

        .section-title {
            font-size: 3rem;
            font-weight: 900;
            background: var(--gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
        }

        .section-divider {
            width: 120px;
            height: 4px;
            background: var(--gradient-primary);
            margin: 0 auto;
            border-radius: 2px;
        }

        .messages-container {
            max-width: 1000px;
            margin: 0 auto;
        }

        .images-section {
            margin-bottom: 3rem;
        }

        .images-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .image-card {
            background: var(--gradient-card);
            padding: 1.5rem;
            border-radius: 16px;
            border: 1px solid var(--border);
            text-align: center;
            transition: all 0.3s ease;
        }

        .image-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-lg);
            border-color: var(--primary);
        }

        .image-preview {
            width: 100%;
            max-width: 200px;
            height: 150px;
            object-fit: cover;
            border-radius: 12px;
            margin-bottom: 1rem;
            cursor: pointer;
            transition: transform 0.3s ease;
        }

        .image-preview:hover {
            transform: scale(1.05);
        }

        .image-info {
            font-size: 0.875rem;
            color: var(--text-secondary);
        }

        .image-author {
            font-weight: 600;
            color: var(--primary-light);
            margin-bottom: 0.25rem;
        }

        .message-group {
            margin-bottom: 2rem;
        }

        .message {
            display: flex;
            gap: 1rem;
            padding: 1.5rem;
            background: var(--gradient-card);
            border-radius: 20px;
            border: 1px solid var(--border);
            margin-bottom: 1rem;
            transition: all 0.3s ease;
            position: relative;
        }

        .message::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            width: 4px;
            height: 100%;
            background: var(--gradient-primary);
            border-radius: 2px;
        }

        .message:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
            border-color: var(--primary-light);
        }

        .message-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 3px solid var(--border);
            flex-shrink: 0;
            transition: all 0.3s ease;
        }

        .message:hover .message-avatar {
            border-color: var(--primary);
            transform: scale(1.05);
        }

        .message-content {
            flex: 1;
            min-width: 0;
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 0.75rem;
            flex-wrap: wrap;
        }

        .message-author {
            font-weight: 800;
            color: var(--text-primary);
            font-size: 1rem;
        }

        .message-timestamp {
            color: var(--text-muted);
            font-size: 0.875rem;
            background: var(--bg-hover);
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-weight: 600;
        }

        .message-text {
            color: var(--text-secondary);
            font-size: 0.95rem;
            line-height: 1.7;
            word-wrap: break-word;
        }

        .bot-message {
            background: linear-gradient(145deg, rgba(147, 51, 234, 0.1), rgba(236, 72, 153, 0.05));
            border-left: 4px solid var(--primary);
        }

        .bot-message::before {
            background: var(--gradient-primary);
        }

        .bot-badge {
            background: var(--gradient-primary);
            color: white;
            font-size: 0.625rem;
            padding: 0.25rem 0.5rem;
            border-radius: 8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .owner-message {
            background: linear-gradient(145deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.05));
            border-left: 4px solid var(--owner);
        }

        .owner-message::before {
            background: var(--gradient-owner);
        }

        .owner-badge {
            background: var(--gradient-owner);
            color: var(--text-inverse);
            font-size: 0.625rem;
            padding: 0.25rem 0.5rem;
            border-radius: 8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 4px rgba(255, 215, 0, 0.3);
        }

        .empty-state {
            text-align: center;
            padding: 4rem 2rem;
            color: var(--text-muted);
        }

        .empty-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }

        .footer {
            background: var(--bg-tertiary);
            padding: 3rem 2rem;
            text-align: center;
            border-top: 1px solid var(--border);
        }

        .footer-content {
            max-width: 800px;
            margin: 0 auto;
        }

        .footer-logo {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .footer-logo img {
            width: 48px;
            height: 48px;
            border-radius: 12px;
        }

        .footer-title {
            font-size: 1.5rem;
            font-weight: 900;
            background: var(--gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            letter-spacing: -0.01em;
        }

        .footer-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .footer-item {
            background: var(--bg-card);
            padding: 1rem;
            border-radius: 12px;
            border: 1px solid var(--border);
        }

        .footer-item strong {
            color: var(--primary-light);
            font-weight: 700;
        }

        .footer-copyright {
            color: var(--text-muted);
            font-size: 0.875rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border);
            font-weight: 600;
        }

        .modal {
            display: none;
            position: fixed;
            z-index: 9999;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.9);
            backdrop-filter: blur(5px);
        }

        .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            max-width: 90%;
            max-height: 90%;
        }

        .modal-image {
            max-width: 100%;
            max-height: 100%;
            border-radius: 12px;
            box-shadow: var(--shadow-xl);
        }

        .close {
            position: absolute;
            top: -40px;
            right: 0;
            color: white;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            background: var(--danger);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .close:hover {
            background: var(--primary);
            transform: scale(1.1);
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .hero-section {
                padding: 3rem 1rem;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
                padding: 2rem 1rem;
            }
            
            .stat-header {
                gap: 1rem;
            }
            
            .stat-avatar {
                width: 60px;
                height: 60px;
            }
            
            .messages-section {
                padding: 2rem 1rem;
            }
            
            .message {
                padding: 1rem;
            }
            
            .message-avatar {
                width: 40px;
                height: 40px;
            }
            
            .footer {
                padding: 2rem 1rem;
            }
            
            .footer-info {
                grid-template-columns: 1fr;
            }
        }

        /* Animation */
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .stat-card,
        .message {
            animation: fadeInUp 0.6s ease-out;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
            width: 12px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--gradient-primary);
            border-radius: 6px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--primary-dark);
        }
    </style>
</head>
<body>
    <div class="background-pattern"></div>
    <div class="container">
        <header class="hero-section">
            <div class="hero-content">
                <h1 class="hero-title">
                    🎫 Lashk Transcript
                </h1>
                <p class="hero-subtitle">${channel.name}</p>
                <div class="hero-badge">
                    🔒 Lashk ticket sistemi
                </div>
            </div>
        </header>

        <section class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <img src="${ticketOwnerAvatar}" alt="Ticket Sahibi" class="stat-avatar" 
                         onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="stat-content">
                        <h3>𝗧𝗶𝗰𝗸𝗲𝘁 𝗦𝗮𝗵𝗶𝗯𝗶</h3>
                        <p>${ticketOwner ? ticketOwner.user.tag : 'Bilinmiyor'}</p>
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <img src="${serverIcon}" alt="Sunucu" class="stat-avatar server-avatar" 
                         onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <div class="stat-content">
                        <h3>𝗦𝘂𝗻𝘂𝗰𝘂</h3>
                        <p>${channel.guild.name}</p>
                    </div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        📋
                    </div>
                    <div class="stat-content">
                        <h3>𝗞𝗮𝘁𝗲𝗴𝗼𝗿𝗶</h3>
                        <p>${ticketData.kategori}</p>
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        💬
                    </div>
                    <div class="stat-content">
                        <h3>𝗧𝗼𝗽𝗹𝗮𝗺 𝗠𝗲𝘀𝗮𝗷</h3>
                        <p>${messageCount} mesaj</p>
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        ⏰
                    </div>
                    <div class="stat-content">
                        <h3>𝗔𝗰̧ı𝗸 𝗞𝗮𝗹𝗺𝗮 𝗦𝘂̈𝗿𝗲𝘀𝗶</h3>
                        <p>${hours}s ${minutes}d</p>
                    </div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        📅
                    </div>
                    <div class="stat-content">
                        <h3>𝗢𝗹𝘂𝘀̧𝘁𝘂𝗿𝘂𝗹𝗺𝗮</h3>
                        <p>${new Date(ticketData.createdAt).toLocaleString('tr-TR')}</p>
                    </div>
                </div>
            </div>
        </section>

        <main class="messages-section">
            ${imageMessages.length > 0 ? `
            <div class="images-section">
                <div class="section-header">
                    <h2 class="section-title">
                        🖼️ 𝗚𝗼̈𝗿𝘀𝗲𝗹 𝗜𝗰̧𝗲𝗿𝗶𝗸𝗹𝗲𝗿
                    </h2>
                    <div class="section-divider"></div>
                </div>
                
                <div class="images-grid">
                    ${imageMessages.map((msg, index) => {
                        return msg.attachments.map(att => `
                            <div class="image-card">
                                <img src="${att.url}" alt="Görsel ${index + 1}" class="image-preview" onclick="openModal('${att.url}')" loading="lazy">
                                <div class="image-info">
                                    <div class="image-author">${msg.author.tag}</div>
                                    <div>${msg.createdAt.toLocaleString('tr-TR')}</div>
                                </div>
                            </div>
                        `).join('');
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <div class="section-header">
                <h2 class="section-title">
                    📝 𝗠𝗲𝘀𝗮𝗷 𝗚𝗲𝗰̧𝗺𝗶𝘀̧𝗶
                </h2>
                <div class="section-divider"></div>
            </div>
            
            <div class="messages-container">
                ${messagesArray.length > 0 ? messagesArray.map(msg => {
                    const avatarUrl = msg.author.displayAvatarURL ? msg.author.displayAvatarURL({ format: 'png', size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const isOwner = msg.author.id === '773582512647569409';
                    const messageClass = msg.author.bot ? 'message bot-message' : (isOwner ? 'message owner-message' : 'message');
                    
                    return `
                    <div class="${messageClass}">
                        <img src="${avatarUrl}" alt="${msg.author.tag}" class="message-avatar" 
                             onerror="this.src='https://cdn.discordapp.com/embed/avatars/${msg.author.discriminator % 5}.png'">
                        <div class="message-content">
                            <div class="message-header">
                                <span class="message-author">${msg.author.tag}</span>
                                ${msg.author.bot ? '<span class="bot-badge">Bot</span>' : ''}
                                ${isOwner ? '<span class="owner-badge">👑 Sahip</span>' : ''}
                                <span class="message-timestamp">
                                    ⏰ ${msg.createdAt.toLocaleString('tr-TR')}
                                </span>
                            </div>
                            <div class="message-text">
                                ${msg.content || '<em style="opacity: 0.7;">Mesaj içeriği yok</em>'}
                            </div>
                        </div>
                    </div>`;
                }).join('') : `
                <div class="empty-state">
                    <div class="empty-icon">
                        💬
                    </div>
                    <h3>𝗠𝗲𝘀𝗮𝗷 𝗯𝘂𝗹𝘂𝗻𝗮𝗺𝗮𝗱ı</h3>
                    <p>Bu ticket'ta henüz mesaj bulunmuyor.</p>
                </div>`}
            </div>
        </main>

        <footer class="footer">
            <div class="footer-content">
                <div class="footer-logo">
                    <img src="${serverIcon}" alt="Server Icon">
                    <h3 class="footer-title">𝗭𝘆𝗽𝗵𝗲𝗿𝗶𝘀 𝗧𝗶𝗰𝗸𝗲𝘁 Sistemi</h3>
                </div>
                
                <div class="footer-info">
                    <div class="footer-item">
                        <strong>Sunucu:</strong> ${channel.guild.name}
                    </div>
                    <div class="footer-item">
                        <strong>Kanal:</strong> ${channel.name}
                    </div>
                    <div class="footer-item">
                        <strong>Oluşturan:</strong> ${ticketOwner ? ticketOwner.user.tag : 'Bilinmiyor'}
                    </div>
                    <div class="footer-item">
                        <strong>Transcript:</strong> ${new Date().toLocaleString('tr-TR')}
                    </div>
                </div>
                
                <div class="footer-copyright">
                    ❤️ <strong>Lashk ticket sistemi</strong> - kahpelere inat yapmaya devam
                    <br>
                    <small>Bu transcript lashk sayesinde oluşturulmuştur</small>
                </div>
            </div>
        </footer>
    </div>

    <!-- Image Modal -->
    <div id="imageModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <img class="modal-image" id="modalImage">
        </div>
    </div>

    <script>
        document.documentElement.style.scrollBehavior = 'smooth';
        
        window.addEventListener('load', function() {
            document.body.style.opacity = '0';
            document.body.style.transform = 'translateY(20px)';
            document.body.style.transition = 'all 0.6s ease';
            
            setTimeout(() => {
                document.body.style.opacity = '1';
                document.body.style.transform = 'translateY(0)';
            }, 100);
        });

        document.querySelectorAll('.stat-card, .message').forEach(el => {
            el.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-4px) scale(1.02)';
            });
            
            el.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0) scale(1)';
            });
        });

        function openModal(imageUrl) {
            const modal = document.getElementById('imageModal');
            const modalImage = document.getElementById('modalImage');
            modal.style.display = 'block';
            modalImage.src = imageUrl;
        }

        function closeModal() {
            const modal = document.getElementById('imageModal');
            modal.style.display = 'none';
        }
        window.onclick = function(event) {
            const modal = document.getElementById('imageModal');
            if (event.target === modal) {
                closeModal();
            }
        }
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closeModal();
            }
        });
    </script>
</body>
</html>`;
    } catch (error) {
        console.error('Transcript oluşturulurken hata:', error);
        return `<html><body><h1>Transcript oluşturulamadı</h1><p>Hata: ${error.message}</p></body></html>`;
    }
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
                data.guilds[guildId] = {
                    adminRol: null,
                    logKanal: null,
                    ticketKanallari: [],
                    ayarlar: {
                        maxTicketSayisi: 1,
                        otomatikKapatma: false,
                        transcriptAktif: true,
                        autoDelete: true,
                        kategoriGuncelleme: true
                    }
                };
                interaction.client.data.save(data);
            }

            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;

                try {
                    await command.execute(interaction);
                } catch (error) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('⚠️ **𝗦𝗶𝘀𝘁𝗲𝗺 𝗛𝗮𝘁𝗮𝘀ı**')
                        .setDescription('> Komut çalıştırılırken bir hata oluştu! Lütfen daha sonra tekrar deneyin.')
                        .setColor('#EF4444')
                        .setTimestamp();
                    
                    await safeInteractionReply(interaction, { 
                        embeds: [errorEmbed], 
                        flags: ['Ephemeral']
                    });
                }
            }

            if (interaction.isStringSelectMenu()) {
                await handleSelectMenus(interaction, data, guildId);
            }

            if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_kategori_sec') {
                await handleTicketCategorySelection(interaction, data, guildId, config);
            }

            if (interaction.isButton()) {
                switch (interaction.customId) {
                    case 'ticket_kapat':
                        await handleTicketClose(interaction, data, guildId, config);
                        break;
                    case 'ticket_reopen':
                        await handleTicketReopen(interaction, data, guildId, config);
                        break;
                    case 'ticket_transcript':
                        await handleTicketTranscript(interaction, data, guildId, config);
                        break;
                    case 'ticket_bilgilendirme':
                        await handleTicketInfo(interaction, data, guildId, config);
                        break;
                }
            }

        } catch (error) {
            console.error('Interaction handler error:', error);
        }
    },
};

async function handleSelectMenus(interaction, data, guildId) {
    try {
        if (interaction.customId === 'setup_admin_rol') {
            const roleId = interaction.values[0];
            data.guilds[guildId].adminRol = roleId;
            interaction.client.data.save(data);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ **𝗔𝘆𝗮𝗿 𝗕𝗮𝘀̧𝗮𝗿ı𝗹ı!**')
                .setDescription(`> Admin rolü <@&${roleId}> olarak ayarlandı!`)
                .setColor('#9333EA')
                .setTimestamp();

            await safeInteractionReply(interaction, {
                embeds: [successEmbed],
                flags: ['Ephemeral']
            });
        }

        if (interaction.customId === 'setup_log_kanal') {
            const channelId = interaction.values[0];
            data.guilds[guildId].logKanal = channelId;
            interaction.client.data.save(data);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ **𝗔𝘆𝗮𝗿 𝗕𝗮𝘀̧𝗮𝗿ı𝗹ı!**')
                .setDescription(`> Log kanalı <#${channelId}> olarak ayarlandı!`)
                .setColor('#9333EA')
                .setTimestamp();

            await safeInteractionReply(interaction, {
                embeds: [successEmbed],
                flags: ['Ephemeral']
            });
        }
    } catch (error) {
        console.error('Select menu handler error:', error);
    }
}

async function handleTicketInfo(interaction, data, guildId, config) {
    try {
        const ticketVerisi = data.tickets?.[interaction.channel.id];
        if (!ticketVerisi) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ **𝗧𝗶𝗰𝗸𝗲𝘁 𝗕𝘂𝗹𝘂𝗻𝗮𝗺𝗮𝗱ı**')
                .setDescription('> Bu kanal için ticket verisi bulunamadı!')
                .setColor('#EF4444');

            return await safeInteractionReply(interaction, {
                embeds: [errorEmbed],
                flags: ['Ephemeral']
            });
        }

        const kategori = config.kategoriler.find(kat => kat.id === ticketVerisi.kategoriId);
        if (!kategori) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ **𝗞𝗮𝘁𝗲𝗴𝗼𝗿𝗶 𝗕𝘂𝗹𝘂𝗻𝗮𝗺𝗮𝗱ı**')
                .setDescription('> Ticket kategorisi bulunamadı!')
                .setColor('#EF4444');

            return await safeInteractionReply(interaction, {
                embeds: [errorEmbed],
                flags: ['Ephemeral']
            });
        }

        const infoEmbed = createInfoEmbed(kategori, interaction.guild);
        
        await safeInteractionReply(interaction, {
            embeds: [infoEmbed],
            flags: ['Ephemeral']
        });

    } catch (error) {
        console.error('Bilgilendirme handler error:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ **𝗛𝗮𝘁𝗮**')
            .setDescription('> Bilgilendirme gösterilirken hata oluştu!')
            .setColor('#EF4444');

        try {
            await safeInteractionReply(interaction, {
                embeds: [errorEmbed],
                flags: ['Ephemeral']
            });
        } catch (replyError) {
            console.error('Reply error:', replyError);
        }
    }
}

async function handleTicketCategorySelection(interaction, data, guildId, config) {
    const userId = interaction.user.id;

    try {
        if (!checkRateLimit(userId)) {
            const rateLimitEmbed = new EmbedBuilder()
                .setTitle('⏱️ **Rate Limit**')
                .setDescription('> Çok hızlı işlem yapmaya çalışıyorsunuz! Lütfen 10 saniye bekleyip tekrar deneyin.')
                .setColor('#F59E0B')
                .setTimestamp();

            return await safeInteractionReply(interaction, {
                embeds: [rateLimitEmbed],
                flags: ['Ephemeral']
            });
        }

        if (!acquireTicketLock(userId)) {
            const lockEmbed = new EmbedBuilder()
                .setTitle('🔄 **𝗜𝘀̧𝗹𝗲𝗺 𝗦𝘂̈𝗿𝘂̈𝘆𝗼𝗿**')
                .setDescription('> Zaten bir ticket oluşturma işleminiz devam ediyor. Lütfen bekleyin.')
                .setColor('#F59E0B')
                .setTimestamp();

            return await safeInteractionReply(interaction, {
                embeds: [lockEmbed],
                flags: ['Ephemeral']
            });
        }

        const kategoriId = interaction.values[0];
        const kategori = config.kategoriler.find(kat => kat.id === kategoriId);

        if (!kategori) {
            releaseTicketLock(userId);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ **𝗞𝗮𝘁𝗲𝗴𝗼𝗿𝗶 𝗕𝘂𝗹𝘂𝗻𝗮𝗺𝗮𝗱ı!**')
                .setDescription('> Seçilen kategori bulunamadı!')
                .setColor('#EF4444')
                .setTimestamp();

            return await safeInteractionReply(interaction, {
                embeds: [errorEmbed],
                flags: ['Ephemeral']
            });
        }

        if (!saatKontrol(kategori.acilisSaati, kategori.kapanisSaati)) {
            releaseTicketLock(userId);
            const timeEmbed = new EmbedBuilder()
                .setTitle('⏰ **𝗞𝗮𝗽𝗮𝗹ı 𝗦𝗮𝗮𝘁𝗹𝗲𝗿**')
                .setDescription(`> Bu kategori şu anda kapalı! Çalışma saatleri: ${kategori.acilisSaati} - ${kategori.kapanisSaati}`)
                .setColor('#F59E0B')
                .setTimestamp();

            return await safeInteractionReply(interaction, {
                embeds: [timeEmbed],
                flags: ['Ephemeral']
            });
        }

        const aktifTicketler = interaction.guild.channels.cache.filter(ch => 
            ch.topic && ch.topic.includes(`Ticket sahibi: ${userId}`) && 
            (ch.name.includes('-ticket') || ch.name.startsWith('ticket-'))
        );

        const maxTicket = 1;
        if (aktifTicketler.size >= maxTicket) {
            releaseTicketLock(userId);
            const limitEmbed = new EmbedBuilder()
                .setTitle('🚫 **𝗧𝗶𝗰𝗸𝗲𝘁 𝗟𝗶𝗺𝗶𝘁𝗶**')
                .setDescription('> Zaten açık bir ticket\'ınız bulunuyor! Önce mevcut ticket\'ınızı kapatın.')
                .addFields({
                    name: '📂 Açık Ticket\'ınız',
                    value: aktifTicketler.map(ch => ch.toString()).join('\n') || 'Bulunamadı',
                    inline: false
                })
                .setColor('#EF4444')
                .setTimestamp();

            return await safeInteractionReply(interaction, {
                embeds: [limitEmbed],
                flags: ['Ephemeral']
            });
        }

        await interaction.deferReply({ flags: ['Ephemeral'] });

        let ticketKategorisi = interaction.guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && 
            (c.name === config.ticketKategorisi.toUpperCase() || 
             c.name.startsWith(config.ticketKategorisi.toUpperCase() + ' ['))
        );

        if (!ticketKategorisi) {
            try {
                ticketKategorisi = await interaction.guild.channels.create({
                    name: config.ticketKategorisi.toUpperCase(),
                    type: ChannelType.GuildCategory,
                    position: 0
                });
            } catch (categoryError) {
                releaseTicketLock(userId);
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ **𝗞𝗮𝘁𝗲𝗴𝗼𝗿𝗶 𝗛𝗮𝘁𝗮𝘀ı**')
                    .setDescription('> Ticket kategorisi oluşturulamadı. Lütfen bot izinlerini kontrol edin.')
                    .setColor('#EF4444');

                return await interaction.editReply({
                    embeds: [errorEmbed]
                });
            }
        }

        const kullaniciAdi = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `${kullaniciAdi}-ticket`;
        
        try {
            const ticketKanali = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: ticketKategorisi.id,
                topic: `Ticket sahibi: ${userId} | Kategori: ${kategori.isim} | Oluşturulma: ${Date.now()}`,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: userId,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AddReactions,
                            PermissionFlagsBits.AttachFiles
                        ]
                    }
                ]
            });

            if (data.guilds[guildId].adminRol) {
                try {
                    await ticketKanali.permissionOverwrites.create(data.guilds[guildId].adminRol, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        ManageMessages: true
                    });
                } catch (permError) {
                    console.error('Permission error:', permError);
                }
            }

            try {
                await kategoriAdiniGuncelle(interaction.guild, config.ticketKategorisi);
            } catch (updateError) {
                console.error('Kategori adı güncellenirken hata:', updateError);
            }

            const ticketEmbed = createTicketEmbed(kategori, interaction.user, ticketKanali, channelName, interaction.guild);
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_kapat')
                    .setLabel('🔒 kapat')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('ticket_bilgilendirme')
                    .setLabel('📚 Bilgilendirme')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('ticket_transcript')
                    .setLabel('📄 Transcript')
                    .setStyle(ButtonStyle.Secondary)
            );
            try {
                await ticketKanali.send({
                    embeds: [ticketEmbed],
                    components: [buttonRow]
                });
            } catch (messageError) {
                console.error('Ticket mesajı gönderilirken hata:', messageError);
            }

            if (!data.tickets) data.tickets = {};
            data.tickets[ticketKanali.id] = {
                userId: userId,
                kategori: kategori.isim,
                kategoriId: kategori.id,
                createdAt: Date.now(),
                messageCount: 0,
                guildId: interaction.guild.id,
                ticketNumarasi: channelName,
                durum: 'acik'
            };
            interaction.client.data.save(data);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ **𝗧𝗶𝗰𝗸𝗲𝘁 𝗢𝗹𝘂𝘀̧𝘁𝘂𝗿𝘂𝗹𝗱𝘂!**')
                .setDescription(`> Ticket kanalınız: ${ticketKanali.toString()}`)
                .addFields(
                    { name: '📋 Kategori', value: kategori.isim, inline: true },
                    { name: '⏰ Oluşturulma', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                )
                .setColor('#9333EA')
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed]
            });

        } catch (channelError) {
            console.error('Kanal oluşturulurken hata:', channelError);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ **𝗞𝗮𝗻𝗮𝗹 𝗢𝗹𝘂𝘀̧𝘁𝘂𝗿𝗺𝗮 𝗛𝗮𝘁𝗮𝘀ı**')
                .setDescription('> Ticket kanalı oluşturulamadı. Lütfen bot izinlerini kontrol edin.')
                .setColor('#EF4444');

            await interaction.editReply({
                embeds: [errorEmbed]
            });
        }

    } catch (error) {
        console.error('Ticket oluşturulurken genel hata:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ **𝗚𝗲𝗻𝗲𝗹 𝗛𝗮𝘁𝗮!**')
            .setDescription('> Ticket oluşturulurken beklenmeyen bir hata oluştu. Lütfen yöneticilerle iletişime geçin.')
            .setColor('#EF4444');

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await safeInteractionReply(interaction, {
                    embeds: [errorEmbed],
                    flags: ['Ephemeral']
                });
            }
        } catch (replyError) {
            console.error('Reply gönderilirken hata:', replyError);
        }
    } finally {
        releaseTicketLock(userId);
    }
}

async function handleTicketClose(interaction, data, guildId, config) {
    try {
        const adminRol = data.guilds[guildId]?.adminRol;

        const hasPermission = 
            interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
            (adminRol && interaction.member.roles.cache.has(adminRol)) ||
            interaction.channel.topic?.includes(`Ticket sahibi: ${interaction.user.id}`);

        if (!hasPermission) {
            const noPermEmbed = new EmbedBuilder()
                .setTitle('🚫 **𝗬𝗲𝘁𝗸𝗶𝘀𝗶𝘇 𝗘𝗿𝗶𝘀̧𝗶𝗺**')
                .setDescription('> Bu işlem için yetkin yetersiz!')
                .setColor('#EF4444');

            return await safeInteractionReply(interaction, {
                embeds: [noPermEmbed],
                flags: ['Ephemeral']
            });
        }

        const ticketVerisi = data.tickets?.[interaction.channel.id];
        if (!ticketVerisi) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ **𝗧𝗶𝗰𝗸𝗲𝘁 𝗩𝗲𝗿𝗶𝘀𝗶 𝗬𝗼𝗸!**')
                .setDescription('> Bu kanal için ticket verisi bulunamadı!')
                .setColor('#EF4444');

            return await safeInteractionReply(interaction, {
                embeds: [errorEmbed],
                flags: ['Ephemeral']
            });
        }

        const confirmEmbed = new EmbedBuilder()
            .setTitle('🔒 **𝗧𝗶𝗰𝗸𝗲𝘁 𝗞𝗮𝗽𝗮𝘁𝗺𝗮 𝗢𝗻𝗮𝘆ı**')
            .setDescription('> Bu ticket\'ı kapatmak istediğinizden emin misiniz? Bu işlem geri alınamaz.')
            .setColor('#F59E0B');

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_close')
                .setLabel('✅ Evet, Kapat')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_close')
                .setLabel('❌ İptal')
                .setStyle(ButtonStyle.Secondary)
        );

        await safeInteractionReply(interaction, {
            embeds: [confirmEmbed],
            components: [confirmRow],
            flags: ['Ephemeral']
        });

        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 30000
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'confirm_close') {
                await processTicketClose(i, data, guildId, config, ticketVerisi);
            } else if (i.customId === 'cancel_close') {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ **İ𝗽𝗮𝗹 𝗘𝗱𝗶𝗹𝗱𝗶**')
                    .setDescription('> Ticket kapatma iptal edildi.')
                    .setColor('#6B7280');

                await safeInteractionUpdate(i, {
                    embeds: [cancelEmbed],
                    components: []
                });
            }
            collector.stop();
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                try {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ **𝗭𝗮𝗺𝗮𝗻 𝗔𝘀̧ı𝗺ı**')
                        .setDescription('> İşlem zaman aşımına uğradı.')
                        .setColor('#6B7280');

                    await interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: []
                    });
                } catch (error) {
                    console.error('Timeout mesajı gönderilirken hata:', error);
                }
            }
        });

    } catch (error) {
        console.error('Ticket kapatma işlemi sırasında hata:', error);
    }
}

async function processTicketClose(interaction, data, guildId, config, ticketVerisi) {
    try {
        try {
            await kategoriAdiniGuncelle(interaction.guild, config.ticketKategorisi, interaction.channel.id);
        } catch (updateError) {
            console.error('Kategori adı güncellenirken hata (kapatma sırasında):', updateError);
        }

        if (data.tickets && data.tickets[interaction.channel.id]) {
            data.tickets[interaction.channel.id].durum = 'kapali';
            data.tickets[interaction.channel.id].kapatilmaTarihi = Date.now();
            data.tickets[interaction.channel.id].kapatanId = interaction.user.id;
            interaction.client.data.save(data);
        }

        let ticketSahibi = null;
        try {
            ticketSahibi = await interaction.guild.members.fetch(ticketVerisi.userId);
        } catch (error) {
            console.error('Ticket sahibi fetch edilirken hata:', error);
        }
        
        let mesajlar, mesajSayisi = 0;
        try {
            mesajlar = await interaction.channel.messages.fetch({ limit: 100 });
            mesajSayisi = mesajlar.size;
        } catch (error) {
            console.error('Mesajlar fetch edilirken hata:', error);
            mesajlar = new Map();
        }

        const sure = Date.now() - ticketVerisi.createdAt;
        const saat = Math.floor(sure / (1000 * 60 * 60));
        const dakika = Math.floor((sure % (1000 * 60 * 60)) / (1000 * 60));
        const logKanali = interaction.guild.channels.cache.get(data.guilds[guildId]?.logKanal);
        
        if (logKanali) {
            try {
                const logEmbed = createLogEmbed(ticketVerisi, ticketSahibi, interaction.user, mesajSayisi, saat, dakika, interaction.guild);
                const transcriptHtml = await generateAdvancedTranscript(
                    interaction.channel,
                    ticketVerisi,
                    ticketSahibi,
                    mesajlar,
                    mesajSayisi,
                    saat,
                    dakika
                );

                const Buffer = require('buffer').Buffer;
                const attachment = {
                    attachment: Buffer.from(transcriptHtml, 'utf-8'),
                    name: `lashk-${ticketVerisi.ticketNumarasi}-${Date.now()}.html`
                };

                await logKanali.send({
                    content: `📋 **Ticket Log** - ${ticketVerisi.ticketNumarasi}`,
                    embeds: [logEmbed],
                    files: [attachment]
                });
            } catch (logError) {
                console.error('Log gönderilirken hata:', logError);
            }
        }
        
        const closeEmbed = new EmbedBuilder()
            .setTitle('✅ **𝗧𝗶𝗰𝗸𝗲𝘁 𝗞𝗮𝗽𝗮𝘁ı𝗹𝗱ı**')
            .setDescription('> Ticket başarıyla kapatıldı! 3 saniye içinde silinecek.')
            .addFields(
                { name: '📊 İstatistik', value: `${mesajSayisi} mesaj, ${saat}s ${dakika}d`, inline: true },
                { name: '🔒 Kapatan', value: interaction.user.toString(), inline: true }
            )
            .setColor('#22C55E')
            .setTimestamp();

        await safeInteractionUpdate(interaction, {
            embeds: [closeEmbed],
            components: []
        });
        
        setTimeout(async () => {
            try {
                if (data.tickets && data.tickets[interaction.channel.id]) {
                    if (!data.ticketHistory) data.ticketHistory = {};
                    data.ticketHistory[interaction.channel.id] = { 
                        ...data.tickets[interaction.channel.id]
                    };
                    delete data.tickets[interaction.channel.id];
                    interaction.client.data.save(data);
                }
                
                if (interaction.channel && !interaction.channel.deleted) {
                    await interaction.channel.delete('Ticket kapatıldı');
                }
                
            } catch (deleteError) {
                console.error('Kanal silinirken hata:', deleteError);
            }
        }, 3000);

    } catch (error) {
        console.error('Ticket kapatma işlemi sırasında hata:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ **𝗞𝗮𝗽𝗮𝘁𝗺𝗮 𝗛𝗮𝘁𝗮𝘀ı**')
            .setDescription('> Ticket kapatılırken hata oluştu.')
            .setColor('#EF4444');

        try {
            await safeInteractionUpdate(interaction, {
                embeds: [errorEmbed],
                components: []
            });
        } catch (updateError) {
            console.error('Hata mesajı güncellenirken hata:', updateError);
        }
    }
}

async function handleTicketReopen(interaction, data, guildId, config) {
    const errorEmbed = new EmbedBuilder()
        .setTitle('🚧 **𝗚𝗲𝗹𝗶𝘀̧𝘁𝗶𝗿𝗶𝗹𝗶𝘆𝗼𝗿**')
        .setDescription('> Bu özellik yakında eklenecek!')
        .setColor('#F59E0B');

    await safeInteractionReply(interaction, {
        embeds: [errorEmbed],
        flags: ['Ephemeral']
    });
}

async function handleTicketTranscript(interaction, data, guildId, config) {
    try {
        const ticketVerisi = data.tickets?.[interaction.channel.id];
        if (!ticketVerisi) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ **𝗧𝗶𝗰𝗸𝗲𝘁 𝗕𝘂𝗹𝘂𝗻𝗮𝗺𝗮𝗱ı!**')
                .setDescription('> Bu kanal için ticket verisi bulunamadı!')
                .setColor('#EF4444');

            return await safeInteractionReply(interaction, {
                embeds: [errorEmbed],
                flags: ['Ephemeral']
            });
        }

        await interaction.deferReply({ flags: ['Ephemeral'] });

        let mesajlar;
        try {
            mesajlar = await interaction.channel.messages.fetch({ limit: 100 });
        } catch (fetchError) {
            console.error('Mesajlar alınırken hata:', fetchError);
            mesajlar = new Map();
        }

        let ticketSahibi = null;
        try {
            ticketSahibi = await interaction.guild.members.fetch(ticketVerisi.userId);
        } catch (error) {
            console.error('Ticket sahibi fetch edilirken hata:', error);
        }
        
        const sure = Date.now() - ticketVerisi.createdAt;
        const saat = Math.floor(sure / (1000 * 60 * 60));
        const dakika = Math.floor((sure % (1000 * 60 * 60)) / (1000 * 60));

        const transcriptHtml = await generateAdvancedTranscript(
            interaction.channel,
            ticketVerisi,
            ticketSahibi,
            mesajlar,
            mesajlar.size,
            saat,
            dakika
        );

        const Buffer = require('buffer').Buffer;
        const attachment = {
            attachment: Buffer.from(transcriptHtml, 'utf-8'),
            name: `lashk-${ticketVerisi.ticketNumarasi}-${Date.now()}.html`
        };

        const transcriptEmbed = new EmbedBuilder()
            .setTitle('📄 **𝗧𝗿𝗮𝗻𝘀𝗰𝗿𝗶𝗽𝘁 𝗛𝗮𝘇ı𝗿!**')
            .setDescription(`> ${interaction.channel.name} transcript'i oluşturuldu.`)
            .addFields(
                { name: '📊 Mesaj Sayısı', value: `${mesajlar.size} mesaj`, inline: true },
                { name: '⏰ Süre', value: `${saat}s ${dakika}d`, inline: true }
            )
            .setColor('#9333EA')
            .setTimestamp();

        await interaction.editReply({
            embeds: [transcriptEmbed],
            files: [attachment]
        });

    } catch (error) {
        console.error('Transcript oluşturulurken hata:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ **𝗧𝗿𝗮𝗻𝘀𝗰𝗿𝗶𝗽𝘁 𝗛𝗮𝘁𝗮𝘀ı**')
            .setDescription('> Transcript oluşturulamadı. Tekrar deneyin.')
            .setColor('#EF4444');

        try {
            await interaction.editReply({
                embeds: [errorEmbed]
            });
        } catch (editError) {
            console.error('Hata mesajı güncellenirken hata:', editError);
        }
    }
}
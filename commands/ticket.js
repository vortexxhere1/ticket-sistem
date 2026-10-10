const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket menüsü oluştur')
        .addChannelOption(option =>
            option.setName('kanal')
                .setDescription('Ticket menüsünün gönderileceği kanal')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('kanal');
        const config = interaction.client.config;

        const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket Sistemi / Ticket System')
            .setDescription(config.mesajlar.ticketOlustur)
            .setColor(config.embed.renk)
            .setImage(config.embed.gorsel)
            .setFooter({
                text: config.embed.footer.metin,
                iconURL: config.embed.footer.ikon
            })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_kategori_sec')
            .setPlaceholder('Ticket oluşturmak için bir kategori seçin');
        config.kategoriler.forEach(kategori => {
            selectMenu.addOptions({
                label: kategori.isim,
                value: kategori.id,
                emoji: kategori.emoji
            });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);

        try {
            await channel.send({
                embeds: [embed],
                components: [row]
            });

            await interaction.reply({
                content: `✅ Ticket menüsü ${channel} kanalına başarıyla gönderildi!`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                content: '❌ Ticket menüsü gönderilirken bir hata oluştu!',
                ephemeral: true
            });
        }
    },
};
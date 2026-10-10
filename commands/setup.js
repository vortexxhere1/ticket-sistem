const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Ticket sistemi kurulumu')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const data = interaction.client.data.load();
        const guildId = interaction.guild.id;

        if (!data.guilds[guildId]) {
            data.guilds[guildId] = {
                adminRol: null,
                logKanal: null,
                ticketKanallari: []
            };
        }

        const embed = new EmbedBuilder()
            .setTitle('🛠️ Ticket Sistemi Kurulumu')
            .setDescription('Aşağıdaki menülerden kurulum ayarlarını yapın:')
            .addFields(
                {
                    name: '🔧 Admin Rolü',
                    value: data.guilds[guildId].adminRol ? `<@&${data.guilds[guildId].adminRol}>` : '❌ Ayarlanmamış',
                    inline: true
                },
                {
                    name: '📝 Log Kanalı',
                    value: data.guilds[guildId].logKanal ? `<#${data.guilds[guildId].logKanal}>` : '❌ Ayarlanmamış',
                    inline: true
                }
            )
            .setColor(interaction.client.config.embed.renk)
            .setTimestamp();

        const roleSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('setup_admin_rol')
            .setPlaceholder('Admin rolü seçin...')
            .setMaxValues(1);
        const roles = interaction.guild.roles.cache
            .filter(role => !role.managed && role.name !== '@everyone')
            .first(25);

        roles.forEach(role => {
            roleSelectMenu.addOptions({
                label: role.name,
                value: role.id,
                description: `${role.members.size} üye`,
                emoji: '😁'
            });
        });

        const channelSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('setup_log_kanal')
            .setPlaceholder('Log kanalı seçin...')
            .setMaxValues(1);
        const channels = interaction.guild.channels.cache
            .filter(channel => channel.type === 0)
            .first(25);

        channels.forEach(channel => {
            channelSelectMenu.addOptions({
                label: channel.name,
                value: channel.id,
                description: `#${channel.name}`,
                emoji: '📝'
            });
        });

        const row1 = new ActionRowBuilder().addComponents(roleSelectMenu);
        const row2 = new ActionRowBuilder().addComponents(channelSelectMenu);

        await interaction.reply({
            embeds: [embed],
            components: [row1, row2],
            ephemeral: true
        });
    },
};
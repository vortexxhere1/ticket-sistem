const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.config = config;
client.data = {
    load: () => {
        try {
            return JSON.parse(fs.readFileSync('./data.json', 'utf8'));
        } catch {
            return { guilds: {}, tickets: {} };
        }
    },
    save: (data) => {
        fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
    }
};
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}
const eventsPath = path.join(__dirname, 'events');
if (!fs.existsSync(eventsPath)) {
    fs.mkdirSync(eventsPath);
}

const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}
async function deployCommands() {
    const commands = [];
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(`./commands/${file}`);
        commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('🔄 Slash komutları yükleniyor...');
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands },
        );
        console.log('✅ Slash komutları başarıyla yüklendi!');
    } catch (error) {
        console.error('❌ Komut yükleme hatası:', error);
    }
}

client.login(config.token);
deployCommands();
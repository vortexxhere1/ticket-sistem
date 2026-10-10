module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`✅ ${client.user.tag} aktif!`);
        console.log(`📊 ${client.guilds.cache.size} sunucuda aktif`);
        console.log(`👥 ${client.users.cache.size} kullanıcıya hizmet veriyor`);
        client.user.setPresence({
            activities: [
                {
                    name: 'lashk',
                    type: 4 
                }
            ],
            status: 'dnd'
        });
    },
};

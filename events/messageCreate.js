module.exports = {
    name: 'messageCreate',
    execute(message) {
        if (message.author.bot) return;
        const data = message.client.data.load();
        if (data.tickets && data.tickets[message.channel.id]) {
            data.tickets[message.channel.id].messageCount++;
            message.client.data.save(data);
        }
    },
};
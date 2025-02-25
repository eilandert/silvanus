/* eslint-disable no-case-declarations */
/* eslint-disable indent */
// dotenv for handling environment variables
const dotenv = require('dotenv');
dotenv.config();
const token = process.env.TOKEN;
const statusChannelId = process.env.STATUSCHANNELID;

// Discord.JS
const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.MessageContent
	],
	partials: [
		Partials.Channel,
		Partials.Message
	],
});

// Various imports
const fn = require('./modules/functions.js');
const strings = require('./data/strings.json');
const dbfn = require('./modules/dbfn.js');
const { GuildInfo } = require('./modules/CustomClasses.js');
const isDev = process.env.DEBUG;
let statusChannel;

client.once('ready', async () => {
	fn.collectionBuilders.slashCommands(client);
	fn.collectionBuilders.dotCommands(client);
	fn.collectionBuilders.setvalidCommands(client);
	await fn.collectionBuilders.guildInfos(client);
	await fn.collectionBuilders.messageCollectors(client);
	const serverCount = client.guilds.cache.size;
	// checkRateLimits();
	console.log('Ready!');
	client.user.setActivity({ name: `${serverCount} trees grow.`, type: ActivityType.Watching });
	statusChannel = await client.channels.fetch(statusChannelId);
	if (isDev == 'false') {
		statusChannel.send(`${new Date().toISOString()} -- \nStartup Sequence Complete <@481933290912350209>`);
	}
});

// slash-commands
client.on('interactionCreate', async interaction => {
	if (interaction.isCommand()) {
		if (isDev) {
			// console.log(interaction);
		}
		const { commandName } = interaction;

		if (client.slashCommands.has(commandName)) {
			client.slashCommands.get(commandName).execute(interaction);
		} else {
			interaction.reply('Sorry, I don\'t have access to that command.');
			console.error('Slash command attempted to run but not found: ' + commandName);
		}
	}

	if (interaction.isButton()) {
		switch (interaction.component.customId) {
			case 'refresh':
				// console.log(JSON.stringify(interaction));
				await fn.refresh(interaction).catch(err => {
					interaction.channel.send(fn.builders.errorEmbed(err));
				});
				break;
			case 'deleteping':
				if (interaction.message.deletable) {
					await interaction.message.delete().catch(err => {
						// console.error(err);
					});
				}
				break;
			case 'waterpingrole':
				const waterPingStatus = await fn.buttonHandlers.waterPing(interaction);
				await interaction.reply(waterPingStatus).catch(e => console.error(e));
				break;
			case 'fruitpingrole':
				const fruitPingStatus = await fn.buttonHandlers.fruitPing(interaction);
				await interaction.reply(fruitPingStatus).catch(e => console.error(e));
				break;
			default:
				break;
		}
	}
});

client.on('messageUpdate', async (oldMessage, message) => {
	await fn.messages.updateHandler(message).catch(async e => {
		switch (e) {
			case strings.error.noCompareMessage:
				await message.channel.send(strings.error.noCompareMessage);
				break;
			default:
				break;
		}
	});
});

client.on('messageCreate', async message => {
	await fn.messages.updateHandler(message).catch(e => console.error(e));

	// Dot Command Handling
	// Some basic checking to prevent running unnecessary code
	if (message.author.bot) return;

	// Break the message down into its components and analyze it
	const commandData = fn.dotCommands.getCommandData(message);
	// if (isDev) console.log(commandData);

	if (commandData.isValid && commandData.isCommand) {
		try {
			client.dotCommands.get(commandData.command).execute(message, commandData);
		}
		catch (error) {
			console.error(error);
			message.reply('There was an error trying to execute that command.');
		}
	}
	return;
});

client.on('guildCreate', async guild => {
	const serverCount = client.guilds.cache.size;
	client.user.setActivity({ name: `${serverCount} trees grow.`, type: ActivityType.Watching });
	await statusChannel.send(`I've been added to a new guild: ${guild.name} (${guild.id})`);
	const guildInfo = new GuildInfo()
		.setIds(guild.id, guild.ownerId);
	const setBasicQuery = guildInfo.queryBuilder("setBasic");
	await dbfn.setGuildInfo(setBasicQuery).catch(e => console.error(e));
});

client.on('guildDelete', async guild => {
	const serverCount = client.guilds.cache.size;
	client.user.setActivity({ name: `${serverCount} trees grow.`, type: ActivityType.Watching });
	await statusChannel.send(`I've been removed from a guild: ${guild.name} (${guild.id})`);
	if (client.guildInfos.has(guild.id)) {
		let guildInfo = client.guildInfos.get(guild.id);
		guildInfo.setReminders(undefined, undefined, undefined, undefined, false);
		const setRemindersQuery = guildInfo.queryBuilder("setReminders");
		await dbfn.setGuildInfo(setRemindersQuery);
	}
});

async function checkRateLimits(hi) {
	const axios = require('axios');

	// Make a GET request to the Discord API
	await axios.get('https://discord.com/api/v10/users/@me', {
		headers: {
			'Authorization': `Bot ${token}`
		}
	}).then(response => {
		// Get the rate limit headers
		const remaining = response.headers['x-ratelimit-remaining'];
		const reset = response.headers['x-ratelimit-reset'];

		// Log the rate limit headers
		console.log(`Remaining requests: ${remaining}`);
		console.log(`Reset time (Unix epoch seconds): ${reset}`);
	}).catch(error => {
		console.error(error);
	});
	await fn.sleep(500).then(async () =>{
		await checkRateLimits();
	})
}

process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection (pls dont break up with me):', error);
});

client.login(token);
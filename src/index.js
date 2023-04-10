const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve('../.env') });
const { google } = require('googleapis');
dotenv.config();
const token = process.env.botToken;
const ytKey = process.env.youTubeKey;
const { OpusEncoder } = require('@discordjs/opus');
const { Client, Events, GatewayIntentBits, EmbedBuilder} = require('discord.js');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { joinVoiceChannel, createAudioPlayer, createVolumeTransformer, NoSubscriberBehavior, createAudioResource,AudioPlayerStatus, StreamType } = require('@discordjs/voice');


const youtube = google.youtube({
    version: 'v3',
    auth: ytKey,
  });


// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
  });



// Set up queue for music playback
const queue = new Map();

// client.on("message", async message => {
//   if (message.content === "!unmute2") {
//     const voiceChannel = message.member.voice.channel;
//     if (!voiceChannel) {
//       return message.reply("You need to be in a voice channel to use this command.");
//     }
//     const connection = await voiceChannel.join();
//     connection.voice.setSelfMute(false);
//     message.channel.send("I have been unmuted!");
//   }
// });

client.on('messageCreate', async (message) => {
    
  const voiceChannel = message.member.voice.channel;
  if (message.content === '!join') {
    if (voiceChannel) {
      try {
        const connection = await joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          lfDeaf: false // Set selfDeaf to false to prevent the bot from being deafened
        });
        console.log(`Connected to ${voiceChannel.name}!`);
      } catch (error) {
        console.error(error);
      }
    } else {
      message.reply('You need to join a voice channel first!');
    }
  }
  try {
    const connection = await voiceChannel.join();
    const audioStreamUrl = await getAudioStream(url);
    const ffmpegArgs = [
      '-i',
      audioStreamUrl,
      '-f',
      'opus',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ];
    const ffmpegProcess = await new Promise((resolve) => {
      const process = require('child_process').spawn(ffmpeg, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      process.once('readable', () => resolve(process));
    });
    const opusStream = ffmpegProcess.stdout;

    playAudioStream(connection, opusStream);
  } catch (error) {
    console.error(error);
   
  }
});

// Command to search for music by name and display a list of search results
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!searchmusic')) {
    return;
  }

  const query = message.content.slice(13);
  const maxResults = 10;

  // Search for videos
  const searchResponse = await youtube.search.list({
    q: query,
    type: 'video',
    part: 'id,snippet',
    maxResults: maxResults,
  });

  // Extract video IDs and titles from search results
  const videos = searchResponse.data.items.map((item, index) => {
    return {
      id: item.id.videoId,
      title: item.snippet.title,
      index: index + 1,
    };
  });

  // Create a message with the list of search results
  const embed = new EmbedBuilder()
    .setTitle(`Search results for "${query}"`)
    .setColor('#0099ff');

    const fields = videos.map(video => ({
        name: `${video.index}. ${video.title}`,
        value: `[Watch on YouTube](https://www.youtube.com/watch?v=${video.id})`
      }));
      embed.addFields(fields);
      

  message.channel.send({ embeds: [embed] });

  // Allow user to select a video to play
  const filter = (m) => m.author.id === message.author.id;
  const response = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
  const choice = response.first().content;

  if (!/^\d+$/.test(choice) || parseInt(choice) < 1 || parseInt(choice) > videos.length) {
    message.channel.send('Invalid choice, please try again.');
    return;
  }

  // Add selected video to queue and join voice channel
  const selectedVideo = videos[parseInt(choice) - 1];
  const voiceChannel = message.member.voice.channel;

  if (!voiceChannel) {
    message.channel.send('You need to be in a voice channel to play music!');
    return;
  }

  const serverQueue = queue.get(message.guild.id);
  const song = {
    title: selectedVideo.title,
    url: `https://www.youtube.com/watch?v=${selectedVideo.id}`,
  };

  if (!serverQueue) {
    const queueConstruct = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 5,
      playing: true,
    };

    queue.set(message.guild.id, queueConstruct);
    queueConstruct.songs.push(song);

    try {
        const connection = joinVoiceChannel(
            {
                channelId: message.member.voice.channel,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            });
            
      queueConstruct.connection = connection;
      connection.subscribe(player);
      play(message.guild, queueConstruct.songs[0]);
    } catch (err) {
      console.log(err);
      queue.delete(message.guild.id);
      return message.channel.send(err);
    }
  } else {
    serverQueue.songs.push(song);
    return message.channel.send(`${song.title} has been added to the queue!`);
  }
});

// Function to play the music
const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
      autoPlay: true // Enable auto-play behavior

    },
  });
  
  async function play(guild, song) {
    const serverQueue = queue.get(guild.id);
  
    if (!song) {
      serverQueue.voiceChannel.leave();
      queue.delete(guild.id);
      return;
    }
  
    const stream = await getAudioStream(song.url);
    const resource = createAudioResource(stream);
    player.play(resource);
  
    player.on(AudioPlayerStatus.Idle, () => {
      serverQueue.songs.shift();
      play(guild, serverQueue.songs[0]);
    });
  
    player.on(AudioPlayerStatus.Error, (error) => {
      console.error(error);
    });
    
    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
  }
    
    // Function to get the audio stream for a YouTube video URL
    async function getAudioStream(url) {
      const metadata = await new ffmpeg(url).then(video => video.metadata);
    
      const duration = metadata.duration.seconds;
      const format = metadata.video.streams[0].width === 3 ? '2' : '251';
    
      return `https://www.youtube.com/watch?v=${url.slice(-11)}&t=0s&${format}=true&start=0&end=${duration}`;
    }
    
    client.once(Events.ClientReady, c => {
      console.log(`Ready! Logged in as ${c.user.tag}`);
    });
// Log in to Discord with your client's token
client.login(token);
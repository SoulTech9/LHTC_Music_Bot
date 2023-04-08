const Discord = require("discord.js")
const ytdl = require("ytdl-core")
import dotenv from 'dotenv';
const client = new Discord.Client()

dotenv.config();





client.on("ready", () => {
    console.log(`logged in as ${client.user.tag}`)
})


client.login(process.env.)
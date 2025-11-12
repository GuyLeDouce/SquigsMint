// index.js - Squigs Mint Bot (polling version)

const { Client, GatewayIntentBits, EmbedBuilder, Events } = require("discord.js");
const { ethers } = require("ethers");

// ---------- Config ----------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// Use HTTP RPC for reliable polling
const ALCHEMY_HTTP_URL = process.env.ALCHEMY_HTTP_URL;

// Squigs contract
const CONTRACT_ADDRESS = "0x9bf567ddf41b425264626d1b8b2c7f7c660b1c42";

// Optional: set a start block manually via env if you want
const START_BLOCK_ENV = process.env.START_BLOCK;

// ABI just for Transfer event
const ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

// --- Basic sanity checks ---
if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN env var");
}
if (!DISCORD_CHANNEL_ID) {
  console.error("Missing DISCORD_CHANNEL_ID env var");
}
if (!ALCHEMY_HTTP_URL) {
  console.error("Missing ALCHEMY_HTTP_URL env var");
}

// Ethers (v5 style)
const provider = new ethers.providers.JsonRpcProvider(ALCHEMY_HTTP_URL);
const iface = new ethers.utils.Interface(ABI);

const TRANSFER_TOPIC = iface.getEventTopic("Transfer");
const ZERO_ADDRESS = ethers.constants.AddressZero;

let lastCheckedBlock;

// ---------- Discord client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent // so !minttest works reliably
  ]
});

// Build and send the embed for a mint
async function postMint(tokenId, minter) {
  try {
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setTitle(`Squig #${tokenId} has been minted by ${minter}`)
      .setDescription(
        `[Check it out on OpenSea](https://opensea.io/assets/ethereum/${CONTRACT_ADDRESS}/${tokenId})`
      )
      .setImage(
        `https://assets.bueno.art/images/a49527dc-149c-4cbc-9038-d4b0d1dbf0b2/default/${tokenId}`
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    console.log(`Posted mint: tokenId=${tokenId}, minter=${minter}`);
  } catch (err) {
    console.error("Error posting mint to Discord:", err);
  }
}

// Poll for new mints
async function pollForMints() {
  try {
    const latestBlock = await provider.getBlockNumber();

    // First run: set starting block
    if (lastCheckedBlock === undefined) {
      if (START_BLOCK_ENV) {
        lastCheckedBlock = parseInt(START_BLOCK_ENV, 10);
        console.log(`Using START_BLOCK from env: ${lastCheckedBlock}`);
      } else {
        lastCheckedBlock = latestBlock;
        console.log(`Initial lastCheckedBlock set: ${lastCheckedBlock}`);
      }
      return;
    }

    if (latestBlock <= lastCheckedBlock) {
      // Nothing new to check yet
      return;
    }

    const fromBlock = lastCheckedBlock + 1;
    const toBlock = latestBlock;

    console.log(`Checking logs from block ${fromBlock} to ${toBlock}...`);

    const logs = await provider.getLogs({
      address: CONTRACT_ADDRESS,
      fromBlock,
      toBlock,
      topics: [
        TRANSFER_TOPIC,
        ethers.utils.hexZeroPad(ZERO_ADDRESS, 32) // from == 0x000... for mints
      ]
    });

    if (logs.length > 0) {
      console.log(`Found ${logs.length} mint log(s).`);
    }

    for (const log of logs) {
      const parsed = iface.parseLog(log);
      const { from, to, tokenId } = parsed.args;

      // Extra safety check
      if (from.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
        await postMint(tokenId.toString(), to);
      }
    }

    lastCheckedBlock = latestBlock;
  } catch (err) {
    console.error("Error in pollForMints:", err);
  }
}

// Discord ready
client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

// Test command: type !minttest in your channel to see a sample embed
client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;

  if (message.content.startsWith("!minttest")) {
    await postMint("9999", "0x0000000000000000000000000000000000000000");
    await message.reply("Posted a test mint embed.");
  }
});

// Start everything
async function start() {
  console.log("Starting Squigs Mint Bot (polling mode)...");
  await client.login(DISCORD_TOKEN);

  console.log("Starting polling loop (15s)...");
  setInterval(pollForMints, 15000);
}

start().catch((err) => {
  console.error("Fatal error in start():", err);
  process.exit(1);
});


import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { ethers } from 'ethers';

// -------- ENV --------
const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_ID,
  ALCHEMY_WS_URL,
  CONTRACT_ADDRESS = '0x9bf567ddf41b425264626d1b8b2c7f7c660b1c42',
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID || !ALCHEMY_WS_URL) {
  console.error('Missing env vars. Check DISCORD_TOKEN, DISCORD_CHANNEL_ID, ALCHEMY_WS_URL');
  process.exit(1);
}

// -------- Constants --------
const ZERO = '0x0000000000000000000000000000000000000000';
const IMAGE_BASE = 'https://assets.bueno.art/images/a49527dc-149c-4cbc-9038-d4b0d1dbf0b2/default';
const OPENSEA_BASE = `https://opensea.io/item/ethereum/${CONTRACT_ADDRESS}`;

// ERC-721 minimal ABI for Transfer
const ERC721_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

// Dedup cache (avoid dupes on reconnects)
const seen = new Set();

// -------- Discord Client --------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// -------- Provider + Subscription with Reconnect --------
let provider;
let contract;
let subscriptionActive = false;
let backoffMs = 1000;

async function connectProvider() {
  try {
    provider = new ethers.WebSocketProvider(ALCHEMY_WS_URL);
    contract = new ethers.Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);

    provider._websocket?.on('close', (code) => {
      console.warn(`WS closed: ${code}. Reconnecting...`);
      resubscribeWithBackoff();
    });
    provider._websocket?.on('error', (err) => {
      console.error('WS error:', err?.message ?? err);
      resubscribeWithBackoff();
    });

    await subscribe();
    backoffMs = 1000; // reset on success
  } catch (err) {
    console.error('Provider connect error:', err?.message ?? err);
    resubscribeWithBackoff();
  }
}

async function subscribe() {
  if (subscriptionActive) return;
  console.log('Subscribing to Transfer events...');
  contract.on('Transfer', handleTransfer);
  subscriptionActive = true;
  console.log('Subscribed.');
}

function unsubscribe() {
  if (!subscriptionActive) return;
  contract.removeListener('Transfer', handleTransfer);
  subscriptionActive = false;
}

function resubscribeWithBackoff() {
  unsubscribe();
  try { provider?.destroy?.(); } catch {}
  provider = null;
  setTimeout(connectProvider, backoffMs);
  backoffMs = Math.min(backoffMs * 2, 60_000);
}

// -------- Event Handler --------
async function handleTransfer(from, to, tokenIdBn, event) {
  try {
    if ((from?.toLowerCase?.() ?? '') !== ZERO) return; // Only mints
    const tokenId = tokenIdBn.toString();

    // Prevent duplicates on occasional WS replay
    const key = `${event.log.blockHash}:${event.log.transactionHash}:${tokenId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const minter = to;
    const title = `Squig #${tokenId} has been minted by ${minter}`;
    const imageUrl = `${IMAGE_BASE}/${tokenId}`;
    const openseaUrl = `${OPENSEA_BASE}/${tokenId}`;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`[Check it out on OpenSea](${openseaUrl})`)
      .setImage(imageUrl)
      .setTimestamp(new Date())
      .setFooter({ text: 'Squigs Mint Alert' });

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    await channel.send({ embeds: [embed] });

    console.log(`Posted mint: tokenId=${tokenId} minter=${minter}`);
  } catch (err) {
    console.error('handleTransfer error:', err?.message ?? err);
  }
}

// -------- Start --------
(async () => {
  await client.login(DISCORD_TOKEN);
  await connectProvider();
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  unsubscribe();
  try { provider?.destroy?.(); } catch {}
  process.exit(0);
});

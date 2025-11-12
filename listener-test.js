require('dotenv').config();
const { WebSocketProvider, Contract } = require('ethers');

const ALCHEMY_WSS_URL = process.env.ALCHEMY_WSS_URL; // or whatever your env var name is
const CONTRACT_ADDRESS = '0x9bf567ddf41b425264626d1b8b2c7f7c660b1c42'; // Squigs contract

// Minimal ERC721 ABI for Transfer events
const ERC721_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

async function main() {
  if (!ALCHEMY_WSS_URL) {
    console.error('Missing ALCHEMY_WSS_URL env var');
    process.exit(1);
  }

  console.log('Connecting to Alchemy WSS...');
  const provider = new WebSocketProvider(ALCHEMY_WSS_URL);
  const contract = new Contract(CONTRACT_ADDRESS, ERC721_ABI, provider);

  console.log('Listening for Squigs Transfer events...');

  contract.on('Transfer', (from, to, tokenId, event) => {
    const id = tokenId.toString();

    if (from === '0x0000000000000000000000000000000000000000') {
      console.log(`[MINT EVENT] tokenId=${id} -> ${to} | tx=${event.transactionHash}`);
    } else {
      console.log(`[TRANSFER ONLY] tokenId=${id} ${from} -> ${to} | tx=${event.transactionHash}`);
    }
  });

  provider._websocket.on('close', (code) => {
    console.log(`WebSocket closed with code ${code}.`);
  });

  provider._websocket.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
}

main().catch((err) => {
  console.error('Listener error:', err);
});

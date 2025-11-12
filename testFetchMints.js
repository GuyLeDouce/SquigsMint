require('dotenv').config();
const { ethers } = require('ethers');

// === CONFIG ===
const ALCHEMY_HTTP_URL = process.env.ALCHEMY_HTTP_URL;
const CONTRACT_ADDRESS = '0x9bf567ddf41b425264626d1b8b2c7f7c660b1c42'; // Squigs contract

// Minimal ABI just for Transfer events
const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

async function main() {
  if (!ALCHEMY_HTTP_URL) {
    console.error("Missing ALCHEMY_HTTP_URL in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(ALCHEMY_HTTP_URL);
  const iface = new ethers.Interface(abi);

  const latestBlock = await provider.getBlockNumber();

  // Look back a reasonable range; adjust if needed
  const lookbackBlocks = 8000; // ~1-2 days, depends on traffic
  const fromBlock = Math.max(latestBlock - lookbackBlocks, 0);
  const toBlock = latestBlock;

  console.log(`Querying Transfer events for Squigs from block ${fromBlock} to ${toBlock}...`);

  const logs = await provider.getLogs({
    address: CONTRACT_ADDRESS,
    fromBlock,
    toBlock,
    topics: [iface.getEventTopic("Transfer")]
  });

  console.log(`Total Transfer logs in range: ${logs.length}`);

  const mints = logs
    .map((log) => {
      const decoded = iface.decodeEventLog("Transfer", log.data, log.topics);
      return {
        from: decoded.from,
        to: decoded.to,
        tokenId: decoded.tokenId.toString(),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      };
    })
    // Mint = from zero address
    .filter((e) => e.from.toLowerCase() === ethers.ZeroAddress.toLowerCase())
    .sort((a, b) => Number(a.tokenId) - Number(b.tokenId));

  console.log(`Detected ${mints.length} mints in this block range.\n`);

  // Show the last 25 mints so you can compare to Discord
  const recent = mints.slice(-25);

  for (const mint of recent) {
    console.log(
      `tokenId=${mint.tokenId} | to=${mint.to} | block=${mint.blockNumber} | tx=${mint.txHash}`
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error in testFetchMints:", err);
});

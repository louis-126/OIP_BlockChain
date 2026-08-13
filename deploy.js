/**
 * deploy.js — xhampterr contract deployer
 *
 * Matches the hendrikebbers/oth-summer-school repo pattern:
 * uses ContractCreateFlow which handles bytecode chunking and
 * contract creation in one step (no separate FileCreateTransaction needed).
 *
 * Usage
 * ─────
 *   # From a Remix-exported artifact JSON:
 *   node deploy.js ./artifacts/xhampterr.json
 *
 *   # With constructor topics (bytes32 array):
 *   node deploy.js ./artifacts/xhampterr.json --topics "TopicA" "TopicB" "TopicC"
 *
 *   # Custom gas limit:
 *   node deploy.js ./artifacts/xhampterr.json --topics "Yes" "No" --gas 400000
 *
 * Prerequisites
 * ─────────────
 *   npm install
 *   cp .env.example .env   # fill in your Testnet operator ID + private key
 *
 * Getting Testnet credentials: https://portal.hedera.com/
 */

"use strict";

const {
    Client,
    ContractCreateFlow,
    ContractFunctionParameters,
    PrivateKey,
    AccountId,
    Hbar,
} = require("@hashgraph/sdk");

require("dotenv").config();

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────

const DEFAULT_GAS = 5_000_000;

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Extract bytecode hex from a Remix / Hardhat / solc artifact JSON or a raw .bin file. */
function loadBytecode(filePath) {
    const fs   = require("fs");
    const path = require("path");
    const raw  = fs.readFileSync(filePath, "utf8").trim();

    if (filePath.endsWith(".bin")) {
        // raw hex bytecode
        return raw.startsWith("0x") ? raw.slice(2) : raw;
    }

    // Artifact JSON — Remix exports under data.bytecode.object or bytecode
    const artifact = JSON.parse(raw);
    const hex =
        artifact?.data?.bytecode?.object ||   // Remix JSON format
        artifact?.bytecode ||                  // Hardhat / Foundry
        artifact?.evm?.bytecode?.object;       // solc standard output

    if (!hex) throw new Error("Could not locate bytecode in the artifact JSON.");
    return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/** Convert a plain string to a right-padded bytes32 (matching Solidity bytes32). */
function stringToBytes32(text) {
    if (text.length > 32) throw new Error(`Topic "${text}" exceeds 32 characters.`);
    const buf = Buffer.alloc(32);
    buf.write(text, "utf8");
    return buf;
}

/** Parse CLI args into { artifactPath, topics, gas }. */
function parseArgs(argv) {
    const args       = argv.slice(2);
    const artifactPath = args[0];

    if (!artifactPath) {
        console.error("Usage: node deploy.js <artifact.json|artifact.bin> [--topics ...] [--gas N]");
        process.exit(1);
    }

    const topics = [];
    let gas      = DEFAULT_GAS;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === "--topics") {
            // collect all following non-flag tokens as topic strings
            while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                topics.push(args[++i]);
            }
        } else if (args[i] === "--gas" && args[i + 1]) {
            gas = parseInt(args[++i], 10);
        }
    }

    return { artifactPath, topics, gas };
}

// ─────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────

async function main() {
    // 1. Parse CLI
    const { artifactPath, topics, gas } = parseArgs(process.argv);

    // 2. Load bytecode
    const bytecodeHex = loadBytecode(artifactPath);
    console.log(`\nBytecode loaded  (${bytecodeHex.length / 2} bytes)`);

    // 3. Connect to Hedera Testnet  (from .env)
    const operatorId  = AccountId.fromString(process.env.OPERATOR_ID);
    const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY);

    const client = Client.forTestnet();
    client.setOperator(operatorId, operatorKey);
    client.setDefaultMaxTransactionFee(new Hbar(100));
    client.setMaxQueryPayment(new Hbar(50));
    console.log(`Connected to Hedera Testnet as ${operatorId}`);

    // 4. Build constructor parameters — bytes32[] for topic names
    let constructorParams = null;

    if (topics.length > 0) {
        console.log(`\nConstructor topics (${topics.length}):`);
        topics.forEach((t, i) => console.log(`  [${i}] "${t}"`));

        const bytes32Array = topics.map(stringToBytes32);

        constructorParams = new ContractFunctionParameters()
            .addBytes32Array(bytes32Array);
    } else {
        console.warn("\nNo --topics provided — contract will have 0 proposals.");
        constructorParams = new ContractFunctionParameters()
            .addBytes32Array([]);
    }

    // 5. Deploy via ContractCreateFlow  (matches repo pattern)
    console.log(`\nDeploying with gas = ${gas} …`);

    const flow = new ContractCreateFlow()
        .setBytecode(bytecodeHex)
        .setGas(gas)
        .setConstructorParameters(constructorParams);

    const txResponse = await flow.execute(client);
    const receipt    = await txResponse.getReceipt(client);
    const contractId = receipt.contractId;

    // 6. Print results  (matches repo README output format)
    const evmAddress = `0x${contractId.toSolidityAddress()}`;
    const hashscanUrl = `https://hashscan.io/testnet/contract/${contractId}`;

    console.log("\n✅ Contract deployed successfully");
    console.log(`  Contract ID : ${contractId}`);
    console.log(`  EVM address : ${evmAddress}`);
    console.log(`  HashScan    : ${hashscanUrl}`);
    console.log(`\nSave the Contract ID — you will need it in call.js.`);
}

main().catch((err) => {
    console.error("\n❌ Deployment failed:", err.message ?? err);
    process.exit(1);
});

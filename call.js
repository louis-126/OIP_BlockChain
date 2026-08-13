/**
 * call.js — xhampterr contract interaction script (interactive menu edition)
 *
 * Matches the hendrikebbers/oth-summer-school repo pattern:
 *   - "query"   mode  → ContractCallQuery           (free, view/pure functions)
 *   - "execute" mode  → ContractExecuteTransaction   (state-changing, costs gas)
 *
 * Instead of editing CONFIG.ACTION by hand, run:
 *   node call.js
 *
 * ...and pick an action from the on-screen menu. It will ask you for any
 * extra input it needs (proposal index, address, etc.), run the call,
 * print the result, then bring you back to the menu. Choose "Exit" to quit.
 *
 * CONTRACT_ID is still read from .env (CONTRACT_ID=...) so you don't have
 * to paste it in every time — but the menu will let you override it for
 * the current session if you want to point at a different contract.
 */

"use strict";

const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const {
    Client,
    ContractCallQuery,
    ContractExecuteTransaction,
    ContractFunctionParameters,
    ContractId,
    PrivateKey,
    AccountId,
    AccountInfoQuery,
} = require("@hashgraph/sdk");

require("dotenv").config();

// ─────────────────────────────────────────────
//  ★  CONFIG — defaults, still overridable via .env
// ─────────────────────────────────────────────

const CONFIG = {
    CONTRACT_ID: process.env.CONTRACT_ID || "0.0.REPLACE_ME",
    GAS: 100_000,
};

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Decode a bytes32 return value to a readable string. */
function bytes32ToString(buf) {
    return Buffer.from(buf).toString("utf8").replace(/\0/g, "");
}

/** Validate an EVM/Solidity address and return it with a 0x prefix. */
function normalizeEvmAddress(value) {
    const match = value.trim().match(/^(?:0x)?([0-9a-fA-F]{40})$/);
    if (!match) {
        throw new Error(
            "Enter a Hedera account ID (for example 0.0.1234) " +
            "or a 20-byte EVM address (0x followed by 40 hex characters).",
        );
    }

    return `0x${match[1].toLowerCase()}`;
}

/**
 * Resolve either a Hedera account ID or an EVM address to the address Solidity
 * sees as msg.sender. AccountInfoQuery is important for ECDSA accounts because
 * their EVM alias is not necessarily the long-zero form of 0.0.x.
 */
async function resolveAccountIdentity(client, value) {
    const inputAddress = value.trim();
    if (!inputAddress) {
        throw new Error("An account ID or EVM address is required.");
    }

    let accountLookup;
    if (inputAddress.includes(".")) {
        try {
            accountLookup = AccountId.fromString(inputAddress);
        } catch {
            throw new Error(
                `Invalid Hedera account ID "${inputAddress}". Expected a value like 0.0.1234.`,
            );
        }
    } else {
        const evmAddress = normalizeEvmAddress(inputAddress);
        accountLookup = AccountId.fromEvmAddress(0, 0, evmAddress);
    }

    const accountInfo = await new AccountInfoQuery()
        .setAccountId(accountLookup)
        .execute(client);

    if (!accountInfo.contractAccountId) {
        throw new Error(`No EVM address was found for Hedera account ${accountInfo.accountId}.`);
    }

    return {
        accountId: accountInfo.accountId.toString(),
        evmAddress: normalizeEvmAddress(accountInfo.contractAccountId),
    };
}

async function resolveEvmAddress(client, value) {
    const identity = await resolveAccountIdentity(client, value);
    return identity.evmAddress;
}

async function runQuery(client, contractId, methodName, params, gas) {
    const query = new ContractCallQuery()
        .setContractId(contractId)
        .setGas(gas)
        .setFunction(methodName, params ?? undefined);

    return query.execute(client);
}

async function runExecute(client, contractId, methodName, params, gas) {
    const tx = new ContractExecuteTransaction()
        .setContractId(contractId)
        .setGas(gas)
        .setFunction(methodName, params ?? undefined);

    const txResponse = await tx.execute(client);
    return txResponse.getReceipt(client);
}

// ─────────────────────────────────────────────
//  Menu definition
// ─────────────────────────────────────────────
// Each entry: { label, hint, run(rl, client, contractId) }
// "rl" is the readline interface, used to prompt for any extra input.

const MENU = [
    {
        key: "winner",
        label: "Show current winner",
        async run(rl, client, contractId) {
            const res = await runQuery(client, contractId, "winner", null, CONFIG.GAS);
            const name = bytes32ToString(res.getBytes32(0));
            const index = res.getUint256(1);
            const votes = res.getUint256(2);
            console.log("\nResult");
            console.log(`  Winner name  : ${name || "(no votes yet)"}`);
            console.log(`  Winner index : ${index}`);
            console.log(`  Vote count   : ${votes}`);
        },
    },
    {
        key: "getResults",
        label: "Show full scoreboard",
        async run(rl, client, contractId) {
            const countRes = await runQuery(client, contractId, "proposalCount", null, CONFIG.GAS);
            const total = Number(countRes.getUint256(0));

            console.log("\nFull Scoreboard");
            for (let i = 0; i < total; i++) {
                const params = new ContractFunctionParameters().addUint256(i);
                const res = await runQuery(client, contractId, "proposals", params, CONFIG.GAS);
                const name = bytes32ToString(res.getBytes32(0));
                const count = res.getUint256(1).toString();
                console.log(`  [${i}] ${name.padEnd(20)} ${count} vote(s)`);
            }
        },
    },
    {
        key: "proposalCount",
        label: "Show number of proposals",
        async run(rl, client, contractId) {
            const res = await runQuery(client, contractId, "proposalCount", null, CONFIG.GAS);
            console.log(`\nResult\n  Proposal count : ${res.getUint256(0)}`);
        },
    },
    {
        key: "vote",
        label: "Vote for a proposal",
        async run(rl, client, contractId) {
            const answer = await rl.question("  Proposal index to vote for (0-based): ");
            const proposalIndex = parseInt(answer, 10);
            if (Number.isNaN(proposalIndex)) {
                console.log("  ⚠ Not a valid number, aborting.");
                return;
            }
            const params = new ContractFunctionParameters().addUint256(proposalIndex);
            const receipt = await runExecute(client, contractId, "vote", params, CONFIG.GAS);
            console.log(`\nResult\n  Vote cast for proposal [${proposalIndex}]`);
            console.log(`  Status : ${receipt.status}`);
        },
    },
    {
        key: "hasVoted",
        label: "Check if an address has voted",
        async run(rl, client, contractId) {
            const account = await rl.question(
                "  Hedera account ID (0.0.x) or EVM address (0x...): ",
            );
            const identity = await resolveAccountIdentity(client, account);
            const params = new ContractFunctionParameters().addAddress(identity.evmAddress);
            const res = await runQuery(client, contractId, "hasVoted", params, CONFIG.GAS);
            console.log(`\nResult`);
            console.log(`  Hedera account ID : ${identity.accountId}`);
            console.log(`  EVM address       : ${identity.evmAddress}`);
            console.log(`  Has voted         : ${res.getBool(0)}`);
        },
    },
    {
        key: "isBlacklisted",
        label: "Check if an address is blacklisted",
        async run(rl, client, contractId) {
            const account = await rl.question(
                "  Hedera account ID (0.0.x) or EVM address (0x...): ",
            );
            const identity = await resolveAccountIdentity(client, account);
            const params = new ContractFunctionParameters().addAddress(identity.evmAddress);
            const res = await runQuery(client, contractId, "isBlacklisted", params, CONFIG.GAS);
            console.log(`\nResult`);
            console.log(`  Hedera account ID : ${identity.accountId}`);
            console.log(`  EVM address       : ${identity.evmAddress}`);
            console.log(`  Is blacklisted    : ${res.getBool(0)}`);
        },
    },
    {
        key: "addToBlacklist",
        label: "(admin) Add an address to the blacklist",
        async run(rl, client, contractId) {
            const address = await rl.question("  Address to blacklist (0x...): ");
            const params = new ContractFunctionParameters().addAddress(address);
            const receipt = await runExecute(client, contractId, "addToBlacklist", params, CONFIG.GAS);
            console.log(`\nResult\n  ${address} added to blacklist`);
            console.log(`  Status : ${receipt.status}`);
        },
    },
    {
        key: "removeFromBlacklist",
        label: "(admin) Remove an address from the blacklist",
        async run(rl, client, contractId) {
            const address = await rl.question("  Address to remove (0x...): ");
            const params = new ContractFunctionParameters().addAddress(address);
            const receipt = await runExecute(client, contractId, "removeFromBlacklist", params, CONFIG.GAS);
            console.log(`\nResult\n  ${address} removed from blacklist`);
            console.log(`  Status : ${receipt.status}`);
        },
    },
    {
        key: "stringToBytes32",
        label: "Helper: encode a string to bytes32",
        async run(rl, client, contractId) {
            const text = await rl.question("  Text to encode (max 32 chars): ");
            const params = new ContractFunctionParameters().addString(text);
            const res = await runQuery(client, contractId, "stringToBytes32", params, CONFIG.GAS);
            const hex = "0x" + Buffer.from(res.getBytes32(0)).toString("hex");
            console.log(`\nResult\n  bytes32 of "${text}" : ${hex}`);
        },
    },
];

// ─────────────────────────────────────────────
//  Menu rendering / input loop
// ─────────────────────────────────────────────

function printMenu(contractId) {
    console.log("\n──────────────────────────────────────────");
    console.log(` xhampterr — Hedera Testnet contract menu`);
    console.log(` Contract: ${contractId}`);
    console.log("──────────────────────────────────────────");
    MENU.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.label}`);
    });
    console.log(`  0. Exit`);
    console.log("──────────────────────────────────────────");
}

async function main() {
    // Connect to Hedera Testnet
    const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
    const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY);

    const client = Client.forTestnet();
    client.setOperator(operatorId, operatorKey);

    const contractId = ContractId.fromString(CONFIG.CONTRACT_ID);

    const rl = readline.createInterface({ input, output });

    console.log(`\nOperator  : ${operatorId}`);

    try {
        while (true) {
            printMenu(CONFIG.CONTRACT_ID);
            const choice = await rl.question("Select an action (number): ");
            const trimmed = choice.trim();

            if (trimmed === "0" || trimmed.toLowerCase() === "exit") {
                console.log("\nBye!");
                break;
            }

            const index = parseInt(trimmed, 10) - 1;
            const item = MENU[index];

            if (!item) {
                console.log("  ⚠ Not a valid choice, try again.");
                continue;
            }

            try {
                await item.run(rl, client, contractId);
            } catch (err) {
                console.error("\n❌ Action failed:", err.message ?? err);
            }
        }
    } finally {
        rl.close();
        client.close();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error("\n❌ Fatal error:", err.message ?? err);
        process.exit(1);
    });
}

module.exports = { normalizeEvmAddress, resolveAccountIdentity, resolveEvmAddress };

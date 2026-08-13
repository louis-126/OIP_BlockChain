# LJDvoting — Hedera Testnet Voting Contract

`LJDvoting` is a Solidity voting application deployed to the Hedera Testnet. Voting topics are set when the contract is deployed, each account may vote once, results can be queried from an interactive Node.js menu, and only the account that deployed the contract can manage the blacklist.

## Features

- Define voting topics in the contract constructor.
- Allow each EVM account address to vote exactly once.
- Show the current winner and the full scoreboard.
- Check voting and blacklist status using either a Hedera account ID (`0.0.x`) or an EVM address (`0x...`).
- Let only the contract owner add accounts to or remove accounts from the blacklist.
- Resolve Hedera account IDs and EVM aliases before querying Solidity mappings.

## Project files

| File | Purpose |
| --- | --- |
| `LJDvoting.sol` | Solidity voting contract |
| `LJDvoting.json` | Compiled contract artifact used for deployment |
| `compile.js` | Compiles the Solidity source into the deployment artifact |
| `deploy.js` | Deploys the contract and supplies its constructor topics |
| `call.js` | Opens the interactive contract menu |
| `.env.example` | Example Hedera Testnet configuration |

## Requirements

- Node.js 18 or newer
- npm
- One or more funded Hedera Testnet accounts
- ECDSA private keys for accounts used by the scripts

Testnet accounts can be created through the [Hedera Portal](https://portal.hedera.com/).

## Installation

Install the dependencies:

```powershell
npm install
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

```dotenv
# Account used for voting, queries, and ordinary contract calls
OPERATOR_ID=0.0.YOUR_OPERATOR_ACCOUNT
OPERATOR_KEY=0xYOUR_OPERATOR_ECDSA_PRIVATE_KEY

# Account that deploys/owns the contract and signs menu actions 7 and 8
OWNER_ID=0.0.YOUR_OWNER_ACCOUNT
OWNER_KEY=0xYOUR_OWNER_ECDSA_PRIVATE_KEY

# Fill this in after deployment
CONTRACT_ID=0.0.YOUR_CONTRACT_ID
```

`OWNER_ID` and `OWNER_KEY` are optional as a pair. If both are omitted, the program uses the operator as the owner. Never commit `.env` or expose private keys; `.env` is excluded by `.gitignore`.

## Account roles

### Operator

The operator configured with `OPERATOR_ID` and `OPERATOR_KEY` performs ordinary calls, including voting. To demonstrate voting with multiple accounts, stop the program, replace the operator credentials with another Testnet account, and run it again.

### Owner

The owner is the account that deploys the contract. The Solidity constructor records the deployer's EVM address, and the contract permits only that address to execute blacklist changes.

When `OWNER_ID` and `OWNER_KEY` are configured:

- `deploy.js` deploys the contract using the owner account.
- Menu options 7 and 8 are signed using the owner account.
- `call.js` checks the configured owner against the owner recorded on-chain before submitting either transaction.

This contract has no ownership-transfer function. If the private key for an existing contract's deployer is unavailable, deploy a new contract with the desired owner and update `CONTRACT_ID`.

## Compiling the contract

Compile the Solidity source using the pinned compiler version:

```powershell
npm run compile
```

This regenerates `LJDvoting.json` with the contract ABI and bytecode.

## Deploying the contract

Deploy the included artifact and provide at least two voting topics:

```powershell
node deploy.js .\LJDvoting.json --topics "Topic A" "Topic B" "Topic C"
```

Topic strings must be no longer than 32 characters. An optional gas limit can also be supplied:

```powershell
node deploy.js .\LJDvoting.json --topics "Yes" "No" --gas 5000000
```

After a successful deployment, the script prints the contract ID, EVM address, and HashScan link. Copy the new contract ID into `.env`:

```dotenv
CONTRACT_ID=0.0.NEW_CONTRACT_ID
```

The deployer supports Remix, Hardhat, or Solidity JSON artifacts containing bytecode, as well as raw `.bin` bytecode files.

## Running the interactive menu

Start the program with either command:

```powershell
npm run call
```

```powershell
node call.js
```

The menu provides:

| Number | Action | Who can use it |
| ---: | --- | --- |
| 1 | Show the current winner | Anyone |
| 2 | Show the full scoreboard | Anyone |
| 3 | Show the number of proposals | Anyone |
| 4 | Vote for a proposal | Current operator, once |
| 5 | Check whether an account has voted | Anyone |
| 6 | Check whether an account is blacklisted | Anyone |
| 7 | Add an account to the blacklist | Contract owner only |
| 8 | Remove an account from the blacklist | Contract owner only |
| 0 | Exit | Anyone |

Options 5–8 accept either form:

```text
Hedera account ID: 0.0.1234567
EVM address:       0x1234567890abcdef1234567890abcdef12345678
```

The program resolves the account and displays both identifiers. Solidity ultimately checks the EVM address because voter and blacklist data are stored in `mapping(address => ...)` values.

## Voting and blacklist rules

- A non-blacklisted address can vote once.
- A vote cannot be changed or removed.
- Blacklisting an address after it voted does not remove its existing vote.
- Removing an address from the blacklist does not reset its voting history.
- Options 7 and 8 check the current blacklist state before submitting a transaction.

## Troubleshooting

### `Cannot read properties of undefined (reading 'startsWith')`

The environment file is missing or `OPERATOR_ID`/`OPERATOR_KEY` is undefined. Create `.env` and provide both values.

### `Configured owner signer ... did not deploy this contract`

The `OWNER_ID` account is not the account that deployed the contract referenced by `CONTRACT_ID`. Use that deployer's account and private key, or redeploy with the configured owner.

### Address validation error

Enter either a complete Hedera account ID such as `0.0.1234567` or a 20-byte EVM address containing exactly 40 hexadecimal characters after `0x`.

### Vote transaction fails

Check that the proposal index exists, the operator is not blacklisted, and the operator has not already voted.

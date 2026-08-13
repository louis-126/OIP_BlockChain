/**
 * Compile LJDvoting.sol and write the deployable LJDvoting.json artifact.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");

const SOURCE_FILE = "LJDvoting.sol";
const CONTRACT_NAME = "LJDvoting";
const ARTIFACT_FILE = "LJDvoting.json";

function compileContract() {
    const sourceCode = fs.readFileSync(path.join(__dirname, SOURCE_FILE), "utf8");
    const compilerInput = {
        language: "Solidity",
        sources: {
            [SOURCE_FILE]: { content: sourceCode },
        },
        settings: {
            optimizer: { enabled: false },
            outputSelection: {
                "*": {
                    "*": [
                        "abi",
                        "evm.bytecode.object",
                        "evm.deployedBytecode.object",
                        "metadata",
                    ],
                },
            },
        },
    };

    const compilerOutput = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
    const diagnostics = compilerOutput.errors ?? [];

    for (const diagnostic of diagnostics) {
        const writeDiagnostic = diagnostic.severity === "error"
            ? console.error
            : console.warn;
        writeDiagnostic(diagnostic.formattedMessage.trim());
    }

    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        throw new Error("Solidity compilation failed.");
    }

    const contractOutput = compilerOutput.contracts?.[SOURCE_FILE]?.[CONTRACT_NAME];
    if (!contractOutput?.evm?.bytecode?.object) {
        throw new Error(`Compiler output does not contain ${CONTRACT_NAME} bytecode.`);
    }

    const artifact = {
        contractName: CONTRACT_NAME,
        sourceName: SOURCE_FILE,
        compiler: { version: solc.version() },
        abi: contractOutput.abi,
        bytecode: contractOutput.evm.bytecode.object,
        deployedBytecode: contractOutput.evm.deployedBytecode.object,
        metadata: JSON.parse(contractOutput.metadata),
    };
    const artifactPath = path.join(__dirname, ARTIFACT_FILE);
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    console.log(`Compiled ${CONTRACT_NAME} with Solidity ${solc.version()}`);
    console.log(`Artifact written to ${artifactPath}`);
}

try {
    compileContract();
} catch (error) {
    console.error(`Compilation failed: ${error.message ?? error}`);
    process.exit(1);
}

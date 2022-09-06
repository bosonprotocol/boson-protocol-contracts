const hre = require("hardhat");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");

const prefix = "contracts/interfaces/";

// folders to check. Folder names are relative to "contracts/interfaces"
const sources = ["clients", "diamond", "handlers"];

async function verifyNatspecIntefaceId() {
  let missingInfo = [];
  let wrongIntefaceId = [];

  // get all interface ids
  const InterfaceIds = await getInterfaceIds();

  // get build info
  const contractNames = await hre.artifacts.getAllFullyQualifiedNames();

  for (let contractName of contractNames) {
    const [source, name] = contractName.split(":");

    // skip contracts that are not in the source folders
    if (!sources.some((s) => source.startsWith(`${prefix}${s}`))) continue;

    const description = JSON.parse(
      (await hre.artifacts.getBuildInfo(contractName)).output.contracts[source][name].metadata
    ).output.userdoc.notice;

    if (!description) {
      missingInfo.push({ name, error: "Missing userdoc" });
      continue;
    }

    const identifier = "The ERC-165 identifier for this interface is:";
    const startErc165Info = description.indexOf(identifier);

    if (startErc165Info < 0) {
      missingInfo.push({ name, error: "Missing ERC-165 info" });
      continue;
    }

    const erc165identifier = description.slice(
      startErc165Info + identifier.length + 1,
      startErc165Info + identifier.length + 11
    );

    if (erc165identifier !== InterfaceIds[name]) {
      wrongIntefaceId.push({ name, natspecInfo: erc165identifier, trueInterfaceId: InterfaceIds[name] });
    }
  }

  if (missingInfo.length > 0) {
    console.log("MISSING INTERFACE IDS");
    console.table(missingInfo);
  }

  if (wrongIntefaceId.length > 0) {
    console.error("WRONG INTERFACE IDS");
    console.table(wrongIntefaceId);
  }

  if (missingInfo.length == 0 && wrongIntefaceId.length == 0) {
    console.log("everything ok");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

verifyNatspecIntefaceId();

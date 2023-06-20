const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
const BN = ethers.BigNumber.from;

console.log("network", network);

async function main() {
    let bn = await ethers.provider.getBlockNumber();
    console.log("block number", bn);

    const signatures = [
        "0x23b872dd", // transferFrom(address,address,uint256)
        "0xb88d4fde", // safeTransferFrom(address,address,uint256,bytes)
        "0xf242432a", // safeTransferFrom(address,address,uint256,uint256,bytes)
    ]

    const sigToType = {
        "0x23b872dd": "20",
        "0xb88d4fde": "721",
        "0xf242432a": "1155",
    }
    
    const sigStat = {
        "0x23b872dd": {n: 0, gas: BN(0), min: BN(30000000), max: BN(0), avg: BN(0)},
        "0xb88d4fde": {n: 0, gas: BN(0), min: BN(30000000), max: BN(0), avg: BN(0)},
        "0xf242432a": {n: 0, gas: BN(0), min: BN(30000000), max: BN(0), avg: BN(0)},
    }

    let n = 5000;

    for (let i = 0; i < n; i++) {
        let blockNumber = bn - i;

        console.log(i, blockNumber)
        let block;

        try {
            block = await ethers.provider.getBlockWithTransactions(blockNumber);
        } catch (e) {
            console.log("error", e);
            continue;
        }

        for (const tx of block.transactions) {
            if (signatures.some(s => tx.data.startsWith(s))) {
                const sig = tx.data.slice(0, 10);
                try {
                    let {gasUsed} = await tx.wait();

                    sigStat[sig].n++;
                    sigStat[sig].gas = sigStat[sig].gas.add(gasUsed);

                    if (gasUsed.lt(sigStat[sig].min)) {
                        sigStat[sig].min = gasUsed;
                    }

                    if (gasUsed.gt(sigStat[sig].max)) {
                        sigStat[sig].max = gasUsed;
                    }

                    sigStat[sig].avg = sigStat[sig].gas.div(sigStat[sig].n);
                } catch (e) {

                }
            }            
        }
    }

    console.log("sigStat", sigStat);
}

main()
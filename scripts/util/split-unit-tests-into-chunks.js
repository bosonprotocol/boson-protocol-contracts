// Script to split tests into chunks. Use with npx hardhat split-unit-tests-into-chunks 4
const fs = require("fs");
const { findFiles } = require("./find-test-files");
const shell = require("shelljs");

/**
Run unit tests and generates chunks of tests with approximately the same execution time in order to run them in parallel on GHA

@param {number} chunks - Number of chunks to divide the tests into
*/
const splitUnitTestsIntoChunks = async (chunks) => {
  let files = await findFiles("test", ["integration", "util", "upgrade"]);

  files = files.map((f) => {
    const startTime = Date.now();
    shell.exec(`npx hardhat test ${f}`);
    const endTime = Date.now();

    const time = endTime - startTime;
    return { name: f, time };
  });

  // Sort in the descending the list by the time it took to run
  files.sort((a, b) => b.time - a.time);

  // Sum the total time of all tests
  const timeTotal = files.reduce((acc, result) => {
    return acc + parseFloat(result.time);
  }, 0);

  console.log(`Total unit tests execution time: ${timeTotal}s`);

  // Calculate the average time that each chunk should take
  const timePerChunk = timeTotal / chunks;

  // Create a list of chunks
  const filesByChunk = [...Array(Number(chunks))].map(() => []);
  const totalTimePerChunk = new Array(Number(chunks)).fill(0);

  // Iterate over the list of files and add them to the chunks
  for (const item of files) {
    // Get order of chunks by time
    let indices = [...Array(Number(chunks)).keys()];
    indices.sort((a, b) => totalTimePerChunk[b] - totalTimePerChunk[a]);

    // Put item in the most filled chunk where it's still below the average time per chunk
    let found;
    for (const index of indices) {
      if (totalTimePerChunk[index] + item.time <= timePerChunk) {
        filesByChunk[index].push(item.name);
        totalTimePerChunk[index] += item.time;
        found = true;
        break;
      }
    }

    // If adding test exceeded the average time per chunk, add it to the most empty chunk
    if (!found) {
      const chunkIndex = indices[indices.length - 1];
      filesByChunk[chunkIndex].push(item.name);
      totalTimePerChunk[chunkIndex] += item.time;
    }
  }

  console.log("Chunks", filesByChunk);
  console.log("Time per chunk", totalTimePerChunk);

  // Save output to test-chunks.txt file
  fs.writeFileSync("./test/util/test-chunks.txt", JSON.stringify(filesByChunk, null, 2));
};

exports.splitUnitTestsIntoChunks = splitUnitTestsIntoChunks;

// Script to split tests into chunks. Used on `test/util/generate-test-chunks.sh`
const fs = require("fs");
const { findFiles } = require("./find-test-files");
const shell = require("shelljs");

/**
Run unit tests and generates chunks of tests with approximatly the same execution time in order to run them in parallel on GHA

@param {number} chunks - Number of chunks to divide the tests into
*/
const splitUnitTestsIntoChunks = async (chunks) => {
  files = await findFiles("test", ["integration", "util"]);

  files = files.map((f) => {
    const startTime = Date.now();
    shell.exec(`npx hardhat test ${f}`);
    const endTime = Date.now();

    const time = endTime - startTime;
    return { name: f, time };
  });

  // Sort the list by the time it took to run
  files = files.sort((a, b) => a.time - b.time);

  // Sum the total time of all tests
  const timeTotal = files.reduce((acc, result) => {
    return acc + parseFloat(result.time);
  }, 0);

  console.log(`Total unit tests execution time: ${timeTotal}s`);

  // Calculate the average time that each chunk should take
  const timePerChunk = timeTotal / chunks;

  // Create a list of chunks
  const filesByChunk = [...Array(Number(chunks))].map(() => []);

  let currentChunk = 0;
  let currentChunkTime = 0;

  // Iterate over the list of files and add them to the chunks
  for (const item of files) {
    // If the sum of the current chunk time + the current file time is greater than the average time per chunk, move to the next chunk and reset currentChunkTime
    const sum = currentChunkTime + item.time;
    if (sum > timePerChunk && currentChunk < chunks - 1) {
      currentChunk++;

      currentChunkTime = item.time;
    } else {
      // Otherwise add the current file time to the current chunk time
      currentChunkTime += item.time;
    }
    // Add the current file name to the current chunk
    filesByChunk[currentChunk].push(item.name);
  }

  console.log("Chunks", filesByChunk);

  // Save output to test-chunks.txt file
  fs.writeFileSync("./test/util/test-chunks.txt", JSON.stringify(filesByChunk, null, 2));
};

exports.splitUnitTestsIntoChunks = splitUnitTestsIntoChunks;

// Script to split tests into chunks. Used on `test/util/generate-test-chunks.sh`
const fs = require("fs");

// The number of chunks to split the tests into
const chunks = process.argv[2];
// The path to the temporary file with the outputs of `time` command, created on `test/util/generate-test-chunks.sh` (`time-report.txt`)
const timeReportFile = process.argv[3];
// A list of tests to split
let files = JSON.parse(process.argv[4]);

fs.readFile(timeReportFile, "utf8", (_, data) => {
  // Each line contains the result of `time` command for a test following the same order of `files` list
  const lines = data.split("\n");

  // Map the list of test names to a list of objects containing the test name and the time it took to run
  files = files.map((file, index) => {
    const line = lines[index];

    if (line) {
      const time = Number(line.split(" ")[5].replace("s", ""));
      return { name: file, time };
    }
  });

  // Remove undefined values from the list if any and sort the list by the time it took to run
  files = files.filter((result) => !!result).sort((a, b) => a.time - b.time);

  // Sum the total time of all tests
  const timeTotal = files.reduce((acc, result) => {
    return acc + parseFloat(result.time);
  }, 0);

  console.log(`Total tests execution time: ${timeTotal}s`);

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

  fs.writeFileSync("./test/util/test-chunks.txt", JSON.stringify(filesByChunk, null, 2));
});

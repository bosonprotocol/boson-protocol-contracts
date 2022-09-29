const fs = require("fs");

const chunks = process.argv[2];
const filePath = process.argv[3];
const files = process.argv[4];

fs.readFile(filePath, "utf8", (err, data) => {
  const lines = data.split("\n");

  let result = files.split(",").map((file, index) => {
    const line = lines[index];

    if (line) {
      const time = Number(line.split(" ")[5].replace("s", ""));
      return { name: file, time };
    }
  });

  result = result.filter((result) => !!result);
  result.sort((a, b) => a.time - b.time);

  const timeTotal = result.reduce((acc, result) => {
    return acc + parseFloat(result.time);
  }, 0);
  // console.log(result);
  console.log(`Total time: ${timeTotal}s`);

  const timePerChunk = timeTotal / chunks;

  console.log("time per chunk", timePerChunk);

  const filesByChunk = [...Array(Number(chunks))].map(() => []);

  let currentChunk = 0;
  let currentChunkTime = 0;

  for (const item of result) {
    const sum = currentChunkTime + item.time;
    if (sum > timePerChunk && currentChunk < chunks - 1) {
      currentChunk++;
      currentChunkTime = item.time;
    } else {
      currentChunkTime += item.time;
    }
    filesByChunk[currentChunk].push(item);
  }
  console.log(filesByChunk.map((chunks) => chunks.reduce((acc, chunk) => acc + chunk.time, 0)));
});

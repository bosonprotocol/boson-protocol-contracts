const fs = require("fs");

const chunks = process.argv[2];
const filePath = process.argv[3];
const files = JSON.parse(process.argv[4]);

fs.readFile(filePath, "utf8", (_, data) => {
  const lines = data.split("\n");

  let result = files.map((file, index) => {
    const line = lines[index];

    if (line) {
      const time = Number(line.split(" ")[5].replace("s", ""));
      return { name: file, time };
    }
  });

  result = result.filter((result) => !!result).sort((a, b) => a.time - b.time);

  const timeTotal = result.reduce((acc, result) => {
    return acc + parseFloat(result.time);
  }, 0);

  console.log(`Total time: ${timeTotal}s`);

  const timePerChunk = timeTotal / chunks;

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
    filesByChunk[currentChunk].push(item.name);
  }

  console.log("Chunks", filesByChunk);

  fs.writeFileSync("./test-chunks.txt", JSON.stringify(filesByChunk));
});

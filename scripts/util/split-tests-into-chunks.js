const fs = require("fs").promises;

const files = [];
let count = 0;

// Counts the number of unit tests in a file
async function countTests(file) {
  const data = await fs.readFile(file, "utf8");
  return data.split('it("').length - 1;
}

// Find all files in a directory and its subdirectories
async function findFiles(directory, foldersToIgnore = []) {
  const directories = await fs.readdir(directory);

  for (const file of directories) {
    const filePath = `${directory}/${file}`;

    if (foldersToIgnore.includes(file)) {
      continue;
    }

    const isDirectory = (await fs.stat(filePath)).isDirectory();

    if (isDirectory) {
      await findFiles(filePath, foldersToIgnore);
    } else {
      files.push(filePath);
      count += await countTests(filePath);
    }
  }
}

/**
 * Split the files into chunks of different or equal sizes
 * @param {number} chunks - The number of chunks to split the files into
 * @param {number} chunkWeights - The weight of each chunk, used to determine the size of each chunk
 * @returns {array} - An array of arrays, where each array is a chunk of files
 */
async function splitTestIntoChunks(chunks = 1, chunkWeights = []) {
  await findFiles("test", ["integration", "utils"]);

  let currentGroup = 0;
  let currentGroupCount = 0;

  const filesByGroup = [...Array(chunks)].map(() => []);

  let numOfTestsByGroup;
  // If weights are provided, calculate the number of tests for each group based on the weights
  if (chunkWeights.length) {
    numOfTestsByGroup = chunkWeights.map((weight) => Math.ceil((weight / 100) * count));
  } else {
    const quantityByGroup = Math.ceil(count / chunks);
    numOfTestsByGroup = [...Array(chunks)].map(() => quantityByGroup);
  }

  for (const file of files) {
    currentGroupCount += await countTests(file);

    if (currentGroupCount >= numOfTestsByGroup[currentGroup] && currentGroup < chunks - 1) {
      currentGroup++;
      currentGroupCount = 0;
    }

    filesByGroup[currentGroup].push(file);
  }
  return filesByGroup;
}

// Execute the script
// The first chunk has the highest weight because tests inside the domain folder don't involve EVM calls so they run faster
splitTestIntoChunks(4, [50, 15, 15, 20]).then((result) => {
  console.log(JSON.stringify(result));
});

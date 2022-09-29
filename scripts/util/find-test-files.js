const fs = require("fs").promises;

const files = [];

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
    }
  }
}

findFiles("test", ["integration", "utils"]).then(() => {
  console.log(JSON.stringify(files));
});

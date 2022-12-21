const fs = require("fs").promises;

const files = [];

// Find all files in a directory and its subdirectories
async function findFiles(directory, subdirectoriesToIgnore = []) {
  const directories = await fs.readdir(directory);

  for (const file of directories) {
    const filePath = `${directory}/${file}`;

    if (subdirectoriesToIgnore.includes(file)) {
      continue;
    }

    const isDirectory = (await fs.stat(filePath)).isDirectory();

    if (isDirectory) {
      await findFiles(filePath, subdirectoriesToIgnore);
    } else {
      files.push(filePath);
    }
  }

  return files;
}

exports.findFiles = findFiles;

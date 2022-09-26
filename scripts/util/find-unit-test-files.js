const fs = require("fs");

const files = [];

function findFiles(directory, foldersToIgnore = []) {
  fs.readdirSync(directory).forEach((file) => {
    const path = directory + "/" + file;
    if (fs.lstatSync(path).isDirectory()) {
      findFiles(path, foldersToIgnore);
    } else if (foldersToIgnore.every((folder) => !path.includes(folder)) && file.endsWith(".js")) {
      files.push(path);
    }
  });
}

findFiles("test", ["integration"]);

console.log(JSON.stringify(files, null, 2));

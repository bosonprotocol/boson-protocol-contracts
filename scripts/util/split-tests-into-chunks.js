const fs = require("fs").promises;

const files = [];
let count = 0;

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
      const data = await fs.readFile(filePath, "utf8");
      count += data.split('it("').length - 1;
    }
  }
}

async function execute(groups = 3) {
  await findFiles("test", ["integration", "utils"]);

  const quantityByGroup = Math.ceil(count / groups);

  let currentGroup = 0;
  let currentGroupCount = 0;

  const filesByGroup = [[], [], []];

  for (const file of files) {
    filesByGroup[currentGroup].push(file);
    const data = await fs.readFile(file, "utf8");
    currentGroupCount += data.split('it("').length - 1;
    if (currentGroupCount > quantityByGroup) {
      currentGroup++;
      currentGroupCount = 0;
    }
  }
  return filesByGroup;
}

execute().then((result) => {
  console.log(JSON.stringify(result));
});

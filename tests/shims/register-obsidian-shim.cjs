const Module = require("module");
const path = require("path");

const originalLoad = Module._load;
const shimPath = path.resolve(__dirname, "obsidian-shim.cjs");

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    return originalLoad(shimPath, parent, isMain);
  }

  return originalLoad(request, parent, isMain);
};

class TAbstractFile {
  constructor(path) {
    this.path = path;
    const idx = path.lastIndexOf("/");
    this.name = idx >= 0 ? path.slice(idx + 1) : path;
  }
}

class TFile extends TAbstractFile {
  constructor(path) {
    super(path);
  }
}

class TFolder extends TAbstractFile {
  constructor(path) {
    super(path);
  }
}

const notices = [];

class Notice {
  constructor(message) {
    notices.push(String(message));
  }
}

function normalizePath(path) {
  return String(path)
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
}

function __getNotices() {
  return [...notices];
}

function __resetNotices() {
  notices.length = 0;
}

module.exports = {
  Notice,
  TAbstractFile,
  TFile,
  TFolder,
  normalizePath,
  __getNotices,
  __resetNotices
};

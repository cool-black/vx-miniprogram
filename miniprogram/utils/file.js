function readFileAsBase64(filePath) {
  const fileSystemManager = wx.getFileSystemManager();

  return new Promise((resolve, reject) => {
    fileSystemManager.readFile({
      filePath,
      encoding: "base64",
      success: (result) => {
        resolve(result.data);
      },
      fail: reject
    });
  });
}

function readFileAsArrayBuffer(filePath) {
  const fileSystemManager = wx.getFileSystemManager();

  return new Promise((resolve, reject) => {
    fileSystemManager.readFile({
      filePath,
      success: (result) => {
        resolve(result.data);
      },
      fail: reject
    });
  });
}

module.exports = {
  readFileAsBase64,
  readFileAsArrayBuffer
};

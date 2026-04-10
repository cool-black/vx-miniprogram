let recorderManager = null;

function getRecorderManager() {
  if (!recorderManager) {
    recorderManager = wx.getRecorderManager();
  }

  return recorderManager;
}

module.exports = {
  getRecorderManager
};

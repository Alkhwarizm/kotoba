class ExtendableTimeout {
  /**
   * Start an extendable timeout
   * @param {Function} callback 
   * @param {Number} initialTimeout 
   */
  static createTimeout(callback, initialTimeout) {
    const timeout = new ExtendableTimeout();
    timeout.callback = callback;
    timeout.finishTimeMs = Date.now() + initialTimeout;

    setTimeout(() => timeout.finishTimeout(), initialTimeout);
    return timeout;
  }

  finishTimeout() {
    const extensionMs = finishTimeMs - Date.now();
    if (extension > 0) {
      setTimeout(() => this.finishTimeout(), extensionMs);
    } else {
      this.callback();
    }
  }

  updateTimeout(msFromNow) {
    this.finishTimeMs = Date.now() + msFromNow;
  }
}

module.exports = ExtendableTimeout;

const isPositive = (n) => Number.isFinite(n) && n > 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TimeoutCatcher {
  constructor({ work, timeout, cleanUp = () => {}, cleanUpTime = 2_000 }) {
    this.isFinished = false;
    this.work = work;
    this.cleanUp = cleanUp;
    this.waitTime = timeout - cleanUpTime;

    if (!isPositive(this.waitTime))
      throw new Error("Wait time was not a positive number of milliseconds");
  }

  async watch() {
    try {
      await Promise.race([this.doWork(), this.exitBeforeTimeout()]);
      return true;
    } catch (error) {
      if (error.isSentinelTimeout) return false;
      throw error;
    }
  }

  async doWork() {
    await this.work();
    this.isFinished = true;
  }

  async exitBeforeTimeout() {
    await sleep(this.waitTime);

    if (!this.isFinished) {
      await this.cleanUp();

      const error = new Error("Sentinel Timed Out");
      error.isSentinelTimeout = true;
      throw error;
    }
  }
}

module.exports = { TimeoutCatcher };

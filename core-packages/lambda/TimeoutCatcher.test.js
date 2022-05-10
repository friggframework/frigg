const { TimeoutCatcher } = require("./TimeoutCatcher");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Time Sentinel", () => {
  it("requires a positive wait time", () => {
    try {
      new TimeoutCatcher({
        timeout: 1_000,
      });
      throw new Error("Expected error was not thrown");
    } catch (error) {
      expect(error).toHaveProperty(
        "message",
        "Wait time was not a positive number of milliseconds"
      );
    }
  });

  it("exits normally if the work is completed", async () => {
    let cleanUpCalled = false;
    const sentinel = new TimeoutCatcher({
      cleanUp: () => (cleanUpCalled = true),
      timeout: 3_000,
      work: async () => {
        await sleep(500);
      },
    });

    const didFinish = await sentinel.watch();
    expect(didFinish).toEqual(true);
    expect(cleanUpCalled).toEqual(false);
  });

  it("terminates before time out if work runs long", async () => {
    let cleanUpCalled = false;
    const sentinel = new TimeoutCatcher({
      cleanUp: () => (cleanUpCalled = true),
      timeout: 3_000,
      work: async () => {
        await sleep(1_500);
      },
    });

    const didFinish = await sentinel.watch();
    expect(didFinish).toEqual(false);
    expect(cleanUpCalled).toEqual(true);
  });

  it("rethrows unexpected errors", async () => {
    let cleanUpCalled = false;
    const sentinel = new TimeoutCatcher({
      cleanUp: () => (cleanUpCalled = true),
      timeout: 3_000,
      work: async () => {
        throw new Error("Spam spam spam spam");
      },
    });

    try {
      await sentinel.watch();
      throw new Error("Expected error did not occur");
    } catch (error) {
      expect(error).toHaveProperty("message", "Spam spam spam spam");
      expect(cleanUpCalled).toEqual(false);
    }
  });
});

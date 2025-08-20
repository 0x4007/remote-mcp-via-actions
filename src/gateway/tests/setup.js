// Global test setup
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Reduce console noise during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
  }
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Fast test timeout - 5 seconds max
jest.setTimeout(5000);

// Clean shutdown - let Jest handle the exit
afterAll(async () => {
  // Allow small delay for cleanup
  await new Promise(resolve => setTimeout(resolve, 50));
});
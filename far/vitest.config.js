export default {
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Isolate each test file in its own worker so global-state mutations
    // (window.OpenCourseDeck, window.DB, rAF loops) cannot bleed between files.
    isolate: true,
    // Restore and clear all mocks/spies automatically after each test.
    restoreMocks: true,
    clearMocks: true,
  },
};


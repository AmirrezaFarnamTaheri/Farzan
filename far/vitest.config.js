export default {
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
};


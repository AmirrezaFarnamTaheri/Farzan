const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      'vendor/**',
      'dist/**',
      'desktop-dist/**',
      'src-tauri/**',
      'src-tauri/target',
      'tauri-dev/**',
      'electron-builder-master/**',
      'Electron.NET-main/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['pdf.js'],
    languageOptions: {
      globals: {
        pdfjsLib: 'readonly',
      },
    },
  },
  {
    files: ['progress.js'],
    languageOptions: {
      globals: {
        Chart: 'readonly',
        DataStore: 'readonly',
        DB: 'readonly',
      },
    },
  },
  {
    files: ['notes.js'],
    rules: {
      // The filename sanitizer intentionally rejects the complete ASCII control range.
      'no-control-regex': 'off',
    },
  },
  {
    files: ['scripts/**/*.cjs', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
];

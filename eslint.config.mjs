import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'vscode' }] }]
    }
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/config/**'],
    rules: {
      '@typescript-eslint/no-magic-numbers': [
        'error',
        { ignoreNumericLiteralTypes: true, ignoreArrayIndexes: true, ignore: [0, 1, -1] }
      ]
    }
  },
  {
    files: ['esbuild.mjs', 'test/**/*.ts'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    ignores: ['dist/**', 'out-test/**', 'node_modules/**', '.vscode-test/**']
  }
);

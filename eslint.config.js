// ESLint 9 flat config
// 规则来源：docs/10-app-tech.md §0.2 / §0.3 / §0.4
// 「any 一律禁止」「跨层依赖禁止」「颜色字面量只准在 tokens.css」
import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import importPlugin from 'eslint-plugin-import'
import boundaries from 'eslint-plugin-boundaries'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'fixtures/**', 'design/**', 'docs/**'],
  },

  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        // 类型感知 lint（no-unsafe-* 等规则必需）
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        // DOM（renderer 侧）
        document: 'readonly',
        window: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        SVGElement: 'readonly',
        matchMedia: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      boundaries,
    },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      boundaries: {
        default: 'disallow',
        rules: [
          {
            from: { element: 'shared' },
            to: { element: ['main', 'renderer', 'preload'] },
          },
          {
            from: { element: 'renderer' },
            to: { element: 'main' },
          },
          {
            from: { element: 'viewmodels' },
            to: { element: ['react', 'dom'] },
          },
          {
            from: { element: 'views' },
            to: { element: ['domain', 'main'] },
          },
        ],
        elements: [
          { type: 'shared', pattern: 'src/shared/*', capture: ['element'] },
          { type: 'main', pattern: 'src/main/*', capture: ['element'] },
          { type: 'renderer', pattern: 'src/renderer/*', capture: ['element'] },
          { type: 'domain', pattern: 'src/shared/domain/*', capture: ['element'] },
          { type: 'viewmodels', pattern: 'src/renderer/viewmodels/*', capture: ['element'] },
          { type: 'views', pattern: 'src/renderer/views/*', capture: ['element'] },
          { type: 'react', pattern: 'react' },
          { type: 'dom', pattern: 'src/renderer/**' },
        ],
      },
    },

    rules: {
      // ── 0.2 类型规范：any 一律禁止 ─────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // 基座的 no-unused-vars 与 TS 版重复且不认 '_' 前缀，关掉
      'no-unused-vars': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // 禁止 @ts-ignore，只允许带原因的 @ts-expect-error
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      'ban-ts-comment': 'off',

      // 禁止宽断言与非必要断言
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
    },
  },

  // ── 0.2 颜色字面量只准出现在 tokens.css ────────────────────
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: ['src/renderer/tokens.css'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}/]',
          message:
            '颜色字面量禁止硬编码。只准用 src/renderer/tokens.css 里的 CSS 变量（docs/10 §0.2）。',
        },
        {
          selector: 'Literal[value=/^rgb\\(|^hsl\\(/]',
          message: '颜色字面量禁止硬编码，使用 tokens.css 的 CSS 变量。',
        },
      ],
    },
  },

  // ── 0.3 单文件上限的软提示 ────────────────────────────────
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // CLI 工具脚本：console 就是输出通道
  {
    files: ['src/tools/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]

import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import terser from '@rollup/plugin-terser'
import copy from 'rollup-plugin-copy'

export default [
  {
    input: 'js/main.js',
    output: {
      file: 'dist/js/main.bundle.min.js',
      format: 'iife',
      name: 'MainBundle',
      sourcemap: false
    },
    plugins: [nodeResolve(), commonjs(), terser()]
  },
  {
    input: 'js/serial.js',
    output: {
      file: 'dist/js/serial.bundle.min.js',
      format: 'iife',
      name: 'SerialBundle',
      sourcemap: false
    },
    plugins: [nodeResolve(), commonjs(), terser()]
  },
  {
    input: 'js/snake.js',
    output: {
      file: 'dist/js/snake.bundle.min.js',
      format: 'iife',
      name: 'SnakeBundle',
      sourcemap: false
    },
    plugins: [nodeResolve(), commonjs(), terser()]
  },
  {
    input: 'js/main.js',
    output: { file: 'dist/.placeholder', format: 'es' },
    plugins: [
      copy({
        targets: [
          { src: 'index.html', dest: 'dist' },
          { src: 'boards.html', dest: 'dist' },
          { src: 'feedback.html', dest: 'dist' },
          { src: 'releases.html', dest: 'dist' },
          { src: 'roadmap.html', dest: 'dist' },
          { src: 'serial.html', dest: 'dist' },
          { src: 'snake.html', dest: 'dist' },
          { src: 'css/*', dest: 'dist/css' }
        ],
        hook: 'buildEnd'
      })
    ]
  }
]



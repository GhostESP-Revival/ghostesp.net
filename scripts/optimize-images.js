import fs from 'fs'
import path from 'path'
import glob from 'glob'
import imagemin from 'imagemin'
import mozjpeg from 'imagemin-mozjpeg'
import pngquant from 'imagemin-pngquant'
import webp from 'imagemin-webp'
import svgo from 'imagemin-svgo'

const srcDir = path.resolve(process.cwd(), 'images')
const outDir = path.resolve(process.cwd(), 'dist', 'images')

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

async function optimize() {
  const files = glob.sync('**/*.{jpg,jpeg,png,webp,svg}', { cwd: srcDir })
  for (const file of files) {
    const inputPath = path.join(srcDir, file)
    const destDir = path.join(outDir, path.dirname(file))
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

    const buffer = fs.readFileSync(inputPath)
    const optimized = await imagemin.buffer(buffer, {
      plugins: [
        mozjpeg({ quality: 75 }),
        pngquant({ quality: [0.6, 0.8] }),
        webp({ quality: 75 }),
        svgo()
      ]
    })

    fs.writeFileSync(path.join(destDir, path.basename(file)), optimized)
    console.log('optimized', file)
  }
}

optimize().catch(err => {
  console.error(err)
  process.exit(1)
})



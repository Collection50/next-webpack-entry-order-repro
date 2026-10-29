// App Router version of generate.mjs. Each page exports `dynamic`, which makes
// its static analysis go through the asynchronous SWC parse, and renders a
// client component that imports the page's own CommonJS components.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const PAGE_COUNT = 40
const SHARED_COUNT = 100
const OWN_COMPONENTS_PER_PAGE = 110
const SHARED_IMPORTS_PER_PAGE = 3

let seed = 1
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = (n) => Math.floor(random() * n)

rmSync('pages', { recursive: true, force: true }) // from generate.mjs
for (const dir of ['app', 'components']) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}
mkdirSync('components/shared')

writeFileSync(
  'app/layout.js',
  `export default function RootLayout({ children }) {\n  return (\n    <html>\n      <body>{children}</body>\n    </html>\n  )\n}\n`
)

for (let s = 0; s < SHARED_COUNT; s++) {
  writeFileSync(
    `components/shared/Shared${s}.js`,
    `export default function Shared${s}() {\n  return <p>shared ${s}</p>\n}\n`
  )
}

for (let p = 0; p < PAGE_COUNT; p++) {
  mkdirSync(`components/page${p}`, { recursive: true })
  const own = Array.from({ length: OWN_COMPONENTS_PER_PAGE }, (_, c) => {
    const name = `Page${p}Part${c}`
    writeFileSync(
      `components/page${p}/${name}.js`,
      `const React = require('react')\nmodule.exports = function ${name}() {\n  return React.createElement('p', null, 'page ${p} part ${c}')\n}\n`
    )
    return name
  })
  writeFileSync(
    `components/page${p}/Page${p}Client.js`,
    `'use client'\n` +
      own.map((name) => `import ${name} from './${name}'\n`).join('') +
      `\nexport default function Page${p}Client() {\n  return (\n    <>\n` +
      own.map((name) => `      <${name} />\n`).join('') +
      `    </>\n  )\n}\n`
  )
  const shared = Array.from({ length: SHARED_IMPORTS_PER_PAGE }, () => {
    const s = pick(SHARED_COUNT)
    return `Shared${s}`
  }).filter((name, i, all) => all.indexOf(name) === i)
  const padding = `const unused = [${Array.from({ length: 10_000 }, (_, i) => `{ id: ${i} }`).join(', ')}]\n`

  mkdirSync(`app/page${p}`)
  writeFileSync(
    `app/page${p}/page.js`,
    `import Page${p}Client from '../../components/page${p}/Page${p}Client'\n` +
      shared.map((name) => `import ${name} from '../../components/shared/${name}'\n`).join('') +
      padding +
      `\nexport const dynamic = 'force-dynamic'\n` +
      `\nexport default function Page${p}() {\n  return (\n    <main>\n      <Page${p}Client />\n` +
      shared.map((name) => `      <${name} />\n`).join('') +
      `    </main>\n  )\n}\n`
  )
}

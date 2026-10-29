// Generates a Pages Router app with many pages, each importing its own
// components plus a few shared ones, so webpack's deterministic module ids
// collide often enough for entry order to matter. Pages export
// getServerSideProps because only pages that need parsing are analyzed
// asynchronously, which is what makes their entry order vary.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const PAGE_COUNT = 40
const SHARED_COUNT = 100
const OWN_COMPONENTS_PER_PAGE = 110
const SHARED_IMPORTS_PER_PAGE = 3

let seed = 1
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = (n) => Math.floor(random() * n)

for (const dir of ['pages', 'components']) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(`${dir}`, { recursive: true })
}
mkdirSync('components/shared')

for (let s = 0; s < SHARED_COUNT; s++) {
  writeFileSync(
    `components/shared/Shared${s}.js`,
    `export default function Shared${s}() {\n  return <p>shared ${s}</p>\n}\n`
  )
}

for (let p = 0; p < PAGE_COUNT; p++) {
  const own = Array.from({ length: OWN_COMPONENTS_PER_PAGE }, (_, c) => {
    const name = `Page${p}Part${c}`
    mkdirSync(`components/page${p}`, { recursive: true })
    writeFileSync(
      `components/page${p}/${name}.js`,
      // CommonJS so webpack cannot concatenate it into the page module and it
      // keeps its own module id, like most packages in node_modules.
      `const React = require('react')\nmodule.exports = function ${name}() {\n  return React.createElement('p', null, 'page ${p} part ${c}')\n}\n`
    )
    return { name, path: `../components/page${p}/${name}` }
  })
  const shared = Array.from({ length: SHARED_IMPORTS_PER_PAGE }, () => {
    const s = pick(SHARED_COUNT)
    return { name: `Shared${s}`, path: `../components/shared/Shared${s}` }
  }).filter((m, i, all) => all.findIndex((n) => n.name === m.name) === i)
  const imports = [...own, ...shared]
  // Give every page the same, non-trivial parse time so the order in which
  // their analysis finishes is decided by scheduling jitter alone.
  const padding = `const unused = [${Array.from({ length: 10_000 }, (_, i) => `{ id: ${i} }`).join(', ')}]\n`

  writeFileSync(
    `pages/page${p}.js`,
    imports.map((m) => `import ${m.name} from '${m.path}'\n`).join('') +
      padding +
      `export default function Page${p}() {\n  return (\n    <main>\n` +
      imports.map((m) => `      <${m.name} />\n`).join('') +
      `    </main>\n  )\n}\n` +
      `\nexport async function getServerSideProps() {\n  return { props: {} }\n}\n`
  )
}

# next-webpack-entry-order-repro

Reproduction for non-deterministic `next build --webpack` output caused by the
order of entries returned by `createEntrypoints`.

- Fix: https://github.com/vercel/next.js/pull/100888
- Related: https://github.com/vercel/next.js/issues/63201

## What happens

Building the same source twice can produce different output. Two modules trade
their module ids between builds, so the chunks that contain them get different
content and file names, and so do the manifests that reference those chunks.
In `results/original-1.txt`, for example, a module in `page1` and a module in
`page10` swapped ids `38568` and `16187`.

`server/pages-manifest.json` also listed the pages in a different order in
every round we ran.

## Why

`createEntrypoints` (`packages/next/src/build/entries.ts`) adds each page's
entry after that page's static analysis resolves. Pages that export
`getServerSideProps`, `getStaticProps`, `export const` and so on are parsed with
SWC asynchronously, so the order in which entries are added changes from build
to build.

Webpack assigns deterministic module ids in an order that follows entry order.
Each module's name is hashed into an id, and when two modules hash to the same
id, the one that comes later is hashed again. When the entry order changes,
which of the two comes first changes, and so do their ids.

## Run it

```sh
npm install
npm run generate          # writes pages/ and components/
./compare.sh original     # without the fix
./compare.sh fixed        # with fix.patch applied to node_modules/next
```

Each round builds the app twice with `next build --webpack` and writes the files
that differ to `results/<mode>-<round>.txt`. The default is 3 rounds. Pass a
number as the second argument to change it, e.g. `./compare.sh original 5`.

For client page chunks whose file name changed, the result also lists the
module ids that changed. `preview-props.json` and `prerender-manifest.json` are
left out of the comparison because they hold preview mode keys that are random
on every build.

## Why the app looks like this

`generate.mjs` writes 40 pages. Each imports 110 components of its own and up to
3 shared ones. Three things are needed to see the problem:

- Every page exports `getServerSideProps`. Only pages that need parsing are
  analyzed asynchronously, so other pages keep a stable order.
- The page components are CommonJS. ES modules would be concatenated into the
  page module, leaving too few module ids for collisions to be likely.
- Every page has the same amount of padding code. When page sizes differ a lot,
  size mostly decides the completion order and it rarely changes.

## Results

|            | Round 1         | Round 2 | Round 3 |
| ---------- | --------------- | ------- | ------- |
| `original` | 20 files differ | 13      | 3       |
| `fixed`    | 0               | 0       | 0       |

`results/fixed-*.txt` are empty because no files differed. Swaps depend on
timing, so the number of differing files changes from round to round.

Environment: Apple M4 Pro (12 cores), macOS 26.5.1, Node.js 22.23.1,
next@16.4.3.

## The fix

`fix.patch` sorts the keys of the `client`, `server` and `edgeServer` entry
objects before `createEntrypoints` returns them, so the entry order no longer
depends on timing. It applies to the published `next@16.4.3` build. The PR makes
the same change in `packages/next/src/build/entries.ts`.

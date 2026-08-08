import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const documentBudgets = new Map([
  ['AGENTS.md', 1800],
  ['MEMORY.md', 1200],
])
const sourceLineBudget = 1000
const errors = []
const contextDocuments = []

for (const [file, budget] of documentBudgets) {
  const content = await readFile(join(root, file), 'utf8')
  contextDocuments.push({ file, content })
  const size = [...content].length
  process.stdout.write(`${file}: ${size}/${budget} 字符\n`)
  if (size > budget) errors.push(`${file} 超出字符预算 ${size - budget}`)
}

const versionReferences = contextDocuments.flatMap(({ file, content }) =>
  [...content.matchAll(/\bV?\d+\.\d+\.\d+\b/g)].map((match) => ({ file, value: match[0].toLowerCase() })),
)
const duplicateVersions = Map.groupBy(versionReferences, ({ value }) => value)
for (const [version, references] of duplicateVersions) {
  if (references.length > 1) errors.push(`上下文文件重复记录版本 ${version}（${references.length} 次）`)
}
if (versionReferences.length > 2) errors.push(`上下文文件包含 ${versionReferences.length} 个版本引用，疑似累积版本流水`)
process.stdout.write(`上下文版本引用: ${versionReferences.length}\n`)

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (['.ts', '.tsx'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

let largest = { file: '', lines: 0 }
for (const file of await sourceFiles(join(root, 'src'))) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/).length
  if (lines > largest.lines) largest = { file: relative(root, file), lines }
  if (lines > sourceLineBudget) errors.push(`${relative(root, file)} 有 ${lines} 行，超过 ${sourceLineBudget}`)
}

process.stdout.write(`最大源码文件: ${largest.file} (${largest.lines} 行)\n`)
if (errors.length) {
  for (const error of errors) process.stderr.write(`- ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('上下文预算检查通过。\n')
}

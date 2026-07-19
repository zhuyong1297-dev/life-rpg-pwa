import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const roots = ['src', 'public', 'dist', '.github', 'scripts']
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json', '.md', '.yml', '.yaml', '.webmanifest'])
const privateActivityPattern = new RegExp(`${['核心力量', '训练'].join('')}|${['每日', '悬挂'].join('')}`, 'u')
const privateVaultPattern = new RegExp(['Obsidian', '知识库'].join(''), 'u')
const forbidden = [
  { name: '私有迁移活动', pattern: privateActivityPattern },
  { name: '滴答稳定 ID', pattern: /\b[0-9a-f]{24}\b/iu },
  { name: '访问令牌', pattern: /github_pat_|ghp_|(?:access|refresh)[_-]?token\s*[=:]\s*["'][^"']+/iu },
  { name: 'Bearer 凭据', pattern: /Bearer\s+[A-Za-z0-9._~+\/-]{20,}/u },
  { name: '私有知识库路径', pattern: privateVaultPattern },
]

function collect(directory) {
  if (!existsSync(directory)) return []
  const output = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) output.push(...collect(path))
    else if (textExtensions.has(extname(path))) output.push(path)
  }
  return output
}

const scannedFiles = roots.flatMap(collect).filter((file) => file.replaceAll('\\', '/') !== 'scripts/privacy-scan.mjs')
const violations = []
for (const file of scannedFiles) {
  const text = readFileSync(file, 'utf8')
  for (const rule of forbidden) if (rule.pattern.test(text)) violations.push(`${relative('.', file)}：${rule.name}`)
}

try {
  const revisions = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean)
  for (const revision of revisions) {
    const files = execFileSync('git', ['ls-tree', '-r', '--name-only', revision], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .filter((file) => textExtensions.has(extname(file)) && file !== 'scripts/privacy-scan.mjs')
    for (const file of files) {
      const text = execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
      for (const rule of forbidden) if (rule.pattern.test(text)) violations.push(`Git 历史 ${revision.slice(0, 8)} ${file}：${rule.name}`)
    }
  }
} catch {
  // 尚无提交时没有历史可扫描。
}

if (violations.length > 0) {
  console.error(`隐私扫描失败：\n${violations.join('\n')}`)
  process.exit(1)
}

console.log(`隐私扫描通过：检查了 ${scannedFiles.length} 个文本文件和 Git 历史。`)

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const rawArgs = process.argv.slice(2).filter((value) => value !== '--')
const dryRun = rawArgs.includes('--dry-run')
const args = rawArgs.filter((value) => value !== '--dry-run')
const requestedCommit = args.shift() ?? 'HEAD'

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  }).trim()
}

const git = (...commandArgs) => run('git', commandArgs)

function ghJson(route, method = 'GET', body) {
  const commandArgs = ['api', '--method', method, route]
  const options = body === undefined ? {} : { input: JSON.stringify(body) }
  if (body !== undefined) commandArgs.push('--input', '-')
  const output = run('gh', commandArgs, options)
  return output ? JSON.parse(output) : undefined
}

function repositoryName() {
  const remote = git('remote', 'get-url', 'origin')
  const match = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`无法从 origin 识别 GitHub 仓库：${remote}`)
  return match[1]
}

function gitObjectSha(type, content) {
  const header = Buffer.from(`${type} ${content.length}\0`)
  return createHash('sha1').update(Buffer.concat([header, content])).digest('hex')
}

function commitIdentity(commit, prefix) {
  const format = prefix === 'author'
    ? ['%an', '%ae', '%at', '%ai', '%aI']
    : ['%cn', '%ce', '%ct', '%ci', '%cI']
  const [name, email, timestamp, rawDate, isoDate] = format.map((token) =>
    git('show', '-s', `--format=${token}`, commit),
  )
  return {
    api: { name, email, date: isoDate },
    raw: `${name} <${email}> ${timestamp} ${rawDate.slice(-5)}`,
  }
}

const repo = repositoryName()
const localCommit = git('rev-parse', requestedCommit)
const localTree = git('rev-parse', `${localCommit}^{tree}`)
const parents = git('show', '-s', '--format=%P', localCommit).split(/\s+/).filter(Boolean)
const currentBranch = git('branch', '--show-current')
const branches = args.length > 0 ? args : [currentBranch]
const status = git('status', '--porcelain', '--untracked-files=all')

if (!dryRun && status) {
  throw new Error('工作区不干净；请先提交当前改动，再执行 Git Data API 发布')
}
if (parents.length === 0) throw new Error('不支持发布没有父提交的根提交')
if (branches.some((branch) => !branch)) throw new Error('必须提供至少一个目标分支')

run('gh', ['auth', 'status', '--hostname', 'github.com'])
const remoteRefs = new Map(branches.map((branch) => {
  const ref = ghJson(`repos/${repo}/git/ref/heads/${branch}`)
  return [branch, ref.object.sha]
}))

if ([...remoteRefs.values()].every((sha) => sha === localCommit)) {
  process.stdout.write(`无需发布：${branches.join('、')} 已指向 ${localCommit}\n`)
  process.exit(0)
}

const ancestors = new Set(git('rev-list', localCommit).split(/\r?\n/))
for (const [branch, remoteSha] of remoteRefs) {
  if (remoteSha !== localCommit && !ancestors.has(remoteSha)) {
    throw new Error(`${branch} 的远端提交 ${remoteSha} 不是 ${localCommit} 的祖先，拒绝非快进更新`)
  }
}

const changes = git(
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  '--no-renames',
  parents[0],
  localCommit,
).split(/\r?\n/).filter(Boolean)

process.stdout.write([
  `仓库：${repo}`,
  `提交：${localCommit}`,
  `文件树：${localTree}`,
  `目标分支：${branches.join('、')}`,
  `变更对象：${changes.length}`,
  dryRun ? '模式：只读预检' : '模式：Git Data API 发布',
].join('\n') + '\n')
if (dryRun) process.exit(0)

const entries = []
for (const change of changes) {
  const [statusCode, path] = change.split('\t')
  if (statusCode === 'D') {
    entries.push({ path, mode: '100644', type: 'blob', sha: null })
    continue
  }
  const treeLine = git('ls-tree', localCommit, '--', path)
  const [mode, type, expectedSha] = treeLine.split(/\s+/)
  if (type !== 'blob') throw new Error(`暂不支持非 blob Git 对象：${path} (${type})`)
  const content = execFileSync('git', ['cat-file', 'blob', `${localCommit}:${path}`])
  if (gitObjectSha('blob', content) !== expectedSha) {
    throw new Error(`本地 blob 校验失败：${path}`)
  }
  const blob = ghJson(`repos/${repo}/git/blobs`, 'POST', {
    content: content.toString('base64'),
    encoding: 'base64',
  })
  if (blob.sha !== expectedSha) throw new Error(`远端 blob 校验失败：${path}`)
  entries.push({ path, mode, type, sha: blob.sha })
}

const baseTree = ghJson(`repos/${repo}/git/commits/${parents[0]}`).tree.sha
const remoteTree = entries.length > 0
  ? ghJson(`repos/${repo}/git/trees`, 'POST', { base_tree: baseTree, tree: entries }).sha
  : baseTree
if (remoteTree !== localTree) {
  throw new Error(`远端 tree 校验失败：${remoteTree} !== ${localTree}`)
}

const author = commitIdentity(localCommit, 'author')
const committer = commitIdentity(localCommit, 'committer')
const message = git('show', '-s', '--format=%B', localCommit).trimEnd()
const remoteCommit = ghJson(`repos/${repo}/git/commits`, 'POST', {
  message,
  tree: remoteTree,
  parents,
  author: author.api,
  committer: committer.api,
})
if (remoteCommit.tree.sha !== localTree) throw new Error('远端提交引用了错误的文件树')

for (const branch of branches) {
  if (remoteRefs.get(branch) === remoteCommit.sha) continue
  ghJson(`repos/${repo}/git/refs/heads/${branch}`, 'PATCH', {
    sha: remoteCommit.sha,
    force: false,
  })
}

const rawCommit = Buffer.from([
  `tree ${localTree}`,
  ...parents.map((parent) => `parent ${parent}`),
  `author ${author.raw}`,
  `committer ${committer.raw}`,
  '',
  message,
].join('\n'))
const reconstructedSha = gitObjectSha('commit', rawCommit)
if (reconstructedSha === remoteCommit.sha) {
  execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { input: rawCommit })
  for (const branch of branches) {
    execFileSync('git', ['update-ref', `refs/heads/${branch}`, remoteCommit.sha])
    execFileSync('git', ['update-ref', `refs/remotes/origin/${branch}`, remoteCommit.sha])
  }
} else {
  process.stdout.write('警告：远端提交对象无法在本地重建；分支 tree 已校验，但本地引用保持不变\n')
}

process.stdout.write(`发布完成：${remoteCommit.sha}\ntree：${remoteTree}\n`)

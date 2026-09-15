import path from 'node:path'

/** How a command's bare operands are interpreted, which decides what gets path-checked. */
type OperandKind = 'paths' | 'literal-then-paths' | 'literals'

interface CommandPolicy {
  /** Options accepted as-is, without a value. */
  options?: readonly string[]
  /** Options taking a value, either attached (`-n5`, `--include=*.md`) or as the next token. */
  valueOptions?: readonly string[]
  operands?: OperandKind
  /** Accepts the legacy numeric form, as in `head -20`. */
  numericOption?: boolean
  /** Options are whole words behind a single dash (`find -maxdepth`), never clusters. */
  singleDashWords?: boolean
}

const GREP_OPTIONS = [
  '-r',
  '-R',
  '-l',
  '-L',
  '-n',
  '-i',
  '-I',
  '-w',
  '-x',
  '-c',
  '-v',
  '-o',
  '-h',
  '-H',
  '-s',
  '-a',
  '-q',
  '-E',
  '-F',
  '-G',
  '-P',
  '--recursive',
  '--dereference-recursive',
  '--files-with-matches',
  '--files-without-match',
  '--line-number',
  '--ignore-case',
  '--word-regexp',
  '--line-regexp',
  '--count',
  '--invert-match',
  '--only-matching',
  '--no-filename',
  '--with-filename',
  '--fixed-strings',
  '--basic-regexp',
  '--extended-regexp',
  '--perl-regexp',
  '--quiet',
  '--silent',
  '--no-messages',
  '--text',
  '--null-data',
] as const

const GREP_VALUE_OPTIONS = [
  '-m',
  '-A',
  '-B',
  '-C',
  '-e',
  '-d',
  '--max-count',
  '--after-context',
  '--before-context',
  '--context',
  '--regexp',
  '--include',
  '--exclude',
  '--exclude-dir',
  '--color',
  '--colour',
  '--devices',
  '--directories',
  '--binary-files',
] as const

/** Options carrying the search pattern, so the first operand is a path rather than a regex. */
const PATTERN_OPTIONS = new Set(['-e', '--regexp'])

/**
 * The sandbox command surface. Every entry must be free of write and exec
 * primitives: anything able to spawn a process (`awk`, `sed -e`, `xargs`,
 * `find -exec`) or create a file (`tee`, `sort -o`) escapes the policy, since
 * the command name is all a name-only allowlist can pin down.
 */
const COMMAND_POLICIES: Record<string, CommandPolicy> = {
  // File discovery
  find: {
    options: ['-empty', '-not', '-o', '-a', '-and', '-or', '-print', '-print0', '-follow', '-depth', '-prune', '-readable', '-nowarn'],
    valueOptions: ['-name', '-iname', '-path', '-ipath', '-regex', '-iregex', '-type', '-maxdepth', '-mindepth', '-size', '-links'],
    singleDashWords: true,
  },
  ls: {
    options: ['-l', '-a', '-A', '-h', '-R', '-t', '-r', '-S', '-1', '-d', '-F', '-i', '-p', '-X', '-U', '-n', '-G', '-o', '-g', '-s', '-c', '-u', '--all', '--almost-all', '--human-readable', '--recursive', '--reverse', '--size', '--classify', '--directory', '--inode', '--numeric-uid-gid'],
    valueOptions: ['--sort', '--time-style', '--color', '--format', '--block-size'],
  },
  tree: {
    options: ['-d', '-a', '-f', '-F', '-i', '-l', '-x', '-r', '-t', '--noreport', '--dirsfirst'],
    valueOptions: ['-L', '-I', '-P', '--filelimit'],
  },
  // Content search
  grep: { options: GREP_OPTIONS, valueOptions: GREP_VALUE_OPTIONS, operands: 'literal-then-paths' },
  egrep: { options: GREP_OPTIONS, valueOptions: GREP_VALUE_OPTIONS, operands: 'literal-then-paths' },
  fgrep: { options: GREP_OPTIONS, valueOptions: GREP_VALUE_OPTIONS, operands: 'literal-then-paths' },
  // File reading
  cat: { options: ['-n', '-b', '-s', '-E', '-T', '-A', '-v', '-e', '-t', '--number', '--number-nonblank', '--squeeze-blank', '--show-ends', '--show-tabs', '--show-all'] },
  head: { options: ['-q', '-v', '-z', '--quiet', '--verbose'], valueOptions: ['-n', '-c', '--lines', '--bytes'], numericOption: true },
  tail: { options: ['-q', '-v', '-z', '--quiet', '--verbose'], valueOptions: ['-n', '-c', '--lines', '--bytes'], numericOption: true },
  // Text processing (output filtering only)
  wc: { options: ['-l', '-w', '-c', '-m', '-L', '--lines', '--words', '--bytes', '--chars', '--max-line-length'] },
  sort: {
    options: ['-n', '-r', '-u', '-f', '-b', '-h', '-V', '-g', '-M', '-s', '-i', '-d', '-c', '-z', '--numeric-sort', '--reverse', '--unique', '--ignore-case', '--human-numeric-sort', '--version-sort', '--general-numeric-sort', '--month-sort', '--stable', '--check', '--dictionary-order', '--ignore-leading-blanks'],
    valueOptions: ['-k', '-t', '--key', '--field-separator'],
  },
  uniq: {
    options: ['-c', '-d', '-u', '-i', '-D', '-z', '--count', '--repeated', '--unique', '--ignore-case', '--all-repeated'],
    valueOptions: ['-w', '-s', '-f', '--check-chars', '--skip-chars', '--skip-fields'],
  },
  cut: {
    options: ['-s', '-n', '-z', '--only-delimited', '--complement'],
    valueOptions: ['-d', '-f', '-c', '-b', '--delimiter', '--fields', '--characters', '--bytes', '--output-delimiter'],
  },
  tr: { options: ['-d', '-s', '-c', '-C', '-t', '--delete', '--squeeze-repeats', '--complement', '--truncate-set1'], operands: 'literals' },
  column: { options: ['-t', '-x', '--table'], valueOptions: ['-s', '-c', '-o', '--separator', '--output-width', '--output-separator'] },
  // Utilities
  echo: { options: ['-n', '-e', '-E'], operands: 'literals' },
  printf: { operands: 'literals' },
  basename: { options: ['-a', '-z', '--multiple', '--zero'], valueOptions: ['-s', '--suffix'], operands: 'literals' },
  dirname: { options: ['-z', '--zero'], operands: 'literals' },
  realpath: {
    options: ['-e', '-m', '-s', '-z', '-q', '--canonicalize-existing', '--canonicalize-missing', '--no-symlinks', '--quiet', '--zero'],
    valueOptions: ['--relative-to', '--relative-base'],
  },
  file: { options: ['-b', '-i', '-L', '-z', '-h', '-k', '--brief', '--mime', '--mime-type', '--dereference'] },
  stat: { options: ['-L', '-t', '-f', '--dereference', '--terse', '--file-system'], valueOptions: ['-c', '--format', '--printf'] },
  du: {
    options: ['-h', '-s', '-a', '-c', '-k', '-m', '-b', '-S', '-x', '-L', '--human-readable', '--summarize', '--all', '--total', '--bytes', '--separate-dirs', '--si'],
    valueOptions: ['-d', '-B', '--max-depth', '--block-size', '--threshold'],
  },
  diff: {
    options: ['-u', '-r', '-q', '-w', '-i', '-B', '-b', '-N', '-y', '-c', '-s', '-a', '-E', '-Z', '--unified', '--recursive', '--brief', '--ignore-all-space', '--ignore-case', '--ignore-blank-lines', '--ignore-space-change', '--new-file', '--side-by-side', '--report-identical-files', '--text'],
    valueOptions: ['-U', '-C', '-W', '--width'],
  },
  comm: { options: ['-1', '-2', '-3', '-i', '-z', '--total', '--check-order', '--nocheck-order'], valueOptions: ['--output-delimiter'] },
  // Checksums
  md5sum: { options: ['-b', '-t', '-z', '--binary', '--text', '--zero'] },
  sha256sum: { options: ['-b', '-t', '-z', '--binary', '--text', '--zero'] },
}

export const ALLOWED_BASH_COMMANDS: ReadonlySet<string> = new Set(Object.keys(COMMAND_POLICIES))

const MAX_STAGES = 8
const MAX_TOKENS_PER_STAGE = 64

export function isPathWithinDirectory(filePath: string, directory: string): boolean {
  const resolvedPath = path.resolve(filePath)
  const resolvedDir = path.resolve(directory)
  return resolvedPath.startsWith(`${resolvedDir}${path.sep}`) || resolvedPath === resolvedDir
}

export function pathMatchesGlob(filePath: string, glob: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(filePath)
  const resolvedBase = path.resolve(baseDir)

  if (!isPathWithinDirectory(resolvedPath, resolvedBase)) {
    return false
  }

  const relativePath = path.relative(resolvedBase, resolvedPath).replace(/\\/g, '/')

  try {
    const globRegex = glob
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*')
      .replace(/\//g, '\\/')

    const regex = new RegExp(`^${globRegex}`)
    if (regex.test(relativePath)) {
      return true
    }

    if (glob.endsWith('/**') && !relativePath.endsWith('/')) {
      return regex.test(`${relativePath}/`)
    }

    return false
  } catch {
    return false
  }
}

export interface ShellValidationOptions {
  /** Narrows the policy table to a subset of commands. */
  allowedCommands?: ReadonlySet<string>
  /** Path operands must resolve inside this directory. */
  allowedBaseDirectory?: string
}

export type ShellValidationResult =
  | { ok: true, command: string }
  | { ok: false, reason: string }

type StageResult =
  | { ok: true }
  | { ok: false, reason: string }

interface ParsedCommandLine {
  stages: string[][]
  separators: string[]
}

type ParseResult =
  | { ok: true, parsed: ParsedCommandLine }
  | { ok: false, reason: string }

/**
 * Splits a command line into stages of argv tokens, resolving quotes and
 * refusing every shell construct the sandbox has no use for. Nothing here
 * interprets the tokens, so `awk 'BEGIN{system("id")}'` parses as a single
 * `awk` argument rather than as a command able to spawn `id`.
 */
function parseCommandLine(command: string): ParseResult {
  const stages: string[][] = []
  const separators: string[] = []
  let argv: string[] = []
  let token: string | null = null

  const endToken = () => {
    if (token !== null) {
      argv.push(token)
      token = null
    }
  }

  const endStage = (separator: string): ParseResult | null => {
    endToken()
    if (argv.length === 0) {
      return { ok: false, reason: `Empty command segment before "${separator}"` }
    }
    stages.push(argv)
    argv = []
    separators.push(separator)
    return null
  }

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!

    if (char === '\'') {
      const end = command.indexOf('\'', i + 1)
      if (end === -1) {
        return { ok: false, reason: 'Unbalanced single quote' }
      }
      token = (token ?? '') + command.slice(i + 1, end)
      i = end
      continue
    }

    if (char === '"') {
      let value = ''
      let j = i + 1
      let closed = false
      while (j < command.length) {
        const inner = command[j]!
        if (inner === '\\' && ['"', '\\', '$', '`'].includes(command[j + 1] ?? '')) {
          value += command[j + 1]!
          j += 2
          continue
        }
        if (inner === '"') {
          closed = true
          break
        }
        if (inner === '`' || (inner === '$' && command[j + 1] === '(')) {
          return { ok: false, reason: 'Command substitution is not allowed' }
        }
        value += inner
        j++
      }
      if (!closed) {
        return { ok: false, reason: 'Unbalanced double quote' }
      }
      token = (token ?? '') + value
      i = j
      continue
    }

    if (char === '\\') {
      const next = command[i + 1]
      if (next === undefined) {
        return { ok: false, reason: 'Trailing backslash' }
      }
      token = (token ?? '') + next
      i++
      continue
    }

    if (char === ' ' || char === '\t') {
      endToken()
      continue
    }

    if (char === '\n' || char === '\r') {
      return { ok: false, reason: 'Newlines are not allowed' }
    }

    if (char === '`' || (char === '$' && command[i + 1] === '(')) {
      return { ok: false, reason: 'Command substitution is not allowed' }
    }

    if (char === '>' || char === '<') {
      return { ok: false, reason: 'Redirection is not allowed' }
    }

    if (char === '(' || char === ')' || char === '{' || char === '}') {
      return { ok: false, reason: 'Subshells and brace groups are not allowed' }
    }

    if (char === '|') {
      const isOr = command[i + 1] === '|'
      const error = endStage(isOr ? '||' : '|')
      if (error) return error
      if (isOr) i++
      continue
    }

    if (char === '&') {
      if (command[i + 1] !== '&') {
        return { ok: false, reason: 'Background execution is not allowed' }
      }
      const error = endStage('&&')
      if (error) return error
      i++
      continue
    }

    if (char === ';') {
      const error = endStage(';')
      if (error) return error
      continue
    }

    token = (token ?? '') + char
  }

  endToken()

  if (argv.length > 0) {
    stages.push(argv)
  } else if (separators.length > 0) {
    // A trailing `;` just terminates the last command; a dangling `|` or `&&` is
    // a syntax error, and silently dropping it would rewrite the command.
    const trailing = separators[separators.length - 1]!
    if (trailing !== ';') {
      return { ok: false, reason: `Empty command segment after "${trailing}"` }
    }
    separators.pop()
  }

  if (stages.length === 0) {
    return { ok: false, reason: 'Empty command' }
  }
  if (stages.length > MAX_STAGES) {
    return { ok: false, reason: `Too many command segments (max ${MAX_STAGES})` }
  }
  if (stages.some(stage => stage.length > MAX_TOKENS_PER_STAGE)) {
    return { ok: false, reason: `Too many arguments (max ${MAX_TOKENS_PER_STAGE})` }
  }

  return { ok: true, parsed: { stages, separators } }
}

type OptionResult =
  | { ok: true, consumesNext: boolean, name: string }
  | { ok: false, reason: string }

/** Resolves a whole-word option (`--include=*.md`, `-maxdepth 2`) against the policy. */
function validateWordOption(
  arg: string,
  command: string,
  options: ReadonlySet<string>,
  valueOptions: ReadonlySet<string>,
): OptionResult {
  const equals = arg.indexOf('=')
  const name = equals === -1 ? arg : arg.slice(0, equals)

  if (valueOptions.has(name)) {
    return { ok: true, consumesNext: equals === -1, name }
  }
  if (options.has(name)) {
    if (equals !== -1) {
      return { ok: false, reason: `Option does not take a value: ${name}` }
    }
    return { ok: true, consumesNext: false, name }
  }
  return { ok: false, reason: `Option not allowed for ${command}: ${name}` }
}

/** Resolves a short option cluster such as `-rl`, `-n5` or `-A`. */
function validateShortCluster(
  arg: string,
  command: string,
  options: ReadonlySet<string>,
  valueOptions: ReadonlySet<string>,
): OptionResult {
  const chars = arg.slice(1)

  for (let i = 0; i < chars.length; i++) {
    const name = `-${chars[i]}`

    if (valueOptions.has(name)) {
      // Whatever remains in the cluster is this option's value, as in `-n5`.
      return { ok: true, consumesNext: i === chars.length - 1, name }
    }
    if (!options.has(name)) {
      return { ok: false, reason: `Option not allowed for ${command}: ${name}` }
    }
  }

  return { ok: true, consumesNext: false, name: arg }
}

function validateStage(argv: string[], options?: ShellValidationOptions): StageResult {
  const command = argv[0]!

  if (command.includes('=')) {
    return { ok: false, reason: `Environment assignments are not allowed: ${command}` }
  }

  const policy = COMMAND_POLICIES[command]
  if (!policy || (options?.allowedCommands && !options.allowedCommands.has(command))) {
    return { ok: false, reason: `Command not allowed: ${command}` }
  }

  const allowedOptions = new Set(policy.options ?? [])
  const allowedValueOptions = new Set(policy.valueOptions ?? [])
  const rest = argv.slice(1)
  const operands: string[] = []
  let endOfOptions = false
  let hasPatternOption = false

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!

    if (endOfOptions || arg === '-' || !arg.startsWith('-')) {
      operands.push(arg)
      continue
    }

    if (arg === '--') {
      endOfOptions = true
      continue
    }

    if (policy.numericOption && /^-\d+$/.test(arg)) {
      continue
    }

    const result = arg.startsWith('--') || policy.singleDashWords
      ? validateWordOption(arg, command, allowedOptions, allowedValueOptions)
      : validateShortCluster(arg, command, allowedOptions, allowedValueOptions)

    if (!result.ok) {
      return result
    }
    if (PATTERN_OPTIONS.has(result.name)) {
      hasPatternOption = true
    }
    if (result.consumesNext && ++i >= rest.length) {
      return { ok: false, reason: `Option requires a value: ${result.name}` }
    }
  }

  const operandKind = policy.operands ?? 'paths'
  if (operandKind === 'literals' || !options?.allowedBaseDirectory) {
    return { ok: true }
  }

  // `grep pattern path...` — the leading operand is a regex, not a file.
  const pathOperands = operandKind === 'literal-then-paths' && !hasPatternOption
    ? operands.slice(1)
    : operands

  for (const operand of pathOperands) {
    const resolved = path.resolve(options.allowedBaseDirectory, operand)
    if (!isPathWithinDirectory(resolved, options.allowedBaseDirectory)) {
      return { ok: false, reason: `Path outside sandbox is not allowed: ${operand}` }
    }
  }

  return { ok: true }
}

/** Single-quotes a token so the shell treats every character as literal text. */
function quoteToken(token: string): string {
  return `'${token.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Parses and authorises a command line, returning an equivalent line that is
 * safe to hand to `bash -c`.
 *
 * The returned `command` is rebuilt from the parsed tokens with every argument
 * single-quoted, so it carries no metacharacters, no expansions and no nested
 * commands. Callers must execute that string rather than their own input.
 */
export function validateShellCommand(
  command: string,
  options?: ShellValidationOptions,
): ShellValidationResult {
  const parsed = parseCommandLine(command)
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason }
  }

  const { stages, separators } = parsed.parsed

  for (const stage of stages) {
    const result = validateStage(stage, options)
    if (!result.ok) {
      return result
    }
  }

  const sanitized = stages
    .map(stage => stage.map(quoteToken).join(' '))
    .reduce((line, stage, index) => `${line} ${separators[index - 1]!} ${stage}`)

  return { ok: true, command: sanitized }
}

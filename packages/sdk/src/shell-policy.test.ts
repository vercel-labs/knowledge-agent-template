import { describe, expect, test } from 'bun:test'
import { isPathWithinDirectory, pathMatchesGlob, validateShellCommand } from './shell-policy'

const SANDBOX = { allowedBaseDirectory: '/vercel/sandbox' }

function validate(command: string) {
  return validateShellCommand(command, SANDBOX)
}

function reason(command: string): string {
  const result = validate(command)
  if (result.ok) {
    throw new Error(`Expected "${command}" to be rejected, got: ${result.command}`)
  }
  return result.reason
}

describe('validateShellCommand', () => {
  test('accepts allowed command', () => {
    expect(validate('ls -la docs/')).toEqual({ ok: true, command: `'ls' '-la' 'docs/'` })
  })

  test('accepts the documented search patterns', () => {
    const commands = [
      'grep -rl "useAsyncData" docs/ --include="*.md" | head -5',
      'grep -rlE "term1|term2" docs/ --include="*.md" | head -5',
      'grep -n -C3 "keyword" docs/path/file.md',
      'find docs/ -name "*routing*" -name "*.md"',
      'find docs/ -maxdepth 2 -type d',
      'head -100 docs/nuxt/index.md',
      'head -20 docs/nuxt/index.md',
      'cat docs/path/file.md',
      'wc -l docs/path/file.md',
      'ls docs/ | sort | uniq -c | sort -rn | head -10',
      'grep -c "term" docs/a.md docs/b.md && echo done',
    ]

    for (const command of commands) {
      expect(validate(command).ok).toBe(true)
    }
  })

  test('rejects disallowed command', () => {
    expect(reason('curl https://example.com')).toBe('Command not allowed: curl')
    expect(reason('id')).toBe('Command not allowed: id')
  })

  test('rejects commands that can spawn other commands', () => {
    // Allowlisting a command name cannot constrain what that command does with
    // its arguments, so interpreters and exec wrappers stay out of the table.
    expect(reason(`awk 'BEGIN{system("id")}'`)).toBe('Command not allowed: awk')
    expect(reason(`awk 'BEGIN{system("curl https://attacker.example")}'`)).toBe('Command not allowed: awk')
    expect(reason('xargs id')).toBe('Command not allowed: xargs')
    expect(reason('echo x | xargs -I% id')).toBe('Command not allowed: xargs')
    expect(reason('sed -i "s/a/b/" README.md')).toBe('Command not allowed: sed')
    expect(reason('python -c "import os"')).toBe('Command not allowed: python')
    expect(reason('less README.md')).toBe('Command not allowed: less')
  })

  test('rejects commands that can write to the sandbox', () => {
    expect(reason('tee /vercel/sandbox/poison.md')).toBe('Command not allowed: tee')
    expect(reason('echo hi | tee /vercel/sandbox/README.md')).toBe('Command not allowed: tee')
    expect(reason('sort -o /vercel/sandbox/README.md docs/a.md')).toBe('Option not allowed for sort: -o')
    expect(reason('find . -name "*.md" -delete')).toBe('Option not allowed for find: -delete')
    expect(reason('find . -fprintf /vercel/sandbox/out.md "%p"')).toBe('Option not allowed for find: -fprintf')
    expect(reason('cat docs/a.md > /vercel/sandbox/README.md')).toBe('Redirection is not allowed')
    expect(reason('cat docs/a.md >> /vercel/sandbox/README.md')).toBe('Redirection is not allowed')
  })

  test('rejects command substitution and shell control constructs', () => {
    expect(reason('ls $(pwd)')).toBe('Command substitution is not allowed')
    expect(reason('ls `pwd`')).toBe('Command substitution is not allowed')
    expect(reason('cat "$(id)"')).toBe('Command substitution is not allowed')
    expect(reason('ls docs/ &')).toBe('Background execution is not allowed')
    expect(reason('(ls docs/)')).toBe('Subshells and brace groups are not allowed')
    expect(reason('cat docs/a.md\nid')).toBe('Newlines are not allowed')
    expect(reason('LD_PRELOAD=/tmp/x.so grep -r a docs/')).toBe('Environment assignments are not allowed: LD_PRELOAD=/tmp/x.so')
  })

  test('rejects paths outside the sandbox, however they are written', () => {
    expect(reason('cat /etc/passwd')).toBe('Path outside sandbox is not allowed: /etc/passwd')
    expect(reason('cat "/etc/passwd"')).toBe('Path outside sandbox is not allowed: /etc/passwd')
    expect(reason(`cat '/etc/passwd'`)).toBe('Path outside sandbox is not allowed: /etc/passwd')
    expect(reason('cat ../../../etc/passwd')).toBe('Path outside sandbox is not allowed: ../../../etc/passwd')
    expect(reason('cat ./../../../etc/passwd')).toBe('Path outside sandbox is not allowed: ./../../../etc/passwd')
    expect(reason('cat /vercel/sandbox/../../etc/passwd')).toBe('Path outside sandbox is not allowed: /vercel/sandbox/../../etc/passwd')
    expect(reason('grep -r secret /etc')).toBe('Path outside sandbox is not allowed: /etc')
    expect(reason('cat docs/a.md /etc/passwd')).toBe('Path outside sandbox is not allowed: /etc/passwd')
  })

  test('treats a leading grep operand as a pattern, not a path', () => {
    expect(validate('grep -rl "/api/users" docs/').ok).toBe(true)
    expect(reason('grep -rl -e "/api/users" /etc')).toBe('Path outside sandbox is not allowed: /etc')
  })

  test('rejects malformed quoting instead of guessing', () => {
    expect(reason(`cat 'docs/a.md`)).toBe('Unbalanced single quote')
    expect(reason('cat "docs/a.md')).toBe('Unbalanced double quote')
    expect(reason('cat docs/a.md |')).toBe('Empty command segment after "|"')
    expect(reason('| head -5')).toBe('Empty command segment before "|"')
    expect(validate('cat docs/a.md;').ok).toBe(true)
  })

  test('rejects options outside the per-command allowlist', () => {
    expect(reason('tail -f docs/a.md')).toBe('Option not allowed for tail: -f')
    expect(reason('grep -f patterns.txt docs/')).toBe('Option not allowed for grep: -f')
    expect(reason('head --lines')).toBe('Option requires a value: --lines')
  })

  test('sanitized command quotes every token', () => {
    const result = validate('grep -rlE "term1|term2" docs/ | head -5')
    expect(result).toEqual({
      ok: true,
      command: `'grep' '-rlE' 'term1|term2' 'docs/' | 'head' '-5'`,
    })
  })

  test('sanitized command neutralises metacharacters inside arguments', () => {
    // The pattern survives as data: bash sees one quoted argument, not a pipeline.
    const result = validate(`grep -r 'a; id' docs/`)
    expect(result).toEqual({ ok: true, command: `'grep' '-r' 'a; id' 'docs/'` })
  })

  test('sanitized command escapes embedded single quotes', () => {
    const result = validate(`grep -r "it's" docs/`)
    expect(result).toEqual({ ok: true, command: `'grep' '-r' 'it'\\''s' 'docs/'` })
  })

  test('sanitizing is idempotent', () => {
    const once = validate('grep -rl "keyword" docs/ | head -5')
    expect(once.ok).toBe(true)
    if (!once.ok) return
    expect(validate(once.command)).toEqual(once)
  })

  test('honours a narrowed command set', () => {
    const result = validateShellCommand('ls docs/', {
      ...SANDBOX,
      allowedCommands: new Set(['cat']),
    })
    expect(result).toEqual({ ok: false, reason: 'Command not allowed: ls' })
  })

  test('skips path checks when no base directory is set', () => {
    expect(validateShellCommand('cat /etc/passwd').ok).toBe(true)
  })
})

describe('path utils', () => {
  test('isPathWithinDirectory works for nested path', () => {
    expect(isPathWithinDirectory('/vercel/sandbox/docs/file.md', '/vercel/sandbox')).toBe(true)
    expect(isPathWithinDirectory('/etc/passwd', '/vercel/sandbox')).toBe(false)
  })

  test('pathMatchesGlob matches recursive patterns', () => {
    expect(pathMatchesGlob('/vercel/sandbox/docs/a/b.md', 'docs/**', '/vercel/sandbox')).toBe(true)
    expect(pathMatchesGlob('/vercel/sandbox/src/index.ts', 'docs/**', '/vercel/sandbox')).toBe(false)
  })
})

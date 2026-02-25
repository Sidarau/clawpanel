import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runAntfarmCommand,
  UnauthorizedActionError,
} from '../src/server/antfarm/exec'

test('runAntfarmCommand throws UnauthorizedActionError for disallowed action', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('workflow', ['unknown-subcommand']),
    UnauthorizedActionError
  )
})

test('runAntfarmCommand throws UnauthorizedActionError for completely unknown command', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('arbitrary', ['args']),
    UnauthorizedActionError
  )
})

test('runAntfarmCommand throws UnauthorizedActionError for empty action', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('', []),
    UnauthorizedActionError
  )
})

test('runAntfarmCommand throws UnauthorizedActionError when subcommand does not match allowed list', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('workflow', ['execute']),
    UnauthorizedActionError
  )
})

test('runAntfarmCommand throws UnauthorizedActionError for shell injection attempt via command name', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('workflow;', ['rm', '-rf', '/']),
    UnauthorizedActionError
  )
})

test('runAntfarmCommand throws UnauthorizedActionError for arbitrary binary path', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('/bin/bash', ['-c', 'echo pwned']),
    UnauthorizedActionError
  )
})

test('runAntfarmCommand throws for "workflow start" (not in allowlist)', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('workflow', ['start']),
    UnauthorizedActionError
  )
})

test('runAntfarmCommand throws for "step skip" (not in allowlist)', async (t) => {
  await assert.rejects(
    () => runAntfarmCommand('step', ['skip']),
    UnauthorizedActionError
  )
})

test('UnauthorizedActionError has correct name and message', async (t) => {
  const error = new UnauthorizedActionError('test-action')
  assert.equal(error.name, 'UnauthorizedActionError')
  assert.ok(error.message.includes('test-action'))
  assert.ok(error.message.includes('not allowed'))
})

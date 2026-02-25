import 'server-only'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ANT_FARM_BIN = 'antfarm'

type AllowedAction =
  | 'workflow status'
  | 'workflow run'
  | 'workflow resume'
  | 'step complete'
  | 'step fail'

const ALLOWED_ACTIONS: readonly AllowedAction[] = [
  'workflow status',
  'workflow run',
  'workflow resume',
  'step complete',
  'step fail',
] as const

export class UnauthorizedActionError extends Error {
  constructor(action: string) {
    super(`Action "${action}" is not allowed`)
    this.name = 'UnauthorizedActionError'
  }
}

export interface AntfarmCommandResult {
  stdout: string
  stderr: string
}

export async function runAntfarmCommand(
  action: string,
  args: string[]
): Promise<AntfarmCommandResult> {
  const fullAction: AllowedAction = `${action} ${args[0] ?? ''}` as AllowedAction

  if (!ALLOWED_ACTIONS.includes(fullAction)) {
    throw new UnauthorizedActionError(fullAction)
  }

  const commandArgs = args.length > 0 ? [action, ...args] : [action]

  const { stdout, stderr } = await execFileAsync(ANT_FARM_BIN, commandArgs, {
    timeout: 30000,
  })

  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

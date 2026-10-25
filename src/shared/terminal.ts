export interface TerminalInfo {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  exitCode: number | null;
}

export type TerminalClientMessage =
  | { type: 'terminal.open'; cwd?: string }
  | { type: 'terminal.create' }
  | { type: 'terminal.attach'; sessionId: string }
  | { type: 'terminal.input'; sessionId: string; data: string }
  | { type: 'terminal.ack'; sessionId: string; size: number }
  | { type: 'terminal.resize'; sessionId: string; cols: number; rows: number }
  | { type: 'terminal.close'; sessionId: string }
  | { type: 'ping' };

export type TerminalServerMessage =
  | { type: 'terminal.state'; cwd: string; sessions: TerminalInfo[]; activeSessionId: string | null }
  | { type: 'terminal.snapshot'; sessionId: string; data: string; cols: number; rows: number }
  | { type: 'terminal.output'; sessionId: string; data: string }
  | { type: 'terminal.resized'; sessionId: string; cols: number; rows: number }
  | { type: 'terminal.error'; message: string }
  | { type: 'pong'; at: string };

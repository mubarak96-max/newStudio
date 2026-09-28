/** Lines kept on the job document; older lines are dropped so the document stays small. */
const keptLines = 200;
const maxLineLength = 400;

export type JobLog = {
  log: (message: string) => void;
  warn: (message: string) => void;
  /** Fields to merge into the next job update; empty once the lines are flushed. */
  patch: () => { log?: string[] };
};

/**
 * Logs to the terminal and to a buffer the job runner writes onto the job
 * document, so Studio shows the same lines the worker prints.
 */
export function createJobLog(version: string): JobLog {
  const lines: string[] = [];
  let dirty = false;
  const push = (level: "info" | "warn", message: string) => {
    const text = `[${version}] ${message}`;
    if (level === "warn") console.warn(text);
    else console.log(text);
    const stamp = new Date().toISOString().slice(11, 19);
    lines.push(`${stamp} ${level === "warn" ? "warn " : ""}${message.slice(0, maxLineLength)}`);
    if (lines.length > keptLines) lines.splice(0, lines.length - keptLines);
    dirty = true;
  };
  return {
    log: (message) => push("info", message),
    warn: (message) => push("warn", message),
    patch: () => {
      if (!dirty) return {};
      dirty = false;
      return { log: [...lines] };
    },
  };
}

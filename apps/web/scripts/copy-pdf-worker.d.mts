type CopyPdfWorkerOptions = {
  argv?: string[];
  env?: Record<string, string | undefined>;
  baseDir?: string;
  resolveModule?: (id: string) => string;
  copy?: (source: string, target: string) => void;
  exists?: (path: string) => boolean;
  mkdir?: (path: string, options?: { recursive?: boolean }) => void;
  log?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

export function copyPdfWorkers(options?: CopyPdfWorkerOptions): void;

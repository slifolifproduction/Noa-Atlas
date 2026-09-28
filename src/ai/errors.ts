import type { TaskName } from './schemas';

export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly task: TaskName,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

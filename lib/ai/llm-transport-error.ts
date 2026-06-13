export class LLMTransportError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'LLMTransportError';
    this.cause = cause;
  }
}

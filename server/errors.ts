export class BridgeError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

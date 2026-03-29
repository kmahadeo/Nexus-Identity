// Stub for @icp-sdk/core/principal — not needed in demo mode
export class Principal {
  static fromText(text: string) { return new Principal(text); }
  constructor(private _id: string) {}
  toText() { return this._id; }
}

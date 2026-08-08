// CQR feature API facade — Phase 1 frontend separation.
// Runtime behavior is intentionally delegated to the existing ../api.js.
// Do not add feature logic here until Phase 1 smoke tests pass.

export {
  assertSuccessfulPayload,
  callAuthorized,
  normalizePayload
} from "../api.js";

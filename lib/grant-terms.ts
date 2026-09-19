/**
 * THE LIMITS A GRANT MUST RESPECT, mirrored from GrantEscrow.
 *
 * These exist here so a form can refuse bad terms before a wallet opens, rather than
 * letting someone sign a transaction that the contract will reject. That makes them a
 * second copy of a constant, which is the defect shape this project is most prone to — so
 * `lib/grant-terms.test.ts` reads them out of the Solidity source and fails if they drift.
 */

/** GrantEscrow.MAX_TIP_BPS. A keeper taking more than this of every release is not a keeper. */
export const MAX_TIP_BPS = 200;

/** GrantEscrow.MAX_DURATION, in seconds. A grant nobody could finish is not a grant. */
export const MAX_DURATION_DAYS = 3650;
export const MAX_DURATION_SECONDS = MAX_DURATION_DAYS * 86_400;

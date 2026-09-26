/**
 * WARRANT'S OWN WALLETS.
 *
 * Every grant and payment on the record so far went between these: the founder's test
 * company, the wallets that played its people, and the release service. They are marked
 * wherever a wallet is named or counted, so no count of "people paid" quietly includes the
 * people who built it. A wallet that is not listed here is someone else's.
 */
export const TEAM_WALLETS: Readonly<Record<string, string>> = {
  "0xd5fe7c38ae5b0f93a51b4833c70b4d1cfd05125b": "the founder's test company",
  "0x223ed5d8c837dbdf38391147bb054ce7ce599d11": "the founder's second wallet",
  "0x4766eb1b9ff2274bd3f819b647d69e35b05cbda9": "a test recipient",
  "0x2914d5fa26a1cc8faff7158070ec292c2d329df9": "a test recipient",
  "0xdf70f6e8e656e5bb714ff0e8ca176d76f26890e3": "a test recipient",
  "0x173b066a5558697b3ce5dc26b57764162ec55e79": "the release service",
};

/** One of Warrant's own wallets. */
export function isTeam(address: string | null | undefined): boolean {
  return typeof address === "string" && address.toLowerCase() in TEAM_WALLETS;
}

/** A payment or grant with the team on both ends: a test, not someone else's use. */
export function allTeam(addresses: readonly string[]): boolean {
  return addresses.length > 0 && addresses.every(isTeam);
}

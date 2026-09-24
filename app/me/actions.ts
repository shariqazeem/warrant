"use server";

/**
 * A PERSON'S CHOICE, READ AND SAVED, SERVER SIDE.
 *
 * Anyone can call these with anything, so nothing the browser sends is trusted: a choice is
 * saved only after `verifyChoice` has checked every rule, the clock and the signature, and
 * `rememberChoice` has refused anything not newer than what is already kept.
 */
import {revalidatePath} from "next/cache";
import type {CertificateData} from "@/components/cert/certificate";
import {certificateDataFor, stockName} from "@/lib/certificate-data";
import {verifyChoice, type ChoiceMessage, type StoredChoice} from "@/lib/choice";
import {readEscrowPool, routeOfGrant, type CompanyReceipt} from "@/lib/company";
import {rememberChoice} from "@/lib/db";
import {grantStanding, type Standing} from "@/lib/grants";
import {catchUp} from "@/lib/indexer";
import {readKeeperStatus} from "@/lib/keeper-status";
import {attempt, held, ok, shortReason, type Outcome} from "@/lib/outcome";
import {choiceFor, grantsFor, readPaidTo} from "@/lib/person";

export type ChoiceNow = {
  /** The choice in force for this wallet, or null if it has never chosen. */
  choice: StoredChoice | null;
  /** The server's clock, unix seconds, so a browser with a wrong clock still signs a
   *  time the server will accept. */
  now: number;
};

export async function readChoice(person: string): Promise<Outcome<ChoiceNow>> {
  return attempt("your current choice", async () => {
    if (typeof person !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(person)) {
      return held("That is not a wallet address.");
    }
    return ok({choice: choiceFor(person), now: Math.floor(Date.now() / 1000)});
  });
}

/** One of your grants, as /me shows it: the certificate's data and where it stands now. */
export type YourGrant = {
  data: CertificateData;
  standing: Pick<Standing, "kind" | "label" | "words" | "irrevocable">;
  /** The stock as people say it: "S&P 500". */
  stock: string;
};

export type Yours = {
  /** Every grant the record holds for this wallet, read live, newest first. */
  grants: YourGrant[];
  /** How many grants name this wallet, including any that could not be read. */
  grantCount: number;
  /** Grants that could not be read just now, each with the reason. */
  unread: {id: number; why: string}[];
  /** Whether the release service is running, so the page never promises what is not happening. */
  keeperAlive: boolean;
  /** The newest payslips paid to this wallet. */
  payslips: CompanyReceipt[];
  payslipCount: number;
  /** Set when the payslips could not be read. */
  payslipsWhy: string | null;
  /** The server's clock, unix seconds. */
  now: number;
};

/**
 * YOUR GRANTS AND PAY, for the wallet that is connected: every grant that vests to it, read
 * live from the escrow, and every payslip paid to it, from the record. Public facts about a
 * public address; nothing here is private, and nothing is written.
 */
export async function readYours(person: string): Promise<Outcome<Yours>> {
  return attempt("your grants and pay", async () => {
    if (typeof person !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(person)) {
      return held("That is not a wallet address.");
    }
    // Bounded, and shared across the site: it only closes the last few seconds.
    await catchUp();
    const [mine, paid] = [await grantsFor(person), readPaidTo(person, 20)];
    if (!mine.ok) return mine;

    // One read of each stock's pool, so units convert exactly as the contract converts them.
    const assets = [...new Set(mine.value.grants.map((l) => l.grant.asset.toLowerCase() as `0x${string}`))];
    const pools = new Map(await Promise.all(assets.map(async (a) => [a, await readEscrowPool(a)] as const)));

    const now = Math.floor(Date.now() / 1000);
    const grants: YourGrant[] = mine.value.grants.map((l) => {
      const pool = pools.get(l.grant.asset.toLowerCase() as `0x${string}`);
      const data = certificateDataFor(l.grant, {
        tx: l.opened.txHash,
        openedUnits: l.opened.units,
        route: routeOfGrant(l.grant.id),
        ...(pool?.ok ? pool.value : {}),
      });
      const s = grantStanding(l.grant, now);
      return {
        data,
        standing: {kind: s.kind, label: s.label, words: s.words, irrevocable: s.irrevocable},
        stock: stockName(data.asset.name),
      };
    });

    return ok({
      grants,
      grantCount: mine.value.count,
      unread: mine.value.unread,
      keeperAlive: readKeeperStatus().alive,
      payslips: paid.ok ? paid.value.receipts : [],
      payslipCount: paid.ok ? paid.value.paymentCount : 0,
      payslipsWhy: paid.ok ? null : paid.why,
      now,
    });
  });
}

export async function saveChoice(message: ChoiceMessage, signature: string): Promise<Outcome<StoredChoice>> {
  try {
    const verified = await verifyChoice(message, signature);
    if (!verified.ok) return verified;
    const saved = rememberChoice(verified.value);
    // The person's public page shows their choice; it must not show the old one for the
    // next fifteen seconds of its cache.
    if (saved.ok) revalidatePath("/[company]", "page");
    return saved;
  } catch (err) {
    return held(`Your choice could not be saved (${shortReason(err)}). Nothing changed; try again.`);
  }
}

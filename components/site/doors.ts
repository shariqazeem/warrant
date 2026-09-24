/**
 * THE DOORS: the one list the nav, the footer and ⌘K all read, so they can never drift.
 * Company first: grants lead, payroll follows, the recipient's door is last.
 *
 * `label` is the nav's word; `jump` is what ⌘K offers, said as the thing you came to do.
 */
export const DOORS = [
  {href: "/grants", label: "Grants", jump: "Issue a grant", hint: "Stock that vests, bought on day one"},
  {href: "/run", label: "Payroll", jump: "Payroll", hint: "One signature pays your whole team"},
  {href: "/record", label: "Public record", jump: "Public record", hint: "Every grant and payroll run, read from the chain"},
  {href: "/me", label: "For recipients", jump: "For recipients", hint: "What you were granted, and how you are paid"},
] as const;

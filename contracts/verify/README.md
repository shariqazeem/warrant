# Verifying the deployed contracts

Both contracts were verified on OKLink on 25 September 2026, as exact matches (the metadata hash
included), from the files in this folder:

| Contract | Address | Input |
| --- | --- | --- |
| GrantEscrow | `0xB238D76499616377abD4908E46F29C7CE50908D1` | `GrantEscrow.standard-input.json` |
| Payroll (v2) | `0xD9d06266B9290bA5ee81Cc54657844D4a874431d` | `Payroll.standard-input.json` |

- Compiler: `v0.8.24+commit.e11b9ed9`, optimizer on (200 runs), `viaIR`, EVM `cancun`, as in
  `contracts/foundry.toml`. OKLink's form: Solidity (Standard-Json-Input).
- Constructor arguments, the same for both (USD₮0, the OKX DEX router, its approval proxy):
  `000000000000000000000000779ded0c9e1022225f8e0630b35a9b54be713736000000000000000000000000
  7c5bee2a8091c3ef39072f64f18fac913060aeaf0000000000000000000000008b773d83bc66be128c60e07e17c8901f7a64f000`
- Each file is what `forge verify-contract --show-standard-json-input <address> <contract>`
  prints from `contracts/`. Before submitting, the local build was compared with `cast code`:
  identical except the immutables, with the same metadata hash.

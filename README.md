# N5eB - Naruto 5e Benni

N5eB is a Naruto 5e system fork for Foundry Virtual Tabletop, built from the D&D 5e system baseline and adapted for the N5eB rules, terminology, actors, jutsu, chakra, adversaries, and summons.

This `3.0.0` release is an early testing build. It is intended for closed table testing, content review, and bug reports before a wider beta.

## Install

Use this manifest URL in Foundry's **Install System** dialog:

https://github.com/ImBenni/n5eb/releases/latest/download/system.json

For manual installation, extract `n5eb.zip` into:

`Data/systems/n5eb`

Then start Foundry, create or open an N5eB world, and verify that the active system id is `n5eb`.

## Playable Test Scope

The current early-test slice includes:

- Naruto terminology and core sheet relabeling for clans, jutsu, chakra, and Ryo.
- Starter character content including Ninjutsu Specialist, Uzumaki Clan, starter ambitions/backgrounds, starter gear, and a representative jutsu set.
- Chakra spending, chakra dice recovery, short/long/full rest smoke coverage, Mastery rolls, and insufficient-chakra warnings.
- Book-backed sample actors including `N5eB Ninjutsu Starter` and `Naruto Uzumaki`.
- NPC adversary support with rank, class, role, Tenacity, Elite Actions, fixed adversary jutsu costs, builder UI, and migrated adversary packs.
- NPC summon support with rank, category, tribe, role, summon defaults, builder UI, and migrated summon packs.

## Known Manual Or Incomplete Areas

These areas are still being developed and should be treated as manual GM adjudication during testing:

- Full character advancement validation, jutsu-known limits, and highest-rank-known limits.
- Concentration, maintenance, Clash, scaling, and upcasting automation for jutsu.
- Full Naruto damage/healing types, condition taxonomy, and rules journals.
- Crafting, enhancement seals, fighting stances, complete feats, tools, and roll tables.
- Legacy world actor migration outside the included normalized compendium content.
- Remaining inherited D&D labels, icons, or artwork that do not affect the active smoke path.

## Tester Notes

Please test with imported actors, not direct edits to compendium documents. Good first checks are:

- Create or import a starter character and use an E-rank, D-rank, and C-rank jutsu.
- Spend and recover chakra and chakra dice through rests.
- Roll skills/tools with Mastery.
- Import one adversary and one summon, open their builders, add content, and run a small combat.
- Report any active `Data/systems/n5eb` startup, sheet render, or roll errors from Foundry logs or the browser console.

Known stale scan errors from old sibling system folders are environment cleanup issues and are not release blockers.

## Credits And License

N5eB is maintained by Benni. The software is based on the Foundry Virtual Tabletop D&D 5e system and retains its MIT-licensed software foundation. Some inherited license notices and assets remain from the upstream project while the Naruto-specific beta is prepared.

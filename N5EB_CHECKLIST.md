# N5eB Implementation Checklist

## Current Foundation

- [x] Fork Foundry D&D 5e v14 baseline into `n5eb`.
- [x] Rename system identity, links, manifest, pack ownership, and namespaces to `n5eb`.
- [x] Relabel core terminology: races to clans, spells to jutsu, spellcasting to jutsu casting.
- [x] Add Naruto skill set: Martial Arts, Chakra Control, Ninshou, Illusions, Crafting.
- [x] Add skill/tool Mastery ranks with level caps and optional classic Expertise mode.
- [x] Add first-pass chakra, chakra dice, jutsu rank, jutsu type, and jutsu sheet fields.

## Next Priority

- [x] Smoke test the current uncommitted implementation in Foundry.
- [x] Fix startup, sheet render, or roll cleanup issues only if new active `n5eb` errors appear.
- [x] Commit the current working baseline once it loads cleanly.
- [x] Create a small test character covering chakra, chakra dice, Mastery, and jutsu usage.
- [x] Use the Naruto 5e books as authoritative sources for the first playable slice: main rules plus Orochimaru classes, Tsunade clans, and Jiraiya jutsu.

## Smoke Test Follow-Ups

- [x] Verify non-zero hit point rest recovery; non-zero chakra and chakra dice recovery has been verified.
- [x] Verify Mastery override/cap UX beyond display and roll-formula checks.
- [x] Recheck startup, sheet, and roll cleanup only if new active `n5eb` errors appear.
- [x] Verify insufficient-chakra warning with the starter jutsu set; the earlier smoke test covered this with a temporary C-rank jutsu.
- [x] Investigate the starter `Substitution Technique` utility activity; the world has a successful `Substitution Technique - Cast` chat card with chakra spent, and the source actor/compendium copies now use the corrected reaction utility activity.

## Playable Content MVP

- [x] Add `N5eB Playable Content` compendium folder and `N5eB PDF Starter` source book metadata.
- [x] Replace the starter class placeholder with the book-backed `Ninjutsu Specialist` class from Orochimaru's Observation Compendium.
- [x] Add book-backed `Ninjutsu Specialist` level-1 class features: `Jutsu Casting`, `Chakra Recovery`, and `Refined Ninjutsu`.
- [x] Add a first book-backed Ninjutsu Specialist tradition feature: `Storm Terror: Wind Release`.
- [x] Create `Non-Clan (Starter Placeholder)` as the first clan/race item.
- [x] Add the book-backed `Uzumaki Clan` from Tsunade's Studies Compendium.
- [x] Add book-backed Uzumaki features: `Wellspring of Chakra`, `Chakra Reserves`, and `Fuinjutsu Master`.
- [x] Add PDF-backed ambitions/backgrounds: `Student`, `Genius`, and `Hard Worker`.
- [x] Add starter Ryo/equipment basics: 100 Ryo wallet, blank jutsu scroll, common clothes, kunai stack, and shuriken stack.
- [x] Replace D&D weight/encumbrance with Chapter 5 Bulk capacity: 10 base Bulk, +2 per positive STR modifier, one active bonus per Shinobi storage tool type, and halved speed when encumbered.
- [x] Add Chapter 5 equipment slice: Shinobi storage tools, basic supplies, equipment packs, utility kits, item/weapon scrolls, ammunition stacks, explosive tools, and first exotic weapons.
- [x] Add book-backed jutsu from Jiraiya's Jutsu Compendium and Tsunade's Studies Compendium with rank, type, chakra cost, components, keywords, and activity data: `Clone Technique`, `Transform`, `Substitution Technique`, `Shadow Clone Technique`, `Rasengan`, and `Adamantine Striking Chains`.
- [x] Create compendium sample actor `N5eB Ninjutsu Starter` using the starter class, Non-Clan, Student, chakra, chakra dice, Mastery, and starter jutsu.
- [x] Create compendium actor `Naruto Uzumaki` using character-creation data from the book-backed Ninjutsu Specialist, Uzumaki Clan, Student background, and starter jutsu.
- [x] Import `Naruto Uzumaki` into the `n5eb-v14` world and verify the sheet opens with non-placeholder hit points, chakra, chakra dice, and resources.
- [x] Verify Naruto's actor sheet shows the book-backed jutsu list with E-, D-, and C-rank entries.
- [x] Verify the new Naruto-labeled compendium packs appear in Foundry under `N5eB Playable Content`.
- [x] Verify jutsu compendium entries open and show Naruto rank/type/chakra/component/keyword data.
- [x] Verify the starter actor sheet renders with chakra, chakra dice, Mastery display, and jutsu grouped by E-Rank and D-Rank.
- [x] Verify a starter jutsu spends chakra and posts a chat card.
- [x] Verify short, long, and full rest dialogs complete on a writable imported starter actor; short rest spent a chakra die and recovered chakra, long rest recovered the chakra die, and full rest recovered missing chakra.

## Character Data

- [ ] Finish chakra point calculation for characters and NPCs.
- [ ] Finish chakra dice tracking, spending, recovery, and chat messages.
- [ ] Add jutsu casting profiles for Ninjutsu, Taijutsu, Genjutsu, and Bukijutsu.
- [ ] Add jutsu known and highest-rank-known limits from class advancement.
- [ ] Convert backgrounds into ambitions/backgrounds with ability score or feat support.
- [ ] Verify clans as the replacement for species/races.
- [ ] Add Naruto-specific damage types and healing types.
- [ ] Add Naruto-specific conditions: elemental, physical, mental, and sensory.
- [ ] Review exhaustion and armor class changes against the Naruto rules.

## Actor Sheets

- [x] Display chakra and chakra dice cleanly on character sheets.
- [ ] Display chakra and chakra dice cleanly on NPC sheets.
- [ ] Add configuration dialogs for chakra and chakra dice.
- [x] Finish jutsu list grouping by rank E, D, C, B, A, S.
- [x] Show jutsu type, chakra cost, rank, components, and keywords.
- [ ] Show concentration/maintenance data for jutsu that need it.
- [ ] Verify skill sorting and Mastery controls on character/NPC sheets.
- [x] Verify rest dialogs for short, long, and full rests.
- [ ] Remove or rename remaining D&D-only labels visible in the UI.

## Items

- [x] Add first-pass jutsu item model fields for rank, type, components, keywords, and chakra cost.
- [ ] Finish maintain cost, scaling, and class tags for the jutsu item model.
- [x] Finish first-pass jutsu item sheet layout.
- [x] Add chakra spending prompt for jutsu usage.
- [ ] Add insufficient chakra warning and manual override.
- [ ] Convert tool items to support Mastery ranks.
- [ ] Convert weapons and armor to Naruto equipment terminology.
- [x] Convert item weight display and actor carrying capacity to N5eB Bulk.
- [ ] Add chakra-enhanced items and enhancement seal fields.
- [ ] Add fighting stances and feats as feature items.
- [ ] Add class, clan, ambition/background, and subclass item support where needed.

## Automation

- [x] Apply Mastery bonuses to skill and tool rolls.
- [ ] Verify Mastery rank caps at levels 1-6, 7-11, and 12+.
- [x] Automate chakra cost payment for jutsu.
- [ ] Automate concentration/maintenance chakra checks.
- [ ] Implement clash mechanics for jutsu with the Clash keyword.
- [ ] Implement jutsu rank scaling and upcasting behavior.
- [ ] Implement jutsu known and highest-rank-known validation warnings.
- [x] Implement short, long, and full rest recovery rules for chakra and chakra dice.
- [ ] Implement crafting downtime for non-enhanced and chakra-enhanced items.
- [ ] Implement enhancement seal creation and application rules.

## Compendia

- [x] Import the old N5eB compendium content into the v14 fork with v14-compatible normalization.
- [x] Restore the old 41-pack N5eB compendium layout, old pack labels, sidebar folders, and internal compendium folders.
- [x] Build first playable class compendium.
- [x] Build first playable clan compendium.
- [x] Build ambitions/backgrounds compendium.
- [x] Build starter equipment compendium.
- [ ] Build tools compendium.
- [ ] Build feat and fighting stance compendium.
- [x] Build jutsu compendium, starting with a small representative set.
- [ ] Build conditions and rules journal pages.
- [ ] Build adversaries/NPC compendium.
- [ ] Add roll tables for missions, loot, crafting, and enhancement seals.
- [ ] Remove or archive D&D SRD content that should not ship in N5eB.

## Migration And Import

- [x] Import old N5eB actors/NPCs/summons/adversary content into old-style packs.
- [x] Migrate legacy spell data into jutsu fields during import.
- [x] Add compatibility UUID rewrites from temporary merged `n5eb-*` packs to old-style packs.
- [ ] Migrate existing world actors from legacy N5e data where possible.
- [ ] Migrate legacy skill/tool expertise values into split proficiency and Mastery data.
- [ ] Migrate races/species into clans.
- [x] Migrate currency from D&D coins to Ryo.
- [ ] Add system migration tests or a repeatable migration smoke procedure.

## Build And Release

- [x] Run `npm run lint` and keep errors at zero.
- [x] Run `npm run build:code`.
- [x] Run `npm run build:css`.
- [x] Run targeted `npm run build:db -- <starter-pack>` builds for the new N5eB packs.
- [x] Run full `npm run build:db` with Foundry stopped to avoid LevelDB lock conflicts.
- [x] Rebuild the actor pack after fixing Naruto's HP/chakra advancement average values.
- [x] Start Foundry and verify the `n5eb-v14` world loads.
- [ ] Test character creation, class advancement, chakra rolls, jutsu usage, rests, and Mastery rolls end to end with the book-backed Naruto actor.
- [ ] Update README and install instructions.
- [ ] Package `n5eb.zip`.
- [ ] Publish a GitHub release with `system.json` and the zip.

## Later Polish

- [x] Copy old N5eB setup, sheet banner, pause, badge, and Ryo art into the current system.
- [x] Wire setup media, sheet banner variables, pause emblem, settings badge, and Ryo-only currency UI.
- [x] Verify Naruto inventory, currency manager, and `/award 10ryo` recognize Ryo as the only denomination.
- [ ] Replace remaining D&D artwork/icons where needed.
- [ ] Add Naruto-specific UI theme polish without hurting sheet density.
- [ ] Add journal rules pages for the major Naruto subsystems.
- [x] Add a first sample actor for quick testing.
- [ ] Add automated regression checks for data models and migrations.
- [ ] Document what is automated, semi-automated, and manual for GMs.

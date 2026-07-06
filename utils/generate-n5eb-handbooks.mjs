import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const SYSTEM_ROOT = process.cwd();
const PACK_SRC = path.join(SYSTEM_ROOT, "packs", "_source", "handbooks");
const RULES_SRC = path.join(SYSTEM_ROOT, "packs", "_source", "rules");
const ASSET_DIR = path.join(SYSTEM_ROOT, "assets", "content", "handbooks");
const TMP_ROOT = path.resolve(SYSTEM_ROOT, "..", "..", "tmp", "pdfs", "n5eb-3.10");
const PYTHON = process.env.N5EB_PYTHON
  ?? "C:\\Users\\Benni\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const PDFTOPPM = process.env.N5EB_PDFTOPPM
  ?? "C:\\Users\\Benni\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdftoppm.exe";

const require = createRequire(import.meta.url);
const YAML = require(path.join(SYSTEM_ROOT, "node_modules", "js-yaml"));

const MAX_PAGES_PER_JOURNAL_PAGE = 6;
const RELATED_LIMIT = 12;
const MAIN_RELATED_LIMIT = 8;
const PLAYER_LINK_PACKS = ["clan", "class", "subclass", "classmod", "jutsus", "feats", "items", "conditions"];

const BOOKS = [
  {
    key: "main",
    title: "Naruto 5e Handbook",
    shortTitle: "Main Rulebook",
    subtitle: "Core character creation, equipment, combat, jutsu casting, feats, adversaries, and GM guidance.",
    sourceBook: "Naruto 5e",
    accent: "crimson",
    pdf: "D:\\Downloads\\Naruto 5e - Full Document (7).pdf"
  },
  {
    key: "orochimaru",
    title: "Orochimaru's Observation Compendium",
    shortTitle: "Classes",
    subtitle: "Class options, class feats, archetypes, and class-specific systems.",
    sourceBook: "Orochimaru's Observation Compendium",
    accent: "sage",
    pdf: "D:\\Downloads\\Orochimarus_Observation_Compendium (5).pdf"
  },
  {
    key: "tsunade",
    title: "Tsunade's Studies Compendium",
    shortTitle: "Clans",
    subtitle: "Clan options, clan feats, bloodlines, releases, and clan-specific jutsu.",
    sourceBook: "Tsunade's Studies Compendium",
    accent: "jade",
    pdf: "D:\\Downloads\\Tsunades_Studies_Compendium (3).pdf"
  },
  {
    key: "jiraiya",
    title: "Jiraiya's Jutsu Compendium",
    shortTitle: "Jutsus",
    subtitle: "Ninjutsu, genjutsu, taijutsu, bukijutsu, summoning techniques, and jutsu reference material.",
    sourceBook: "Jiraiya's Jutsu Compendium",
    accent: "indigo",
    pdf: "D:\\Downloads\\Jiraiyas_Jutsu_Compendium (6).pdf"
  }
];

const CHANGELOG_BOOK = {
  key: "changelog",
  title: "Naruto 5e 3.10 Changelog",
  shortTitle: "3.10 Changelog",
  subtitle: "Readable summary of the 3.02 to 3.10 differences used during the parity sweep.",
  sourceBook: "Naruto 5e 3.10 Changelog",
  accent: "amber",
  pdf: "D:\\Downloads\\Naruto 5e- 2025_ 3.10 Update Changelog - The Homebrewery.pdf"
};

const CHANGELOG_SECTIONS = [
  {
    name: "Shinobi's Handbook",
    groups: [
      {
        name: "General",
        bullets: [
          "All characters start with an additional 10 HP and Chakra.",
          "Saving Throw based effects which do not directly state they affect Death Saves, do not.",
          "Negate, Counter, Dispel, and Interrupt have been codified.",
          "Kit and other DCs adjusted for Mastery."
        ]
      },
      {
        name: "Chapter 5: Equipment",
        bullets: [
          "Unarmed weapons have all had their damage dice changed to 1d4, to match the unarmed keyword text.",
          "The costs of armor have been equalized across categories.",
          "The strength requirements of armor were readjusted to even numbers.",
          "Jonin/Elite Armor had their properties switched.",
          "Lethal is limited to 5 ranks.",
          "Evocation can no longer be used as a component for any jutsu.",
          "Hidden Blade gained Hidden and Finesse properties.",
          "Chili Pepper Bomb rarities beyond the base were removed.",
          "Angel's Breath no longer inflicts conditions on a success."
        ]
      },
      {
        name: "Chapter 7: Adventuring and Missions",
        bullets: [
          "Downtime and Ryo payout per mission has been reduced.",
          "Learning a language now only costs 2 DT.",
          "Gaining an armor proficiency now costs 12 DT.",
          "Armor seals which increase AC can no longer stack.",
          "Medical/Elemental Seals S-rank +1 damage die no longer applies to taijutsu attacks.",
          "Researching Compounds is now an optional rule."
        ]
      },
      {
        name: "Chapter 8: Combat",
        bullets: [
          "Clarified that you can normally only ever have 1 reaction per round, and cannot react to the same trigger more than once.",
          "All mentions of Paralyzed have been removed.",
          "All mentions of the Poisoned condition have been replaced with Envenomed.",
          "Condition language updated to have a standard condition lasting no longer than 1 minute unless otherwise specified.",
          "Jutsu cost doubling added to the effect multiplication list, meaning cost doublings can no longer be stacked.",
          "Stealth being broken by moving out of obscurement is further clarified."
        ]
      },
      {
        name: "Chapter 13: Customization Options",
        bullets: [
          "The Jutsu Customization System has been temporarily removed for significant redesign.",
          "All armor feats have been removed.",
          "Medical Release: Support and Medical Release: Combat have been merged.",
          "Performer is a new skill feat for performance, allowing you to spend time playing an instrument to gain advantage and provide temporary HP during rests.",
          "Elite Presence now gives -1 per minute, capped at -5.",
          "Alert now just adds your full proficiency bonus to initiative.",
          "Lord of Darkness no longer automatically gives Dazzled, instead requiring a once per turn Wisdom save."
        ]
      }
    ]
  },
  {
    name: "Orochimaru's",
    groups: [
      {
        name: "General",
        bullets: [
          "All instances of movement speed doubling have been changed to +30 ft. increases.",
          "All classes who previously learned 15 jutsu from their class now learn 20."
        ]
      },
      {
        name: "Cooking-Nin",
        bullets: [
          "War Cook now allows you to choose a cooking tool to count as a weapon type of your choice, and can be taken up to twice.",
          "Mega HP Up instead allows a healed creature to attempt a skill check to remove a condition."
        ]
      },
      {
        name: "Hunter-Nin",
        bullets: [
          "Blade's Prey flat-footed effect clarified to give a temporary -1 AC.",
          "Greed's Shell can now be used with Heavy Armor.",
          "Vice Assassination Techniques now all require a Constitution save."
        ]
      },
      {
        name: "Int-Op",
        bullets: [
          "Favored Plan no longer allows double plans, instead letting you use a Crafting or Trappers Kit check for passive perception and detecting hidden objects or creatures."
        ]
      },
      {
        name: "Ninjutsu-Specialist",
        bullets: [
          "Potent Ninjutsu instead maximizes up to 3 damage dice on a jutsu.",
          "Fire Release Master now only affects the jutsu's original damage dice.",
          "Limitless Casting can no longer be refreshed by spending chakra dice."
        ]
      },
      { name: "Scout-Nin", bullets: ["Absolute Authority can now be used with Heavy Armor."] },
      {
        name: "Sci-Nin",
        bullets: [
          "The Defender of Tomorrow, Today now only deals damage up to twice per turn, and only requires 1 charge to use."
        ]
      },
      { name: "Taijutsu Specialist", bullets: ["Chakra Frenzy can now be used with Heavy Armor."] },
      {
        name: "Weapon-Specialist",
        bullets: [
          "Focused Efficiency was restored.",
          "Chakra Strike now scales based on jutsu rank.",
          "Chaining Adept was removed and replaced with Arsenal of War."
        ]
      },
      {
        name: "Witch's Training Archetype",
        bullets: [
          "Renamed the feature Witches Training, the ability to upcast a spell twice with a reaction instead of spending chakra, to Spellcaster.",
          "Swapped which feats gave access to the Ritual keyword and Spellcaster feature."
        ]
      }
    ]
  },
  {
    name: "Tsunade's",
    groups: [
      { name: "General", bullets: ["Clan dice options which reduce saves or add damage are now capped at 3 dice."] },
      {
        name: "Aburame",
        bullets: [
          "Chakra Consumption/Insect Focus was completely replaced by a reworked Insect Focus with additional scaling bug choices.",
          "Insect Sphere now uses Strength for both saves, and damage increased to d6s.",
          "Parasitic Destruction now inflicts Envenomed rather than Sealed.",
          "Spindle Formation was replaced with the new jutsu Parasitic Touch.",
          "Insect Clones concentrating on them is now free, and they are allowed to concentrate on jutsu.",
          "Insect Jamming was replaced with Volatile Swarm.",
          "Parasitic Giant Insect is now a single burst of damage and conditions, whose detonation time can be altered."
        ]
      },
      {
        name: "Bakuton",
        bullets: [
          "Art Is An Explosion now increases shrapnel dice by +1 size.",
          "Concussive Blasts is limited to 2 shrapnel dice per cast. The 18th-level feature specifies that cones, cubes, and spheres have their sizes increased.",
          "Clay Chase Down only affects a creature once per casting.",
          "Clay Birds now concusses instead of knocking prone and blinding.",
          "Atomic Missile now only affects non-equipped weapons and armor.",
          "Fury now only affects armor DR.",
          "Clay Flight had its HP halved, and detonate is an action."
        ]
      },
      { name: "Ranton", bullets: ["Storming Rain now gives only 1 resistance.", "Secondary Discharge special cost is now the original jutsu's base cost."] },
      {
        name: "Chinoike",
        bullets: [
          "Sanguine Prowess HP spent now scales with jutsu rank.",
          "Ketsuryugan necrotic damage immunity moved to 11th level; action and reaction effects were revised.",
          "Blood Pact blood patrons were renamed Blood Bonded Allies.",
          "Bloodletting Weaponry upcasts were altered significantly, with the base extra attack moved to S-rank.",
          "Blood Daggers additional daggers on upcast were removed in exchange for a multi.",
          "Red Death casting time changed to special, as a bonus action or free action if used as part of Blood Daggers.",
          "Blood-Clot Strike is now contested against an actual check instead of a passive DC.",
          "Genjutsu Numbness increased range and added concentration.",
          "Sanguine Adept changed in accordance with Sanguine Prowess.",
          "Efficiency Ketsuryugan no longer gives Dazzled immunity.",
          "Tethered Plasma changed significantly."
        ]
      },
      { name: "Futton", bullets: ["Corrosive Aura was removed, as it was supposed to be replaced by Corrosive Pressure.", "Boiling Power damage reduced to 2d6.", "Broiling Rage now gives only 1 resistance."] },
      { name: "Hebi", bullets: ["Adaptive Body Camouflage bonus reduced to -3, and cannot stack with normal Body Camouflage."] },
      { name: "Hoshi", bullets: ["Star Chakra jutsu cast with star chakra can be dispelled by jutsu of equal rank, and their clash bonus is only half Constitution modifier.", "Hypnotic Dance now only charms on a critical failure.", "Star Chakra Resilience temporary HP reduced to twice the jutsu's rank rather than thrice it.", "Cosmic Pressure can no longer charm.", "Cosmic Kujaku no longer grants a bonus to saves against ninjutsu."] },
      { name: "Hyuga", bullets: ["8-Trigrams Spiraling Heaven Palms only ignores DR with Hyuga taijutsu and Gentle Fist unarmed strikes."] },
      { name: "Hanami", bullets: ["Healing Cloak now requires concentration.", "Medical Fist now only grants temporary HP.", "Medical Fist feature Strength bonus capped, and the once per turn attack is limited to attacking with medical jutsu.", "Offensive Cloak can deal damage up to three times per turn.", "Refined Chakra Network now grants a reroll rather than an autopass.", "Improved Combat Medicine is now a level 8+ feat, and no longer increases damage."] },
      { name: "Jiton", bullets: ["Dust Coat starting AC increased by +1, but now only applies half your proficiency bonus and lasts until your next short or long rest."] },
      { name: "Kaguya", bullets: ["Shikotsumyaku Stance no longer grants additional attacks to Dance of the Willow."] },
      { name: "Kuru", bullets: ["Spiraling Dark Wall now gives resistance instead of immunity.", "Yang Chakra Adept lets you reroll rather than autopass."] },
      { name: "Nara", bullets: ["Coordinate initiative bonus removed.", "Shadow Possession resave is now at end of turn rather than as an action."] },
      { name: "Namikaze", bullets: ["Flash Step now has a duration of 1 minute and requires concentration.", "Swift Shield now gives only 1 resistance."] },
      { name: "Senju", bullets: ["Foo Dog Heads damage reduced to 4d6."] },
      { name: "Uchiha", bullets: ["Madara's Hatred no longer provides a bonus to saving throws."] },
      { name: "Uzumaki", bullets: ["Chakra Reserves is no longer a dice resource, instead allowing you to Draw Reserves as an action, gaining additional chakra on a successful check.", "Monstrous Reserves no longer doubles Wellspring of Chakra bonus chakra.", "Adamantine Barrier makes a creature immune after succeeding once.", "Uzumaki Stubbornness no longer grants an additional reaction.", "River Dam Seal DC reduced to 25.", "Adamantine Binding Chains no longer removes hand seals and halves movement, but restrains."] },
      { name: "Tsuchigumo", bullets: ["Spider Brood Summoning is now limited to 2 broodlings."] },
      { name: "Shi Hou", bullets: ["Immortal Techniques removed.", "Seiten Taisei removed as a feat and moved to be Shi Hou's 18th-level feature."] },
      { name: "Shakuton", bullets: ["Violent Slaughtering Flame DC increase cost increased to 2 motes, max motes increased to 6.", "Hellfire Murder base damage reduced to 6d8+6."] },
      { name: "Shikigami", bullets: ["Shikigami Traits now grants an additional D-rank hijutsu.", "Papercraft now increases the quality of created tools, scales as you level, and no longer mentions downtime.", "Divine Shikigami all effects except breaching tag now have a once per turn limit."] },
      { name: "Shoton", bullets: ["Crystal Soul additional concentration slots only apply for jutsu which create quake shards."] },
      { name: "Yamada", bullets: ["Empty Blade instead allows you to maximize damage dice on your bukijutsu."] },
      { name: "Yuki", bullets: ["Twin Dragon Whirlwind now grants ranged attacks disadvantage, and inflicts Chilled on those within the whirlwind."] }
    ]
  }
];

const MAIN_WIKI_TOPICS = [
  {
    key: "start-here",
    name: "Start Here",
    group: "Getting Started",
    range: [10, 16],
    imagePage: 10,
    subtitle: "The character creation flow from first concept through first level.",
    summary: [
      "Use this page when a player is building a shinobi from scratch.",
      "The workflow is clan, class, ability scores, character details, equipment, jutsu, then final derived stats.",
      "For detailed options, jump from here into the clan, class, equipment, and jutsu pages."
    ],
    links: ["Clans", "Classes", "Ability Scores and Modifiers", "Backgrounds", "Equipment", "Jutsu Casting", "Proficiency Bonus", "Armor Class"]
  },
  {
    key: "clans-overview",
    name: "Clans Overview",
    group: "Character Creation",
    range: [17, 17],
    imagePage: 17,
    subtitle: "How clans, traits, proficiencies, and special lineage rules work.",
    summary: [
      "This is the rulebook overview for choosing a clan.",
      "Use Tsunade's Studies Compendium for the complete clan list and clan-specific feature text."
    ],
    links: ["Clans", "Special Traits", "Ability Score Increase", "Proficiencies", "Speed", "Clan Feats"]
  },
  {
    key: "ambitions-backgrounds",
    name: "Ambitions & Backgrounds",
    group: "Character Creation",
    range: [18, 24],
    imagePage: 18,
    subtitle: "Personality hooks, Will of Fire, backgrounds, language, equipment, and starting identity.",
    summary: [
      "This topic collects the roleplaying and background layer of character creation.",
      "Backgrounds still matter mechanically through proficiencies, equipment, features, and ability-score choices."
    ],
    links: ["Backgrounds", "Will of Fire", "Languages and Dialects", "Equipment", "Proficiencies"]
  },
  {
    key: "classes-overview",
    name: "Classes Overview",
    group: "Character Creation",
    range: [25, 25],
    imagePage: 25,
    subtitle: "How the main rulebook points players into the class compendium.",
    summary: [
      "The main rulebook intentionally keeps classes brief.",
      "Use Orochimaru's Observation Compendium for class progression, archetypes, class feats, and class-specific systems."
    ],
    links: ["Classes", "Class Features", "Class Feats", "Orochimaru's Observation Compendium"]
  },
  {
    key: "equipment-overview",
    name: "Equipment Overview",
    group: "Equipment",
    range: [26, 27],
    imagePage: 26,
    subtitle: "Currency, wealth, selling treasure, active inventory, and encumbrance.",
    summary: [
      "Use this page for the economy and inventory rules before selecting specific armor, weapons, or gear.",
      "Detailed item entries should be opened from the related links or the Items compendium."
    ],
    links: ["Chapter 5: Equipment", "Currency", "Wealth", "Encumbered", "Active Inventory", "Equipment"]
  },
  {
    key: "weapons-armor",
    name: "Weapons & Armor",
    group: "Equipment",
    range: [27, 33],
    imagePage: 28,
    subtitle: "Armor categories, armor properties, weapon proficiency, weapon properties, and ammunition.",
    summary: [
      "This is the primary equipment rules page for combat gear.",
      "Use item sheets for exact item stats; use this page for the rules that make those items work."
    ],
    links: ["Armor", "Light Armor", "Medium Armor", "Heavy Armor", "Weapons", "Ammunition", "Ammunition Die", "Weapon Properties", "Armor Properties"]
  },
  {
    key: "gear-tools-scrolls",
    name: "Gear, Tools & Scrolls",
    group: "Equipment",
    range: [34, 50],
    imagePage: 34,
    subtitle: "Adventuring gear, packs, communication tools, explosive tools, medical tools, toolkits, and scrolls.",
    summary: [
      "Use this page when players are shopping, preparing for missions, or resolving toolkit-based utility rules.",
      "The page is long because the equipment catalog is broad; related links point to the most likely item sheets."
    ],
    links: ["Adventuring Gear", "Equipment Packs", "Toolkits", "Scrolls", "First Aid Kit", "Medicine Kit", "Security Kit", "Explosive Tag Ball", "Chakra Pill", "Weapon Scroll", "Jutsu Scroll"]
  },
  {
    key: "ability-scores-checks",
    name: "Ability Scores & Checks",
    group: "Core Rules",
    range: [51, 56],
    imagePage: 51,
    subtitle: "Ability modifiers, advantage, proficiency, mastery, contests, passive checks, and each ability score.",
    summary: [
      "Use this page for the core d20 resolution rules.",
      "The Rules Quick Reference remains the best target for short tooltip links."
    ],
    links: ["Ability Scores and Modifiers", "Advantage and Disadvantage", "Proficiency Bonus", "Mastery", "Ability Checks", "Contests", "Passive Checks", "Saving Throws"]
  },
  {
    key: "skill-actions",
    name: "Skill Actions",
    group: "Core Rules",
    range: [57, 63],
    imagePage: 57,
    subtitle: "What proficiency and mastery unlock for individual skills.",
    summary: [
      "Use this page when a player asks what a skill can do beyond a normal ability check.",
      "Skill actions are dense, so this page intentionally keeps related links focused."
    ],
    links: ["Acrobatics", "Animal Handling", "Athletics", "Chakra Control", "Crafting", "Deception", "Insight", "Intimidation", "Medicine", "Stealth", "Survival"]
  },
  {
    key: "adventuring-missions",
    name: "Adventuring & Missions",
    group: "Play",
    range: [64, 83],
    imagePage: 64,
    subtitle: "Exploration, travel, missions, time, and non-combat play structure.",
    summary: [
      "Use this page for the parts of play that happen between character sheets and combat rounds.",
      "Mission and downtime rules are intentionally kept together because they are often used in the same session flow."
    ],
    links: ["Adventuring", "Missions", "Downtime", "Travel", "Resting", "Lifestyle", "Languages and Dialects"]
  },
  {
    key: "downtime-rewards",
    name: "Downtime, Rewards & Crafting",
    group: "Play",
    range: [84, 110],
    imagePage: 84,
    subtitle: "Training, mission rewards, crafting, research, and longer-term progression systems.",
    summary: [
      "Use this page after missions, between arcs, or when resolving training and crafting.",
      "Where an activity exists as a Foundry entry, prefer the related link for the exact mechanical record."
    ],
    links: ["Downtime Activities", "Crafting", "Training", "Rewards", "Research", "Compounds", "Ryo"]
  },
  {
    key: "combat-overview",
    name: "Combat Overview",
    group: "Combat",
    range: [111, 112],
    imagePage: 111,
    subtitle: "The combat loop, initiative, rounds, turns, and the basic shape of a fight.",
    summary: [
      "Start here when teaching combat.",
      "For tactical details, move next to turns, actions, movement, attacks, damage, and conditions."
    ],
    links: ["Combat", "Initiative", "Rounds", "Turns", "Your Turn", "Surprised"]
  },
  {
    key: "turns-actions-movement",
    name: "Turns, Actions & Movement",
    group: "Combat",
    range: [113, 116],
    imagePage: 113,
    subtitle: "Actions, bonus actions, reactions, free actions, object interaction, movement, size, and space.",
    summary: [
      "Use this page for the turn economy and movement rules players ask about most often.",
      "It deliberately focuses on action structure rather than damage resolution."
    ],
    links: ["Actions in Combat", "Bonus Actions", "Reactions", "Free Actions", "Interacting with Objects Around You", "Breaking Up Your Move", "Moving Between Attacks", "Creature Size", "Space"]
  },
  {
    key: "attacks-damage-conditions",
    name: "Attacks, Damage & Conditions",
    group: "Combat",
    range: [117, 123],
    imagePage: 117,
    subtitle: "Attack resolution, cover, damage, healing, death, conditions, and combat consequences.",
    summary: [
      "Use this page once an action creates an attack, saving throw, damage roll, condition, or recovery effect.",
      "Condition names link out where exact Foundry condition records exist."
    ],
    links: ["Attacks", "Damage", "Cover", "Hit Points", "Temporary Hit Points", "Death Saving Throws", "Conditions", "Dazed", "Bleeding", "Burned", "Shocked", "Envenomed"]
  },
  {
    key: "jutsu-casting",
    name: "Jutsu Casting",
    group: "Jutsu",
    range: [124, 134],
    imagePage: 126,
    subtitle: "Jutsu rank, casting time, components, cost, concentration, keywords, clashes, and combination jutsu.",
    summary: [
      "Use this page for the universal rules that apply before opening a specific jutsu sheet.",
      "Jiraiya's Jutsu Compendium remains the player-facing catalog for individual jutsu."
    ],
    links: ["Jutsu Casting", "Jutsu Rank", "Casting Time", "Components", "Chakra Cost", "Concentration", "Keywords", "Clash", "Combination-Jutsu"]
  },
  {
    key: "jutsu-lists",
    name: "Jutsu Lists Overview",
    group: "Jutsu",
    range: [135, 135],
    imagePage: 135,
    subtitle: "How the main rulebook hands off to the jutsu lists.",
    summary: [
      "This is a short index bridge rather than the full jutsu catalog.",
      "Use Jiraiya's Jutsu Compendium for actual jutsu browsing."
    ],
    links: ["Ninjutsu", "Genjutsu", "Taijutsu", "Bukijutsu", "Jutsus", "Jiraiya's Jutsu Compendium"]
  },
  {
    key: "feats-customization",
    name: "Feats & Customization",
    group: "Options",
    range: [136, 165],
    imagePage: 136,
    subtitle: "Feats, stances, customization options, and character build expansion.",
    summary: [
      "Use this page when players are choosing feats or build-defining options.",
      "Individual feat records are usually better to open directly from the related links or Feats compendium."
    ],
    links: ["Feats", "General Feats", "Skill Feats", "Chakra Feats", "Nature Release", "Fighting Stances", "Clone Specialization", "Medical Release Expert"]
  },
  {
    key: "allies-adversaries",
    name: "Allies & Adversaries",
    group: "GM Tools",
    range: [166, 166],
    imagePage: 166,
    subtitle: "How the main rulebook points GMs toward allies, adversaries, and monster-style content.",
    summary: [
      "This is a bridge into adversary content rather than the full creature catalog.",
      "Use the adversary and summon compendiums for actual stat blocks."
    ],
    links: ["Allies", "Adversaries", "Bingo Book", "Summons", "NPC"]
  },
  {
    key: "kage-guide",
    name: "Kage Guide",
    group: "GM Tools",
    range: [167, 172],
    imagePage: 167,
    subtitle: "GM-facing guidance for campaigns, rulings, encounters, and table structure.",
    summary: [
      "Use this page for the GM layer of the rulebook.",
      "It should remain readable, not overloaded with automated item links."
    ],
    links: ["Kage Guide", "The Dungeon Master", "Encounters", "Rewards"]
  },
  {
    key: "running-the-game",
    name: "Running the Game",
    group: "GM Tools",
    range: [173, 178],
    imagePage: 173,
    subtitle: "Practical DM guidance from the later Kage Guide pages.",
    summary: [
      "Use this page for session-running advice and table procedures.",
      "It is intentionally separated from player rules so the handbook sidebar stays scannable."
    ],
    links: ["The Dungeon Master", "Kage Guide Basics", "Encounters", "Difficulty"]
  },
  {
    key: "legacy-rules",
    name: "Legacy Rules",
    group: "Archive",
    range: [179, 181],
    imagePage: 179,
    subtitle: "Archived rules retained for reference and compatibility.",
    summary: [
      "Use this only when an older feature, item, or campaign note references removed or legacy mechanics.",
      "Current play should prefer the main topic pages and Rules Quick Reference."
    ],
    links: ["Legacy Rules", "Multiclassing", "Experience Points", "Extra Attack", "Jutsu Casting"]
  }
];

function idFrom(value) {
  const digest = crypto.createHash("sha1").update(value).digest("base64url").replace(/[^A-Za-z0-9]/g, "");
  return digest.padEnd(16, "0").slice(0, 16);
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "entry";
}

function normalizeKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/\u2026/g, "...")
    .replace(/\u2212/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlEscape(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ordinalBookSort(key) {
  return { header: 0, main: 100000, orochimaru: 200000, tsunade: 300000, jiraiya: 400000, changelog: 500000 }[key] ?? 900000;
}

function baseStats() {
  return {
    duplicateSource: null,
    coreVersion: "14.360",
    systemId: "n5eb",
    systemVersion: "3.0.0",
    createdTime: 1783230000000,
    modifiedTime: 1783230000000,
    lastModifiedBy: "n5ebbuilder00000",
    exportSource: null
  };
}

function runPython(code, input, args=[]) {
  const result = spawnSync(PYTHON, ["-c", code, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" }
  });
  if ( result.status !== 0 ) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function extractBooks() {
  const code = String.raw`
import json
import re
import sys
from pypdf import PdfReader
import pdfplumber

books = json.loads(sys.stdin.read())

def clean(text):
    if text is None:
        return ""
    replacements = {
        "\u0000": "", "\u00a0": " ", "\u2010": "-", "\u2011": "-", "\u2012": "-",
        "\u2013": "-", "\u2014": "-", "\u2015": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2026": "...", "\u2212": "-"
    }
    for src, target in replacements.items():
        text = text.replace(src, target)
    return re.sub(r"[ \t]+", " ", text).strip()

def flatten(reader, outline, depth=0, out=None):
    if out is None:
        out = []
    for item in outline:
        if isinstance(item, list):
            flatten(reader, item, depth + 1, out)
            continue
        try:
            page = reader.get_destination_page_number(item) + 1
        except Exception:
            page = None
        title = clean(getattr(item, "title", str(item)))
        if title:
            out.append({"title": title, "page": page, "depth": depth})
    return out

def is_noise(line, page_count):
    if not line:
        return True
    if re.fullmatch(r"\d+", line):
        return True
    if re.fullmatch(r"page\s+\d+(\s+of\s+\d+)?", line, re.I):
        return True
    if line in {chr(96), "|"}:
        return True
    return False

def text_lines(page, page_number, page_count, book_title):
    raw = page.extract_text(x_tolerance=1.5, y_tolerance=3, layout=False) or ""
    lines = []
    seen = set()
    for raw_line in raw.splitlines():
        line = clean(raw_line)
        if is_noise(line, page_count):
            continue
        compact = line.lower().replace(" ", "")
        if compact in seen and len(line) < 80:
            continue
        seen.add(compact)
        lines.append(line)
    return lines

def extract_tables(page):
    settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
        "join_tolerance": 3,
        "edge_min_length": 3,
        "min_words_vertical": 2,
        "min_words_horizontal": 1
    }
    tables = []
    try:
        extracted = page.extract_tables(settings) or []
    except Exception:
        extracted = []
    for table in extracted:
        rows = []
        for row in table:
            cells = [clean(cell) for cell in (row or [])]
            if any(cells):
                rows.append(cells)
        if len(rows) >= 2:
            tables.append(rows)
    return tables

payload = []
for book in books:
    reader = PdfReader(book["pdf"])
    outline = flatten(reader, reader.outline)
    pages = []
    with pdfplumber.open(book["pdf"]) as pdf:
        page_count = len(pdf.pages)
        for index, page in enumerate(pdf.pages):
            pages.append({
                "page": index + 1,
                "lines": text_lines(page, index + 1, page_count, book["title"]),
                "tables": extract_tables(page)
            })
    payload.append({
        **book,
        "pageCount": len(reader.pages),
        "outline": outline,
        "pages": pages
    })

print(json.dumps(payload, ensure_ascii=True))
`;
  return JSON.parse(runPython(code, JSON.stringify(BOOKS)));
}

function renderWebp(pdf, page, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if ( fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0 ) return;
  const tmpPrefix = path.join(TMP_ROOT, "render", `${slugify(path.basename(outputPath, ".webp"))}-${page}`);
  fs.mkdirSync(path.dirname(tmpPrefix), { recursive: true });
  const ppm = spawnSync(PDFTOPPM, ["-f", String(page), "-l", String(page), "-singlefile", "-r", "130", "-png", pdf, tmpPrefix], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if ( ppm.status !== 0 ) {
    throw new Error([
      `Failed to render ${path.basename(pdf)} page ${page}.`,
      `Command: ${PDFTOPPM}`,
      `Exit: ${ppm.status}`,
      ppm.error ? `Error: ${ppm.error.message}` : "",
      ppm.stderr ? `stderr: ${ppm.stderr}` : "",
      ppm.stdout ? `stdout: ${ppm.stdout}` : ""
    ].filter(Boolean).join("\n"));
  }

  const pngPath = `${tmpPrefix}.png`;
  const code = String.raw`
import sys
from PIL import Image

src, dest = sys.argv[1], sys.argv[2]
with Image.open(src) as img:
    img = img.convert("RGB")
    img.thumbnail((1200, 1800))
    img.save(dest, "WEBP", quality=82, method=6)
`;
  runPython(code, "", [pngPath, outputPath]);
  fs.rmSync(pngPath, { force: true });
}

function renderBookImages(book, chunks) {
  const rendered = new Map();
  const requests = [{ key: "cover", page: 1, name: `${book.key}-cover.webp` }];
  for ( const chunk of chunks ) {
    if ( chunk.part !== 1 ) continue;
    requests.push({
      key: `section:${chunk.title}:${chunk.start}`,
      page: chunk.start,
      name: `${book.key}-${slugify(chunk.title)}-${chunk.start}.webp`
    });
  }
  for ( const request of requests ) {
    const output = path.join(ASSET_DIR, request.name);
    renderWebp(book.pdf, request.page, output);
    rendered.set(request.key, `systems/n5eb/assets/content/handbooks/${request.name}`);
  }
  return rendered;
}

function usableOutline(book) {
  const outline = book.outline
    .filter(item => Number.isInteger(item.page) && item.page >= 1 && item.page <= book.pageCount)
    .sort((a, b) => (a.page - b.page) || (a.depth - b.depth));
  if ( !outline.length ) return [{ title: book.title, start: 1, end: book.pageCount, depth: 0 }];

  const topLevelCount = outline.filter(item => item.depth === 0).length;
  const maxDepth = topLevelCount < 8 ? 1 : 0;
  const candidates = outline.filter(item => item.depth <= maxDepth);
  const deduped = [];
  const seen = new Set();
  for ( const item of candidates ) {
    const key = `${normalizeKey(item.title)}:${item.page}`;
    if ( seen.has(key) ) continue;
    seen.add(key);
    deduped.push(item);
  }

  const ranges = [];
  for ( let i = 0; i < deduped.length; i++ ) {
    const current = deduped[i];
    const next = deduped[i + 1];
    const start = Math.max(1, current.page);
    const end = Math.min(book.pageCount, (next?.page ?? (book.pageCount + 1)) - 1);
    if ( end >= start ) ranges.push({ title: current.title, start, end, depth: current.depth });
  }
  return ranges.length ? ranges : [{ title: book.title, start: 1, end: book.pageCount, depth: 0 }];
}

function chunkRanges(ranges) {
  const chunks = [];
  for ( const range of ranges ) {
    const rangeChunks = [];
    for ( let start = range.start; start <= range.end; start += MAX_PAGES_PER_JOURNAL_PAGE ) {
      const end = Math.min(range.end, start + MAX_PAGES_PER_JOURNAL_PAGE - 1);
      rangeChunks.push({ ...range, start, end, part: rangeChunks.length + 1 });
    }
    for ( const chunk of rangeChunks ) chunks.push({ ...chunk, totalParts: rangeChunks.length });
  }
  return chunks;
}

function isHeading(line, previousLine="") {
  if ( line.length > 92 ) return false;
  if ( /[.!?]$/.test(line) && !/^chapter\s+\d+/i.test(line) ) return false;
  if ( /^(chapter|appendix|rank|level|actions|attacks|class feats|contents|credits)\b/i.test(line) ) return true;
  if ( /^[A-Z0-9][A-Z0-9 '&:/(),.-]{4,}$/.test(line) && /[A-Z]/.test(line) ) return true;
  if ( /^[A-Z][a-z0-9' -]+(: [A-Z0-9])?/.test(line) && previousLine === "" && line.length <= 54 ) return true;
  return false;
}

function lineKind(line) {
  if ( /^[-*•]\s+/.test(line) ) return "bullet";
  if ( /^\d+[.)]\s+/.test(line) ) return "number";
  return null;
}

function linesToBlocks(lines) {
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if ( !paragraph.length ) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if ( !list ) return;
    blocks.push(list);
    list = null;
  };

  for ( const line of lines.map(cleanText).filter(Boolean) ) {
    const kind = lineKind(line);
    if ( kind ) {
      flushParagraph();
      const ordered = kind === "number";
      if ( !list || list.ordered !== ordered ) flushList();
      list ??= { type: "list", ordered, items: [] };
      list.items.push(line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, ""));
      continue;
    }
    flushList();

    if ( isHeading(line, paragraph.length ? paragraph[paragraph.length - 1] : "") ) {
      flushParagraph();
      blocks.push({ type: "heading", level: /^chapter|appendix/i.test(line) ? 2 : 3, text: line });
      continue;
    }

    if ( paragraph.length && /-$/.test(paragraph[paragraph.length - 1]) ) {
      paragraph[paragraph.length - 1] = paragraph[paragraph.length - 1].slice(0, -1) + line;
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

function loadSourceIndex() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));
  const packTypes = new Map((manifest.packs ?? []).map(pack => [pack.name, pack.type]));
  const packNames = PLAYER_LINK_PACKS;
  const index = new Map();

  function add(name, uuid, pack, type) {
    const key = normalizeKey(name);
    if ( !key || key.length < 3 ) return;
    const existing = index.get(key) ?? [];
    if ( !existing.some(entry => entry.uuid === uuid) ) existing.push({ name: cleanText(name), uuid, pack, type });
    index.set(key, existing);
  }

  function* walk(dir) {
    if ( !fs.existsSync(dir) ) return;
    for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
      const full = path.join(dir, entry.name);
      if ( entry.isDirectory() ) yield* walk(full);
      else if ( [".yml", ".yaml"].includes(path.extname(entry.name)) ) yield full;
    }
  }

  for ( const pack of packNames ) {
    const packDir = path.join(SYSTEM_ROOT, "packs", "_source", pack);
    const docType = packTypes.get(pack) ?? "Item";
    for ( const file of walk(packDir) ) {
      const doc = YAML.load(fs.readFileSync(file, "utf8"));
      if ( !doc?._id || !doc.name ) continue;
      add(doc.name, `Compendium.n5eb.${pack}.${docType}.${doc._id}`, pack, docType);
      if ( docType === "JournalEntry" ) {
        for ( const page of doc.pages ?? [] ) {
          if ( page?._id && page.name ) {
            add(page.name, `Compendium.n5eb.${pack}.JournalEntry.${doc._id}.JournalEntryPage.${page._id}`, pack, "JournalEntryPage");
          }
        }
      }
    }
  }
  return index;
}

function relatedForText(index, values, { limit=RELATED_LIMIT, uniqueNames=false, preferredPacks=[] }={}) {
  const related = [];
  const seen = new Set();
  const seenNames = new Set();
  const packWeight = new Map(preferredPacks.map((pack, index) => [pack, index]));
  for ( const value of values ) {
    const matches = [...(index.get(normalizeKey(value)) ?? [])].sort((a, b) => {
      const aWeight = packWeight.get(a.pack) ?? 999;
      const bWeight = packWeight.get(b.pack) ?? 999;
      return (aWeight - bWeight) || a.name.localeCompare(b.name);
    });
    for ( const match of matches ) {
      if ( seen.has(match.uuid) ) continue;
      const nameKey = normalizeKey(match.name);
      if ( uniqueNames && seenNames.has(nameKey) ) continue;
      seen.add(match.uuid);
      seenNames.add(nameKey);
      related.push(match);
      if ( related.length >= limit ) return related;
    }
  }
  return related;
}

function renderRelated(related, { title="Related Foundry Entries" }={}) {
  if ( !related.length ) return "";
  const cards = related.map(entry => [
    `<div class="n5eb-related-card">`,
    `<span class="n5eb-related-title">@UUID[${entry.uuid}]{${htmlEscape(entry.name)}}</span>`,
    `<span class="n5eb-related-meta">${htmlEscape(packLabel(entry.pack))}</span>`,
    `</div>`
  ].join("")).join("\n");
  return [
    `<section class="n5eb-related">`,
    `<h2>${htmlEscape(title)}</h2>`,
    `<div class="n5eb-related-grid">${cards}</div>`,
    `</section>`
  ].join("\n");
}

function packLabel(pack) {
  return {
    jutsus: "Jutsu",
    clan: "Clan",
    class: "Class",
    subclass: "Subclass",
    classmod: "Class Mod",
    feats: "Feat",
    items: "Item",
    conditions: "Condition",
    rules: "Rule Reference"
  }[pack] ?? pack;
}

function renderBlocks(blocks, index) {
  return blocks.map(block => {
    if ( block.type === "heading" ) {
      const match = (index.get(normalizeKey(block.text)) ?? [])[0];
      const content = match ? `@UUID[${match.uuid}]{${htmlEscape(block.text)}}` : htmlEscape(block.text);
      return `<h${block.level}>${content}</h${block.level}>`;
    }
    if ( block.type === "list" ) {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map(item => `<li>${htmlEscape(item)}</li>`).join("")}</${tag}>`;
    }
    return `<p>${htmlEscape(block.text)}</p>`;
  }).join("\n");
}

function renderTable(table) {
  const [head, ...body] = table;
  return [
    `<div class="n5eb-table-wrap"><table>`,
    `<thead><tr>${head.map(cell => `<th>${htmlEscape(cell)}</th>`).join("")}</tr></thead>`,
    `<tbody>${body.map(row => `<tr>${row.map(cell => `<td>${htmlEscape(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`,
    `</table></div>`
  ].join("");
}

function* walkYamlFiles(dir) {
  if ( !fs.existsSync(dir) ) return;
  for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
    const full = path.join(dir, entry.name);
    if ( entry.isDirectory() ) yield* walkYamlFiles(full);
    else if ( [".yml", ".yaml"].includes(path.extname(entry.name)) && entry.name !== "_folder.yml" ) yield full;
  }
}

const PROPERTY_LABELS = {
  ada: "Adamantine",
  amm: "Ammunition",
  blo: "Blocking",
  bulky: "Bulky",
  bulwark: "Bulwark",
  camouflage: "Camouflage",
  chakramolding: "Chakra Molding",
  cri: "Critical",
  dea: "Deadly",
  dis: "Disarm",
  evo: "Evocation",
  fashionable: "Fashionable",
  fin: "Finesse",
  fir: "Firearm",
  flx: "Flexible",
  foc: "Focus",
  fortified: "Fortified",
  gear: "Gear",
  gra: "Grapple",
  grp: "Grappling",
  heavyweight: "Heavyweight",
  hid: "Hidden",
  highQuality: "High Quality",
  hvy: "Heavy",
  let: "Lethal",
  lgt: "Light",
  lightweight: "Lightweight",
  lod: "Loading",
  mgc: "Magical",
  mla: "Melee Amplifier",
  mul: "Multiattack",
  ran: "Ranged",
  rch: "Reach",
  reinforced: "Reinforced",
  rel: "Reload",
  ret: "Returning",
  rng: "Range",
  sil: "Silvered",
  spc: "Special",
  stealthDisadvantage: "Stealth Disadvantage",
  tac: "Tactical",
  thr: "Thrown",
  threatening: "Threatening",
  trp: "Tripping",
  two: "Two-Handed",
  una: "Unarmed",
  ver: "Versatile",
  vol: "Volatile",
  weightlessContents: "Weightless Contents",
  win: "Winding"
};

const ITEM_TYPE_LABELS = {
  aseal: "Armor Seal",
  clothing: "Clothing",
  container: "Container",
  exoticM: "Exotic Melee",
  exoticR: "Exotic Ranged",
  explosive: "Explosive",
  food: "Food",
  heavy: "Heavy",
  improv: "Improvised",
  kit: "Kit",
  light: "Light",
  loot: "Gear",
  martialM: "Martial Melee",
  martialR: "Martial Ranged",
  medium: "Medium",
  natural: "Natural",
  poison: "Poison",
  potion: "Potion",
  scroll: "Scroll",
  shield: "Shield",
  simpleM: "Simple Melee",
  simpleR: "Simple Ranged",
  snack: "Snack",
  tool: "Tool",
  trap: "Trap",
  trinket: "Trinket",
  wseal: "Weapon Seal"
};

const ABILITY_LABELS = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
};

function labelFromCode(code) {
  if ( !code ) return "-";
  if ( PROPERTY_LABELS[code] ) return PROPERTY_LABELS[code];
  if ( ITEM_TYPE_LABELS[code] ) return ITEM_TYPE_LABELS[code];
  return String(code)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function compactValue(value, suffix="") {
  if ( value === null || value === undefined || value === "" ) return "-";
  return `${value}${suffix}`;
}

function loadHandbookItemData() {
  const itemsDir = path.join(SYSTEM_ROOT, "packs", "_source", "items");
  const items = [];
  for ( const file of walkYamlFiles(itemsDir) ) {
    const doc = YAML.load(fs.readFileSync(file, "utf8"));
    if ( !doc?._id || !doc.name || !doc.type ) continue;
    const sourcePath = path.relative(itemsDir, file).replaceAll(path.sep, "/");
    items.push({ ...doc, sourcePath, system: doc.system ?? {} });
  }
  return { items };
}

function itemSourceLink(item) {
  return `@UUID[Compendium.n5eb.items.Item.${item._id}]{${htmlEscape(item.name)}}`;
}

function itemTypeLabel(item) {
  return labelFromCode(item.system?.type?.value || item.type);
}

function formatPrice(item) {
  const price = item.system?.price ?? {};
  const value = price.value;
  if ( value === null || value === undefined || value === "" ) return "-";
  return `${value} ${price.denomination || "ryo"}`;
}

function formatWeight(item) {
  const weight = item.system?.weight ?? {};
  const value = weight.value;
  if ( value === null || value === undefined || value === "" ) return "-";
  return `${value} ${weight.units || "bulk"}`;
}

function formatProperties(item) {
  const properties = item.system?.properties ?? [];
  return properties.length ? properties.map(labelFromCode).join(", ") : "-";
}

function formatDamage(item) {
  const parts = item.system?.damage?.parts ?? [];
  const damage = parts
    .map(part => [part?.[0], part?.[1]].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  const versatile = item.system?.damage?.versatile;
  if ( versatile ) return damage ? `${damage}; Versatile ${versatile}` : `Versatile ${versatile}`;
  return damage || item.system?.formula || "-";
}

function formatRange(item) {
  const range = item.system?.range ?? {};
  const units = range.units || "";
  if ( range.value && range.long ) return `${range.value}/${range.long}${units ? ` ${units}` : ""}`;
  if ( range.value ) return `${range.value}${units ? ` ${units}` : ""}`;
  return "-";
}

function formatUses(item) {
  const uses = item.system?.uses ?? {};
  const max = uses.max || uses.value;
  if ( max === null || max === undefined || max === "" ) return "-";
  return `${max}${uses.per ? `/${uses.per}` : ""}`;
}

function textSummary(html, limit=130) {
  const text = cleanText(String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">"));
  if ( text.length <= limit ) return text || "-";
  return `${text.slice(0, limit - 3).replace(/\s+\S*$/, "")}...`;
}

function sortByTypeThenName(a, b) {
  return itemTypeLabel(a).localeCompare(itemTypeLabel(b)) || a.name.localeCompare(b.name);
}

function tableCell(value) {
  return htmlEscape(compactValue(value));
}

function renderRichTable(headers, rows) {
  return [
    `<div class="n5eb-table-wrap"><table>`,
    `<thead><tr>${headers.map(cell => `<th>${htmlEscape(cell)}</th>`).join("")}</tr></thead>`,
    `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`,
    `</table></div>`
  ].join("");
}

function renderGeneratedTable({ title, note, headers, rows, className="" }) {
  if ( !rows.length ) return "";
  return [
    `<section class="n5eb-generated-table ${className}">`,
    `<h2>${htmlEscape(title)}</h2>`,
    note ? `<p class="n5eb-generated-table-note">${htmlEscape(note)}</p>` : "",
    renderRichTable(headers, rows),
    `</section>`
  ].filter(Boolean).join("\n");
}

function armorRows(items) {
  return items
    .filter(item => item.sourcePath.startsWith("armors/") && item.type === "equipment")
    .sort(sortByTypeThenName)
    .map(item => {
      const armor = item.system?.armor ?? {};
      return [
        itemSourceLink(item),
        tableCell(itemTypeLabel(item)),
        tableCell(compactValue(armor.bonus, armor.bonus === null || armor.bonus === undefined ? "" : "")),
        tableCell(armor.value),
        tableCell(armor.dr),
        tableCell(armor.dexCap),
        tableCell(item.system?.strength ? `Str ${item.system.strength}` : "-"),
        tableCell(formatProperties(item)),
        tableCell(formatPrice(item)),
        tableCell(formatWeight(item)),
        tableCell(`${compactValue(armor.don)} / ${compactValue(armor.doff)}`)
      ];
    });
}

function weaponRows(items) {
  return items
    .filter(item => item.sourcePath.startsWith("weapons/") && item.type === "weapon")
    .sort(sortByTypeThenName)
    .map(item => [
      itemSourceLink(item),
      tableCell(itemTypeLabel(item)),
      tableCell(formatDamage(item)),
      tableCell(formatRange(item)),
      tableCell(formatProperties(item)),
      tableCell(formatPrice(item)),
      tableCell(formatWeight(item))
    ]);
}

function gearRows(items) {
  return items
    .filter(item => item.sourcePath.startsWith("mundane/"))
    .sort(sortByTypeThenName)
    .map(item => [
      itemSourceLink(item),
      tableCell(itemTypeLabel(item)),
      tableCell(formatPrice(item)),
      tableCell(formatWeight(item)),
      tableCell(formatProperties(item)),
      tableCell(textSummary(item.system?.description?.value))
    ]);
}

function packRows(items) {
  return items
    .filter(item => item.sourcePath.startsWith("packs/") && item.type === "container")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => [
      itemSourceLink(item),
      tableCell(formatPrice(item)),
      tableCell(formatWeight(item)),
      tableCell(formatProperties(item))
    ]);
}

function toolRows(items) {
  return items
    .filter(item => item.sourcePath.startsWith("consumables/kits/") && item.type === "tool")
    .sort(sortByTypeThenName)
    .map(item => [
      itemSourceLink(item),
      tableCell(itemTypeLabel(item)),
      tableCell(ABILITY_LABELS[item.system?.ability] ?? compactValue(item.system?.ability)),
      tableCell(formatUses(item)),
      tableCell(formatPrice(item)),
      tableCell(formatWeight(item)),
      tableCell(textSummary(item.system?.description?.value, 100))
    ]);
}

function scrollRows(items) {
  return items
    .filter(item => item.sourcePath.startsWith("scrolls/"))
    .sort(sortByTypeThenName)
    .map(item => [
      itemSourceLink(item),
      tableCell(itemTypeLabel(item)),
      tableCell(formatUses(item)),
      tableCell(item.system?.save?.dc ? `DC ${item.system.save.dc}` : "-"),
      tableCell(formatPrice(item)),
      tableCell(formatWeight(item)),
      tableCell(textSummary(item.system?.description?.value, 100))
    ]);
}

function consumableRows(items, types) {
  return items
    .filter(item => item.sourcePath.startsWith("consumables/") && !item.sourcePath.startsWith("consumables/kits/"))
    .filter(item => types.includes(item.system?.type?.value ?? ""))
    .sort(sortByTypeThenName)
    .map(item => [
      itemSourceLink(item),
      tableCell(itemTypeLabel(item)),
      tableCell(formatUses(item)),
      tableCell(item.system?.save?.dc ? `DC ${item.system.save.dc}` : "-"),
      tableCell(formatPrice(item)),
      tableCell(formatWeight(item)),
      tableCell(textSummary(item.system?.description?.value, 100))
    ]);
}

function generatedTablesForNode(book, node, itemData) {
  if ( book.key !== "main" ) return [];
  const items = itemData.items ?? [];
  if ( normalizeKey(node.title) === "armor" ) {
    return [renderGeneratedTable({
      title: "Armor Table",
      note: "Generated from the current Naruto 5e item compendium so item links, AC, DR, requirements, cost, and bulk stay aligned with the game data.",
      headers: ["Armor", "Category", "Armor Bonus", "AC", "DR", "Dex Cap", "Requirement", "Properties", "Cost", "Bulk", "Don/Doff"],
      rows: armorRows(items),
      className: "n5eb-primary-table n5eb-armor-table"
    })].filter(Boolean);
  }
  if ( normalizeKey(node.title) === "weapons" ) {
    return [renderGeneratedTable({
      title: "Weapon Table",
      note: "Generated from the current Naruto 5e item compendium. Open an item link for its full automation and description.",
      headers: ["Weapon", "Category", "Damage", "Range", "Properties", "Cost", "Bulk"],
      rows: weaponRows(items),
      className: "n5eb-primary-table n5eb-weapon-table"
    })].filter(Boolean);
  }
  if ( normalizeKey(node.title) === "adventuring gear" ) {
    return [
      renderGeneratedTable({
        title: "Equipment Packs",
        note: "Pack containers are listed first; individual pack contents remain linked as separate items in the item compendium.",
        headers: ["Pack", "Cost", "Bulk", "Properties"],
        rows: packRows(items),
        className: "n5eb-primary-table n5eb-pack-table"
      }),
      renderGeneratedTable({
        title: "Tools and Kits",
        note: "Tool and kit entries use their current charges, ability, cost, and bulk from the item data.",
        headers: ["Tool or Kit", "Type", "Ability", "Uses", "Cost", "Bulk", "Summary"],
        rows: toolRows(items),
        className: "n5eb-primary-table n5eb-tool-table"
      }),
      renderGeneratedTable({
        title: "Adventuring Gear",
        note: "General utility items from the Naruto 5e mundane gear folder.",
        headers: ["Item", "Type", "Cost", "Bulk", "Properties", "Summary"],
        rows: gearRows(items),
        className: "n5eb-primary-table n5eb-gear-table"
      }),
      renderGeneratedTable({
        title: "Scrolls",
        note: "Scroll cost, save DC, uses, and bulk are pulled from the item compendium.",
        headers: ["Scroll", "Type", "Uses", "Save", "Cost", "Bulk", "Summary"],
        rows: scrollRows(items),
        className: "n5eb-primary-table n5eb-scroll-table"
      }),
      renderGeneratedTable({
        title: "Consumables",
        note: "Potions, poisons, food, and other consumables that are not kit/tool entries.",
        headers: ["Consumable", "Type", "Uses", "Save", "Cost", "Bulk", "Summary"],
        rows: consumableRows(items, ["potion", "poison", "food", "snack", ""]),
        className: "n5eb-primary-table n5eb-consumable-table"
      }),
      renderGeneratedTable({
        title: "Explosives and Traps",
        note: "Explosive and trap entries are grouped separately so combat gear is easier to scan.",
        headers: ["Item", "Type", "Uses", "Save", "Cost", "Bulk", "Summary"],
        rows: consumableRows(items, ["explosive", "trap"]),
        className: "n5eb-primary-table n5eb-trap-table"
      })
    ].filter(Boolean);
  }
  return [];
}

function shouldInlineExtractedTables(book, node) {
  return book.key === "main" && ["weapon properties"].includes(normalizeKey(node.title));
}

function renderExtractedTables(tables, node, { inline=false }={}) {
  if ( !tables.length ) return "";
  const renderedTables = tables.slice(0, 16).map(renderTable).join("\n");
  const omitted = tables.length > 16
    ? `<p class="n5eb-source-note">${tables.length - 16} additional extracted tables were omitted from this page to keep it readable.</p>`
    : "";
  if ( inline ) {
    return [
      `<section class="n5eb-generated-table n5eb-primary-table n5eb-pdf-table">`,
      `<h2>Tables from ${htmlEscape(chapterRangeLabel(node))}</h2>`,
      renderedTables,
      omitted,
      `</section>`
    ].filter(Boolean).join("\n");
  }
  return [
    `<details class="n5eb-table-drawer">`,
    `<summary>Extracted tables from ${htmlEscape(chapterRangeLabel(node))}</summary>`,
    renderedTables,
    omitted,
    `</details>`
  ].filter(Boolean).join("\n");
}

function topicRangeLabel(topic) {
  const [start, end] = topic.range;
  return start === end ? `PDF page ${start}` : `PDF pages ${start}-${end}`;
}

function isWikiNoiseLine(line) {
  if ( !line || line.length < 2 ) return true;
  if ( /^\d+$/.test(line) ) return true;
  if ( /\.{4,}/.test(line) ) return true;
  if ( /^C\s+\d+\s*:\s+/i.test(line) ) return true;
  if ( /^HAPTER\b/i.test(line) ) return true;
  if ( /^CHAPTER\s+\d+\s*:/i.test(line) ) return true;
  if ( /^(contents|table of contents)$/i.test(line) ) return true;
  if ( /^naruto\s+5e$/i.test(line) ) return true;
  return false;
}

function isMinorHeadingLine(line, headingSet=new Set()) {
  if ( line.length > 78 ) return false;
  if ( /[.!?]$/.test(line) ) return false;
  if ( /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line) ) return false;
  if ( /^(and|or|but|with|from|when|while|until)\b/i.test(line) ) return false;
  const normalized = normalizeKey(line);
  if ( headingSet.has(normalized) ) return true;
  if ( !headingSet.size ) {
  if ( /^[A-Z0-9][A-Z0-9 '&:/(),.-]{4,}$/.test(line) && /[A-Z]/.test(line) ) return true;
  const words = line.split(/\s+/);
  if ( words.length <= 6 && words.every(word => /^(and|or|of|the|to|a|an|&|[A-Z][A-Za-z0-9'()/.-]*)$/.test(word)) ) return true;
  }
  return false;
}

function linesToReaderBlocks(lines, headingSet=new Set()) {
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if ( !paragraph.length ) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if ( !list ) return;
    blocks.push(list);
    list = null;
  };

  for ( const rawLine of lines ) {
    let line = cleanText(rawLine)
      .replace(/^([A-Z])\s+([a-z]{1,3})\b/, (match, first, rest) => rest === "he" ? `${first}${rest}` : match);
    if ( isWikiNoiseLine(line) ) continue;

    const kind = lineKind(line);
    if ( kind ) {
      flushParagraph();
      const ordered = kind === "number";
      if ( !list || list.ordered !== ordered ) flushList();
      list ??= { type: "list", ordered, items: [] };
      list.items.push(line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""));
      continue;
    }
    flushList();

    if ( isMinorHeadingLine(line, headingSet) ) {
      flushParagraph();
      blocks.push({ type: "minorHeading", text: line });
      continue;
    }

    if ( paragraph.length && /-$/.test(paragraph[paragraph.length - 1]) ) {
      paragraph[paragraph.length - 1] = paragraph[paragraph.length - 1].slice(0, -1) + line;
      continue;
    }

    if ( paragraph.length && /[.!?]$/.test(paragraph[paragraph.length - 1]) && /^[A-Z0-9]/.test(line) ) {
      flushParagraph();
    }
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderReaderBlocks(blocks) {
  return blocks.map(block => {
    if ( block.type === "minorHeading" ) return `<p class="n5eb-minor-heading">${htmlEscape(block.text)}</p>`;
    if ( block.type === "list" ) {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map(item => `<li>${htmlEscape(item)}</li>`).join("")}</${tag}>`;
    }
    return `<p>${htmlEscape(block.text)}</p>`;
  }).join("\n");
}

function renderTopicBody(book, topic, sourcePages) {
  const sourceLines = sourcePages.flatMap(page => page.lines ?? []);
  const headingSet = new Set((book.outline ?? [])
    .filter(item => item.page >= topic.range[0] && item.page <= topic.range[1])
    .map(item => normalizeKey(item.title)));
  const blocks = linesToReaderBlocks(sourceLines, headingSet);
  const tables = sourcePages.flatMap(page => page.tables ?? []).filter(table => table.length >= 2);
  const tableHtml = tables.length
    ? [
      `<details class="n5eb-table-drawer">`,
      `<summary>Extracted tables from ${htmlEscape(topicRangeLabel(topic))}</summary>`,
      tables.slice(0, 12).map(renderTable).join("\n"),
      tables.length > 12 ? `<p class="n5eb-source-note">${tables.length - 12} additional extracted tables were omitted from this page to keep it readable.</p>` : "",
      `</details>`
    ].join("\n")
    : "";

  return [
    `<section class="n5eb-topic-body">`,
    `<div class="n5eb-source-chip">Source: ${htmlEscape(book.title)}, ${htmlEscape(topicRangeLabel(topic))}</div>`,
    renderReaderBlocks(blocks) || `<p>No extractable text was found for this topic.</p>`,
    tableHtml,
    `</section>`
  ].filter(Boolean).join("\n");
}

function renderMainWikiImages(book) {
  const rendered = new Map();
  const requests = [{ key: "cover", page: 1, name: `${book.key}-cover.webp` }];
  for ( const topic of MAIN_WIKI_TOPICS ) {
    requests.push({ key: topic.key, page: topic.imagePage ?? topic.range[0], name: `${book.key}-${topic.key}.webp` });
  }
  for ( const request of requests ) {
    const output = path.join(ASSET_DIR, request.name);
    renderWebp(book.pdf, request.page, output);
    rendered.set(request.key, `systems/n5eb/assets/content/handbooks/${request.name}`);
  }
  return rendered;
}

function renderTopicSummary(topic) {
  return [
    `<section class="n5eb-topic-brief">`,
    `<div>`,
    `<p class="n5eb-topic-group">${htmlEscape(topic.group)}</p>`,
    `<h2>What This Page Is For</h2>`,
    `<ul>${topic.summary.map(item => `<li>${htmlEscape(item)}</li>`).join("")}</ul>`,
    `</div>`,
    `</section>`
  ].join("\n");
}

function renderTopicNav(entryId, pageIds, index) {
  const previous = MAIN_WIKI_TOPICS[index - 1];
  const next = MAIN_WIKI_TOPICS[index + 1];
  if ( !previous && !next ) return "";
  const link = topic => `@UUID[Compendium.n5eb.handbooks.JournalEntry.${entryId}.JournalEntryPage.${pageIds.get(topic.key)}]{${htmlEscape(topic.name)}}`;
  return [
    `<nav class="n5eb-topic-nav">`,
    previous ? `<span class="n5eb-topic-nav-prev">Previous: ${link(previous)}</span>` : `<span></span>`,
    next ? `<span class="n5eb-topic-nav-next">Next: ${link(next)}</span>` : `<span></span>`,
    `</nav>`
  ].join("\n");
}

function outlineItems(book) {
  return (book.outline ?? [])
    .map((item, order) => ({ ...item, order, title: cleanText(item.title) }))
    .filter(item => Number.isInteger(item.page) && item.page >= 1 && item.page <= book.pageCount)
    .sort((a, b) => a.order - b.order);
}

function directOutlineChildren(outline, node) {
  const children = [];
  for ( const item of outline ) {
    if ( item.order <= node.order ) continue;
    if ( item.depth <= node.depth ) break;
    if ( item.depth === node.depth + 1 ) children.push(item);
  }
  return children;
}

function outlineDescendants(outline, node) {
  const descendants = [];
  for ( const item of outline ) {
    if ( item.order <= node.order ) continue;
    if ( item.depth <= node.depth ) break;
    descendants.push(item);
  }
  return descendants;
}

function isOutlineArtifact(book, item) {
  const title = normalizeKey(item.title);
  if ( /^(actions|attacks|special actions|special reactions|legendary actions)$/.test(title) ) return true;
  if ( book.key === "orochimaru" && /^(puppet swarm|scientific ninja beast)$/.test(title) ) return true;
  if ( book.key === "tsunade" && /^(blood dragon|data angel demon|ku?jaku beast|ku?jaku dragon|doki club)$/.test(title) ) return true;
  return false;
}

function isFrontMatter(item) {
  return /^(credits|table of contents)$/i.test(cleanText(item.title));
}

function extraTopLevelRoot(book, item) {
  const title = normalizeKey(item.title);
  if ( book.key === "orochimaru" ) return /^(class feats|legacy content)$/.test(title);
  if ( book.key === "tsunade" ) return /^(bloodline latents|legacy content)$/.test(title);
  return false;
}

function rootOutlineItems(book, outline) {
  if ( !outline.length ) {
    return [{ title: book.title, page: 1, depth: 0, order: 0 }];
  }

  if ( ["main", "jiraiya"].includes(book.key) ) {
    return outline.filter(item => item.depth === 0 && !isOutlineArtifact(book, item));
  }

  const toc = outline.find(item => item.depth === 0 && /^table of contents$/i.test(item.title));
  const roots = [];
  const credits = outline.find(item => item.depth === 0 && /^credits$/i.test(item.title));
  if ( credits ) roots.push(credits);
  if ( toc ) roots.push(toc);

  const tocChildren = toc ? directOutlineChildren(outline, toc).filter(item => !isOutlineArtifact(book, item)) : [];
  if ( tocChildren.length >= 5 ) {
    roots.push(...tocChildren);
    roots.push(...outline.filter(item => item.depth === 0 && extraTopLevelRoot(book, item) && !roots.includes(item)));
  } else {
    roots.push(...outline.filter(item => item.depth === 0 && !isOutlineArtifact(book, item) && !roots.includes(item)));
  }

  const seen = new Set();
  return roots
    .filter(item => {
      const key = `${normalizeKey(item.title)}:${item.page}:${item.depth}`;
      if ( seen.has(key) ) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

function shouldCreateChildPages(book, root, children) {
  if ( children.length < 2 ) return false;
  if ( isFrontMatter(root) ) return false;
  if ( normalizeKey(root.title) === "what s different" ) return false;
  if ( book.key === "main" && root.depth === 0 ) return true;
  if ( book.key === "jiraiya" && root.depth === 0 ) return true;
  return false;
}

function rangeEndFor(item, siblings, index, fallbackEnd) {
  const next = siblings[index + 1];
  if ( !next ) return Math.max(item.page, fallbackEnd);
  return Math.max(item.page, Math.min(fallbackEnd, next.page > item.page ? next.page - 1 : item.page));
}

function chapterKey(item, parentKey="") {
  return `${parentKey}${parentKey ? "/" : ""}${slugify(item.title)}-${item.page}-${item.order}`;
}

function displayTitleForNode(book, item, parent=null) {
  const title = cleanText(item.title);
  if ( book.key === "jiraiya" && parent && /^[EDCBAS]-Rank:?$/i.test(title) ) {
    return `${cleanText(parent.title)}: ${title.replace(/:$/, "")}`;
  }
  return title;
}

function buildChapterStructure(book) {
  const outline = outlineItems(book);
  const roots = rootOutlineItems(book, outline);
  const nodes = [];

  for ( const [rootIndex, root] of roots.entries() ) {
    const rootEnd = rangeEndFor(root, roots, rootIndex, book.pageCount);
    const children = directOutlineChildren(outline, root)
      .filter(item => !isOutlineArtifact(book, item) && item.page >= root.page && item.page <= rootEnd);
    const rootKey = chapterKey(root);
    const hasChildPages = shouldCreateChildPages(book, root, children);

    nodes.push({
      key: rootKey,
      title: displayTitleForNode(book, root),
      sourceTitle: root.title,
      start: root.page,
      end: rootEnd,
      level: 1,
      outline: root,
      parentKey: null,
      mode: hasChildPages ? "landing" : "content"
    });

    if ( !hasChildPages ) continue;
    for ( const [childIndex, child] of children.entries() ) {
      nodes.push({
        key: chapterKey(child, rootKey),
        title: displayTitleForNode(book, child, root),
        sourceTitle: child.title,
        start: child.page,
        end: rangeEndFor(child, children, childIndex, rootEnd),
        level: 2,
        outline: child,
        parentKey: rootKey,
        mode: "content"
      });
    }
  }

  return { outline, nodes };
}

function renderBookImagesForNodes(book, nodes) {
  const rendered = new Map();
  const requests = [{ key: "cover", page: 1, name: `${book.key}-cover.webp` }];
  for ( const node of nodes ) {
    if ( node.level !== 1 ) continue;
    requests.push({
      key: node.key,
      page: node.start,
      name: `${book.key}-${slugify(node.title)}-${node.start}.webp`
    });
  }
  for ( const request of requests ) {
    const output = path.join(ASSET_DIR, request.name);
    renderWebp(book.pdf, request.page, output);
    rendered.set(request.key, `systems/n5eb/assets/content/handbooks/${request.name}`);
  }
  return rendered;
}

function imageForNode(images, node) {
  if ( images.has(node.key) ) return images.get(node.key);
  if ( node.parentKey && images.has(node.parentKey) ) return images.get(node.parentKey);
  return images.get("cover");
}

function renderChapterToc(entryId, pageIds, nodes, { heading="Contents" }={}) {
  const byParent = new Map();
  const nodeKeys = new Set(nodes.map(node => node.key));
  for ( const node of nodes ) {
    if ( !node.parentKey || !nodeKeys.has(node.parentKey) ) continue;
    const list = byParent.get(node.parentKey) ?? [];
    list.push(node);
    byParent.set(node.parentKey, list);
  }
  const rootNodes = nodes.filter(node => !node.parentKey || !nodeKeys.has(node.parentKey));
  const link = node => `@UUID[Compendium.n5eb.handbooks.JournalEntry.${entryId}.JournalEntryPage.${pageIds.get(node.key)}]{${htmlEscape(node.title)}}`;
  const rows = rootNodes.map(root => {
    const children = byParent.get(root.key) ?? [];
    return [
      `<li>${link(root)}`,
      children.length ? `<ol>${children.map(child => `<li>${link(child)}</li>`).join("")}</ol>` : "",
      `</li>`
    ].join("");
  }).join("\n");
  return `<section class="n5eb-handbook-toc n5eb-chapter-contents"><h2>${htmlEscape(heading)}</h2><ol>${rows}</ol></section>`;
}

function chapterRangeLabel(node) {
  return node.start === node.end ? `PDF page ${node.start}` : `PDF pages ${node.start}-${node.end}`;
}

function headingCandidatesForNode(outline, node) {
  const descendants = outlineDescendants(outline, node.outline)
    .filter(item => item.page >= node.start && item.page <= node.end && !isOutlineArtifact({ key: "" }, item));
  const map = new Map();
  for ( const item of descendants ) {
    const level = Math.max(2, Math.min(4, item.depth - node.outline.depth + 1));
    const keys = new Set([
      normalizeKey(item.title),
      normalizeKey(item.title.replace(/:$/, "")),
      normalizeKey(item.title.replace(/\s+\[[^\]]+\]$/, ""))
    ]);
    for ( const key of keys ) {
      if ( key && !map.has(key) ) map.set(key, { text: item.title, level });
    }
  }
  return map;
}

function linesToChapterBlocks(lines, headingMap=new Map(), pageTitle="", sourceTitle="") {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const emittedHeadings = new Set();
  const titleKeys = new Set([normalizeKey(pageTitle), normalizeKey(sourceTitle)].filter(Boolean));

  const flushParagraph = () => {
    if ( !paragraph.length ) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if ( !list ) return;
    blocks.push(list);
    list = null;
  };
  const headingForLine = line => {
    const keys = [
      normalizeKey(line),
      normalizeKey(line.replace(/:$/, "")),
      normalizeKey(line.replace(/\s+\[[^\]]+\]$/, ""))
    ];
    for ( const key of keys ) {
      if ( titleKeys.has(key) ) return null;
      const match = headingMap.get(key);
      if ( match ) return { ...match, key };
    }
    return null;
  };

  for ( const rawLine of lines ) {
    const line = cleanText(rawLine);
    if ( isWikiNoiseLine(line) ) continue;

    const heading = headingForLine(line);
    if ( heading && !emittedHeadings.has(heading.key) ) {
      flushParagraph();
      flushList();
      emittedHeadings.add(heading.key);
      blocks.push({ type: "heading", level: heading.level, text: heading.text });
      continue;
    }

    const kind = lineKind(line);
    if ( kind ) {
      flushParagraph();
      const ordered = kind === "number";
      if ( !list || list.ordered !== ordered ) flushList();
      list ??= { type: "list", ordered, items: [] };
      list.items.push(line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""));
      continue;
    }
    flushList();

    if ( paragraph.length && /-$/.test(paragraph[paragraph.length - 1]) ) {
      paragraph[paragraph.length - 1] = paragraph[paragraph.length - 1].slice(0, -1) + line;
      continue;
    }
    if ( paragraph.length && /[.!?]$/.test(paragraph[paragraph.length - 1]) && /^[A-Z0-9]/.test(line) ) {
      flushParagraph();
    }
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderChapterBody(book, node, outline, sourceIndex, sourcePages, generatedTables=[]) {
  const sourceLines = sourcePages.flatMap(page => page.lines ?? []);
  const headingMap = headingCandidatesForNode(outline, node);
  const blocks = linesToChapterBlocks(sourceLines, headingMap, node.title, node.sourceTitle);
  const tables = sourcePages.flatMap(page => page.tables ?? []).filter(table => table.length >= 2);
  const tableHtml = renderExtractedTables(tables, node, { inline: shouldInlineExtractedTables(book, node) });
  return [
    `<section class="n5eb-topic-body n5eb-chapter-body">`,
    `<div class="n5eb-source-chip">Source: ${htmlEscape(book.title)}, ${htmlEscape(chapterRangeLabel(node))}</div>`,
    generatedTables.join("\n"),
    renderBlocks(blocks, sourceIndex) || `<p>No extractable text was found for this section.</p>`,
    tableHtml,
    `</section>`
  ].filter(Boolean).join("\n");
}

function renderNodeNav(entryId, pageIds, nodes, index) {
  const previous = nodes[index - 1];
  const next = nodes[index + 1];
  if ( !previous && !next ) return "";
  const link = node => `@UUID[Compendium.n5eb.handbooks.JournalEntry.${entryId}.JournalEntryPage.${pageIds.get(node.key)}]{${htmlEscape(node.title)}}`;
  return [
    `<nav class="n5eb-topic-nav">`,
    previous ? `<span class="n5eb-topic-nav-prev">Previous: ${link(previous)}</span>` : `<span></span>`,
    next ? `<span class="n5eb-topic-nav-next">Next: ${link(next)}</span>` : `<span></span>`,
    `</nav>`
  ].join("\n");
}

function createChapteredBookJournal(book, sourceIndex, itemData) {
  const entryId = idFrom(`handbook:${book.key}`);
  const { outline, nodes } = buildChapterStructure(book);
  const images = renderBookImagesForNodes(book, nodes);
  const pages = [];
  const pageIds = new Map(nodes.map(node => [node.key, idFrom(`${entryId}:chapter:${node.key}`)]));

  const coverHtml = pageShell(book, book.title, [
    `<section class="n5eb-handbook-summary n5eb-reader-summary">`,
    `<p>${htmlEscape(book.subtitle)}</p>`,
    `<p class="n5eb-source-note">Organized from the PDF bookmark tree. Chapter pages use the same chapter structure as the source book, with nested section pages where the outline supports them.</p>`,
    `</section>`,
    renderChapterToc(entryId, pageIds, nodes)
  ].join("\n"), {
    image: images.get("cover"),
    subtitle: book.subtitle,
    classes: "n5eb-handbook-cover n5eb-handbook-wiki"
  });

  pages.push(createJournalPage({
    entryId,
    book,
    name: "Book Overview",
    sort: 0,
    seed: "chapter-overview",
    html: coverHtml,
    level: 1
  }));

  for ( const [index, node] of nodes.entries() ) {
    const childNodes = nodes.filter(candidate => candidate.parentKey === node.key);
    const sourcePages = book.pages.filter(page => page.page >= node.start && page.page <= node.end);
    const descendants = outlineDescendants(outline, node.outline)
      .filter(item => item.page >= node.start && item.page <= node.end)
      .slice(0, 80);
    const related = relatedForText(sourceIndex, [node.title, ...descendants.map(item => item.title)], {
      limit: node.level === 1 ? 10 : MAIN_RELATED_LIMIT,
      uniqueNames: true,
      preferredPacks: PLAYER_LINK_PACKS
    });
    const generatedTables = generatedTablesForNode(book, node, itemData);
    const childContents = childNodes.length ? renderChapterToc(entryId, pageIds, childNodes, { heading: "Chapter Contents" }) : "";
    const content = node.mode === "landing"
      ? [
        `<section class="n5eb-topic-brief n5eb-chapter-landing">`,
        `<div class="n5eb-source-chip">Source: ${htmlEscape(book.title)}, ${htmlEscape(chapterRangeLabel(node))}</div>`,
        `</section>`,
        childContents
      ].join("\n")
      : [
        childContents,
        renderRelated(related, { title: "Open in Foundry" }),
        renderChapterBody(book, node, outline, sourceIndex, sourcePages, generatedTables)
      ].join("\n");

    const html = pageShell(book, node.title, [
      content,
      renderNodeNav(entryId, pageIds, nodes, index)
    ].join("\n"), {
      image: imageForNode(images, node),
      subtitle: chapterRangeLabel(node),
      eyebrow: node.level === 1 ? book.shortTitle : "Section",
      classes: "n5eb-handbook-wiki n5eb-handbook-wiki-page"
    });

    pages.push(createJournalPage({
      entryId,
      book,
      name: node.title,
      sort: (index + 1) * 100000,
      seed: `chapter:${node.key}`,
      html,
      level: node.level
    }));
  }

  return {
    name: book.title,
    pages,
    folder: null,
    sort: ordinalBookSort(book.key),
    ownership: { default: 0 },
    flags: {
      n5eb: {
        type: "chapter",
        title: book.title,
        sourceBook: book.sourceBook,
        sourcePdf: path.basename(book.pdf),
        handbook: true,
        chapteredWiki: true,
        position: ordinalBookSort(book.key) / 100000
      }
    },
    _stats: baseStats(),
    _id: entryId,
    _key: `!journal!${entryId}`
  };
}

function createMainHandbookJournal(book, sourceIndex) {
  const entryId = idFrom(`handbook:${book.key}`);
  const images = renderMainWikiImages(book);
  const pages = [];
  const pageIds = new Map(MAIN_WIKI_TOPICS.map(topic => [topic.key, idFrom(`${entryId}:wiki:${topic.key}`)]));

  const grouped = new Map();
  for ( const topic of MAIN_WIKI_TOPICS ) {
    const list = grouped.get(topic.group) ?? [];
    list.push(topic);
    grouped.set(topic.group, list);
  }
  const groupedToc = [...grouped.entries()].map(([group, topics]) => [
    `<section class="n5eb-library-group">`,
    `<h2>${htmlEscape(group)}</h2>`,
    `<ol>${topics.map(topic => `<li>@UUID[Compendium.n5eb.handbooks.JournalEntry.${entryId}.JournalEntryPage.${pageIds.get(topic.key)}]{${htmlEscape(topic.name)}}</li>`).join("")}</ol>`,
    `</section>`
  ].join("\n")).join("\n");

  const coverHtml = pageShell(book, book.title, [
    `<section class="n5eb-handbook-summary n5eb-reader-summary">`,
    `<p>${htmlEscape(book.subtitle)}</p>`,
    `<p>This version is organized as a playable wiki. It uses the PDF for source text and page attribution, but the navigation is based on actual table use instead of PDF chunks.</p>`,
    `</section>`,
    `<section class="n5eb-library-index">`,
    groupedToc,
    `</section>`
  ].join("\n"), {
    image: images.get("cover"),
    subtitle: "Readable player wiki for the core Naruto 5e rulebook.",
    classes: "n5eb-handbook-cover n5eb-handbook-wiki"
  });

  pages.push(createJournalPage({
    entryId,
    book,
    name: "Book Overview",
    sort: 0,
    seed: "wiki-overview",
    html: coverHtml
  }));

  for ( const [index, topic] of MAIN_WIKI_TOPICS.entries() ) {
    const [start, end] = topic.range;
    const sourcePages = book.pages.filter(page => page.page >= start && page.page <= end);
    const related = relatedForText(sourceIndex, [topic.name, ...topic.links], {
      limit: MAIN_RELATED_LIMIT,
      uniqueNames: true,
      preferredPacks: PLAYER_LINK_PACKS
    });
    const html = pageShell(book, topic.name, [
      renderTopicSummary(topic),
      renderRelated(related, { title: "Open in Foundry" }),
      renderTopicBody(book, topic, sourcePages),
      renderTopicNav(entryId, pageIds, index)
    ].join("\n"), {
      image: images.get(topic.key) ?? images.get("cover"),
      subtitle: topic.subtitle,
      eyebrow: topic.group,
      classes: "n5eb-handbook-wiki n5eb-handbook-wiki-page"
    });

    pages.push(createJournalPage({
      entryId,
      book,
      name: topic.name,
      sort: (index + 1) * 100000,
      seed: `wiki:${topic.key}`,
      html
    }));
  }

  return {
    name: book.title,
    pages,
    folder: null,
    sort: ordinalBookSort(book.key),
    ownership: { default: 0 },
    flags: {
      n5eb: {
        type: "chapter",
        title: book.title,
        sourceBook: book.sourceBook,
        sourcePdf: path.basename(book.pdf),
        handbook: true,
        curatedWiki: true,
        position: ordinalBookSort(book.key) / 100000
      }
    },
    _stats: baseStats(),
    _id: entryId,
    _key: `!journal!${entryId}`
  };
}

function createJournalPage({ entryId, book, name, html, sort, seed, hidden=false, level=1 }) {
  const pageId = idFrom(`${entryId}:${seed}`);
  return {
    name,
    type: "text",
    _id: pageId,
    title: { show: true, level },
    image: {},
    text: { format: 1, content: html, markdown: "" },
    video: { controls: true, volume: 0.5 },
    src: null,
    system: {},
    sort,
    ownership: { default: -1 },
    flags: {
      n5eb: {
        sourceBook: book.sourceBook,
        pdf: path.basename(book.pdf),
        ...(hidden ? { tocHidden: true } : {})
      }
    },
    _stats: baseStats(),
    _key: `!journal.pages!${entryId}.${pageId}`
  };
}

function pageShell(book, title, body, { image, subtitle, eyebrow, classes="" }={}) {
  const img = image ? `<figure class="n5eb-handbook-hero-media"><img src="${htmlEscape(image)}" alt="${htmlEscape(title)}" /></figure>` : "";
  return [
    `<article class="n5eb-handbook n5eb-handbook-${htmlEscape(book.accent)} ${classes}">`,
    `<header class="n5eb-handbook-hero">`,
    `<div class="n5eb-handbook-hero-copy">`,
    `<p class="n5eb-handbook-eyebrow">${htmlEscape(eyebrow ?? book.shortTitle)}</p>`,
    `<h1>${htmlEscape(title)}</h1>`,
    subtitle ? `<p class="n5eb-handbook-subtitle">${htmlEscape(subtitle)}</p>` : "",
    `</div>`,
    img,
    `</header>`,
    body,
    `</article>`
  ].filter(Boolean).join("\n");
}

function createLibraryHeader() {
  const book = {
    key: "header",
    title: "Naruto 5e Library",
    shortTitle: "Player Wiki",
    subtitle: "Start here for readable Naruto 5e rules, tables, chapters, and linked game references.",
    sourceBook: "Naruto 5e",
    accent: "crimson",
    pdf: ""
  };
  const entryId = idFrom("handbook:library-header");
  const html = pageShell(book, "Naruto 5e Library", [
    `<section class="n5eb-handbook-callouts">`,
    `<div><h2>Read the Books</h2><p>Use this library for player-facing handbook reading, chapter navigation, and linked references.</p></div>`,
    `<div><h2>Use Foundry Links</h2><p>Related entries connect book sections to jutsu, clans, classes, feats, items, and conditions.</p></div>`,
    `<div><h2>Stable System Links</h2><p>Legacy rule UUIDs remain registered for compatibility, while this Library is the player-facing rules source.</p></div>`,
    `</section>`
  ].join("\n"), { classes: "n5eb-handbook-cover" });
  return {
    name: "Library Guide",
    pages: [createJournalPage({ entryId, book, name: "Overview", sort: 0, seed: "overview", html })],
    folder: null,
    sort: ordinalBookSort("header"),
    ownership: { default: 0 },
    flags: { n5eb: { type: "header", title: "Naruto 5e Library" } },
    _stats: baseStats(),
    _id: entryId,
    _key: `!journal!${entryId}`
  };
}

function createBookJournal(book, sourceIndex, itemData) {
  return createChapteredBookJournal(book, sourceIndex, itemData);

  const entryId = idFrom(`handbook:${book.key}`);
  const ranges = usableOutline(book);
  const chunks = chunkRanges(ranges);
  const images = renderBookImages(book, chunks);
  const pages = [];

  const tocRows = chunks.map((chunk, index) => {
    const pageId = idFrom(`${entryId}:section:${index}:${chunk.title}:${chunk.start}-${chunk.end}`);
    const label = chunk.totalParts > 1
      ? `${htmlEscape(chunk.title)} (${chunk.start}-${chunk.end})`
      : htmlEscape(chunk.title);
    const uuid = `Compendium.n5eb.handbooks.JournalEntry.${entryId}.JournalEntryPage.${pageId}`;
    return `<li>@UUID[${uuid}]{${label}}</li>`;
  }).join("\n");

  const coverHtml = pageShell(book, book.title, [
    `<section class="n5eb-handbook-summary">`,
    `<p>${htmlEscape(book.subtitle)}</p>`,
    `<p class="n5eb-source-note">Generated from <em>${htmlEscape(path.basename(book.pdf))}</em>. The text is cleaned for reading, while page labels preserve PDF lookup.</p>`,
    `</section>`,
    `<section class="n5eb-handbook-toc"><h2>Contents</h2><ol>${tocRows}</ol></section>`
  ].join("\n"), {
    image: images.get("cover"),
    subtitle: book.subtitle,
    classes: "n5eb-handbook-cover"
  });
  pages.push(createJournalPage({ entryId, book, name: "Book Overview", sort: 0, seed: "contents", html: coverHtml }));

  for ( const [index, chunk] of chunks.entries() ) {
    const pageName = chunk.totalParts > 1 ? `${chunk.title} (${chunk.part})` : chunk.title;
    const sourcePages = book.pages.filter(page => page.page >= chunk.start && page.page <= chunk.end);
    const blocks = [];
    const relatedSeeds = [chunk.title];
    const pageSections = sourcePages.map(page => {
      const pageBlocks = linesToBlocks(page.lines ?? []);
      for ( const block of pageBlocks ) if ( block.type === "heading" ) relatedSeeds.push(block.text);
      const textHtml = renderBlocks(pageBlocks, sourceIndex);
      const tables = (page.tables ?? []).slice(0, 4).map(renderTable).join("\n");
      if ( !textHtml && !tables ) return "";
      blocks.push(...pageBlocks);
      return [
        `<section class="n5eb-handbook-source-page" id="pdf-page-${page.page}">`,
        `<div class="n5eb-page-label">PDF Page ${page.page}</div>`,
        textHtml,
        tables ? `<section class="n5eb-extracted-tables"><h3>Tables on this page</h3>${tables}</section>` : "",
        `</section>`
      ].join("\n");
    }).filter(Boolean).join("\n");

    const related = relatedForText(sourceIndex, relatedSeeds);
    const image = images.get(`section:${chunk.title}:${chunk.start}`) ?? images.get("cover");
    const html = pageShell(book, pageName, [
      renderRelated(related),
      pageSections || `<section class="n5eb-handbook-source-page"><p>No extractable text was found in this page range.</p></section>`
    ].join("\n"), {
      image,
      subtitle: `${book.title}, PDF pages ${chunk.start}-${chunk.end}.`,
      eyebrow: book.shortTitle
    });

    pages.push(createJournalPage({
      entryId,
      book,
      name: pageName,
      sort: (index + 1) * 100000,
      seed: `section:${index}:${chunk.title}:${chunk.start}-${chunk.end}`,
      html
    }));
  }

  return {
    name: book.title,
    pages,
    folder: null,
    sort: ordinalBookSort(book.key),
    ownership: { default: 0 },
    flags: {
      n5eb: {
        type: "chapter",
        title: book.title,
        sourceBook: book.sourceBook,
        sourcePdf: path.basename(book.pdf),
        handbook: true,
        position: ordinalBookSort(book.key) / 100000
      }
    },
    _stats: baseStats(),
    _id: entryId,
    _key: `!journal!${entryId}`
  };
}

function createChangelogJournal(sourceIndex) {
  const book = CHANGELOG_BOOK;
  const entryId = idFrom("handbook:changelog");
  const coverImage = renderChangelogImage(book);
  const pages = [];

  const overviewToc = CHANGELOG_SECTIONS.map((section, index) => {
    const pageId = idFrom(`${entryId}:changelog:${section.name}`);
    return `<li>@UUID[Compendium.n5eb.handbooks.JournalEntry.${entryId}.JournalEntryPage.${pageId}]{${htmlEscape(section.name)}}</li>`;
  }).join("\n");

  pages.push(createJournalPage({
    entryId,
    book,
    name: "Changelog Overview",
    sort: 0,
    seed: "overview",
    html: pageShell(book, book.title, [
      `<section class="n5eb-handbook-summary"><p>${htmlEscape(book.subtitle)}</p></section>`,
      `<section class="n5eb-handbook-toc"><h2>Contents</h2><ol>${overviewToc}</ol></section>`
    ].join("\n"), { image: coverImage, subtitle: book.subtitle, classes: "n5eb-handbook-cover" })
  }));

  for ( const [index, section] of CHANGELOG_SECTIONS.entries() ) {
    const related = relatedForText(sourceIndex, [section.name, ...section.groups.map(group => group.name)]);
    const groups = section.groups.map(group => [
      `<section class="n5eb-change-group">`,
      `<h2>${htmlEscape(group.name)}</h2>`,
      `<ul>${group.bullets.map(bullet => `<li>${htmlEscape(bullet)}</li>`).join("\n")}</ul>`,
      `</section>`
    ].join("\n")).join("\n");
    pages.push(createJournalPage({
      entryId,
      book,
      name: section.name,
      sort: (index + 1) * 100000,
      seed: `changelog:${section.name}`,
      html: pageShell(book, section.name, [renderRelated(related), groups].join("\n"), {
        image: coverImage,
        subtitle: "3.02 to 3.10 changes grouped by source book.",
        eyebrow: book.shortTitle
      })
    }));
  }

  return {
    name: book.title,
    pages,
    folder: null,
    sort: ordinalBookSort("changelog"),
    ownership: { default: 0 },
    flags: {
      n5eb: {
        type: "chapter",
        title: book.title,
        sourceBook: book.sourceBook,
        sourcePdf: path.basename(book.pdf),
        handbook: true,
        position: ordinalBookSort("changelog") / 100000
      }
    },
    _stats: baseStats(),
    _id: entryId,
    _key: `!journal!${entryId}`
  };
}

function renderChangelogImage(book) {
  const output = path.join(ASSET_DIR, "changelog-cover.webp");
  renderWebp(book.pdf, 1, output);
  return "systems/n5eb/assets/content/handbooks/changelog-cover.webp";
}

function createRulesHeader() {
  const entryId = idFrom("rules:quick-reference-header");
  const book = {
    sourceBook: "Naruto 5e",
    pdf: "",
    accent: "jade",
    shortTitle: "Compatibility"
  };
  const html = pageShell({
    ...book,
    title: "Rules Compatibility Index",
    subtitle: "Compact linked rule pages kept so existing system UUIDs, enrichers, and tooltips continue to resolve."
  }, "Rules Compatibility Index", [
    `<section class="n5eb-handbook-summary">`,
    `<p>This compendium is retained for compatibility with existing tooltips, enrichers, and mechanical UUID references.</p>`,
    `<p>For normal reading and player-facing tables, use the Naruto 5e Library. For fast visual tables, use Cheat Sheets.</p>`,
    `</section>`
  ].join("\n"), { classes: "n5eb-handbook-cover" });

  return {
    name: "Rules Compatibility Guide",
    pages: [createJournalPage({ entryId, book, name: "Overview", sort: 0, seed: "overview", html })],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {
      n5eb: {
        type: "header",
        title: "Rules Compatibility Index"
      }
    },
    _stats: baseStats(),
    _id: entryId,
    _key: `!journal!${entryId}`
  };
}

function writeJournal(journal, dir, fileName) {
  const yaml = YAML.dump(journal, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: "'"
  });
  fs.writeFileSync(path.join(dir, fileName), `${yaml}\n`, "utf8");
}

function clearGeneratedHandbooks() {
  fs.mkdirSync(PACK_SRC, { recursive: true });
  for ( const file of fs.readdirSync(PACK_SRC) ) {
    if ( file.endsWith(".yml") || file.endsWith(".yaml") ) fs.rmSync(path.join(PACK_SRC, file), { force: true });
  }
}

function ensureRulesHeader() {
  fs.mkdirSync(RULES_SRC, { recursive: true });
  writeJournal(createRulesHeader(), RULES_SRC, "rules-quick-reference-guide.yml");
}

function main() {
  fs.mkdirSync(PACK_SRC, { recursive: true });
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });

  const sourceIndex = loadSourceIndex();
  const itemData = loadHandbookItemData();
  const books = extractBooks();
  fs.writeFileSync(
    path.join(TMP_ROOT, "pdf-corpus-summary.json"),
    JSON.stringify(books.map(({ pages, ...book }) => ({
      ...book,
      outline: book.outline.slice(0, 300),
      extractedLines: pages.reduce((total, page) => total + (page.lines?.length ?? 0), 0),
      extractedTables: pages.reduce((total, page) => total + (page.tables?.length ?? 0), 0)
    })), null, 2),
    "utf8"
  );

  clearGeneratedHandbooks();

  const generated = [];
  const header = createLibraryHeader();
  writeJournal(header, PACK_SRC, "library-guide.yml");
  generated.push({ name: header.name, id: header._id, pages: header.pages.length });

  for ( const book of books ) {
    const journal = createBookJournal(book, sourceIndex, itemData);
    writeJournal(journal, PACK_SRC, `${slugify(journal.name)}.yml`);
    generated.push({ name: journal.name, id: journal._id, pages: journal.pages.length });
  }
  const changelog = createChangelogJournal(sourceIndex);
  writeJournal(changelog, PACK_SRC, `${slugify(changelog.name)}.yml`);
  generated.push({ name: changelog.name, id: changelog._id, pages: changelog.pages.length });

  ensureRulesHeader();

  fs.writeFileSync(path.join(TMP_ROOT, "handbook-generation-summary.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    pack: "handbooks",
    assets: path.relative(SYSTEM_ROOT, ASSET_DIR),
    generated
  }, null, 2), "utf8");

  console.log(JSON.stringify({ packSource: PACK_SRC, assets: ASSET_DIR, generated }, null, 2));
}

main();

import BackgroundData from "./background.mjs";
import ClassModData from "./classmod.mjs";
import ClassData from "./class.mjs";
import ConsumableData from "./consumable.mjs";
import ContainerData from "./container.mjs";
import DowntimeData from "./downtime.mjs";
import EquipmentData from "./equipment.mjs";
import FacilityData from "./facility.mjs";
import FeatData from "./feat.mjs";
import LootData from "./loot.mjs";
import RaceData from "./race.mjs";
import SpellData from "./spell.mjs";
import SubclassData from "./subclass.mjs";
import ToolData from "./tool.mjs";
import WeaponData from "./weapon.mjs";

export {
  BackgroundData,
  ClassModData,
  ClassData,
  ConsumableData,
  ContainerData,
  DowntimeData,
  EquipmentData,
  FacilityData,
  FeatData,
  LootData,
  RaceData,
  SpellData,
  SubclassData,
  ToolData,
  WeaponData
};
export {default as ItemTypeField} from "./fields/item-type-field.mjs";
export {default as SpellcastingField} from "./fields/spellcasting-field.mjs";
export {default as ActivitiesTemplate} from "./templates/activities.mjs";
export {default as AdvancementTemplate} from "./templates/advancement.mjs";
export {default as EquippableItemTemplate} from "./templates/equippable-item.mjs";
export {default as IdentifiableTemplate} from "./templates/identifiable.mjs";
export {default as ItemDescriptionTemplate} from "./templates/item-description.mjs";
export {default as ItemTypeTemplate} from "./templates/item-type.mjs";
export {default as MountableTemplate} from "./templates/mountable.mjs";
export {default as PhysicalItemTemplate} from "./templates/physical-item.mjs";
export * as startingEquipment from "./templates/starting-equipment.mjs";

export const config = {
  background: BackgroundData,
  classmod: ClassModData,
  container: ContainerData,
  class: ClassData,
  consumable: ConsumableData,
  downtime: DowntimeData,
  equipment: EquipmentData,
  facility: FacilityData,
  feat: FeatData,
  loot: LootData,
  race: RaceData,
  spell: SpellData,
  subclass: SubclassData,
  tool: ToolData,
  weapon: WeaponData
};

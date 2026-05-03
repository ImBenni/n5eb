import {default as DifficultTerrainRegionBehaviorType} from "./difficult-terrain.mjs";
import {default as RotateAreaRegionBehaviorType} from "./rotate-area.mjs";

export {
  DifficultTerrainRegionBehaviorType,
  RotateAreaRegionBehaviorType
};

export const config = {
  "n5eb.difficultTerrain": DifficultTerrainRegionBehaviorType,
  "n5eb.rotateArea": RotateAreaRegionBehaviorType
};

export const icons = {
  "n5eb.difficultTerrain": "fa-solid fa-hill-rockslide",
  "n5eb.rotateArea": "fa-solid fa-arrows-spin"
};

import assert from "node:assert/strict";

import { calculateChakraUpdates } from "../module/documents/chakra-application.mjs";

const hpKey = key => key.startsWith("system.attributes.hp.");

{
  const updates = calculateChakraUpdates({ value: 20, temp: 3, effectiveMax: 20 }, 7, "damage");
  assert.deepEqual(updates, {
    "system.attributes.chakra.temp": 0,
    "system.attributes.chakra.value": 16
  });
  assert(!Object.keys(updates).some(hpKey));
}

{
  const updates = calculateChakraUpdates({ value: 8, temp: 2, effectiveMax: 20 }, 50, "damage");
  assert.deepEqual(updates, {
    "system.attributes.chakra.temp": 0,
    "system.attributes.chakra.value": 0
  });
  assert(!Object.keys(updates).some(hpKey));
}

{
  const updates = calculateChakraUpdates({ value: 10, temp: 0, effectiveMax: 20 }, 6, "healing");
  assert.deepEqual(updates, { "system.attributes.chakra.value": 16 });
  assert(!Object.keys(updates).some(hpKey));
}

{
  const updates = calculateChakraUpdates({ value: 14, temp: 0, max: 20, tempmax: -5 }, 6, "healing");
  assert.deepEqual(updates, { "system.attributes.chakra.value": 15 });
  assert(!Object.keys(updates).some(hpKey));
}

{
  const updates = calculateChakraUpdates({ value: 12, temp: 2, effectiveMax: 20 }, 5, "temp");
  assert.deepEqual(updates, { "system.attributes.chakra.temp": 5 });
  assert(!Object.keys(updates).some(hpKey));
}

{
  const updates = calculateChakraUpdates({ value: 12, temp: 5, effectiveMax: 20 }, 3, "temp");
  assert.deepEqual(updates, {});
}

console.log("chat chakra application tests passed");

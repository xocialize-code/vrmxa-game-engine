// @vrmxg/interact — M1 W3 (AB-T-0515). Focus, prompts, verbs with the character's slots, seats, and the inventory.
import { InteractService } from './service.js';
import { InventoryService } from './inventory.js';

export { InteractService } from './service.js';
export { InventoryService } from './inventory.js';

/**
 * Give a SceneTree interaction: adds the "inventory" and "interact" services. Install after input (the interact
 * action is read from it) and items.
 * @param {any} tree @param {ConstructorParameters<typeof InteractService>[1]} [opts]
 */
export function installInteraction(tree, opts) {
  const inventory = tree.addService('inventory', new InventoryService());
  const interact = tree.addService('interact', new InteractService(tree, opts));
  return { interact, inventory };
}

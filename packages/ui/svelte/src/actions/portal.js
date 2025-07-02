/**
 * Svelte action for rendering elements in a portal
 */

export function portal(node, target = 'body') {
  let targetEl;
  
  function update(newTarget) {
    // Find target element
    if (typeof newTarget === 'string') {
      targetEl = document.querySelector(newTarget);
    } else if (newTarget instanceof HTMLElement) {
      targetEl = newTarget;
    } else {
      targetEl = document.body;
    }
    
    // Move node to target
    if (targetEl && targetEl !== node.parentElement) {
      targetEl.appendChild(node);
    }
  }
  
  update(target);
  
  return {
    update(newTarget) {
      if (newTarget !== target) {
        target = newTarget;
        update(target);
      }
    },
    destroy() {
      if (node.parentElement) {
        node.parentElement.removeChild(node);
      }
    }
  };
}
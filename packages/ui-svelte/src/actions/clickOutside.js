/**
 * Svelte action for detecting clicks outside an element
 */

export function clickOutside(node, { enabled = true, callback } = {}) {
  function handleClick(event) {
    if (!enabled) return;
    
    if (node && !node.contains(event.target) && !event.defaultPrevented) {
      if (callback && typeof callback === 'function') {
        callback(event);
      }
      node.dispatchEvent(new CustomEvent('clickoutside', { detail: event }));
    }
  }

  if (enabled) {
    document.addEventListener('click', handleClick, true);
  }

  return {
    update({ enabled: newEnabled = true, callback: newCallback } = {}) {
      if (!newEnabled && enabled) {
        document.removeEventListener('click', handleClick, true);
      } else if (newEnabled && !enabled) {
        document.addEventListener('click', handleClick, true);
      }
      enabled = newEnabled;
      callback = newCallback;
    },
    destroy() {
      document.removeEventListener('click', handleClick, true);
    }
  };
}
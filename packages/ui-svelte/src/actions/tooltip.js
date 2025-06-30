/**
 * Svelte action for tooltips
 */

export function tooltip(node, options = {}) {
  let {
    content = '',
    placement = 'top',
    delay = 500,
    offset = 8,
    className = 'tooltip'
  } = options;
  
  let tooltipEl;
  let showTimeout;
  let hideTimeout;
  
  function createTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = `${className} fixed z-50 px-2 py-1 text-sm text-white bg-gray-900 rounded pointer-events-none opacity-0 transition-opacity`;
    tooltipEl.textContent = content;
    document.body.appendChild(tooltipEl);
  }
  
  function positionTooltip() {
    if (!tooltipEl) return;
    
    const rect = node.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    
    let top, left;
    
    switch (placement) {
      case 'top':
        top = rect.top - tooltipRect.height - offset;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = rect.bottom + offset;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.left - tooltipRect.width - offset;
        break;
      case 'right':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.right + offset;
        break;
      default:
        top = rect.top - tooltipRect.height - offset;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
    }
    
    // Keep tooltip within viewport
    const padding = 8;
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
    
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
  }
  
  function show() {
    if (!content) return;
    
    clearTimeout(hideTimeout);
    showTimeout = setTimeout(() => {
      if (!tooltipEl) createTooltip();
      positionTooltip();
      tooltipEl.style.opacity = '1';
    }, delay);
  }
  
  function hide() {
    clearTimeout(showTimeout);
    if (tooltipEl) {
      tooltipEl.style.opacity = '0';
      hideTimeout = setTimeout(() => {
        if (tooltipEl && tooltipEl.parentElement) {
          tooltipEl.parentElement.removeChild(tooltipEl);
          tooltipEl = null;
        }
      }, 200);
    }
  }
  
  node.addEventListener('mouseenter', show);
  node.addEventListener('mouseleave', hide);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hide);
  
  return {
    update(newOptions = {}) {
      content = newOptions.content ?? content;
      placement = newOptions.placement ?? placement;
      delay = newOptions.delay ?? delay;
      offset = newOptions.offset ?? offset;
      className = newOptions.className ?? className;
      
      if (tooltipEl) {
        tooltipEl.textContent = content;
        tooltipEl.className = `${className} fixed z-50 px-2 py-1 text-sm text-white bg-gray-900 rounded pointer-events-none transition-opacity`;
        positionTooltip();
      }
    },
    destroy() {
      clearTimeout(showTimeout);
      clearTimeout(hideTimeout);
      
      node.removeEventListener('mouseenter', show);
      node.removeEventListener('mouseleave', hide);
      node.removeEventListener('focus', show);
      node.removeEventListener('blur', hide);
      
      if (tooltipEl && tooltipEl.parentElement) {
        tooltipEl.parentElement.removeChild(tooltipEl);
      }
    }
  };
}
export function createFillFocusedFieldScript(value: string): string {
  const payload = JSON.stringify(value.slice(0, 2000))
  return `(() => {
    const element = window.__jobflowLastFocusedFormField || document.activeElement;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return { filled: false };
    if (!element.isConnected) return { filled: false };
    const type = (element.getAttribute('type') || (element instanceof HTMLSelectElement ? 'select' : element instanceof HTMLTextAreaElement ? 'textarea' : 'text')).toLowerCase();
    if (element.disabled || element.readOnly || ['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio'].includes(type)) return { filled: false };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return { filled: false };
    const value = ${payload};
    if (element instanceof HTMLSelectElement && ![...element.options].some((option) => option.value === value || option.textContent?.trim() === value)) return { filled: false };
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { filled: true };
  })()`
}

export function createInstallFocusedFieldTrackerScript(): string {
  return `(() => {
    if (window.__jobflowFocusedFieldTrackerInstalled) return;
    window.__jobflowFocusedFieldTrackerInstalled = true;
    window.__jobflowLastFocusedFormField = null;
    const safe = (element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
      const type = (element.getAttribute('type') || (element instanceof HTMLSelectElement ? 'select' : element instanceof HTMLTextAreaElement ? 'textarea' : 'text')).toLowerCase();
      if (element.disabled || element.readOnly || ['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio'].includes(type)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    document.addEventListener('focusin', (event) => {
      window.__jobflowLastFocusedFormField = safe(event.target) ? event.target : null;
    }, true);
  })()`
}

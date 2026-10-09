export function createFillFormScript(
  fields: Array<{
    index?: number
    indices?: number[]
    signature: string
    value: string
    kind?: 'text' | 'select' | 'radio' | 'checkbox' | 'combobox' | 'file'
    options?: Array<{ label: string; value: string; checked?: boolean }>
  }>,
): string {
  const payload = JSON.stringify(
    fields.slice(0, 180).map(({ index, indices, signature, value, kind, options }) => ({
      index,
      indices,
      signature,
      value: value.slice(0, 10000),
      kind,
      options,
    })),
  )
  return `(async () => {
    const requested = ${payload};
    const visible = (element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
    const normalize = (value) => String(value || '').toLocaleLowerCase().replace(/[\\s\\p{P}\\p{S}_]+/gu, '');
    const dispatch = (element) => {
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const setValue = (element, value) => {
      if (element.isContentEditable) { element.textContent = value; dispatch(element); return element.textContent === value; }
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) return false;
      setter.call(element, value);
      dispatch(element);
      return String(element.value ?? '') === value;
    };
    const chooseOption = (options, value) => {
      const key = normalize(value);
      const exact = options.filter((option) => normalize(option.textContent || option.getAttribute('aria-label') || option.value) === key);
      if (exact.length === 1) return exact[0];
      const partial = options.filter((option) => key.length > 1 && (normalize(option.textContent || option.getAttribute('aria-label') || option.value).includes(key) || key.includes(normalize(option.textContent || option.getAttribute('aria-label') || option.value))));
      return partial.length === 1 ? partial[0] : null;
    };
    let filled = 0;
    for (const item of requested) {
      if (!Number.isInteger(item.index)) continue;
      const groupIndices = Array.isArray(item.indices) && item.indices.length ? item.indices : [item.index];
      const group = groupIndices.map((index) => document.querySelector('[data-jobflow-autofill-index="' + index + '"]')).filter((element) => element && visible(element) && element.getAttribute('data-jobflow-autofill-signature') === item.signature);
      if (!group.length) continue;
      const first = group[0];
      const kind = item.kind || (first instanceof HTMLSelectElement ? 'select' : first.getAttribute('role') === 'combobox' ? 'combobox' : 'text');
      if (kind === 'file') continue;
      if (kind === 'radio' || kind === 'checkbox') {
        if (group.some((element) => (element instanceof HTMLInputElement && element.checked) || element.getAttribute('aria-checked') === 'true')) continue;
        const wanted = kind === 'checkbox' ? String(item.value).split(/[;,，、\\s]+/).map(normalize).filter(Boolean) : [normalize(item.value)];
        const options = Array.isArray(item.options) ? item.options : [];
        const selected = options.filter((option) => wanted.some((key) => normalize(option.label) === key || normalize(option.value) === key));
        const unique = kind === 'radio' ? selected.length === 1 ? selected : [] : selected;
        for (const option of unique) {
          const index = groupIndices[options.indexOf(option)];
          const target = document.querySelector('[data-jobflow-autofill-index="' + index + '"]');
          if (!target) continue;
          target.click();
          if (target instanceof HTMLInputElement) { target.checked = true; dispatch(target); }
          else target.setAttribute('aria-checked', 'true');
        }
        if (unique.length) filled++;
        continue;
      }
      if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement || first.isContentEditable) {
        if (String(first.value || first.textContent || '').trim()) continue;
      }
      if (first instanceof HTMLSelectElement) {
        if (String(first.value || '').trim()) continue;
        const option = chooseOption([...first.options], item.value);
        if (!option) continue;
        if (setValue(first, option.value)) {
          filled++;
          // Cascading province/city selectors often fetch dependent options asynchronously.
          await new Promise((resolve) => setTimeout(resolve, 220));
        }
        continue;
      }
      if (kind === 'combobox' || first.getAttribute('role') === 'combobox') {
        first.click();
        await new Promise((resolve) => setTimeout(resolve, 90));
        const options = [...document.querySelectorAll('[role="option"], [role="listbox"] [role="option"]')].filter(visible);
        const option = chooseOption(options, item.value);
        if (!option) continue;
        option.click();
        dispatch(first);
        filled++;
        continue;
      }
      const type = (first.getAttribute('type') || '').toLowerCase();
      if (first.disabled || first.readOnly || ['password', 'hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
      if (setValue(first, item.value)) filled++;
    }
    return { filled };
  })()`
}

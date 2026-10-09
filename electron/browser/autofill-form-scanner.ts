export interface ExperienceFormCounts {
  educationCount?: number
  internshipCount?: number
  projectCount?: number
}

export function createInspectFormScript(counts: ExperienceFormCounts = {}): string {
  const targets = JSON.stringify({
    education: Math.max(0, Math.min(20, counts.educationCount ?? 0)),
    internship: Math.max(0, Math.min(20, counts.internshipCount ?? 0)),
    project: Math.max(0, Math.min(20, counts.projectCount ?? 0)),
  })
  return `(async () => {
  const targets = ${targets};
  const excludedTypes = ['password', 'hidden', 'submit', 'button', 'reset', 'image'];
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const normalize = (value) => value.toLocaleLowerCase().replace(/[\\s\\p{P}\\p{S}_]+/gu, '');
  const cleanText = (value) => (value || '').replace(/\\s+/g, ' ').replace(/[*：:]+$/g, '').trim();
  const promptText = (value) => /^(请输入|请选择|输入|选择|please enter|select|enter)$/i.test(cleanText(value));
  const contextFor = (element) => {
    let ancestor = element.parentElement;
    for (let depth = 0; ancestor && ancestor !== document.body && depth < 8; depth++, ancestor = ancestor.parentElement) {
      const heading = ancestor.getAttribute('aria-label') || ancestor.getAttribute('data-section') ||
        ancestor.querySelector(':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > [role="heading"],:scope > .ant-card-head .ant-card-head-title,:scope > [class*="section-title"]')?.textContent || '';
      const value = cleanText(heading);
    if (value && /教育|学历|学校|院校|实习|工作经历|项目经历|教育背景|education|school|university|intern|work experience|project/i.test(value)) return value.slice(0, 120);
    }
    return '';
  };
  const groupFor = (element) => {
    let ancestor = element.parentElement;
    for (let depth = 0; ancestor && ancestor !== document.body && depth < 5; depth++, ancestor = ancestor.parentElement) {
      const title = ancestor.querySelector(':scope > legend,:scope > [role="heading"],:scope > [class*="label"],:scope > [class*="Label"],:scope > label')?.textContent || ancestor.getAttribute('aria-label') || '';
      const value = cleanText(title);
      if (value && value.length <= 80) return value;
    }
    return '';
  };
  const labelFor = (element) => {
    const labels = [...document.querySelectorAll('label')]
      .filter((label) => (element.id && label.htmlFor === element.id) || label.contains(element))
      .map((label) => cleanText(label.innerText || label.textContent));
    const ariaLabel = cleanText(element.getAttribute('aria-label'));
    const labelledBy = cleanText(element.getAttribute('aria-labelledby')?.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '));
    const explicit = [ariaLabel, labelledBy, ...labels].find((value) => value && !promptText(value));
    if (explicit) return explicit.slice(0, 120);

    const placeholder = cleanText(element.getAttribute('placeholder'))
      .replace(/^(请输入|请选择|输入|选择|please enter|select|enter)\s*/i, '')
      .trim();
    if (placeholder && !promptText(placeholder)) return placeholder.slice(0, 120);

    // Career forms often render visible labels beside controls without associating
    // them through <label for>. Search only nearby form rows to avoid copying a panel title.
    let row = element.parentElement;
    for (let depth = 0; row && row !== document.body && depth < 5; depth++, row = row.parentElement) {
      const nestedControls = row.querySelectorAll('input, textarea, select, [role="combobox"], [contenteditable="true"]');
      if (nestedControls.length > 1) continue;
      const candidates = [...row.querySelectorAll('label,[class*="label"],[class*="Label"],[role="label"],dt,th')]
        .filter((candidate) => !candidate.contains(element))
        .map((candidate) => cleanText(candidate.innerText || candidate.textContent))
        .filter((value) => value.length > 0 && value.length <= 60 && !promptText(value));
      if (candidates.length) return candidates[candidates.length - 1].slice(0, 120);

      const siblings = [...(row.parentElement?.children || [])];
      const position = siblings.indexOf(row);
      for (let index = position - 1; index >= 0; index--) {
        const value = cleanText(siblings[index].innerText || siblings[index].textContent);
        if (value.length > 0 && value.length <= 60 && !promptText(value)) return value.slice(0, 120);
      }
    }

    const identifier = [element.getAttribute('name'), element.id, element.getAttribute('autocomplete')]
      .map(cleanText)
      .find(Boolean);
    return (identifier || cleanText(element.getAttribute('placeholder'))).slice(0, 120);
  };
  const controls = () => [...new Set(document.querySelectorAll('input, textarea, select, [role="combobox"], [role="radio"], [role="checkbox"], [contenteditable="true"]'))].filter((element) => {
    const type = (element.getAttribute('type') || '').toLowerCase();
    return visible(element) && !element.disabled && !element.readOnly && !excludedTypes.includes(type) && element.getAttribute('aria-hidden') !== 'true';
  });
  const categoryOf = (value) => {
    const text = normalize(value);
    if (/实习|工作经历|internship|intern|workexperience/.test(text)) return 'internship';
    if (/项目经历|项目经验|项目|project/.test(text)) return 'project';
    if (/教育经历|教育背景|学历|学位|学校|院校|专业|毕业时间|毕业日期|education|school|university|college|degree|major|graduationdate/.test(text)) return 'education';
    return '';
  };
  const fieldText = (element) => [labelFor(element), element.getAttribute('name') || '', element.id || '', element.getAttribute('placeholder') || '', groupFor(element), contextFor(element)].join(' ');
  const categoryRowCount = (category) => {
    const anchorCounts = new Map();
    for (const element of controls()) {
      const text = normalize(fieldText(element));
      if (categoryOf(fieldText(element)) !== category) continue;
      let anchor = '';
      if (category === 'education' && /学校|院校|毕业院校|school|university|college|institution/.test(text)) anchor = 'school';
      if (category === 'internship' && /实习单位|实习公司|雇主|工作单位|employer|company/.test(text)) anchor = 'employer';
      if (category === 'project' && /项目名称|项目标题|projectname|projecttitle/.test(text)) anchor = 'name';
      if (anchor) anchorCounts.set(anchor, (anchorCounts.get(anchor) || 0) + 1);
    }
    const identifiedRows = Math.max(0, ...anchorCounts.values());
    return identifiedRows || (controls().some((element) => categoryOf(fieldText(element)) === category) ? 1 : 0);
  };
  const addButtonFor = (category) => [...document.querySelectorAll('button,[role="button"],input[type="button"]')].find((button) => {
    if (!visible(button) || button.disabled) return false;
    if (button instanceof HTMLButtonElement && button.type === 'submit') return false;
    const text = [button.getAttribute('aria-label') || '', button.getAttribute('title') || '', button.innerText || button.value || ''].join(' ').trim();
    if (!/(添加|新增|增加|add|new|plus)/i.test(text) || categoryOf(text + ' ' + contextFor(button)) !== category) return false;
    return true;
  });
  for (const [category, count] of Object.entries(targets)) {
    let attempts = 0;
    while (categoryRowCount(category) < count && attempts < 20) {
      const button = addButtonFor(category);
      if (!button) break;
      const before = controls().length;
      button.click();
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (controls().length <= before) break;
    }
  }
  const elements = controls();
  const handledGroups = new Set();
  const signatureOccurrences = new Map();
  const signatureFor = (parts) => {
    const base = parts.join('|').slice(0, 460);
    const occurrence = (signatureOccurrences.get(base) || 0) + 1;
    signatureOccurrences.set(base, occurrence);
    return occurrence === 1 ? base : base + '|occurrence:' + occurrence;
  };
  const output = [];
  elements.forEach((element, index) => {
    if (output.length >= 180) return;
    const tag = element.tagName.toLowerCase();
    const inputType = (element.getAttribute('type') || '').toLowerCase();
    const role = element.getAttribute('role') || '';
    const kind = inputType === 'file' ? 'file' : inputType === 'radio' || role === 'radio' ? 'radio' : inputType === 'checkbox' || role === 'checkbox' ? 'checkbox' : tag === 'select' ? 'select' : role === 'combobox' ? 'combobox' : 'text';
    if (kind === 'radio' || kind === 'checkbox') {
      const group = element.closest('fieldset,[role="radiogroup"],[role="group"]');
      if (handledGroups.has(element)) return;
      const members = elements.filter((candidate) => {
        const candidateRole = candidate.getAttribute('role') || '';
        const candidateType = (candidate.getAttribute('type') || '').toLowerCase();
        const sameKind = kind === 'radio' ? candidateType === 'radio' || candidateRole === 'radio' : candidateType === 'checkbox' || candidateRole === 'checkbox';
        const candidateGroup = candidate.closest('fieldset,[role="radiogroup"],[role="group"]');
        const name = element.getAttribute('name');
        const sameGroup = group ? candidateGroup === group : name ? candidate.getAttribute('name') === name : candidate.parentElement === element.parentElement;
        return sameKind && sameGroup;
      });
      members.forEach((member) => handledGroups.add(member));
      const indices = members.map((member) => elements.indexOf(member));
      const legend = group?.querySelector(':scope > legend,:scope > [role="heading"],[aria-label]')?.textContent || group?.getAttribute('aria-label') || '';
      const options = members.map((member) => ({
        value: member.getAttribute('value') || member.getAttribute('aria-label') || '',
        label: labelFor(member),
        checked: (member instanceof HTMLInputElement && member.checked) || member.getAttribute('aria-checked') === 'true',
      }));
      const label = cleanText(legend) || options.map((option) => option.label).filter(Boolean).join(' / ');
      const signature = signatureFor([
        kind,
        element.getAttribute('name') || '',
        normalize(label),
        normalize(groupFor(element)),
        normalize(contextFor(element)),
        ...options.map((option) => normalize(option.label)),
      ]);
      members.forEach((member, memberOffset) => {
        member.setAttribute('data-jobflow-autofill-index', String(indices[memberOffset]));
        member.setAttribute('data-jobflow-autofill-signature', signature);
      });
      output.push({ index: indices[0] ?? index, indices, tag, type: inputType || role, kind, role, label, group: cleanText(legend), context: contextFor(element), name: element.getAttribute('name') || '', options, signature });
      return;
    }
    element.setAttribute('data-jobflow-autofill-index', String(index));
    const type = inputType || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : role || 'text');
    const options = tag === 'select' ? [...element.options].map((option) => ({ value: option.value, label: cleanText(option.textContent), checked: option.selected })) : [];
    const signature = signatureFor([
      tag,
      type,
      element.getAttribute('name') || '',
      element.id || '',
      element.getAttribute('autocomplete') || '',
      element.getAttribute('placeholder') || '',
      element.getAttribute('aria-label') || '',
      role,
      normalize(labelFor(element)),
      normalize(groupFor(element)),
      normalize(contextFor(element)),
    ]);
    element.setAttribute('data-jobflow-autofill-signature', signature);
    output.push({ index, indices: [index], tag, type, kind, role, label: labelFor(element), context: contextFor(element), group: groupFor(element), autocomplete: element.getAttribute('autocomplete') || '', name: element.getAttribute('name') || '', id: element.id || '', placeholder: element.getAttribute('placeholder') || '', ariaLabel: element.getAttribute('aria-label') || '', options, signature });
  });
  return output;
})()`
}

export const inspectFormScript = createInspectFormScript()

/** Install a one-time confirmation in the embedded page's own top layer. */
export function createAutofillConfirmationScript(): string {
  return `new Promise((resolve) => {
    const existing = document.querySelector('[data-jobflow-confirmation]');
    existing?.remove();
    const host = document.createElement('div');
    host.dataset.jobflowConfirmation = 'true';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({mode:'closed'});
    shadow.innerHTML = \`
      <style>
        :host{all:initial}
        .backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:rgba(15,23,42,.42);font:14px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2937}
        .dialog{box-sizing:border-box;width:min(480px,calc(100vw - 40px));padding:24px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.32)}
        h2{margin:0 0 12px;font-size:17px;line-height:1.4;color:#111827}
        p{margin:0;color:#4b5563}
        .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}
        button{appearance:none;border:1px solid #d1d5db;border-radius:8px;padding:8px 14px;background:#fff;color:#374151;font:inherit;cursor:pointer}
        button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
        button.primary{border-color:#3156d9;background:#3156d9;color:#fff}
      </style>
      <div class="backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="jobflow-title" tabindex="-1">
        <h2 id="jobflow-title">确认中等置信度字段</h2>
        <p>部分字段匹配需要确认。继续后会填写高置信度字段和这些候选字段；也可以先返回助手检查映射。网页表单不会自动提交。</p>
        <div class="actions"><button type="button" data-choice="review">检查映射</button><button class="primary" type="button" data-choice="confirm">确认填写</button></div>
      </section></div>\`;
    const finish = (confirmed) => { host.remove(); resolve(confirmed); };
    shadow.querySelector('[data-choice="review"]').addEventListener('click', () => finish(false), {once:true});
    shadow.querySelector('[data-choice="confirm"]').addEventListener('click', () => finish(true), {once:true});
    shadow.querySelector('[role="dialog"]').focus();
    document.documentElement.appendChild(host);
  })`
}

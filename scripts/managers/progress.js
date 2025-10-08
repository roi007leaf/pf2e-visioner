/**
 * Lightweight progress overlay for long-running background tasks
 */

export class VisionerProgress extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: {
      title: game.i18n.localize('PF2E_VISIONER.DIALOG_TITLES.APPLYING_CHANGES'),
      icon: 'fas fa-spinner',
      resizable: false,
    },
    position: { width: 360, height: 'auto' },
  };

  static PARTS = {
    content: { template: null },
  };

  constructor(title = 'Applying Changes', total = 0) {
    super({ window: { title } });
    this.total = total;
    this.completed = 0;
  }

  async _renderHTML(context, options) {
    const percent = this.total > 0 ? Math.floor((this.completed / this.total) * 100) : 0;
    return `
      <div class="visioner-progress" style="padding: 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:600;">Working...</span>
          <span class="label" style="font-variant-numeric: tabular-nums;">${this.completed}/${this.total} (${percent}%)</span>
        </div>
        <div style="position:relative;height:10px;background:var(--color-border,#6663);border-radius:6px;overflow:hidden;">
          <div class="bar" style="position:absolute;left:0;top:0;height:100%;width:${percent}%;background:var(--color-primary,var(--visibility-observed));"></div>
        </div>
      </div>`;
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
    return content;
  }

  setProgress(completed, total) {
    this.completed = Math.min(completed, total);
    this.total = Math.max(total, 0);
    try {
      const percent = this.total > 0 ? Math.floor((this.completed / this.total) * 100) : 0;
      const el = this.element;
      const bar = el?.querySelector?.('.bar');
      const label = el?.querySelector?.('.label');
      if (bar) bar.style.width = `${percent}%`;
      if (label) label.textContent = `${this.completed}/${this.total} (${percent}%)`;
      if (!bar || !label) this.render({ force: true });
    } catch (_) {
      this.render({ force: true });
    }
  }
}

/**
 * Run an array of task functions/promises while showing a progress overlay
 * @param {string} title
 * @param {Array<Function|Promise>} tasks - functions returning promises or raw promises
 */
export async function runTasksWithProgress(title, tasks) {
  const total = Array.isArray(tasks) ? tasks.length : 0;
  const overlay = new VisionerProgress(title, total);
  overlay.render(true);
  let completed = 0;

  const toPromise = (t) => (typeof t === 'function' ? (async () => t())() : Promise.resolve(t));
  const wrapped = tasks.map((t) =>
    toPromise(t)
      .catch(() => {})
      .finally(() => {
        completed += 1;
        try {
          overlay.setProgress(completed, total);
        } catch (_) {}
      }),
  );

  await Promise.allSettled(wrapped);
  try {
    overlay.close();
  } catch (_) {}
}

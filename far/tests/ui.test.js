import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('UI component safe rendering', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    window.PlasmaDeck = {};
    await import('../ui.js');
  });

  it('renders card body and footer strings as text instead of HTML', () => {
    const card = window.PlasmaDeck.UI.Card.create({
      title: '<img src=x onerror="window.__cardTitleXss = true">',
      subtitle: '<svg onload="window.__cardSubtitleXss = true"></svg>',
      body: '<img src=x onerror="window.__cardBodyXss = true">',
      footer: '<script>window.__cardFooterXss = true</script>',
    });

    expect(card.textContent).toContain('<img');
    expect(card.textContent).toContain('<svg');
    expect(card.textContent).toContain('<script>');
    expect(card.querySelector('img, svg')).toBeNull();
    expect(card.querySelector('script')).toBeNull();
    expect(window.__cardTitleXss).toBeUndefined();
    expect(window.__cardSubtitleXss).toBeUndefined();
    expect(window.__cardBodyXss).toBeUndefined();
    expect(window.__cardFooterXss).toBeUndefined();
  });

  it('validates card and avatar image URLs before assigning src', () => {
    const card = window.PlasmaDeck.UI.Card.create({
      title: 'Unsafe image',
      image: 'javascript:window.__cardImageXss = true',
      imageAlt: 'Unsafe',
    });
    const avatar = window.PlasmaDeck.UI.Avatar.create({
      src: 'data:text/html,<script>window.__avatarImageXss = true</script>',
      initials: 'PX',
    });
    const safeCard = window.PlasmaDeck.UI.Card.create({
      title: 'Safe image',
      image: 'https://cdn.example.test/image.png',
      imageAlt: 'Safe',
    });

    expect(card.querySelector('img')).toBeNull();
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent).toBe('PX');
    expect(safeCard.querySelector('img')?.src).toBe('https://cdn.example.test/image.png');
    expect(window.__cardImageXss).toBeUndefined();
    expect(window.__avatarImageXss).toBeUndefined();
  });

  it('renders alert action strings as text and node actions as controls', () => {
    const alert = window.PlasmaDeck.UI.Alert.create({
      title: '<img src=x onerror="window.__alertTitleXss = true">',
      message: '<script>window.__alertMessageXss = true</script>',
      actions: '<button onclick="window.__alertActionXss = true">Run</button>',
    });

    expect(alert.textContent).toContain('<img');
    expect(alert.textContent).toContain('<script>');
    expect(alert.textContent).toContain('<button');
    expect(alert.querySelector('img')).toBeNull();
    expect(alert.querySelector('script')).toBeNull();
    expect(alert.querySelector('.alert-actions button:not(.alert-close)')).toBeNull();

    const button = document.createElement('button');
    button.dataset.safeAction = 'true';
    button.textContent = 'Safe';
    const actionable = window.PlasmaDeck.UI.Alert.create({ message: 'Node action', actions: button });
    expect(actionable.querySelector('[data-safe-action="true"]')).toBe(button);

    expect(window.__alertTitleXss).toBeUndefined();
    expect(window.__alertMessageXss).toBeUndefined();
    expect(window.__alertActionXss).toBeUndefined();
  });

  it('renders button labels and string icons without executing HTML', () => {
    const button = window.PlasmaDeck.UI.Button.create({
      label: '<img src=x onerror="window.__buttonLabelXss = true">',
      icon: '<svg onload="window.__buttonIconXss = true"></svg>',
    });

    expect(button.textContent).toContain('<img');
    expect(button.textContent).toContain('<svg');
    expect(button.querySelector('img, svg')).toBeNull();
    expect(window.__buttonLabelXss).toBeUndefined();
    expect(window.__buttonIconXss).toBeUndefined();
  });

  it('preserves existing button child nodes across loading state', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    icon.dataset.icon = 'safe';
    icon.textContent = 'Icon';
    button.append(icon, document.createTextNode(' Save'));

    window.PlasmaDeck.UI.Button.setLoading(button, true);

    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('.btn-spinner')).not.toBeNull();
    expect(button.textContent).toContain('Loading');

    window.PlasmaDeck.UI.Button.setLoading(button, false);

    expect(button.querySelector('[data-icon="safe"]')).toBe(icon);
    expect(button.textContent).toContain('Save');
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });

  it('renders tag input values as text and safe remove controls', () => {
    document.body.innerHTML = `
      <div data-tags-input>
        <input type="hidden" value="<img src=x onerror=&quot;window.__tagXss = true&quot;>,safe">
        <div data-tag-list></div>
        <input type="text">
      </div>
    `;

    window.PlasmaDeck.UI.TagsInput.init();

    const tagList = document.querySelector('[data-tag-list]');
    expect(tagList.textContent).toContain('<img');
    expect(tagList.querySelector('img')).toBeNull();
    expect(tagList.querySelectorAll('.tag-close')).toHaveLength(2);
    expect(tagList.querySelector('.tag-close').getAttribute('aria-label')).toContain('<img');
    expect(window.__tagXss).toBeUndefined();
  });

  it('keeps custom select accessible and handles empty native options', () => {
    document.body.innerHTML = `
      <div data-custom-select>
        <select id="status-select">
          <option value="done">Done</option>
        </select>
        <button type="button" data-select-trigger aria-expanded="false">
          <span data-select-label>Done</span>
        </button>
        <div data-select-menu></div>
      </div>
    `;

    window.PlasmaDeck.UI.Select.init();
    const wrapper = document.querySelector('[data-custom-select]');
    const select = wrapper.querySelector('select');
    const trigger = wrapper.querySelector('[data-select-trigger]');
    const menu = wrapper.querySelector('[data-select-menu]');

    expect(menu.getAttribute('role')).toBe('listbox');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(menu.querySelector('[role="option"]').getAttribute('aria-selected')).toBe('true');

    select.innerHTML = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(wrapper.querySelector('[data-select-label]').textContent).toBe('');
    expect(trigger.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('hides UI tooltips when their anchor is removed', async () => {
    document.body.innerHTML = '<button id="tip-anchor" data-tooltip="Tooltip text">Hover</button>';
    window.PlasmaDeck.UI.Tooltip.init();

    const anchor = document.getElementById('tip-anchor');
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.querySelector('.tooltip').classList.contains('visible')).toBe(true);

    anchor.remove();
    await Promise.resolve();

    expect(document.querySelector('.tooltip').classList.contains('visible')).toBe(false);
  });

  it('updates dynamically added range sliders through delegated events', () => {
    window.PlasmaDeck.bus = { emit: vi.fn() };
    document.body.innerHTML = `
      <label>
        <input id="dynamic-range" type="range" min="0" max="100" value="25" data-output="range-output" data-range-format="{v}%" />
        <output id="range-output"></output>
        <span data-range-tip></span>
      </label>
    `;

    window.PlasmaDeck.UI.Range.init();
    const range = document.getElementById('dynamic-range');
    range.value = '75';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(range._enhanced).toBe(true);
    expect(range.style.getPropertyValue('--range-fill')).toBe('75%');
    expect(document.getElementById('range-output').textContent).toBe('75%');
    expect(window.PlasmaDeck.bus.emit).toHaveBeenCalledWith('range:change', { el: range, value: 75 });
  });

  it('routes confirmations through the styled modal adapter when available', async () => {
    const confirmAsync = vi.fn(async () => true);
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    window.PlasmaDeck.Modal = { confirmAsync };

    await expect(window.PlasmaDeck.UI.confirm({
      title: 'Delete note',
      message: 'Delete this note permanently?',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    })).resolves.toBe(true);

    expect(confirmAsync).toHaveBeenCalledWith({
      title: 'Delete note',
      message: 'Delete this note permanently?',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('uses native confirm only when the modal adapter is unavailable', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    delete window.PlasmaDeck.Modal;

    await expect(window.PlasmaDeck.UI.confirm('Fallback question?')).resolves.toBe(true);

    expect(nativeConfirm).toHaveBeenCalledWith('Fallback question?');
  });

  it('uses Intl locale data for date picker month and weekday labels', () => {
    document.documentElement.lang = 'fa-IR';
    document.body.innerHTML = `
      <div data-datepicker>
        <input value="2026-01-15" />
      </div>
    `;

    window.PlasmaDeck.UI.DatePicker.init();

    const popup = document.querySelector('[data-datepicker-popup]');
    const title = popup.querySelector('.dp-title').textContent;
    const weekdays = [...popup.querySelectorAll('.dp-dow')].map((el) => el.textContent);
    const currentMonth = new Date();
    const expectedTitle = new Intl.DateTimeFormat('fa-IR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
    const expectedFirstDay = new Intl.DateTimeFormat('fa-IR', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 7)));

    expect(title).toBe(expectedTitle);
    expect(weekdays[0]).toBe(expectedFirstDay);
    expect(weekdays).not.toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  it('renders date picker labels as text even if locale formatting is hostile', () => {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = vi.fn(function hostileDateTimeFormat() {
      return {
      format: vi.fn(() => '<img src=x onerror="window.__datePickerXss = true">'),
      };
    });
    document.body.innerHTML = `
      <div data-datepicker>
        <input value="2026-01-15" />
      </div>
    `;

    window.PlasmaDeck.UI.DatePicker.init();

    const popup = document.querySelector('[data-datepicker-popup]');
    expect(popup.textContent).toContain('<img');
    expect(popup.querySelector('img')).toBeNull();
    expect(window.__datePickerXss).toBeUndefined();

    Intl.DateTimeFormat = originalDateTimeFormat;
  });
});

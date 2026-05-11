

// ============================================================
// ui.js
// Complete UI Component JavaScript Layer
// ============================================================

  const UI = (() => {

    // ── Shared micro-utilities ────────────────────────────
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const uid = (p = 'ui') => `${p}-${Math.random().toString(36).slice(2, 8)}`;
    const esc = s => String(s).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

    function animH(el, open, dur = 250) {
      return new Promise(resolve => {
        el.style.overflow   = 'hidden';
        el.style.transition = `height ${dur}ms ease`;
        el.style.height     = open ? '0px' : `${el.scrollHeight}px`;
        requestAnimationFrame(() => {
          el.style.height = open ? `${el.scrollHeight}px` : '0px';
          setTimeout(() => {
            el.style.height     = open ? '' : '0px';
            el.style.overflow   = open ? '' : 'hidden';
            el.style.transition = '';
            resolve();
          }, dur);
        });
      });
    }

    // ════════════════════════════════════════════════════
    // COMPONENT: BUTTON
    // ════════════════════════════════════════════════════
    const Button = {
      init() {
        // Loading state
        document.addEventListener('click', e => {
          const btn = e.target.closest('[data-loading-on-click]');
          if (!btn) return;
          this.setLoading(btn, true);
          // Auto-reset after a timeout or the caller resets manually
          const timeout = parseInt(btn.dataset.loadingTimeout ?? '0', 10);
          if (timeout) setTimeout(() => this.setLoading(btn, false), timeout);
        });
      },

      setLoading(btn, on) {
        if (on) {
          btn._originalHTML = btn.innerHTML;
          btn._originalWidth = btn.offsetWidth + 'px';
          btn.style.minWidth = btn._originalWidth;
          btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>
                           <span class="sr-only">Loading…</span>`;
          btn.disabled = true;
          btn.setAttribute('aria-busy', 'true');
        } else {
          btn.innerHTML = btn._originalHTML ?? btn.innerHTML;
          btn.disabled = false;
          btn.style.minWidth = '';
          btn.removeAttribute('aria-busy');
        }
      },

      /** Create a button element programmatically */
      create({ label = '', variant = 'primary', size = '', icon = '',
               loading = false, block = false, disabled = false,
               onClick = null } = {}) {
        const classes = ['btn', `btn-${variant}`, size ? `btn-${size}` : '',
                         block ? 'btn-block' : ''].filter(Boolean).join(' ');
        const btn = document.createElement('button');
        btn.className = classes;
        btn.disabled  = disabled;
        btn.innerHTML = `${icon ? `<span class="btn-icon-left" aria-hidden="true">${icon}</span>` : ''}${esc(label)}`;
        if (onClick) btn.addEventListener('click', onClick);
        if (loading) this.setLoading(btn, true);
        return btn;
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: CARD
    // ════════════════════════════════════════════════════
    const Card = {
      /**
       * Create a card element
       */
      create({
        title    = '',
        subtitle = '',
        body     = '',
        footer   = '',
        variant  = '',       // 'ghost' | 'filled' | 'accent' | 'gradient'
        glow     = false,
        image    = '',
        imageAlt = '',
        actions  = [],
      } = {}) {
        const card = document.createElement('div');
        card.className = `card ${variant ? `card-${variant}` : ''} ${glow ? 'card-glow' : ''}`.trim();

        if (image) {
          const img = document.createElement('img');
          img.src = image; img.alt = imageAlt;
          img.className = 'card-image';
          card.appendChild(img);
        }

        if (title || actions.length) {
          const header = document.createElement('div');
          header.className = 'card-header';
          if (title) {
            header.innerHTML = `<div class="card-title">${esc(title)}</div>
              ${subtitle ? `<div class="card-subtitle">${esc(subtitle)}</div>` : ''}`;
          }
          if (actions.length) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'card-actions';
            actions.forEach(a => {
              const btn = Button.create(a);
              actionsEl.appendChild(btn);
            });
            header.appendChild(actionsEl);
          }
          card.appendChild(header);
        }

        const bodyEl = document.createElement('div');
        bodyEl.className = 'card-body';
        if (typeof body === 'string') bodyEl.innerHTML = body;
        else bodyEl.appendChild(body);
        card.appendChild(bodyEl);

        if (footer) {
          const footerEl = document.createElement('div');
          footerEl.className = 'card-footer';
          if (typeof footer === 'string') footerEl.innerHTML = footer;
          else footerEl.appendChild(footer);
          card.appendChild(footerEl);
        }

        return card;
      },

      /** Flip card on [data-flip-card] click */
      initFlip() {
        document.addEventListener('click', e => {
          const trigger = e.target.closest('[data-flip-card]');
          if (!trigger) return;
          const card = trigger.closest('.card-flip') ?? trigger;
          card.classList.toggle('flipped');
        });
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: BADGE
    // ════════════════════════════════════════════════════
    const Badge = {
      create({ text = '', variant = '', dot = false, pulse = false } = {}) {
        const span = document.createElement('span');
        span.className = `badge ${variant ? `badge-${variant}` : ''} ${dot ? 'badge-dot' : ''} ${pulse ? 'badge-pulse' : ''}`.trim();
        if (!dot) span.textContent = text;
        return span;
      },

      /** Update count badge with animation */
      setCount(el, count) {
        const prev = parseInt(el.textContent ?? '0', 10);
        el.textContent = count > 99 ? '99+' : String(count);
        el.hidden = count === 0;
        if (count > prev) {
          el.classList.remove('badge-bump');
          void el.offsetWidth; // force reflow
          el.classList.add('badge-bump');
        }
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: AVATAR
    // ════════════════════════════════════════════════════
    const Avatar = {
      create({ src = '', alt = '', initials = '', size = '', status = '',
               shape = '', color = '' } = {}) {
        const el = document.createElement('div');
        el.className = `avatar ${size ? `avatar-${size}` : ''} ${shape === 'square' ? 'avatar-square' : ''}`.trim();
        if (color) el.style.setProperty('--avatar-color', color);

        if (src) {
          const img = document.createElement('img');
          img.src = src; img.alt = alt ?? initials;
          el.appendChild(img);
        } else if (initials) {
          const span = document.createElement('span');
          span.className    = 'avatar-initials';
          span.textContent  = initials.slice(0, 2).toUpperCase();
          el.appendChild(span);
        }

        if (status) {
          const dot = document.createElement('span');
          dot.className = `avatar-status avatar-status-${status}`;
          el.appendChild(dot);
        }

        return el;
      },

      /** Group multiple avatars with overlap */
      createGroup(avatarOptions = [], max = 5) {
        const group = document.createElement('div');
        group.className = 'avatar-group';
        const visible = avatarOptions.slice(0, max);
        visible.forEach(opts => group.appendChild(this.create(opts)));
        const extra = avatarOptions.length - max;
        if (extra > 0) {
          const overflow = document.createElement('div');
          overflow.className  = 'avatar avatar-overflow';
          overflow.textContent = `+${extra}`;
          group.appendChild(overflow);
        }
        return group;
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: ALERT
    // ════════════════════════════════════════════════════
    const Alert = {
      ICONS: { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' },

      create({ message = '', type = 'info', title = '', dismissible = true,
               icon = null, actions = '' } = {}) {
        const el = document.createElement('div');
        el.className = `alert alert-${type}`;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        el.innerHTML = `
          <span class="alert-icon" aria-hidden="true">${icon ?? this.ICONS[type] ?? 'ℹ️'}</span>
          <div class="alert-content">
            ${title ? `<div class="alert-title">${esc(title)}</div>` : ''}
            <div class="alert-message">${esc(message)}</div>
            ${actions}
          </div>
          ${dismissible ? '<button class="alert-close" aria-label="Dismiss">×</button>' : ''}
        `;

        if (dismissible) {
          el.querySelector('.alert-close').addEventListener('click', () => this.dismiss(el));
        }

        return el;
      },

      show(container, opts) {
        const el    = typeof container === 'string'
          ? document.getElementById(container)
          : container;
        const alert = this.create(opts);
        el?.appendChild(alert);
        const fade = window.PlasmaDeck?.ProgressUI?.tween?.fade;
        if (typeof fade === 'function') fade(alert, 1, 300);
        else alert.style.opacity = '1';
        return alert;
      },

      dismiss(alertEl) {
        const fade = window.PlasmaDeck?.ProgressUI?.tween?.fade;
        if (typeof fade === 'function') fade(alertEl, 0, 250);
        else alertEl.style.opacity = '0';
        setTimeout(() => alertEl.remove(), 260);
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: TOGGLE / SWITCH
    // ════════════════════════════════════════════════════
    const Toggle = {
      init() {
        document.addEventListener('change', e => {
          const toggle = e.target.closest('input[type="checkbox"].toggle');
          if (!toggle) return;
          const label  = toggle.closest('.toggle-wrapper')?.querySelector('[data-toggle-label]');
          if (label) {
            label.textContent = toggle.checked
              ? (toggle.dataset.labelOn  ?? 'On')
              : (toggle.dataset.labelOff ?? 'Off');
          }
          window.PlasmaDeck?.bus?.emit('toggle:change', {
            el:      toggle,
            checked: toggle.checked,
            name:    toggle.name ?? toggle.id,
          });
        });
      },

      set(toggle, on) {
        const el = typeof toggle === 'string'
          ? document.getElementById(toggle)
          : toggle;
        if (!el) return;
        el.checked = on;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: RANGE SLIDER (enhanced)
    // ════════════════════════════════════════════════════
    const Range = {
      init() {
        $$('input[type="range"]').forEach(range => this._enhance(range));

        // Observe new ranges added dynamically
        const observer = new MutationObserver(muts => {
          muts.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (node.matches?.('input[type="range"]')) this._enhance(node);
            node.querySelectorAll?.('input[type="range"]').forEach(r => this._enhance(r));
          }));
        });
        observer.observe(document.body, { childList: true, subtree: true });
      },

      _enhance(range) {
        if (range._enhanced) return;
        range._enhanced = true;

        const update = () => {
          const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
          range.style.setProperty('--range-fill', `${pct}%`);

          // Output element
          const output = document.getElementById(range.dataset.output ?? '')
            ?? range.parentElement?.querySelector('[data-range-output]');
          if (output) {
            const fmt = range.dataset.rangeFormat ?? '{v}';
            output.textContent = fmt.replace('{v}', range.value);
          }

          // Tooltip
          const tip = range.parentElement?.querySelector('[data-range-tip]');
          if (tip) {
            const thumbX = (pct / 100) * (range.offsetWidth - 16) + 8;
            tip.style.left    = `${thumbX}px`;
            tip.textContent   = range.value;
            tip.style.display = 'block';
          }
        };

        range.addEventListener('input', update);
        range.addEventListener('mouseup',  () => {
          const tip = range.parentElement?.querySelector('[data-range-tip]');
          if (tip) setTimeout(() => { tip.style.display = 'none'; }, 600);
          window.PlasmaDeck?.bus?.emit('range:change', { el: range, value: +range.value });
        });
        update();
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: SELECT (custom styled)
    // ════════════════════════════════════════════════════
    const Select = {
      init() {
        $$('[data-custom-select]').forEach(wrapper => this._init(wrapper));
      },

      _init(wrapper) {
        const native  = $('select', wrapper);
        if (!native || wrapper._initialized) return;
        wrapper._initialized = true;

        const trigger = $('[data-select-trigger]', wrapper);
        const menu    = $('[data-select-menu]', wrapper);
        const label   = $('[data-select-label]', wrapper);
        if (!trigger || !menu) return;

        // Build options
        const buildOptions = () => {
          menu.innerHTML = '';
          [...native.options].forEach((opt, i) => {
            if (opt.disabled) return;
            const item = document.createElement('div');
            item.className   = `dropdown-item ${opt.selected ? 'selected' : ''}`;
            item.textContent = opt.text;
            item.dataset.value = opt.value;
            item.addEventListener('click', () => {
              native.value = opt.value;
              native.dispatchEvent(new Event('change', { bubbles: true }));
              if (label) label.textContent = opt.text;
              $$('.dropdown-item', menu).forEach(d => d.classList.remove('selected'));
              item.classList.add('selected');
              menu.classList.remove('open');
              trigger.setAttribute('aria-expanded', 'false');
            });
            menu.appendChild(item);
          });
        };

        buildOptions();

        trigger.addEventListener('click', e => {
          e.stopPropagation();
          const open = menu.classList.toggle('open');
          trigger.setAttribute('aria-expanded', String(open));
          if (open) ($('.dropdown-item.selected', menu) ?? $('.dropdown-item', menu))?.focus();
        });

        native.addEventListener('change', () => {
          const sel = native.options[native.selectedIndex];
          if (label && sel) label.textContent = sel.text;
        });

        document.addEventListener('click', e => {
          if (!wrapper.contains(e.target)) {
            menu.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
          }
        });

        // Sync if native changes externally
        const obs = new MutationObserver(buildOptions);
        obs.observe(native, { childList: true, subtree: true });
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: TAGS INPUT
    // ════════════════════════════════════════════════════
    const TagsInput = {
      init() {
        $$('[data-tags-input]').forEach(wrapper => this._init(wrapper));
      },

      _init(wrapper) {
        if (wrapper._initialized) return;
        wrapper._initialized = true;

        const input   = $('input[type="text"]', wrapper);
        const hidden  = $('input[type="hidden"]', wrapper);
        const tagList = $('[data-tag-list]', wrapper);
        if (!input || !tagList) return;

        let tags = hidden?.value ? hidden.value.split(',').filter(Boolean) : [];

        const render = () => {
          tagList.innerHTML = '';
          tags.forEach(tag => {
            const el = document.createElement('span');
            el.className = 'tag';
            el.innerHTML = `${esc(tag)}<button class="tag-close" aria-label="Remove ${esc(tag)}">×</button>`;
            el.querySelector('.tag-close').addEventListener('click', () => {
              tags = tags.filter(t => t !== tag);
              render();
            });
            tagList.appendChild(el);
          });
          if (hidden) hidden.value = tags.join(',');
          wrapper.dispatchEvent(new CustomEvent('tags:change', { detail: { tags }, bubbles: true }));
        };

        const addTag = val => {
          const trimmed = val.trim();
          const max     = parseInt(wrapper.dataset.tagsMax ?? '99', 10);
          if (!trimmed || tags.includes(trimmed) || tags.length >= max) return false;
          tags.push(trimmed);
          render();
          return true;
        };

        input.addEventListener('keydown', e => {
          const separators = (wrapper.dataset.tagsSeparators ?? 'Enter,,').split(',');
          if (separators.includes(e.key)) {
            e.preventDefault();
            if (addTag(input.value)) input.value = '';
          }
          if (e.key === 'Backspace' && !input.value && tags.length) {
            tags.pop();
            render();
          }
        });

        input.addEventListener('blur', () => {
          if (input.value.trim()) {
            if (addTag(input.value)) input.value = '';
          }
        });

        render();
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: COLOR PICKER
    // ════════════════════════════════════════════════════
    const ColorPicker = {
      init() {
        $$('[data-color-picker]').forEach(wrapper => this._init(wrapper));
      },

      _init(wrapper) {
        if (wrapper._initialized) return;
        wrapper._initialized = true;

        const input   = $('input[type="color"]', wrapper) ?? $('input[type="text"]', wrapper);
        const preview = $('[data-color-preview]', wrapper);
        const hex     = $('[data-color-hex]', wrapper);
        const swatches = $$('[data-swatch]', wrapper);

        const update = color => {
          if (preview) preview.style.background = color;
          if (hex)     hex.textContent = color.toUpperCase();
          if (input && input.type === 'color') input.value = color;
          else if (input) input.value = color;
          wrapper.dispatchEvent(new CustomEvent('color:change', { detail: { color }, bubbles: true }));
        };

        if (input) input.addEventListener('input', () => update(input.value));

        swatches.forEach(swatch => {
          swatch.addEventListener('click', () => {
            update(swatch.dataset.swatch);
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
          });
        });

        // Init with current value
        if (input?.value) update(input.value);
      },
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: DATE PICKER (lightweight)
    // ════════════════════════════════════════════════════
    const DatePicker = {
      _months: ['January','February','March','April','May','June',
                'July','August','September','October','November','December'],
      _days:   ['Su','Mo','Tu','We','Th','Fr','Sa'],

      init() {
        $$('[data-datepicker]').forEach(wrapper => this._init(wrapper));
      },

      _init(wrapper) {
        if (wrapper._initialized) return;
        wrapper._initialized = true;

        const input    = $('input', wrapper);
        const popup    = $('[data-datepicker-popup]', wrapper)
          ?? this._createPopup(wrapper);
        const today    = new Date();
        let   viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
        let   selected = input?.value ? new Date(input.value) : null;

        const render = () => {
          const year  = viewDate.getFullYear();
          const month = viewDate.getMonth();
          const first = new Date(year, month, 1).getDay();
          const days  = new Date(year, month + 1, 0).getDate();

          popup.innerHTML = `
            <div class="dp-header">
              <button class="dp-prev" aria-label="Previous month">‹</button>
              <span class="dp-title">${this._months[month]} ${year}</span>
              <button class="dp-next" aria-label="Next month">›</button>
            </div>
            <div class="dp-grid">
              ${this._days.map(d => `<span class="dp-dow">${d}</span>`).join('')}
              ${Array.from({ length: first }, () => '<span class="dp-empty"></span>').join('')}
              ${Array.from({ length: days }, (_, i) => {
                const d    = i + 1;
                const date = new Date(year, month, d);
                const isToday = date.toDateString() === today.toDateString();
                const isSel   = selected && date.toDateString() === selected.toDateString();
                return `<button class="dp-day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}"
                                data-date="${date.toISOString().slice(0,10)}">${d}</button>`;
              }).join('')}
            </div>
          `;

          $('.dp-prev', popup).addEventListener('click', () => {
            viewDate.setMonth(viewDate.getMonth() - 1);
            render();
          });
          $('.dp-next', popup).addEventListener('click', () => {
            viewDate.setMonth(viewDate.getMonth() + 1);
            render();
          });
                    $$('.dp-day', popup).forEach(btn => {
            btn.addEventListener('click', () => {
              const date = btn.dataset.date;
              selected = new Date(date);
              if (input) input.value = date;
              popup.classList.remove('open');

              wrapper.dispatchEvent(new CustomEvent('date:change', {
                detail: { date, element: input },
                bubbles: true
              }));
            });
          });
        };

        if (input) {
          input.addEventListener('focus', () => {
            popup.classList.add('open');
          });
        }

        document.addEventListener('click', e => {
          if (!wrapper.contains(e.target)) {
            popup.classList.remove('open');
          }
        });

        render();
      },

      _createPopup(wrapper) {
        const el = document.createElement('div');
        el.className = 'datepicker-popup';
        el.setAttribute('data-datepicker-popup', '');
        wrapper.appendChild(el);
        return el;
      }
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: TOOLTIP
    // ════════════════════════════════════════════════════
    const Tooltip = {
      _tooltip: null,

      init() {
        this._tooltip = document.createElement('div');
        this._tooltip.className = 'tooltip';
        document.body.appendChild(this._tooltip);

        document.addEventListener('mouseover', e => {
          const el = e.target.closest('[data-tooltip]');
          if (!el) return;
          this.show(el);
        });

        document.addEventListener('mouseout', e => {
          const el = e.target.closest('[data-tooltip]');
          if (!el) return;
          this.hide();
        });
      },

      show(el) {
        const text = el.dataset.tooltip;
        if (!text) return;

        this._tooltip.textContent = text;
        this._tooltip.classList.add('visible');

        const rect = el.getBoundingClientRect();
        const tip  = this._tooltip.getBoundingClientRect();

        const x = rect.left + rect.width / 2 - tip.width / 2;
        const y = rect.top - tip.height - 8;

        this._tooltip.style.left = `${x}px`;
        this._tooltip.style.top  = `${y}px`;
      },

      hide() {
        this._tooltip.classList.remove('visible');
      }
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: POPOVER
    // ════════════════════════════════════════════════════
    const Popover = {
      init() {
        document.addEventListener('click', e => {
          const trigger = e.target.closest('[data-popover]');
          if (!trigger) return;

          const id = trigger.dataset.popover;
          const pop = document.getElementById(id);
          if (!pop) return;

          e.stopPropagation();
          this.toggle(pop, trigger);
        });

        document.addEventListener('click', e => {
          if (!e.target.closest('.popover')) {
            $$('.popover.open').forEach(p => p.classList.remove('open'));
          }
        });
      },

      toggle(pop, trigger) {
        const open = pop.classList.toggle('open');

        if (open) {
          const rect = trigger.getBoundingClientRect();
          pop.style.left = `${rect.left}px`;
          pop.style.top  = `${rect.bottom + 8}px`;
        }
      }
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: COPY TO CLIPBOARD
    // ════════════════════════════════════════════════════
    const Clipboard = {
      init() {
        document.addEventListener('click', async e => {
          const btn = e.target.closest('[data-copy]');
          if (!btn) return;

          const target = btn.dataset.copy;
          const text = target.startsWith('#')
            ? document.querySelector(target)?.textContent
            : target;

          if (!text) return;

          try {
            await navigator.clipboard.writeText(text);

            btn.classList.add('copied');
            const original = btn.innerHTML;
            btn.innerHTML = '✓ Copied';

            setTimeout(() => {
              btn.innerHTML = original;
              btn.classList.remove('copied');
            }, 1500);

          } catch {
            console.warn('Clipboard copy failed');
          }
        });
      }
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: HOTKEYS
    // ════════════════════════════════════════════════════
    const Hotkeys = {
      _map: new Map(),

      register(key, handler) {
        this._map.set(key.toLowerCase(), handler);
      },

      init() {
        document.addEventListener('keydown', e => {
          const combo = [
            e.ctrlKey ? 'ctrl' : '',
            e.metaKey ? 'meta' : '',
            e.shiftKey ? 'shift' : '',
            e.altKey ? 'alt' : '',
            e.key.toLowerCase()
          ].filter(Boolean).join('+');

          const handler = this._map.get(combo);
          if (handler) {
            e.preventDefault();
            handler(e);
          }
        });
      }
    };


    // ════════════════════════════════════════════════════
    // COMPONENT: GLOBAL INIT
    // ════════════════════════════════════════════════════
    function init() {
      Button.init();
      Card.initFlip();
      Toggle.init();
      Range.init();
      Select.init();
      TagsInput.init();
      ColorPicker.init();
      DatePicker.init();
      Tooltip.init();
      Popover.init();
      Clipboard.init();
      Hotkeys.init();
    }

    /** Async confirm used where a modal is not wired (stats/import flows). */
    async function confirm(message) {
      const modalConfirm = window.PlasmaDeck?.Modal?.confirmAsync;
      if (typeof modalConfirm === 'function') {
        return modalConfirm({
          title: 'Confirm action',
          message: String(message ?? 'Are you sure?'),
        });
      }
      return window.confirm(String(message ?? 'Are you sure?'));
    }

    return {
      init,
      confirm,
      Button,
      Card,
      Badge,
      Avatar,
      Alert,
      Toggle,
      Range,
      Select,
      TagsInput,
      ColorPicker,
      DatePicker,
      Tooltip,
      Popover,
      Clipboard,
      Hotkeys
    };

  })();

  window.PlasmaDeck = window.PlasmaDeck ?? {};
  window.PlasmaDeck.UI = UI;



// ============================================================
// FINAL BOOTSTRAP
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  window.PlasmaDeck?.Progress?.init?.();
  window.PlasmaDeck?.UI?.init?.();
});

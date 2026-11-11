// Minimal stand-in for the Design canvas runtime, enough to render this
// canvas's artboards locally: {{holes}}, <sc-for>, <sc-if>, on* handlers,
// <helmet>, data-props defaults, DCLogic state.
(() => {
  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(patch) {
      Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch);
      window.__dcRender();
    }
    forceUpdate() {
      window.__dcRender();
    }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    let value = scope;
    for (const part of path.split('.')) {
      if (value == null) return undefined;
      value = value[part];
    }
    return value;
  }

  function interpolate(text, scope) {
    return text.replace(HOLE, (_, path) => {
      const v = lookup(path, scope);
      return v == null ? '' : String(v);
    });
  }

  function build(node, scope, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.appendChild(document.createTextNode(interpolate(node.textContent, scope)));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'helmet') return;
    if (tag === 'sc-for') {
      const list = lookup(WHOLE.exec(node.getAttribute('list'))[1], scope) || [];
      const as = node.getAttribute('as');
      list.forEach((item, index) => {
        const inner = Object.assign(Object.create(scope), { [as]: item, $index: index });
        for (const child of node.childNodes) build(child, inner, out);
      });
      return;
    }
    if (tag === 'sc-if') {
      if (lookup(WHOLE.exec(node.getAttribute('value'))[1], scope)) {
        for (const child of node.childNodes) build(child, scope, out);
      }
      return;
    }
    const el = document.createElementNS(node.namespaceURI, node.tagName);
    for (const attr of node.attributes) {
      const whole = WHOLE.exec(attr.value);
      if (/^on[A-Z]/.test(attr.name) || /^on[a-z]+$/.test(attr.name)) {
        const fn = whole ? lookup(whole[1], scope) : null;
        if (typeof fn === 'function') el.addEventListener(attr.name.slice(2).toLowerCase(), fn);
        continue;
      }
      if (attr.name.startsWith('hint-')) continue;
      el.setAttribute(attr.name, interpolate(attr.value, scope));
    }
    for (const child of node.childNodes) build(child, scope, el);
    out.appendChild(el);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const xdc = document.querySelector('x-dc');
    const template = document.createElement('template');
    template.innerHTML = xdc.innerHTML;
    const helmet = template.content.querySelector('helmet');
    if (helmet) for (const child of [...helmet.childNodes]) document.head.appendChild(child);
    const script = document.querySelector('script[data-dc-script]');
    const decl = JSON.parse(script.getAttribute('data-props') || '{}');
    const props = {};
    for (const [key, spec] of Object.entries(decl)) {
      if (spec && typeof spec === 'object' && 'default' in spec) props[key] = spec.default;
    }
    const Component = new Function('DCLogic', `${script.textContent}\nreturn Component;`)(DCLogic);
    const instance = new Component(props);
    const host = document.createElement('div');
    host.id = 'dc-root';
    xdc.replaceWith(host);
    window.__dcRender = () => {
      const scope = instance.renderVals();
      const frag = document.createDocumentFragment();
      for (const child of template.content.childNodes) build(child, scope, frag);
      host.replaceChildren(frag);
    };
    window.__dcInstance = instance;
    window.__dcRender();
  });
})();

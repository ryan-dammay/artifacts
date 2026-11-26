/* dc-lite: a small stand-in for the Claude Design canvas runtime, so the COACH search
   prototypes run on GitHub Pages. It renders a board's <template> with the component's
   renderVals(): {{holes}}, <sc-if>, <sc-for>, onX handlers and ref, and patches the page
   with morphdom so animations, transitions and input focus survive re-renders. */
(function () {
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var EVENTS = { onclick: 'click', onchange: 'input', onfocus: 'focusin', onkeydown: 'keydown', onsubmit: 'submit' };

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function str(v) { return v == null ? '' : String(v); }

  function DCLogic(props) { this.props = props || {}; this.state = null; }
  DCLogic.prototype.setState = function (patch) {
    var prev = this.state || {};
    var next = typeof patch === 'function' ? patch(prev, this.props) : patch;
    this.state = Object.assign({}, prev, next);
    if (this.__schedule) this.__schedule();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__schedule) this.__schedule(); };

  function mount(Component, tpl, root, defaults) {
    var comp = new Component(Object.assign({}, defaults));
    comp.props = Object.assign({}, defaults);
    var registry = {}, seq = 0, pending = false, mounted = false;

    function reg(fn) { var id = 'h' + (seq++); registry[id] = fn; return id; }

    function renderChildren(srcParent, outParent, scope) {
      for (var n = srcParent.firstChild; n; n = n.nextSibling) renderNode(n, outParent, scope);
    }
    function renderNode(n, out, scope) {
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue.replace(HOLE, function (_, p) { return str(lookup(p, scope)); }))); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (tag === 'sc-if') {
        var m = (n.getAttribute('value') || '').match(WHOLE);
        if (m && lookup(m[1], scope)) renderChildren(n, out, scope);
        return;
      }
      if (tag === 'sc-for') {
        var lm = (n.getAttribute('list') || '').match(WHOLE);
        var list = lm ? lookup(lm[1], scope) : null, as = n.getAttribute('as') || 'item';
        (list || []).forEach(function (item, i) {
          var s = Object.create(scope); s[as] = item; s.$index = i;
          renderChildren(n, out, s);
        });
        return;
      }
      var el = n.namespaceURI === 'http://www.w3.org/2000/svg'
        ? document.createElementNS(n.namespaceURI, n.tagName)
        : document.createElement(n.tagName);
      for (var i = 0; i < n.attributes.length; i++) {
        var a = n.attributes[i], name = a.name, val = a.value, lname = name.toLowerCase();
        if (lname.indexOf('hint-') === 0) continue;
        var whole = val.match(WHOLE);
        if (EVENTS[lname] && whole) {
          var fn = lookup(whole[1], scope);
          if (typeof fn === 'function') el.setAttribute('data-dc-on-' + EVENTS[lname], reg(fn));
          continue;
        }
        if (lname === 'ref' && whole) {
          var rf = lookup(whole[1], scope);
          if (typeof rf === 'function') el.setAttribute('data-dc-ref', reg(rf));
          continue;
        }
        var v = whole ? str(lookup(whole[1], scope)) : val.replace(HOLE, function (_, p) { return str(lookup(p, scope)); });
        if (lname === 'class') { el.setAttribute('class', v); continue; }
        el.setAttribute(name, v);
      }
      if (tag === 'input' && n.hasAttribute('value')) el.value = el.getAttribute('value');
      renderChildren(n, el, scope);
      out.appendChild(el);
    }

    function render() {
      pending = false;
      registry = {}; seq = 0;
      var vals = comp.renderVals ? comp.renderVals() || {} : {};
      var next = document.createElement('div');
      next.id = root.id;
      renderChildren(tpl.content, next, vals);
      morphdom(root, next, {
        onBeforeElUpdated: function (from, to) {
          if (from.tagName === 'INPUT' && from === document.activeElement) {
            if (from.value !== to.getAttribute('value')) from.value = to.getAttribute('value') || '';
            for (var i = 0; i < to.attributes.length; i++) {
              var a = to.attributes[i];
              if (a.name !== 'value' && from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
            }
            for (var j = from.attributes.length - 1; j >= 0; j--) {
              var b = from.attributes[j].name;
              if (b !== 'value' && !to.hasAttribute(b)) from.removeAttribute(b);
            }
            return false;
          }
          return true;
        }
      });
      var refs = root.querySelectorAll('[data-dc-ref]');
      for (var k = 0; k < refs.length; k++) { var f = registry[refs[k].getAttribute('data-dc-ref')]; if (f) f(refs[k]); }
      if (!mounted) { mounted = true; if (comp.componentDidMount) comp.componentDidMount(); }
    }
    comp.__schedule = function () { if (!pending) { pending = true; Promise.resolve().then(render); } };

    ['click', 'input', 'focusin', 'keydown', 'submit'].forEach(function (type) {
      root.addEventListener(type, function (e) {
        var stopped = false, orig = e.stopPropagation;
        e.stopPropagation = function () { stopped = true; orig.call(e); };
        for (var t = e.target; t && t !== root.parentNode; t = t.parentNode) {
          if (t.getAttribute && t.hasAttribute('data-dc-on-' + type)) {
            var fn = registry[t.getAttribute('data-dc-on-' + type)];
            if (fn) fn(e);
            if (stopped) break;
          }
          if (t === root) break;
        }
      });
    });
    render();
    window.addEventListener('pagehide', function () { if (comp.componentWillUnmount) comp.componentWillUnmount(); });
    return comp;
  }

  window.DCLogic = DCLogic;
  window.DCLite = { mount: mount };
})();

/*
 * Make Church Easy — Kinetic lower thirds engine.
 *
 * Twenty-five GSAP-driven name straps (21–25 are the "Modern" wide-italic family). The lower-third overlay renders a theme's
 * HTML (a `.kx-root` element carrying the field values as data attributes),
 * positions it, then calls `MCEKinetic.run(root, "in" | "out")`. This file
 * rebuilds the strap inside `.kx-root`, plays the in or out timeline, and
 * returns the duration in milliseconds so the overlay knows when to clear.
 *
 * Requires window.gsap (public/kinetic/gsap.min.js) to be loaded first.
 * Sizes use em: `.kx-root` sets font-size 19.2px, so 1em = 1% of a 1920px canvas.
 */
(function (global) {
  "use strict";

  var IN = "power3.out", OUT = "power2.in";

  function $(r, s) { return r.querySelector(s); }
  function $$(r, s) { return Array.prototype.slice.call(r.querySelectorAll(s)); }
  function E(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function split(el) {
    if (!el) return [];
    var t = el.textContent; el.textContent = "";
    return Array.from(t).map(function (c) {
      var s = document.createElement("span"); s.className = "ch"; s.textContent = c; el.appendChild(s); return s;
    });
  }
  function words(el, mask) {
    if (!el) return [];
    var ws = el.textContent.trim().split(/\s+/).filter(Boolean); el.textContent = "";
    return ws.map(function (w, i) {
      var n = document.createElement("span"); n.className = "i"; n.textContent = w;
      var node = n;
      if (mask) { node = document.createElement("span"); node.className = "mi"; node.appendChild(n); }
      el.appendChild(node);
      if (i < ws.length - 1) el.appendChild(document.createTextNode(" "));
      return n;
    });
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.random() * (i + 1) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function centerOut(a) {
    var c = (a.length - 1) / 2;
    return a.map(function (e, i) { return [e, Math.abs(i - c) + i * 1e-3]; }).sort(function (x, y) { return x[1] - y[1]; }).map(function (x) { return x[0]; });
  }
  function rev(a) { return a.slice().reverse(); }
  function rgba(color, a) {
    var h = String(color || "#ffffff").trim();
    var m = h.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return "rgba(255,255,255," + a + ")";
    h = m[1]; if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }
  function mix(fg, a) { return rgba(fg, a); }
  function firstWord(s) { s = String(s || "").trim(); var i = s.indexOf(" "); return i < 0 ? s : s.slice(0, i); }
  function restWords(s) { s = String(s || "").trim(); var i = s.indexOf(" "); return i < 0 ? "" : s.slice(i + 1); }
  function tl() { return global.gsap.timeline(); }

  /* ---- "Modern" family helpers (templates mx-*) ---- */
  var MX_SCALE = 0.72; // designed at 1920px sizes; 0.72 sits with the other straps
  function mxMk(tag, cls, parent, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; }
  function mxLine(parent, text, cls) {
    var l = mxMk("div", "mx-ln " + (cls || ""), parent); l.chars = [];
    Array.from(String(text == null ? "" : text)).forEach(function (ch) { l.chars.push(mxMk("span", "ch", l, ch === " " ? " " : ch)); });
    return l;
  }
  function mxZip(a, b) { return a.map(function (x, i) { return b && b[i] ? [x, b[i]] : x; }); }
  function mxRand(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function mxTl() { return global.gsap.timeline({ paused: true }); }
  var MX = {
    fade: [{ opacity: 0 }, { opacity: 1, duration: .22, ease: "power1.out" }],
    type: [{ opacity: 0 }, { opacity: 1, duration: .02, ease: "none" }],
    fill: [{ "--f": 0 }, { "--f": 1, duration: .22, ease: "power1.out", immediateRender: false }],
    rise: [{ yPercent: 105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .38, ease: "power3.out" }]
  };
  function mxSeq(x, items, fx, start, step) {
    items.forEach(function (t, i) { x.fromTo(t, Object.assign({}, fx[0]), Object.assign({}, fx[1]), start + i * step); });
  }
  function mxShow(x, items, start, step) {
    items.forEach(function (t, i) { x.fromTo(t, { display: "none" }, { display: "inline-block", duration: 0 }, start + i * step); });
  }
  function mxInv(hex) {
    var m = String(hex).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return "#ffffff";
    var h = m[1]; if (h.length === 3) h = h.split("").map(function (ch) { return ch + ch; }).join("");
    var n = parseInt(h, 16), lum = (.2126 * (n >> 16 & 255) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255;
    return lum > .55 ? "#0b0b0b" : "#ffffff";
  }
  /* Wrap an mx build (returns one paused timeline) into the engine's { tin, tout } contract. */
  function mxWrap(fn) {
    return function (r, d, c) {
      var fit = mxMk("div", "mx-fit", r), lt = mxMk("div", "mx", fit);
      lt.style.setProperty("--ink", c.fg); lt.style.setProperty("--inv", mxInv(c.fg));
      var x = fn(lt, d, c), s = MX_SCALE * (c.scale || 1);
      fit.style.width = Math.ceil(lt.offsetWidth * s) + "px";
      fit.style.height = Math.ceil(lt.offsetHeight * s) + "px";
      lt.style.transform = "scale(" + s + ")";
      var D = x.duration(), p = { t: 0 }, sync = function () { x.time(p.t); };
      var tin = tl().fromTo(p, { t: 0 }, { t: D, duration: D, ease: "none", onUpdate: sync });
      var tout = tl().fromTo(p, { t: D }, { t: 0, duration: D / 1.15, ease: "none", immediateRender: false, onUpdate: sync });
      return { tin: tin, tout: tout, render: sync };
    };
  }
  try { if (global.document && document.fonts && document.fonts.load) document.fonts.load('italic 900 100px "MCE Archivo"'); } catch (e) {}

  /*
   * Template list. `fields` = [builderKey, themeVariableKey, label, default].
   * `color` = default text colour (the reel's colour for that strap).
   */
  var T = [
    { id: "word-rise", name: "Word Rise", ref: "Jaklin Lucas", tech: "Words rise out of hidden masks", color: "#ffffff",
      fields: [["first", "firstName", "Small name", "GRACE"], ["last", "lastName", "Big name", "OKAFOR"], ["title", "title", "Title", "WORSHIP LEADER"], ["org", "organization", "Church", "CITY CHURCH"]],
      build: function (r, d) {
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<div style="display:flex;align-items:flex-end;justify-content:center;gap:.25em"><span class="mi hv" style="font-size:4.6em"><span class="i a">' + E(d.first) + '</span></span><span class="mi hv" style="font-size:7.6em"><span class="i b">' + E(d.last) + '</span></span></div>' +
          '<div class="sm t" style="font-size:1.45em;margin-top:.45em">' + E(d.title) + '</div>' +
          '<div class="rg o" style="font-size:.95em;margin-top:.55em;letter-spacing:.04em">' + E(d.org) + '</div></div>';
        var tw = words($(r, ".t"), 1), ow = words($(r, ".o"), 1), A = $(r, ".a"), B = $(r, ".b");
        var tin = tl().from(A, { yPercent: 115, duration: .4 }, .05).from(B, { yPercent: 115, duration: .45 }, .15)
          .from(tw, { yPercent: 115, duration: .35, stagger: .09 }, .28).from(ow, { yPercent: 115, duration: .35, stagger: .08 }, .4);
        var tout = tl().to(rev(ow), { yPercent: 115, duration: .22, stagger: .05, ease: OUT }, 0).to(rev(tw), { yPercent: 115, duration: .25, stagger: .06, ease: OUT }, .04)
          .to(B, { yPercent: 115, duration: .3, ease: OUT }, .12).to(A, { yPercent: 115, duration: .3, ease: OUT }, .26);
        return { tin: tin, tout: tout };
      } },

    { id: "slide-reveal", name: "Slide Reveal", ref: "Eric Estrada", tech: "Name slides out, letters fade away", color: "#ffffff",
      fields: [["first", "firstName", "First name", "DAVID"], ["last", "lastName", "Last name", "ADEYEMI"], ["role", "title", "Role", "SENIOR PASTOR"], ["org", "organization", "Church", "HOPE CHAPEL"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="padding-left:9em">' +
          '<div class="m hv" style="font-size:7.6em"><span class="i a">' + E(d.first) + '</span></div>' +
          '<div style="position:relative"><div class="m hv" style="font-size:7.6em"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="m sm" style="position:absolute;right:100%;bottom:.55em;font-size:1.25em;margin-right:.35em"><span class="i cc">' + E(d.role) + '</span></div></div>' +
          '<div class="sm o" style="font-size:1.6em;margin-left:-5.6em;margin-top:.15em">' + E(d.org) + '</div></div>';
        var b = $(r, ".blk"), A = $(r, ".a"), B = $(r, ".b"), C = $(r, ".cc"), ow = words($(r, ".o"));
        var tin = tl().from(A, { xPercent: -101, duration: .5 }, 0).from(b, { xPercent: 30, duration: .6, ease: "power3.inOut" }, .42)
          .from(B, { xPercent: -101, duration: .55 }, .5).from(C, { xPercent: 101, duration: .45 }, .72)
          .from(ow.slice(0, 1), { opacity: 0, y: ".4em", duration: .25 }, .83).fromTo(ow.slice(1), { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .35 }, .95);
        var ca = split(A), cb = split(B), cc = split(C), co = ow.reduce(function (acc, w) { return acc.concat(split(w)); }, []);
        var f = { opacity: 0, duration: .14, ease: "none" };
        var tout = tl().to(ca, Object.assign({}, f, { stagger: .07 }), 0).to(cb, Object.assign({}, f, { stagger: .06 }), .02)
          .to(cc, Object.assign({}, f, { stagger: .03 }), .05).to(co, Object.assign({}, f, { stagger: .025 }), .08);
        return { tin: tin, tout: tout };
      } },

    { id: "outline-bloom", name: "Outline Bloom", ref: "Kate Mager", tech: "Outline letters bloom from the centre", color: "#ffffff",
      fields: [["org", "organization", "Church", "VICTORY CHURCH"], ["first", "firstName", "First name (light)", "MERCY"], ["last", "lastName", "Last name (heavy)", "JOHNSON"], ["role", "title", "Role", "GUEST SPEAKER"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<div class="sm co" style="font-size:1.2em;letter-spacing:.45em;padding-left:.45em;margin-bottom:.5em">' + E(d.org) + '</div>' +
          '<div class="ol" style="font-size:7.4em"><span class="lg f" style="letter-spacing:-.02em">' + E(d.first) + '</span><span class="hv l">' + E(d.last) + '</span></div>' +
          '<div class="rg ro" style="font-size:1.15em;text-align:right;margin-top:.35em">' + E(d.role) + '</div></div>';
        var co = split($(r, ".co")), nm = split($(r, ".f")).concat(split($(r, ".l"))), ro = split($(r, ".ro")), ord = centerOut(nm);
        var tin = tl().fromTo(co, { opacity: 0 }, { opacity: 1, duration: .15, stagger: .035 }, .03)
          .fromTo(ord, { opacity: 0, color: c.fg0 }, { opacity: 1, duration: .15, stagger: .05, ease: "none" }, .15)
          .to(ord, { color: c.fg, duration: .28, stagger: .05, ease: "power1.inOut" }, .3)
          .fromTo(ro, { opacity: 0 }, { opacity: 1, duration: .12, stagger: .06 }, .38);
        var ro2 = rev(ord);
        var tout = tl().to(rev(co), { opacity: 0, duration: .1, stagger: .025 }, 0).to(rev(ro), { opacity: 0, duration: .1, stagger: .04 }, 0)
          .to(ro2, { color: c.fg0, duration: .18, stagger: .04 }, .05).to(ro2, { opacity: 0, duration: .12, stagger: .04 }, .17);
        return { tin: tin, tout: tout };
      } },

    { id: "flicker-stack", name: "Flicker Stack", ref: "Kevin Paulino", tech: "Stacked rise with a flickering tag", color: "#0d1d27",
      fields: [["first", "firstName", "First name", "SAMUEL"], ["last", "lastName", "Last name", "MENSAH"], ["tag", "title", "Tag", "ELDER"], ["org", "organization", "Church", "LIVING WORD ASSEMBLY"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk">' +
          '<div style="display:flex;align-items:flex-end"><div class="m hv" style="font-size:6.6em"><span class="i a">' + E(d.first) + '</span></div>' +
          '<div class="sm tg" style="margin-left:auto;padding-left:.9em;padding-bottom:.45em;font-size:1.25em">' + E(d.tag) + '</div></div>' +
          '<div class="m hv" style="font-size:6.6em"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="sm o" style="font-size:1.25em;margin-top:.7em">' + E(d.org) + '</div></div>';
        var A = $(r, ".a"), B = $(r, ".b"), tg = split($(r, ".tg")), ow = words($(r, ".o"), 1);
        var tin = tl().from(A, { yPercent: 115, duration: .38 }, .06).from(B, { yPercent: 115, duration: .42 }, .15).from(ow, { yPercent: 115, duration: .3, stagger: .1 }, .5);
        tg.forEach(function (ch) {
          tin.fromTo(ch, { opacity: 0, color: c.sub }, { keyframes: [{ opacity: .7, duration: .05 }, { opacity: .15, duration: .05 }, { opacity: .8, duration: .05 }, { opacity: 1, color: c.fg, duration: .15 }], ease: "none" }, .22 + Math.random() * .38);
        });
        var tout = tl().to(tg, { opacity: 0, duration: .08, stagger: .035 }, 0).to(rev(ow), { yPercent: 115, duration: .22, stagger: .04, ease: OUT }, 0)
          .to(B, { yPercent: 115, duration: .28, ease: OUT }, .12).to(A, { yPercent: 115, duration: .28, ease: OUT }, .2);
        return { tin: tin, tout: tout };
      } },

    { id: "light-heavy", name: "Light & Heavy", ref: "Hunter Jacobs", tech: "Light name fades, heavy name shuffles in", color: "#ffffff",
      fields: [["first", "firstName", "First name (light)", "JOSHUA"], ["last", "lastName", "Last name (heavy)", "BELLO"], ["title", "title", "Title", "YOUTH PASTOR"], ["org", "organization", "Church", "GRACE COMMUNITY CHURCH"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk">' +
          '<div style="display:flex;align-items:center"><span class="lg f" style="font-size:6.4em;letter-spacing:-.02em">' + E(d.first) + '</span>' +
          '<div style="margin-left:.6em;line-height:1.15;padding-top:.6em"><div class="rg t1" style="font-size:1em">' + E(d.title) + '</div><div class="sm t2" style="font-size:.85em">' + E(d.org) + '</div></div></div>' +
          '<div class="hv ol l" style="font-size:6.4em;text-align:right">' + E(d.last) + '</div></div>';
        var fc = split($(r, ".f")), lc = shuffle(split($(r, ".l"))), t1 = split($(r, ".t1")), t2 = split($(r, ".t2"));
        var tin = tl().fromTo(fc, { opacity: 0 }, { opacity: 1, duration: .2, stagger: .1, ease: "none" }, .05)
          .fromTo(lc, { opacity: 0, color: c.fg0 }, { opacity: 1, duration: .12, stagger: .07, ease: "none" }, .2)
          .to(lc, { color: c.fg, duration: .25, stagger: .07, ease: "none" }, .4)
          .fromTo(t1, { opacity: 0 }, { opacity: 1, duration: .06, stagger: .035 }, .37).fromTo(t2, { opacity: 0 }, { opacity: 1, duration: .05, stagger: .02 }, .47);
        var tout = tl().to(fc, { opacity: 0, duration: .15, stagger: .07, ease: "none" }, .12)
          .to(lc, { color: c.fg0, duration: .2, stagger: .06, ease: "none" }, .12).to(lc, { opacity: 0, duration: .1, stagger: .06 }, .3)
          .to(rev(t1), { opacity: 0, duration: .05, stagger: .03 }, 0).to(rev(t2), { opacity: 0, duration: .05, stagger: .02 }, .05);
        return { tin: tin, tout: tout };
      } },

    { id: "ruled-rise", name: "Ruled Rise", ref: "Mark Madson", tech: "Ruled label, tilted letters rise", color: "#ffffff",
      fields: [["org", "organization", "Label", "FAITH TABERNACLE"], ["first", "firstName", "First name", "PETER"], ["last", "lastName", "Last name", "OBI"], ["title", "title", "Title", "ASSOCIATE PASTOR"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:right">' +
          '<div style="display:inline-block;text-align:center">' +
          '<div style="display:inline-block;position:relative;padding:0 .8em .35em"><span class="sm lb" style="font-size:1.05em">' + E(d.org) + '</span><i class="rule rl" style="position:absolute;left:0;right:0;bottom:0;height:.16em"></i></div>' +
          '<div class="m hv" style="font-size:7.2em;margin-top:.04em"><span class="i a">' + E(d.first) + '</span></div></div>' +
          '<div class="m hv" style="font-size:3.9em"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="sm st" style="font-size:.9em;margin-top:.6em">' + E(d.title) + '</div></div>';
        var lw = words($(r, ".lb"), 1), ac = split($(r, ".a")), bc = split($(r, ".b")), st = $(r, ".st"), rl = $(r, ".rl");
        var fr = { yPercent: 125, rotate: 16, transformOrigin: "0% 100%" };
        var tin = tl().from(rl, { scaleX: 0, transformOrigin: "0% 50%", duration: .45, ease: "power2.out" }, .06).from(lw, { yPercent: 115, duration: .3, stagger: .17 }, .08)
          .from(ac, Object.assign({}, fr, { duration: .4, stagger: .1 }), .1).from(bc, Object.assign({}, fr, { duration: .32, stagger: .06 }), .32)
          .fromTo(st, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .3 }, .6);
        var tout = tl().to(st, { opacity: 0, duration: .15 }, 0).to(ac, Object.assign({}, fr, { duration: .28, stagger: { each: .07, from: "end" }, ease: OUT }), 0)
          .to(bc, Object.assign({}, fr, { duration: .24, stagger: { each: .04, from: "end" }, ease: OUT }), .03).to(rev(lw), { yPercent: 115, duration: .22, stagger: .08, ease: OUT }, .06)
          .to(rl, { scaleX: 0, transformOrigin: "0% 50%", duration: .3, ease: "power2.inOut" }, .15);
        return { tin: tin, tout: tout };
      } },

    { id: "split-line", name: "Split Line", ref: "Latoya McGowan", tech: "A centre line splits name and labels", color: "#ffffff",
      fields: [["l1", "title", "Label 1", "MINISTER"], ["l2", "organization", "Label 2", "CITY CHURCH"], ["first", "firstName", "First name", "ESTHER"], ["last", "lastName", "Last name", "ADEBAYO"]],
      build: function (r, d) {
        r.innerHTML = '<div class="blk" style="margin-left:9em"><i class="rule vl" style="position:absolute;left:0;top:-.15em;bottom:-.15em;width:.2em"></i>' +
          '<div style="padding-left:.55em"><div class="m hv" style="font-size:5.8em"><span class="i a">' + E(d.first) + '</span></div><div class="m hv" style="font-size:5.8em"><span class="i b">' + E(d.last) + '</span></div></div>' +
          '<div class="sm" style="position:absolute;right:100%;top:.75em;padding-right:.55em;text-align:right;font-size:1.2em;line-height:1.3"><div class="m"><span class="i cc">' + E(d.l1) + '</span></div><div class="m"><span class="i dd">' + E(d.l2) + '</span></div></div></div>';
        var A = $(r, ".a"), B = $(r, ".b"), C = $(r, ".cc"), D = $(r, ".dd"), vl = $(r, ".vl");
        var tin = tl().from(vl, { scaleY: 0, duration: .28, ease: "power2.out" }, .05).from(A, { xPercent: -101, duration: .5 }, .27).from(B, { xPercent: -101, duration: .5 }, .36)
          .from(C, { xPercent: 101, duration: .45 }, .45).from(D, { xPercent: 101, duration: .45 }, .5);
        var f = { opacity: 0, duration: .12, ease: "none" };
        var tout = tl().to(split(C).concat(split(D)), Object.assign({}, f, { stagger: .015 }), 0).to(split(A), Object.assign({}, f, { stagger: .06 }), .06)
          .to(split(B), Object.assign({}, f, { stagger: .05 }), .1).to(vl, { opacity: 0, duration: .1 }, .1);
        return { tin: tin, tout: tout };
      } },

    { id: "block-wipe", name: "Block Wipe", ref: "Mike Butler", tech: "White block wipes in, folds into a corner rule", color: "#ffffff",
      fields: [["first", "firstName", "First name", "DANIEL"], ["last", "lastName", "Last name", "EZE"], ["title", "title", "Title (two words)", "MEDIA DIRECTOR"], ["org", "organization", "Church", "KINGDOM LIFE CHURCH"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk"><div class="nw" style="position:relative;display:inline-block">' +
          '<div class="nm" style="padding-left:.7em;padding-bottom:.55em"><div class="hv" style="font-size:7.8em;line-height:.84">' + E(d.first) + '<br>' + E(d.last) + '</div></div>' +
          '<i class="rule vl" style="position:absolute;left:0;top:0;bottom:.5em;width:.2em"></i><i class="rule hl" style="position:absolute;left:0;bottom:.5em;height:.2em;width:112%"></i>' +
          '<i class="rule bar" style="position:absolute;top:0;bottom:.55em;left:0;width:0"></i></div>' +
          '<div class="sm" style="font-size:1.3em;padding-left:.55em;line-height:1;margin-top:.4em"><span class="mi"><span class="i t1">' + E(firstWord(d.title)) + '</span></span> <span class="i t2">' + E(restWords(d.title)) + '</span></div>' +
          '<div class="rg og" style="font-size:1.05em;letter-spacing:.32em;padding-left:.7em;margin-top:.55em">' + E(d.org) + '</div></div>';
        var nm = $(r, ".nm"), bar = $(r, ".bar"), vl = $(r, ".vl"), hl = $(r, ".hl"), t1 = $(r, ".t1"), t2 = $(r, ".t2"), og = split($(r, ".og"));
        var p = { l: 1.35, r: 1.38 };
        var draw = function () {
          bar.style.left = (p.l * 100) + "%"; bar.style.width = Math.max(0, (p.r - p.l) * 100) + "%";
          nm.style.clipPath = "inset(0 0 0 " + Math.max(0, p.r * 100) + "%)";
        };
        draw(); global.gsap.set(vl, { opacity: 0 }); global.gsap.set(hl, { scaleX: 0, transformOrigin: "0% 50%" });
        var tin = tl().to(p, { l: 0, duration: .42, ease: "power3.out", onUpdate: draw }, .03).to(p, { r: .012, duration: .36, ease: "power2.inOut", onUpdate: draw }, .2)
          .set(vl, { opacity: 1 }, .48).set(bar, { opacity: 0 }, .48)
          .to(vl, { scaleY: 0, transformOrigin: "50% 0%", duration: .18, ease: "power2.in" }, .5).to(hl, { scaleX: 1, duration: .3, ease: "power2.out" }, .55)
          .from(t1, { yPercent: 115, duration: .3 }, .42).from(t2, { y: "-1em", opacity: 0, duration: .3 }, .62)
          .fromTo(og, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .15, stagger: .025 }, .47);
        var tout = tl().to(t2, { y: "-1em", opacity: 0, duration: .2, ease: OUT }, 0).to(rev(og), { opacity: 0, duration: .08, stagger: .015 }, 0).to(t1, { yPercent: 115, duration: .22, ease: OUT }, .06)
          .to(hl, { scaleX: 0, duration: .18, ease: OUT }, .05).to(vl, { scaleY: 1, transformOrigin: "50% 100%", duration: .15 }, .18)
          .set(bar, { opacity: 1 }, .32).set(vl, { opacity: 0 }, .32)
          .to(p, { r: 1, duration: .22, ease: "power2.in", onUpdate: draw }, .32).to(p, { l: 1.3, r: 1.36, duration: .32, ease: "power3.in", onUpdate: draw }, .52).to(bar, { opacity: 0, duration: .06 }, .84);
        return { tin: tin, tout: tout, render: draw };
      } },

    { id: "line-slide", name: "Line Slide", ref: "Rachel Klein", tech: "Lines slide out from a vertical rule", color: "#ffffff",
      fields: [["first", "firstName", "First name", "RUTH"], ["last", "lastName", "Last name", "OKON"], ["org", "organization", "Church", "WATERMARK COMMUNITY CHURCH"], ["role", "title", "Role", "PASTOR"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk"><i class="rule vl" style="position:absolute;left:0;top:-.2em;bottom:-.2em;width:.2em"></i>' +
          '<div style="padding-left:.9em"><div class="m hv" style="font-size:5.8em"><span class="i a">' + E(d.first) + '</span></div><div class="m hv" style="font-size:5.8em"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="m sm" style="font-size:1.25em;margin-top:.7em"><span class="i cc">' + E(d.org) + '</span></div>' +
          '<div class="m rg" style="font-size:.95em;margin-top:.5em"><span class="i dd">' + E(d.role) + '</span></div></div></div>';
        var A = $(r, ".a"), B = $(r, ".b"), C = $(r, ".cc"), D = $(r, ".dd"), vl = $(r, ".vl"), cw = words(C);
        var tin = tl().from(vl, { scaleY: 0, transformOrigin: "50% 0%", duration: .3, ease: "power2.out" }, 0).from(A, { xPercent: -101, duration: .45 }, 0).from(B, { xPercent: -101, duration: .45 }, .2)
          .from(C, { xPercent: -101, duration: .4 }, .43).fromTo(cw.slice(1), { opacity: .25, color: c.sub }, { opacity: 1, color: c.fg, duration: .3 }, .6)
          .from(D, { xPercent: -101, duration: .4 }, .62).fromTo(D, { opacity: .6 }, { opacity: .85, duration: .3 }, .62);
        var tout = tl().to(A, { yPercent: 115, duration: .3, ease: OUT }, .08).to(B, { yPercent: 115, duration: .3, ease: OUT }, .18).to(C, { yPercent: 115, duration: .25, ease: OUT }, .3)
          .to(D, { yPercent: 115, duration: .22, ease: OUT }, .44).to(vl, { scaleY: 0, transformOrigin: "50% 100%", duration: .3, ease: "power2.inOut" }, .32);
        return { tin: tin, tout: tout };
      } },

    { id: "random-outline", name: "Random Outline", ref: "Stefanie Dolas", tech: "Letters appear as outlines in random order, then fill", color: "#ffffff",
      fields: [["top", "organization", "Top line", "WOMEN OF PURPOSE CONFERENCE"], ["first", "firstName", "First name", "DEBORAH"], ["last", "lastName", "Last name", "COLE"], ["sub", "title", "Bottom line", "CONFERENCE HOST"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk">' +
          '<div class="sm tp" style="font-size:1.3em;margin:0 0 .45em .12em">' + E(d.top) + '</div>' +
          '<div class="rg ol" style="font-size:8.6em;line-height:.9;letter-spacing:-.02em"><div class="f">' + E(d.first) + '</div><div class="l">' + E(d.last) + '</div></div>' +
          '<div class="sm sb" style="font-size:1.15em;margin:.7em 0 0 .12em">' + E(d.sub) + '</div></div>';
        var nm = shuffle(split($(r, ".f")).concat(split($(r, ".l")))), tw = words($(r, ".tp")), sw = words($(r, ".sb"));
        var tin = tl().fromTo(nm, { opacity: 0, color: c.fg0 }, { opacity: 1, duration: .15, stagger: .055, ease: "none" }, .03)
          .to(nm, { color: c.fg, duration: .3, stagger: .055, ease: "power1.inOut" }, .3)
          .fromTo(tw, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .25, stagger: .2 }, .4).fromTo(sw, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .25, stagger: .15 }, .55);
        var tout = tl().to(tw, { opacity: 0, duration: .2, stagger: .1 }, .2).to(rev(sw), { opacity: 0, duration: .2, stagger: .1 }, .2)
          .to(nm, { color: c.fg0, duration: .2, stagger: .035 }, .2).to(nm, { opacity: 0, duration: .15, stagger: .035 }, .38);
        return { tin: tin, tout: tout };
      } },

    { id: "tight-rise", name: "Tight Rise", ref: "Shirley Sweeney", tech: "Tight-leaded letters rise in a ripple", color: "#122a2b",
      fields: [["first", "firstName", "First name", "BLESSING"], ["last", "lastName", "Last name", "NWOSU"], ["org", "organization", "Church", "RESTORATION CHAPEL"], ["role", "title", "Role", "CHOIR DIRECTOR"]],
      build: function (r, d) {
        r.innerHTML = '<div class="blk" style="line-height:.8">' +
          '<div class="m hv" style="font-size:5.9em"><span class="i a">' + E(d.first) + '</span></div><div class="m hv" style="font-size:5.9em"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="sm o" style="font-size:1.4em;margin-top:.9em">' + E(d.org) + '</div>' +
          '<div class="m rg" style="font-size:1.05em;margin-top:.35em"><span class="i ro">' + E(d.role) + '</span></div></div>';
        var ac = split($(r, ".a")), bc = split($(r, ".b")), ow = words($(r, ".o"), 1), ro = $(r, ".ro");
        var tin = tl().from(ac, { yPercent: 115, duration: .3, stagger: .03 }, .03).from(bc, { yPercent: 115, duration: .3, stagger: .035 }, .1)
          .from(ow.slice(0, 1), { yPercent: 115, duration: .3 }, .33).from(ow.slice(1), { yPercent: 115, duration: .28, stagger: .13 }, .6).from(ro, { yPercent: 115, duration: .3 }, .5);
        var tout = tl().to(rev(ow.slice(1)), { yPercent: 115, duration: .2, stagger: .1, ease: OUT }, .1).to(ac, { yPercent: 115, duration: .22, stagger: .02, ease: OUT }, .3)
          .to(bc, { yPercent: 115, duration: .22, stagger: .02, ease: OUT }, .4).to(ow.slice(0, 1).concat([ro]), { yPercent: 115, duration: .22, ease: OUT }, .5);
        return { tin: tin, tout: tout };
      } },

    { id: "heavy-light-rise", name: "Heavy over Light", ref: "Oliver Reed", tech: "Right-aligned letters rise, heavy over light", color: "#ffffff",
      fields: [["hd", "title", "Top line", "HEAD OF PROTOCOL"], ["co", "organization", "Church (two words)", "COVENANT HOUSE"], ["first", "firstName", "First name", "MICHAEL"], ["last", "lastName", "Last name", "ODU"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:right">' +
          '<div class="rg hd" style="font-size:1.05em;margin-bottom:.3em">' + E(d.hd) + '</div>' +
          '<div class="sm" style="font-size:1.25em;margin-bottom:.45em"><span class="i c1">' + E(firstWord(d.co)) + '</span> <span class="i c2" style="position:relative;top:-.2em">' + E(restWords(d.co)) + '</span></div>' +
          '<div class="m hv" style="font-size:7.2em"><span class="i a">' + E(d.first) + '</span></div><div class="m rg" style="font-size:7.2em;letter-spacing:-.01em"><span class="i b">' + E(d.last) + '</span></div></div>';
        var ac = split($(r, ".a")), bc = split($(r, ".b")), c1 = $(r, ".c1"), c2 = $(r, ".c2"), hd = $(r, ".hd");
        var tin = tl().from(ac, { yPercent: 115, duration: .35, stagger: .07 }, .05).from(bc, { yPercent: 115, duration: .35, stagger: .08 }, .12)
          .fromTo(c1, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .25 }, .23).from(c2, { y: ".6em", opacity: 0, duration: .25 }, .53).from(hd, { y: "-.5em", opacity: 0, duration: .25 }, .6);
        var tout = tl().to([hd, c2], { opacity: 0, y: "-.3em", duration: .25 }, 0).to(ac, { yPercent: 115, duration: .25, stagger: { each: .05, from: "end" }, ease: OUT }, .12)
          .to(bc, { yPercent: 115, duration: .25, stagger: { each: .05, from: "end" }, ease: OUT }, .15).to(c1, { opacity: 0, duration: .25 }, .42);
        return { tin: tin, tout: tout };
      } },

    { id: "stepped-rise", name: "Stepped Rise", ref: "Denise Porter", tech: "Words climb in steps and settle", color: "#0c0c0c",
      fields: [["first", "firstName", "First name (regular)", "ABIGAIL"], ["last", "lastName", "Last name (heavy)", "AKANDE"], ["org", "organization", "Church", "GOSPEL FAITH MISSION"], ["role", "title", "Role", "USHER LEAD"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<div class="m rg" style="font-size:5em;padding-bottom:.9em;margin-bottom:-.9em;letter-spacing:-.02em"><span class="i a">' + E(d.first) + '</span></div>' +
          '<div class="m hv" style="font-size:6.4em;position:relative"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="sm o" style="font-size:1.1em;margin-top:.8em">' + E(d.org) + '</div>' +
          '<div class="rg ro" style="font-size:1em;letter-spacing:calc(var(--ls,.38) * 1em);padding-left:.38em;margin-top:.7em">' + E(d.role) + '</div></div>';
        var A = $(r, ".a"), B = $(r, ".b"), ow = words($(r, ".o"), 1), ro = $(r, ".ro");
        var tin = tl().from(B, { yPercent: 115, duration: .36 }, .03).from(A, { yPercent: 150, duration: .34 }, .05);
        ow.forEach(function (w, i) {
          tin.fromTo(w, { yPercent: 115 }, { keyframes: [{ yPercent: -40 * i, duration: .25, ease: IN }, { yPercent: 0, duration: .3, ease: "power2.inOut" }] }, .1 + i * .13);
        });
        tin.fromTo(ro, { opacity: 0, color: c.sub, "--ls": .7 }, { opacity: 1, color: c.fg, "--ls": .38, duration: .45 }, .45);
        var tout = tl().to(ro, { opacity: 0, duration: .15 }, 0).to(rev(ow), { yPercent: 115, duration: .22, stagger: .1, ease: OUT }, .05)
          .to(A, { yPercent: 150, duration: .25, ease: OUT }, .12).to(B, { yPercent: 115, duration: .25, ease: OUT }, .3);
        return { tin: tin, tout: tout };
      } },

    { id: "rule-lift", name: "Rule Lift", ref: "Maria Bradshow", tech: "A travelling rule lifts the name into place", color: "#ffffff",
      fields: [["first", "firstName", "First name", "FAITH"], ["last", "lastName", "Last name", "OGUNLEYE"], ["org", "organization", "Church", "NEW LIFE CHURCH"], ["role", "title", "Role", "TEACHER"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<div class="m hv" style="font-size:3.9em"><span class="i a">' + E(d.first) + '</span></div><div class="m hv" style="font-size:7.2em"><span class="i b">' + E(d.last) + '</span></div>' +
          '<i class="rule rl" style="height:.16em;margin:.5em 0 .9em"></i>' +
          '<div class="og"><div class="sm o" style="font-size:1.35em">' + E(d.org) + '</div><div class="m rg" style="font-size:.95em;margin-top:.3em"><span class="i ro">' + E(d.role) + '</span></div></div></div>';
        var A = $(r, ".a"), B = $(r, ".b"), rl = $(r, ".rl"), og = $(r, ".og"), ow = words($(r, ".o")), ro = $(r, ".ro");
        var up = function () { return -rl.offsetTop; };
        var tin = tl().fromTo([rl, og], { y: up }, { y: 0, duration: .4, ease: "power3.inOut" }, .62).from(rl, { scaleX: 0, duration: .4, ease: "power2.out" }, .03)
          .fromTo(ow.slice(0, 1), { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .3 }, .72).fromTo(ow.slice(1), { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .25 }, .93)
          .from(A, { yPercent: 115, duration: .3 }, .85).from(B, { yPercent: 115, duration: .35 }, .93).from(ro, { yPercent: 115, duration: .25 }, 1.02);
        var tout = tl().to(ro, { opacity: 0, duration: .12 }, 0).to(B, { yPercent: 115, duration: .18, ease: OUT }, .06).to(rl, { scaleX: 0, duration: .15, ease: OUT }, .15)
          .to(A, { yPercent: 115, duration: .15, ease: OUT }, .2).to(rev(ow), { opacity: 0, duration: .22, stagger: .04 }, .23);
        return { tin: tin, tout: tout };
      } },

    { id: "overlap-rise", name: "Overlap Rise", ref: "Rita Brexton", tech: "Lines rise over each other, grey words turn white", color: "#ffffff",
      fields: [["title", "title", "Title", "WORSHIP PASTOR"], ["first", "firstName", "First name", "JOY"], ["last", "lastName", "Last name", "AMADI"], ["org", "organization", "Church", "HOUSE ON THE ROCK"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<div class="sm t" style="font-size:1.25em;margin-bottom:.15em">' + E(d.title) + '</div>' +
          '<div class="m hv" style="font-size:6.6em;padding-bottom:.6em;margin-bottom:-.6em"><span class="i a">' + E(d.first) + '</span></div>' +
          '<div class="m hv" style="font-size:6.6em;position:relative"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="sm o" style="font-size:1.45em;margin-top:.55em">' + E(d.org) + '</div></div>';
        var A = $(r, ".a"), B = $(r, ".b"), tw = words($(r, ".t"), 1), ow = words($(r, ".o"), 1);
        var tin = tl().from(B, { yPercent: 115, duration: .3 }, .06).from(A, { yPercent: 160, duration: .32 }, .08)
          .from(tw.slice(0, 1), { yPercent: 115, duration: .25 }, .22).fromTo(tw.slice(1), { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .3 }, .42)
          .from(ow.slice(0, 2), { yPercent: 115, duration: .25, stagger: .1 }, .2).fromTo(ow.slice(2), { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .3 }, .55);
        var tout = tl().to(tw.concat(ow), { yPercent: 115, duration: .2, ease: OUT }, 0).to(A, { yPercent: 160, duration: .22, ease: OUT }, .05).to(B, { yPercent: 115, duration: .22, ease: OUT }, .12);
        return { tin: tin, tout: tout };
      } },

    { id: "pop-rise", name: "Pop Rise", ref: "David Bruce", tech: "Letters pop up with a tilt and bounce", color: "#ffffff",
      fields: [["title", "title", "Title", "EVANGELIST"], ["first", "firstName", "First name", "JAMES"], ["last", "lastName", "Last name", "ADU"], ["org", "organization", "Church", "HARVEST CHURCH"]],
      build: function (r, d) {
        r.innerHTML = '<div class="blk">' +
          '<div class="m sm" style="font-size:1em"><span class="i t">' + E(d.title) + '</span></div>' +
          '<div class="m hv" style="font-size:7.4em"><span class="i a">' + E(d.first) + '</span></div><div class="m hv" style="font-size:7.4em"><span class="i b">' + E(d.last) + '</span></div>' +
          '<div class="rg o" style="font-size:1.25em;text-align:right;margin-top:.15em">' + E(d.org) + '</div></div>';
        var ac = split($(r, ".a")), bc = split($(r, ".b")), tc = split($(r, ".t")), ow = words($(r, ".o"), 1);
        var fr = { yPercent: 130, rotate: -20, transformOrigin: "50% 100%" };
        var tin = tl().from(ac, Object.assign({}, fr, { duration: .45, stagger: .06, ease: "back.out(1.7)" }), 0).from(bc, Object.assign({}, fr, { duration: .45, stagger: .06, ease: "back.out(1.7)" }), .1)
          .from(tc, { yPercent: 115, duration: .2, stagger: .025 }, .33).from(ow, { yPercent: 115, duration: .28, stagger: .15 }, .33);
        var tout = tl().to(tc.concat(ow), { yPercent: 115, duration: .18, ease: OUT }, 0).to(ac, Object.assign({}, fr, { duration: .25, stagger: .04, ease: OUT }), .05).to(bc, Object.assign({}, fr, { duration: .25, stagger: .04, ease: OUT }), .1);
        return { tin: tin, tout: tout };
      } },

    { id: "zoom-settle", name: "Zoom Settle", ref: "Lisa Zarling", tech: "Oversized grey letters shrink into place", color: "#ffffff",
      fields: [["first", "firstName", "First name", "SARAH"], ["last", "lastName", "Last name", "ADEOLA"], ["title", "title", "Title words", "CHURCH ADMINISTRATOR"], ["org", "organization", "Church", "CITY OF DAVID"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<div style="font-size:6.8em;font-weight:800;line-height:.86;letter-spacing:-.02em"><div class="a">' + E(d.first) + '</div><div class="b">' + E(d.last) + '</div></div>' +
          '<div class="rg t" style="font-size:1.05em;letter-spacing:.32em;word-spacing:.9em;margin-top:.9em">' + E(d.title) + '</div>' +
          '<div class="sm o" style="font-size:1.35em;margin-top:.55em">' + E(d.org) + '</div></div>';
        var nm = split($(r, ".a")).concat(split($(r, ".b"))), tw = words($(r, ".t")), o = $(r, ".o");
        var tin = tl().fromTo(nm, { scale: 1.75, x: ".18em", y: ".3em", opacity: 0, color: c.sub }, { keyframes: [{ opacity: .7, duration: .12, ease: "none" }, { scale: 1, x: 0, y: 0, opacity: 1, color: c.fg, duration: .38, ease: IN }], stagger: .055 }, .06)
          .fromTo(tw, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .25, stagger: .17 }, .45).fromTo(o, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .3 }, .85);
        var tout = tl().to(tw.concat([o]), { opacity: 0, duration: .2 }, 0).to(rev(nm), { scale: 1.5, opacity: 0, color: c.sub, duration: .28, stagger: .03, ease: OUT }, .05);
        return { tin: tin, tout: tout };
      } },

    { id: "bar-reveal", name: "Bar Reveal", ref: "Jason Johnson", tech: "Solid bars sweep across and reveal each line", color: "#ececec",
      fields: [["first", "firstName", "First name", "PAUL"], ["last", "lastName", "Last name", "OYELARAN"], ["org", "organization", "Church", "GRACE CITY"], ["role", "title", "Role", "LEAD PASTOR"]],
      build: function (r, d) {
        function line(cls, size, txt, extra) {
          return '<div><div class="bl ' + cls + '" style="position:relative;display:inline-block;font-size:' + size + 'em;' + (extra || "") + '"><span class="tx">' + E(txt) + '</span><i class="rule bar" style="position:absolute;left:-.08em;right:-.08em;top:.04em;bottom:.04em"></i></div></div>';
        }
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<i class="rule h1" style="position:absolute;left:12%;right:20%;top:-.9em;height:.12em"></i>' +
          line("hv", 6.6, d.first) + line("hv", 6.6, d.last) + line("rg", 1.6, d.org, "margin-top:.35em") + line("sm", 1.2, d.role, "letter-spacing:.35em;padding-left:.35em;margin-top:.35em") +
          '<i class="rule h2" style="position:absolute;left:30%;right:5%;bottom:-.8em;height:.12em"></i></div>';
        var L = $$(r, ".bl"), h = [$(r, ".h1"), $(r, ".h2")], tin = tl(), tout = tl();
        global.gsap.set(h, { scaleX: 0, transformOrigin: "0% 50%" });
        tin.to(h, { scaleX: 1, duration: .35, stagger: .12, ease: "power2.out" }, .08).to(h, { scaleX: 0, transformOrigin: "100% 50%", duration: .3, stagger: .1, ease: "power2.in" }, .75);
        L.forEach(function (el, i) {
          var bar = $(el, ".bar"), tx = $(el, ".tx"), t = [.05, .15, .3, .45][i];
          global.gsap.set(tx, { opacity: 0 }); global.gsap.set(bar, { scaleX: 0, transformOrigin: "0% 50%" });
          tin.to(bar, { scaleX: 1, duration: .3, ease: "power3.inOut" }, t).set(tx, { opacity: 1 }, t + .3).to(bar, { scaleX: 0, transformOrigin: "100% 50%", duration: .32, ease: "power3.inOut" }, t + .32);
          var u = [.08, 0, .12, .05][i];
          tout.set(bar, { transformOrigin: "0% 50%" }, u).to(bar, { scaleX: 1, duration: .22, ease: "power3.inOut" }, u).set(tx, { opacity: 0 }, u + .22).to(bar, { scaleX: 0, transformOrigin: "100% 50%", duration: .25, ease: "power3.inOut" }, u + .24);
        });
        return { tin: tin, tout: tout };
      } },

    { id: "rule-drop", name: "Rule Drop", ref: "Mary Bender", tech: "The name drops down from a drawn rule", color: "#ffffff",
      fields: [["l1", "title", "Label line 1", "DIRECTOR OF MISSIONS"], ["l2", "organization", "Label line 2", "TRINITY BAPTIST CHURCH"], ["first", "firstName", "First name", "HANNAH"], ["last", "lastName", "Last name", "IDOWU"]],
      build: function (r, d) {
        r.innerHTML = '<div class="blk">' +
          '<div class="rg l1" style="font-size:1.3em;line-height:1.2">' + E(d.l1) + '</div><div class="sm l2" style="font-size:1em">' + E(d.l2) + '</div>' +
          '<i class="rule rl" style="height:.16em;width:77%;margin:.7em 0 .5em"></i>' +
          '<div class="m hv" style="font-size:6em"><span class="i a">' + E(d.first) + '</span></div><div class="m hv" style="font-size:6em"><span class="i b">' + E(d.last) + '</span></div></div>';
        var w1 = words($(r, ".l1"), 1), w2 = words($(r, ".l2"), 1), rl = $(r, ".rl"), A = $(r, ".a"), B = $(r, ".b");
        var ws = []; for (var i = 0; i < Math.max(w1.length, w2.length); i++) { if (w1[i]) ws.push(w1[i]); if (w2[i]) ws.push(w2[i]); }
        var tin = tl().from(rl, { scaleX: 0, transformOrigin: "0% 50%", duration: .5, ease: "power2.out" }, .1)
          .fromTo(ws, { yPercent: 115, opacity: .4 }, { yPercent: 0, opacity: 1, duration: .3, stagger: .05 }, .58)
          .from(A, { yPercent: -115, duration: .35 }, .62).from(B, { yPercent: -230, duration: .4 }, .64);
        var tout = tl().to(ws, { yPercent: 115, duration: .18, ease: OUT }, 0).to([A, B], { yPercent: -115, duration: .2, ease: OUT }, 0).to(rl, { scaleX: 0, transformOrigin: "100% 50%", duration: .22, ease: OUT }, .1);
        return { tin: tin, tout: tout };
      } },

    { id: "track-in", name: "Track In", ref: "Paul Samuelson", tech: "Wide letter-spacing tracks in to the name", color: "#ffffff",
      fields: [["first", "firstName", "First name", "JOHN"], ["last", "lastName", "Last name", "OLUWASEUN"], ["title", "title", "Title", "BISHOP"], ["org", "organization", "Church", "CHRIST EMBASSY"]],
      build: function (r, d, c) {
        r.innerHTML = '<div class="blk" style="text-align:center">' +
          '<div class="hv a" style="font-size:6.2em">' + E(d.first) + '</div>' +
          '<div class="rg b" style="font-size:6em;letter-spacing:calc(var(--ls,-.01) * 1em)">' + E(d.last) + '</div>' +
          '<div class="rg t" style="font-size:1.45em;letter-spacing:calc(var(--ls,.45) * 1em);padding-left:.45em;margin-top:.55em">' + E(d.title) + '</div>' +
          '<div class="sm o" style="font-size:.9em;margin-top:.7em">' + E(d.org) + '</div></div>';
        var B = $(r, ".b"), Tt = $(r, ".t"), ac = split($(r, ".a")), bc = split(B), tc = split(Tt), o = $(r, ".o");
        var tin = tl().fromTo(ac, { opacity: 0, scaleY: 1.5, transformOrigin: "50% 100%" }, { opacity: 1, scaleY: 1, duration: .32, stagger: .09 }, .05)
          .fromTo(B, { "--ls": .45 }, { "--ls": -.01, duration: .9 }, .25).fromTo(bc, { opacity: 0 }, { opacity: 1, duration: .2, stagger: .045, ease: "none" }, .3)
          .fromTo(Tt, { "--ls": 1.1 }, { "--ls": .45, duration: .8 }, .45).fromTo(tc, { opacity: 0 }, { opacity: 1, duration: .15, stagger: .035, ease: "none" }, .5)
          .fromTo(o, { opacity: 0, color: c.sub }, { opacity: 1, color: c.fg, duration: .3 }, .75);
        var tout = tl().to(ac.concat(bc, tc, [o]), { opacity: 0, duration: .45, ease: "power1.in" }, 0).to(B, { "--ls": .2, duration: .5, ease: OUT }, 0).to(Tt, { "--ls": .8, duration: .5, ease: OUT }, 0);
        return { tin: tin, tout: tout };
      } },

    /*
     * "Modern" family (21–25): wide black-italic straps with outline/fill letter builds.
     * Built at 1920px design size inside .mx-fit, then scaled by MX_SCALE.
     * Each strap is one paused timeline; "in" scrubs it forward, "out" scrubs it back.
     */
    { id: "mx-glitch", name: "Glitch Dash", ref: "Modern 3", tech: "Glitch dashes flicker while the name builds", color: "#0b0b0b", mx: true,
      fields: [["n1", "firstName", "Name (solid)", "GRACE"], ["role", "title", "Small title", "WORSHIP LEADER"], ["n2", "lastName", "Name (outline)", "OKAFOR"]],
      build: function (lt, d) {
        lt.className += " mx3";
        var n1 = mxLine(lt, d.n1, "mx-n1 mx-of"), row = mxMk("div", "mx-row2", lt);
        var role = mxLine(row, d.role, "mx-role"), n2 = mxLine(row, d.n2, "mx-n2 mx-ol");
        var x = mxTl();
        x.fromTo(n1.chars[0], { opacity: 0, "--f": 1 }, { opacity: 1, duration: .3 }, .25);
        mxSeq(x, n1.chars.slice(1), MX.fade, .6, .075); mxSeq(x, n1.chars.slice(1), MX.fill, .72, .075);
        mxSeq(x, n2.chars, MX.fade, .82, .075);
        mxSeq(x, role.chars, MX.type, .86, .045);
        var w = lt.offsetWidth, h = lt.offsetHeight, rnd = mxRand(7);
        for (var i = 0; i < 11; i++) {
          var dash = mxMk("div", "mx-dash", lt);
          var y = rnd() < .5 ? -18 - rnd() * 30 : h * (.55 + rnd() * .55);
          global.gsap.set(dash, { left: rnd() * w * .45 + (rnd() < .3 ? w * .1 : 0), top: y, width: 20 + rnd() * 120 });
          var t0 = .45 + rnd() * .5;
          x.fromTo(dash, { opacity: 0, x: 0 }, { opacity: 1, duration: .01 }, t0)
            .fromTo(dash, { x: 0 }, { x: (rnd() - .3) * 90, duration: .18, ease: "none", immediateRender: false }, t0 + .02)
            .fromTo(dash, { opacity: 1 }, { opacity: 0, duration: .01, immediateRender: false }, t0 + .14 + rnd() * .22);
        }
        return x;
      } },

    { id: "mx-underline", name: "Ghost Underline", ref: "Modern 4", tech: "Underline draws in, title slides out of an outline ghost", color: "#0b0b0b", mx: true,
      fields: [["n1", "firstName", "Full name", "ESTHER ADEBAYO"], ["role", "title", "Title", "MINISTER"]],
      build: function (lt, d) {
        lt.className += " mx4";
        var n1 = mxLine(lt, d.n1, "mx-n1 mx-of"), ul = mxMk("div", "mx-uline mx-fill", lt), rw = mxMk("div", "mx-rolewrap", lt);
        var ghost = mxLine(rw, d.role, "mx-role mx-ol mx-ghost"), role = mxLine(rw, d.role, "mx-role");
        var off = Math.min(lt.offsetWidth * .48, 340);
        var x = mxTl();
        x.fromTo(ul, { scaleX: 0 }, { scaleX: 1, duration: .45, ease: "power3.inOut" }, .28);
        x.fromTo(n1.chars[0], { opacity: 0, "--f": 1 }, { opacity: 1, duration: .3 }, .55);
        mxSeq(x, n1.chars.slice(1), MX.fade, .9, .045); mxSeq(x, n1.chars.slice(1), MX.fill, 1.0, .045);
        x.fromTo(role, { x: -off }, { x: 0, duration: .55, ease: "power3.inOut" }, .95);
        mxSeq(x, role.chars, MX.type, .4, .07);
        x.fromTo(ghost, { x: -off, opacity: 0 }, { opacity: .55, duration: .2 }, 1.0)
          .fromTo(ghost, { opacity: .55 }, { opacity: 0, duration: .35, immediateRender: false }, 1.3);
        return x;
      } },

    { id: "mx-frame", name: "Drawn Frame", ref: "Modern 6", tech: "A border draws itself around the name", color: "#0b0b0b", mx: true,
      fields: [["role", "title", "Small title", "SENIOR PASTOR"], ["n1", "firstName", "Name (solid)", "BARTHOLOMEW"], ["n2", "lastName", "Name (outline)", "FREDERICK"]],
      build: function (lt, d) {
        lt.className += " mx6";
        var role = mxLine(lt, d.role, "mx-role"), fr = mxMk("div", "mx-frame", lt);
        var et = mxMk("div", "mx-e mx-et", fr), el = mxMk("div", "mx-e mx-el", fr), eb = mxMk("div", "mx-e mx-eb", fr), er = mxMk("div", "mx-e mx-er", fr);
        var n1 = mxLine(fr, d.n1, "mx-n1 mx-of"), n2 = mxLine(fr, d.n2, "mx-n2 mx-ol");
        var x = mxTl();
        x.fromTo(et, { scaleX: 0 }, { scaleX: 1, duration: .38, ease: "power3.out" }, .22)
          .fromTo(el, { scaleY: 0 }, { scaleY: 1, duration: .1, ease: "none" }, .56)
          .fromTo(eb, { scaleX: 0 }, { scaleX: 1, duration: .14, ease: "power2.out" }, .63)
          .fromTo(er, { scaleY: 0 }, { scaleY: 1, duration: .1, ease: "power2.out" }, .74);
        mxSeq(x, n1.chars, MX.fade, .55, .055); mxSeq(x, n1.chars, MX.fill, .7, .055);
        mxShow(x, n2.chars, .9, .065); mxSeq(x, n2.chars, MX.fade, .9, .065);
        mxShow(x, role.chars, .86, .045); mxSeq(x, role.chars, MX.type, .86, .045);
        return x;
      } },

    { id: "mx-tag", name: "Name Tag", ref: "Modern 7", tech: "Big name flies in with ghost trails beside a tag box", color: "#0b0b0b", mx: true,
      fields: [["n1", "firstName", "Name (big)", "SIMON"], ["n2", "lastName", "Name (in box)", "PETERS"], ["role", "title", "Title", "CREATIVE DIRECTOR"]],
      build: function (lt, d, c) {
        lt.className += " mx7";
        var n1 = mxLine(lt, d.n1, "mx-n1 mx-st"), side = mxMk("div", "mx-side", lt), tag = mxMk("div", "mx-tag", side), bg = mxMk("div", "mx-bg mx-fill", tag);
        var n2 = mxLine(tag, d.n2, "mx-inv"), role = mxLine(side, d.role, "mx-role");
        var W = tag.offsetWidth, H = tag.offsetHeight;
        var ins = function (t, r) { return "inset(" + t + "px " + r + "px " + t + "px 0px)"; };
        var x = mxTl();
        x.fromTo(bg, { clipPath: ins(H * .3, W - 1) }, { clipPath: ins(H * .12, W - 6), duration: .2, ease: "power2.out" }, .25)
          .fromTo(bg, { clipPath: ins(H * .12, W - 6) }, { clipPath: ins(0, W - 14), duration: .08, immediateRender: false }, .45)
          .fromTo(bg, { clipPath: ins(0, W - 14) }, { clipPath: ins(0, 0), duration: .16, ease: "power3.out", immediateRender: false }, .53);
        mxSeq(x, n2.chars, MX.type, .76, .07); mxSeq(x, role.chars, MX.type, .76, .035);
        n1.chars.forEach(function (ch, i) {
          var t = i === 0 ? .42 : .9 + i * .06;
          x.fromTo(ch, { opacity: 0, x: -50, "--f": i === 0 ? 1 : 0, textShadow: "-70px 0px 0px " + rgba(c.fg, .4) },
            { opacity: 1, x: 0, textShadow: "0px 0px 0px " + rgba(c.fg, 0), duration: i === 0 ? .55 : .35, ease: "power3.out" }, t);
          if (i) x.fromTo(ch, { "--f": 0 }, { "--f": 1, duration: .2, immediateRender: false }, 1.0 + i * .07);
        });
        x.fromTo(n1, { scale: 1.07 }, { scale: 1, duration: .7, ease: "power2.out" }, .95);
        return x;
      } },

    { id: "mx-badge", name: "Leading Badge", ref: "Modern 9", tech: "Leading letter lands solid, the rest outline, then all fill", color: "#0b0b0b", mx: true,
      fields: [["tag", "firstName", "Name (in box)", "GARRISON"], ["n1", "lastName", "Name (big)", "SCARLETT"], ["role", "title", "Title (outline)", "YOUTH PASTOR"]],
      build: function (lt, d) {
        lt.className += " mx9";
        var row = mxMk("div", "mx-tagrow", lt), tag = mxMk("div", "mx-tag", row), bg = mxMk("div", "mx-bg mx-fill", tag);
        var tg = mxLine(tag, d.tag, "mx-inv"), n1 = mxLine(lt, d.n1, "mx-n1 mx-st"), role = mxLine(lt, d.role, "mx-role mx-ol");
        var W = tag.offsetWidth, H = tag.offsetHeight;
        var ins = function (t, l) { return "inset(" + t + "px 0px " + t + "px " + l + "px)"; };
        var x = mxTl();
        x.fromTo(bg, { clipPath: ins(H * .45, W - 3) }, { clipPath: ins(H * .12, W - 5), duration: .3, ease: "power1.out" }, .05)
          .fromTo(bg, { clipPath: ins(H * .12, W - 5) }, { clipPath: ins(0, W - H * 1.3), duration: .2, ease: "power2.out", immediateRender: false }, .4)
          .fromTo(bg, { clipPath: ins(0, W - H * 1.3) }, { clipPath: ins(0, 0), duration: .16, ease: "power3.out", immediateRender: false }, .62);
        mxSeq(x, tg.chars, MX.type, .8, .065);
        var L = n1.chars.length;
        n1.chars.forEach(function (ch, i) {
          var t = .58 + i * .08;
          x.fromTo(ch, { opacity: 0, "--f": 1 }, { opacity: 1, duration: .03 }, t);
          if (i < L - 1) {
            x.fromTo(ch, { "--f": 1 }, { "--f": 0, duration: .06, immediateRender: false }, t + .08);
            x.fromTo(ch, { "--f": 0 }, { "--f": 1, duration: .3, ease: "power1.inOut", immediateRender: false }, .62 + L * .08 + .1 + i * .015);
          }
        });
        mxSeq(x, role.chars, MX.type, .8, .045);
        return x;
      } }

  ];

  /* Every strap ships with the same neutral sample text; churches type their own in the Dock. */
  var SAMPLE_TEXT = { firstName: "TAYO", lastName: "AKOSILE", title: "FOUNDER & CEO", organization: "MAKECHURCHEAZY" };
  T.forEach(function (t) { t.fields.forEach(function (f) { if (SAMPLE_TEXT[f[1]] != null) f[3] = SAMPLE_TEXT[f[1]]; }); });

  T.forEach(function (t) { if (t.mx) t.build = mxWrap(t.build); });

  var BY_ID = {};
  T.forEach(function (t) { BY_ID[t.id] = t; });

  function describe() {
    return T.map(function (t) {
      return {
        id: t.id, name: t.name, ref: t.ref, tech: t.tech, color: t.color, family: t.family || "motion",
        // Optional per-family metadata (e.g. church-lower-thirds.js): category, tags, default hold,
        // and typed fields [builderKey, themeKey, label, default, type, options].
        category: t.category, group: t.group, tags: t.tags, hold: t.hold,
        fields: t.fields.map(function (f) { return { key: f[1], label: f[2], defaultValue: f[3], type: f[4] || "text", options: f[5] || undefined }; })
      };
    });
  }

  /* Other strap families (e.g. subscribe-lower-thirds.js) add their templates here. */
  function register(list) {
    (list || []).forEach(function (t) {
      if (!t || !t.id || BY_ID[t.id]) return;
      T.push(t);
      BY_ID[t.id] = t;
    });
    api.templates = describe();
  }

  var active = null; // { master, root }

  function readValues(el, t) {
    var d = {};
    t.fields.forEach(function (f) {
      var attr = "data-v-" + f[1].replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
      var v = el.getAttribute(attr);
      d[f[0]] = (v == null || /^\{\{.*\}\}$/.test(v)) ? f[3] : v;
    });
    return d;
  }

  function justifyFor(el) {
    var host = el.closest ? el.closest("#overlay-root") : null;
    var origin = host ? String(host.style.getPropertyValue("--lt-fit-origin") || "").trim().split(/\s+/)[0] : "";
    return origin === "center" ? "center" : origin === "right" ? "flex-end" : "flex-start";
  }

  /* Read a numeric data-v-* setting, clamped; falls back when missing or still a {{placeholder}}. */
  function num(el, attr, fallback, min, max) {
    var v = parseFloat(el.getAttribute(attr));
    if (!isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  function kill() {
    if (active && active.master) active.master.kill();
    active = null;
  }

  /**
   * Build and play a strap. `container` is any element holding a `.kx-root`.
   * Returns the duration of what was started, in milliseconds (0 if nothing ran).
   */
  function run(container, state) {
    if (!global.gsap || !container) return 0;
    var el = container.classList && container.classList.contains("kx-root") ? container : container.querySelector(".kx-root");
    if (!el) return 0;
    var t = BY_ID[el.getAttribute("data-kx")];
    // Admin-published graphics carry their own package (mce-graphic-packages.js decodes it).
    if (!t && api.resolvePackage) t = api.resolvePackage(el);
    if (!t) return 0;
    kill();

    var fg = el.getAttribute("data-v-kx-color");
    if (!fg || /^\{\{/.test(fg) || !/^#[0-9a-f]{3,6}$/i.test(fg)) fg = t.color;
    var speed = num(el, "data-v-kx-speed", 1, 0.25, 3);
    var scale = num(el, "data-v-kx-scale", 0.5, 0.2, 2.5);
    var c = { fg: fg, fg0: rgba(fg, 0), sub: mix(fg, .38), scale: scale };
    el.style.fontSize = (19.2 * scale) + "px";
    el.style.setProperty("--kx-fg", fg);
    el.style.color = fg;
    el.style.justifyContent = justifyFor(el);

    var stage = document.createElement("div");
    stage.className = "kx-stage";
    el.innerHTML = "";
    el.appendChild(stage);

    var res = t.build(stage, readValues(el, t), c);
    var tinDur = res.tin.duration();
    var master = global.gsap.timeline({ paused: true, onUpdate: res.render || null });
    master.add(res.tin, 0).add(res.tout, tinDur + 0.001);
    master.timeScale(speed);
    active = { master: master, root: el };

    if (state === "out") {
      master.seek(tinDur, false);
      if (res.render) res.render();
      master.play();
      return Math.ceil(res.tout.duration() / speed * 1000);
    }
    if (state === "hold") {
      master.seek(tinDur, false);
      if (res.render) res.render();
      return 0;
    }
    master.tweenFromTo(0, tinDur);
    return Math.ceil(tinDur / speed * 1000);
  }

  var api = {
    run: run,
    kill: kill,
    register: register,
    templates: describe()
  };
  global.MCEKinetic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

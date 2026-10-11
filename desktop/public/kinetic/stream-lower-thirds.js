/*
 * Make Church Eazy — "Stream graphics" (4 animated graphics), registered into the Motion engine
 * (kinetic-lower-thirds.js and church-lower-thirds.js must load first).
 *
 *   Day Badge             a DAY tag with a date plate
 *   Partnership + QR      a heading, a link and a scan code that opens exactly the link that is typed
 *   News Ticker Bar       a label and messages that scroll across the bottom (one message per line)
 *   Live Bug              a LIVE pill with a hashtag
 *
 * Each graphic is laid out on the 1920x1080 frame, pinned to the screen in OBS. Position moves it
 * left / centre / right and to the top or bottom, Size scales it. Text and colours are read from
 * the theme's data-v-* attributes, so the Dock and Broadcast Graphics edit them. The scan code is
 * drawn with the QR encoder bundled in church-lower-thirds.js (api.makeQr), so it needs no network.
 *
 * Font: plain Open Sans (400 / 600 / 800), bundled in /fonts/sunday/.
 */
(function (global) {
  "use strict";
  var api = global.MCEKinetic;
  if (!api || !api.register) return;
  var gsap = global.gsap;

  var DESIGN_W = 1920, DESIGN_H = 1080;
  var EDGE_TOP = 40; // headroom above a graphic for the drop shadow

  var FONT_LABEL = "'Open Sans',Arial,sans-serif";
  var FONT_BODY = "'Open Sans',Arial,sans-serif";
  var FONT_FACES = [[400, "/fonts/sunday/open-sans-400.woff2"], [600, "/fonts/sunday/open-sans-600.woff2"], [800, "/fonts/sunday/open-sans-800.woff2"]];

  function $(s, r) { return r.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hex(v, fallback) { v = String(v || "").trim(); return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? v : fallback; }

  /* The text a scan code should carry: the link exactly as typed, with https:// added when it has no scheme. */
  function scanTarget(v) {
    v = String(v == null ? "" : v).trim();
    if (!v || /^\{\{/.test(v)) return "";
    if (/^[a-z][a-z0-9+.\-]*:\/\//i.test(v) || /^(mailto|tel|sms|geo|wifi|upi):/i.test(v)) return v;
    return "https://" + v.replace(/^\/+/, "");
  }
  function qrSvg(text) {
    var Q = api.makeQr;
    if (!Q || !text) return "";
    try {
      var q = Q(0, "M"); q.addData(text); q.make();
      var s = q.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
      return String(s).replace(/<svg([^>]*)>/, function (m, a) { return "<svg" + a.replace(/\s(?:width|height)="[^"]*"/g, "") + ' shape-rendering="crispEdges">'; });
    } catch (e) { return ""; }
  }

  /* ---------- styles ---------- */
  var P0 = ":is(#overlay-root,body) .kx-root .stl";
  var rules = [];
  function R(sel, body) { rules.push(P0 + " " + sel + "{" + body + "}"); }
  function F(weight, size, family) { return "font:" + weight + " " + size + "px/1 " + family + " !important"; }
  rules.push(P0 + "{position:absolute;inset:0;pointer-events:none;color:#fff;font:400 14px/1.4 " + FONT_BODY + " !important;letter-spacing:normal;text-align:left;text-transform:none;white-space:normal;font-stretch:normal;font-style:normal;justify-content:normal}");
  R("*", "font-family:inherit !important;box-sizing:border-box");
  R(".stl-lt", "position:absolute;white-space:nowrap;transform-origin:0 100%");

  /* Day badge */
  R(".sd", "display:flex;align-items:stretch;height:76px;filter:drop-shadow(0 8px 16px rgba(0,0,0,.35))");
  R(".sd-day", "display:flex;align-items:center;background:var(--a);padding:0 30px 0 34px;border-radius:10px 0 0 10px");
  R(".sd-day span", F(800, 34, FONT_LABEL) + ";color:#fff;letter-spacing:.08em;text-transform:uppercase");
  R(".sd-bar", "width:9px;background:var(--b)");
  R(".sd-date", "display:flex;align-items:center;background:var(--c);padding:0 58px 0 28px;clip-path:polygon(0 0,100% 0,calc(100% - 24px) 100%,0 100%)");
  R(".sd-date span", F(600, 28, FONT_BODY) + ";color:var(--a);letter-spacing:.01em");

  /* Partnership + scan code */
  R(".sp", "display:flex;align-items:stretch;height:188px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.4))");
  R(".sp-qr", "position:relative;flex:none;width:188px;height:188px;background:#fff;padding:14px;border-radius:14px 0 0 14px;box-shadow:inset 0 0 0 5px var(--b);overflow:hidden");
  R(".sp-qr svg", "display:block;width:100%;height:100%");
  R(".sp-qr-empty", "display:flex;align-items:center;justify-content:center;width:100%;height:100%;" + F(800, 40, FONT_LABEL) + ";color:#9aa3b2;letter-spacing:.2em");
  R(".sp-scan", "position:absolute;left:14px;right:14px;top:14px;height:4px;border-radius:2px;background:var(--b);box-shadow:0 0 14px var(--b);opacity:0");
  R(".sp-body", "display:flex;flex-direction:column;justify-content:center;gap:10px;background:var(--a);padding:0 52px 0 34px;border-radius:0 14px 14px 0");
  R(".sp-label", "display:flex;align-items:center;gap:16px;" + F(800, 26, FONT_LABEL) + ";color:var(--b);letter-spacing:.2em;text-transform:uppercase");
  R(".sp-link", F(600, 48, FONT_BODY) + ";color:var(--c);letter-spacing:-.015em;padding:4px 0 6px");
  R(".sp-note", F(400, 22, FONT_BODY) + ";color:var(--c);opacity:.72;letter-spacing:.04em");

  /* News ticker bar */
  R(".st", "display:flex;align-items:stretch;height:78px;overflow:hidden");
  R(".st-label", "position:relative;z-index:2;flex:none;display:flex;align-items:center;gap:16px;background:var(--b);padding:0 62px 0 36px;clip-path:polygon(0 0,100% 0,calc(100% - 26px) 100%,0 100%)");
  R(".st-label i", "width:14px;height:14px;border-radius:50%;background:var(--a)");
  R(".st-label b", F(800, 28, FONT_LABEL) + ";color:var(--a);letter-spacing:.14em;text-transform:uppercase");
  R(".st-wrap", "position:relative;flex:1;min-width:0;margin-left:-26px;padding-left:26px;background:var(--a);border-top:4px solid var(--b);overflow:hidden;display:flex;align-items:center");
  R(".st-track", "display:flex;align-items:center;white-space:nowrap;will-change:transform");
  R(".st-track span", "display:inline-flex;align-items:center;" + F(600, 29, FONT_BODY) + ";color:var(--t)");
  R(".st-track span::after", "content:'';width:12px;height:12px;margin:0 44px;background:var(--b);transform:rotate(45deg)");

  /* Live bug */
  R(".sl", "display:flex;filter:drop-shadow(0 6px 14px rgba(0,0,0,.4))");
  R(".sl-in", "display:flex;align-items:center;height:58px;padding:5px;background:var(--a);border-radius:29px");
  R(".sl-pill", "display:flex;align-items:center;gap:12px;height:48px;padding:0 24px 0 20px;background:var(--b);border-radius:24px");
  R(".sl-pill i", "width:14px;height:14px;border-radius:50%;background:#fff");
  R(".sl-pill b", F(800, 25, FONT_LABEL) + ";color:#fff;letter-spacing:.16em");
  R(".sl-tag", F(600, 26, FONT_BODY) + ";color:var(--c);padding:0 28px 0 20px;letter-spacing:.01em");
  var FACES = FONT_FACES.map(function (f) {
    return "@font-face{font-family:'Open Sans';font-weight:" + f[0] + ";font-style:normal;font-display:block;src:url(" + f[1] + ") format('woff2')}";
  }).join("\n");
  var CSS = FACES + "\n" + rules.join("\n");

  var FONT_LOADS = ["400 20px 'Open Sans'", "600 20px 'Open Sans'", "800 20px 'Open Sans'"];
  function injectStyles() {
    if (typeof document === "undefined" || document.getElementById("mce-stream-lt-style")) return;
    var st = document.createElement("style");
    st.id = "mce-stream-lt-style";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
    if (document.fonts && document.fonts.load) FONT_LOADS.forEach(function (s) { try { document.fonts.load(s); } catch (e) { } });
  }

  /* ---------- field helpers: [builderKey, themeKey, label, default, type, options, cssVar, shades, extra] ---------- */
  function text(k, label, def) { return [k, k, label, def, "text"]; }
  function area(k, label, def) { return [k, k, label, def, "text", null, null, false, { multiline: true }]; }
  function color(k, label, def) { return [k, k, label, def, "color", null, k, false]; }

  /* ======================================================================
   * The graphics. `x` / `y` = designed distance from the left / bottom edge of the frame.
   * ==================================================================== */
  var TAGS = ["Church", "Graphics", "Stream", "Motion", "Animated"];
  var T = {};

  T.day = { cls: "sd", group: "service", tags: TAGS.concat(["Day"]), color: "#10243f", hold: 0, x: 70, y: 70,
    name: "Day Badge", tech: "A DAY tag with a date plate that wipes in beside it",
    fields: [text("dayText", "Day tag", "DAY 1"), text("dateText", "Date", "12TH MAR. 2010"),
      color("a", "Day tag colour", "#10243f"), color("b", "Accent colour", "#2fe0c3"), color("c", "Date plate colour", "#ffffff")],
    html: function (v) {
      var date = String(v.dateText || "").trim();
      return '<div class="sd-day"><span>' + esc(v.dayText) + "</span></div>" +
        (date ? '<i class="sd-bar"></i><div class="sd-date"><span>' + esc(date) + "</span></div>" : "");
    },
    tl: function (r) {
      var tl = gsap.timeline(), day = $(".sd-day", r), bar = $(".sd-bar", r), date = $(".sd-date", r);
      tl.fromTo(day, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: .5, ease: "power3.inOut" }, 0);
      if (bar) tl.fromTo(bar, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: .35, ease: "expo.out" }, .3);
      if (date) tl.fromTo(date, { x: -46, opacity: 0 }, { x: 0, opacity: 1, duration: .6, ease: "power3.out" }, .38);
      return tl;
    },
    out: function (r, tl) {
      var day = $(".sd-day", r), bar = $(".sd-bar", r), date = $(".sd-date", r);
      if (date) tl.to(date, { x: -30, opacity: 0, duration: .3, ease: "power2.in" }, 0);
      if (bar) tl.to(bar, { scaleY: 0, duration: .25, ease: "power2.in" }, .1);
      tl.to(day, { clipPath: "inset(0% 0% 0% 100%)", duration: .4, ease: "power3.in" }, .2);
    } };

  T.partner = { cls: "sp", group: "giving", tags: TAGS.concat(["Giving", "Partner", "QR"]), color: "#10243f", hold: 12, x: 80, y: 70,
    name: "Partnership Link + QR", tech: "A scan code beside a heading and link; the code opens exactly the link that is typed",
    fields: [text("ptLabel", "Heading", "Partnership"), text("link", "Link (the scan code opens this)", "www.yourwebsite.com/partnership"),
      text("note", "Small line", "Scan the code or visit the link"),
      color("a", "Panel colour", "#10243f"), color("b", "Accent colour", "#2fe0c3"), color("c", "Link text colour", "#ffffff")],
    html: function (v) {
      var svg = qrSvg(scanTarget(v.link));
      return '<div class="sp-qr">' + (svg || '<span class="sp-qr-empty">QR</span>') + '<i class="sp-scan"></i></div>' +
        '<div class="sp-body"><div class="sp-label">' + esc(v.ptLabel) + '</div><div class="sp-link">' + esc(v.link) + "</div>" +
        (String(v.note || "").trim() ? '<div class="sp-note">' + esc(v.note) + "</div>" : "") + "</div>";
    },
    tl: function (r) {
      var tl = gsap.timeline(), qr = $(".sp-qr", r), body = $(".sp-body", r), lab = $(".sp-label", r), lnk = $(".sp-link", r), note = $(".sp-note", r), scan = $(".sp-scan", r);
      tl.fromTo(qr, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: .6, ease: "expo.out" }, 0)
        .fromTo(body, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: .75, ease: "power3.inOut" }, .2)
        .fromTo(lab, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: .5, ease: "power3.out" }, .55)
        .fromTo(lnk, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .55, ease: "power3.out" }, .68);
      if (note) tl.fromTo(note, { opacity: 0 }, { opacity: .72, duration: .5, ease: "power1.out" }, .9);
      if (scan) tl.fromTo(scan, { y: 0, opacity: 1 }, { y: 154, duration: .6, ease: "sine.inOut" }, .7).to(scan, { opacity: 0, duration: .2 }, 1.3);
      return tl;
    },
    out: function (r, tl) {
      var qr = $(".sp-qr", r), body = $(".sp-body", r), lab = $(".sp-label", r), lnk = $(".sp-link", r), note = $(".sp-note", r);
      tl.to([lab, lnk, note].filter(Boolean), { opacity: 0, y: -14, duration: .28, ease: "power2.in", stagger: .05 }, 0)
        .to(body, { clipPath: "inset(0% 0% 0% 100%)", duration: .45, ease: "power3.inOut" }, .2)
        .to(qr, { clipPath: "inset(0% 0% 100% 0%)", duration: .45, ease: "power3.inOut" }, .3);
    } };

  /* One message per line (a "|" also separates messages). */
  function tickerItems(v) {
    return String(v.tickerItems || "").split(/\r?\n|\s*\|\s*/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 30);
  }
  T.ticker = { cls: "st", group: "announcements", tags: TAGS.concat(["Ticker", "News", "Announcement"]), color: "#2fe0c3", hold: 0, x: 0, y: 0, full: true, always: true,
    name: "News Ticker Bar", tech: "A label tab and a full-width bar of messages that scroll across, one message per line",
    fields: [text("tickerLabel", "Label", "LATEST"),
      area("tickerItems", "Messages (one per line)", "Welcome to our service. Replace this with your own message.\nAdd announcements, prayer points or event details here.\nType one message per line and they scroll across the screen."),
      color("a", "Bar colour", "#10243f"), color("b", "Label and accent colour", "#2fe0c3"), color("t", "Message text colour", "#ffffff")],
    html: function (v, c) {
      var items = tickerItems(v);
      if (!items.length) items = ["Add your messages here"];
      var per = items.reduce(function (n, s) { return n + s.length * 17 + 100; }, 0);
      var need = DESIGN_W / ((c && c.scale) || 1) + 300;
      var k = Math.max(1, Math.ceil(need / per)), one = "";
      for (var i = 0; i < k; i++) one += items.map(function (s) { return "<span>" + esc(s) + "</span>"; }).join("");
      return '<div class="st-label"><i></i><b>' + esc(v.tickerLabel) + '</b></div><div class="st-wrap"><div class="st-track" data-w="' + (per * k) + '">' + one + one + "</div></div>";
    },
    tl: function (r) {
      var tl = gsap.timeline(), wrap = $(".st-wrap", r), label = $(".st-label", r);
      tl.fromTo(wrap, { yPercent: 100 }, { yPercent: 0, duration: .55, ease: "power3.out" }, 0)
        .fromTo(label, { xPercent: -100 }, { xPercent: 0, duration: .6, ease: "expo.out" }, .22);
      return tl;
    },
    out: function (r, tl) {
      tl.to($(".st-label", r), { xPercent: -100, duration: .4, ease: "power3.in" }, 0)
        .to($(".st-wrap", r), { yPercent: 100, duration: .45, ease: "power3.in" }, .15);
    },
    amb: function (r) {
      var track = $(".st-track", r); if (!track) return [];
      var half = (track.scrollWidth || +track.getAttribute("data-w") * 2 || 2000) / 2;
      var dur = Math.max(14, half / 120); // about 120 design pixels per second
      return [gsap.fromTo(track, { xPercent: 0 }, { xPercent: -50, duration: dur, ease: "none", repeat: -1 })];
    } };

  T.live = { cls: "sl", group: "service", tags: TAGS.concat(["Live", "Hashtag"]), color: "#ff3156", hold: 0, x: 70, y: 70,
    name: "Live Bug", tech: "A LIVE pill with a pulsing dot and a hashtag",
    fields: [text("liveText", "Live pill text", "LIVE"), text("hashtag", "Hashtag", "#YourHashtag"),
      color("a", "Plate colour", "#10243f"), color("b", "Live pill colour", "#ff3156"), color("c", "Hashtag colour", "#ffffff")],
    html: function (v) {
      var tag = String(v.hashtag || "").trim();
      return '<div class="sl-in"><div class="sl-pill"><i></i><b>' + esc(v.liveText) + "</b></div>" + (tag ? '<div class="sl-tag">' + esc(tag) + "</div>" : "") + "</div>";
    },
    tl: function (r) {
      var tl = gsap.timeline(), cap = $(".sl-in", r), pill = $(".sl-pill", r), tag = $(".sl-tag", r);
      tl.fromTo(cap, { clipPath: "inset(0% 100% 0% 0% round 29px)" }, { clipPath: "inset(0% 0% 0% 0% round 29px)", duration: .6, ease: "power3.inOut" }, 0)
        .fromTo(pill, { scale: .6, opacity: 0, transformOrigin: "0% 50%" }, { scale: 1, opacity: 1, duration: .45, ease: "back.out(2)" }, .12);
      if (tag) tl.fromTo(tag, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: .45, ease: "power3.out" }, .35);
      return tl;
    },
    out: function (r, tl) {
      var tag = $(".sl-tag", r);
      if (tag) tl.to(tag, { x: -16, opacity: 0, duration: .22, ease: "power2.in" }, 0);
      tl.to($(".sl-pill", r), { scale: .6, opacity: 0, duration: .25, ease: "power2.in" }, .05)
        .to($(".sl-in", r), { clipPath: "inset(0% 0% 0% 100% round 29px)", duration: .4, ease: "power3.in" }, .15);
    },
    amb: function (r) {
      var dot = $(".sl-pill i", r); if (!dot) return [];
      return [gsap.fromTo(dot, { boxShadow: "0 0 0 0 rgba(255,255,255,.8)" }, { boxShadow: "0 0 0 14px rgba(255,255,255,0)", duration: 1.4, ease: "power1.out", repeat: -1 })];
    } };

  /* ---------- lifetime ---------- */
  var live = [], sweeper = 0;
  function killAmb(ctx) { (ctx.amb || []).forEach(function (a) { a.kill(); }); ctx.amb = []; }
  function track(ctx) {
    live.push(ctx);
    if (!sweeper) sweeper = setInterval(function () {
      live = live.filter(function (c) { if (c.sec.isConnected) return true; killAmb(c); return false; });
      if (!live.length) { clearInterval(sweeper); sweeper = 0; }
    }, 1000);
  }
  function justifyFactor(kx) {
    var j = kx && kx.style ? kx.style.justifyContent : "";
    return j === "center" ? .5 : j === "flex-end" ? 1 : 0;
  }
  var reduceMotion = function () { try { return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  function makeTemplate(key) {
    var d = T[key];
    var X = d.x == null ? 80 : d.x, Y = d.y == null ? 70 : d.y, PS = d.s || 1;
    return {
      id: "stream-" + key, name: d.name, ref: "Stream graphics", tech: d.tech, color: d.color, family: "stream",
      category: "general", group: d.group, tags: d.tags, hold: d.hold, fields: d.fields,
      build: function (stage, P, c) {
        injectStyles();
        var kx = stage.parentElement;
        var inOverlay = !!(kx && kx.closest && kx.closest("#overlay-root"));
        var userScale = c.scale || 1, Sc = userScale;
        if (kx) { kx.style.padding = "0"; kx.style.lineHeight = "normal"; }
        if (!inOverlay && kx && kx.parentElement) {
          var pw = kx.parentElement.clientWidth || DESIGN_W;
          Sc = Sc * Math.min(1, pw / DESIGN_W);
        }
        // Same placement model as the Church and Sunday graphics: the design sits on its 1920x1080 frame,
        // pinned to the screen in OBS; Position picks left / centre / right with the design's margin.
        var crop = document.createElement("div");
        var frame = document.createElement("div");
        var sec = document.createElement("section");
        sec.className = "stl stl-" + key;
        var box = document.createElement("div");
        box.className = "stl-lt " + d.cls;
        d.fields.forEach(function (f) {
          if (f[4] !== "color") return;
          box.style.setProperty("--" + f[6], hex(P[f[0]], f[3]));
        });
        box.innerHTML = d.html(P, { scale: userScale });
        // Full-width bars keep spanning the screen whatever the Size is.
        if (d.full) box.style.width = Math.round(DESIGN_W / userScale) + "px";
        sec.appendChild(box); frame.appendChild(sec); crop.appendChild(frame); stage.appendChild(crop);
        frame.style.cssText = "position:absolute;top:0;width:" + DESIGN_W + "px;height:" + DESIGN_H + "px;transform-origin:0 0";
        var w = box.offsetWidth * PS, h = box.offsetHeight * PS;
        var f = inOverlay ? justifyFactor(kx) : 0;
        var left = f === 0 ? X : f === 1 ? DESIGN_W - X - w : (DESIGN_W - w) / 2;
        box.style.cssText += ";left:" + left + "px;bottom:" + Y + "px;transform:scale(" + PS + ")";
        var H = Math.min(DESIGN_H, Math.ceil(Y + h + EDGE_TOP));
        crop.style.cssText = "position:relative;overflow:visible;width:" + (inOverlay ? 0 : Math.round(DESIGN_W * Sc)) + "px;height:" + Math.round(H * Sc) + "px";
        frame.style.left = (inOverlay ? -DESIGN_W * Sc * f : 0) + "px";
        frame.style.transform = "scale(" + Sc + ") translateY(" + (-(DESIGN_H - H)) + "px)";

        var ctx = { sec: sec, amb: [] };
        var tin = gsap.timeline(), tout = gsap.timeline();
        tin.add(d.tl(box, P), 0);
        if (d.amb) tin.call(function () { killAmb(ctx); if (d.always || !reduceMotion()) ctx.amb = (d.amb(box, P) || []).filter(Boolean); }, null, tin.duration());
        tout.call(function () { killAmb(ctx); }, null, 0);
        d.out(box, tout);
        tout.set(sec, { autoAlpha: 0 }, tout.duration() + .02);
        track(ctx);
        return { tin: tin, tout: tout };
      }
    };
  }

  injectStyles();
  api.register(Object.keys(T).map(makeTemplate));

})(typeof window !== "undefined" ? window : globalThis);

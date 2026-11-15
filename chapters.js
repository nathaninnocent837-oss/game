/* TRUGO : chapitres (8 mondes), livre des chapitres, décors 3D du lobby et de l'arène */
(function () {
  "use strict";
  if (window.TrugoChapters) return;

  /* ============================== PROGRESSION ============================== */
  var CH = [
    { n: 1, key: "dino", name: "L'ère des dinosaures", min: 0, icon: "🦕", desc: "Une jungle brûlante, des fougères géantes et des volcans en éruption. Les plus grands monstres de la Terre rôdent encore autour de l'arène." },
    { n: 2, key: "stone", name: "L'âge de pierre", min: 450, icon: "🦣", desc: "Des grottes, des feux de camp et des mammouths. Les premiers guerriers s'affrontent à coups de silex autour des menhirs." },
    { n: 3, key: "antiq", name: "L'Antiquité", min: 900, icon: "🏛️", desc: "Temples de marbre, colonnes brisées et statues de héros. Les gladiateurs t'attendent dans l'amphithéâtre." },
    { n: 4, key: "medieval", name: "Le Moyen Âge", min: 1400, icon: "🏰", desc: "Châteaux forts, bannières au vent et tours de guet. Seuls les plus braves franchissent les murailles." },
    { n: 5, key: "revol", name: "La Révolution", min: 1900, icon: "🚩", desc: "Barricades, canons et drapeaux tricolores. Les pavés tremblent : le peuple se lève !" },
    { n: 6, key: "modern", name: "Les Temps modernes", min: 2500, icon: "🏭", desc: "Usines fumantes, locomotives et lampes à gaz. L'ère des machines et des inventions commence." },
    { n: 7, key: "now", name: "L'époque actuelle", min: 3200, icon: "🏙️", desc: "L'arène d'aujourd'hui : ruines, forêt, braseros et cristaux lumineux." },
    { n: 8, key: "future", name: "Le futur", min: 4000, icon: "🚀", desc: "Tours de verre, pylônes néon et hologrammes. Le dernier chapitre : l'arène du futur." }
  ];
  function of_(points) {
    var p = Math.max(0, Number(points) || 0), n = 1;
    for (var i = 0; i < CH.length; i++) if (p >= CH[i].min) n = CH[i].n;
    return n;
  }
  function floor_(points) { return CH[of_(points) - 1].min; }
  function info(points) {
    var p = Math.max(0, Number(points) || 0), n = of_(p), c = CH[n - 1], nx = CH[n] || null;
    return { n: n, ch: c, next: nx, medals: p, into: p - c.min, span: nx ? nx.min - c.min : 0, pct: nx ? Math.min(100, (p - c.min) / (nx.min - c.min) * 100) : 100 };
  }

  /* ============================== 3D : OUTILS ============================== */
  var _mc = {};
  function mat(c, o) {
    var k = c + "|" + (o ? JSON.stringify(o) : "");
    if (!_mc[k]) { var p = { color: c, roughness: 0.9, metalness: 0.02 }; if (o) for (var q in o) p[q] = o[q]; _mc[k] = new THREE.MeshStandardMaterial(p); }
    return _mc[k];
  }
  function glow(c, i) { return mat(c, { emissive: c, emissiveIntensity: i == null ? 1 : i, roughness: 0.4 }); }
  var _bc = {};
  function basic(c, o) {
    var k = c + "|" + (o ? JSON.stringify(o) : "");
    if (!_bc[k]) { var p = { color: c }; if (o) for (var q in o) p[q] = o[q]; _bc[k] = new THREE.MeshBasicMaterial(p); }
    return _bc[k];
  }
  function mk(geo, m, x, y, z, rx, ry, rz) {
    var o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    return o;
  }
  function G() { return new THREE.Group(); }
  function cyl(rt, rb, h, seg) { return new THREE.CylinderGeometry(rt, rb, h, seg || 10); }
  function cone(r, h, seg) { return new THREE.ConeGeometry(r, h, seg || 8); }
  function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
  function sph(r, a, b) { return new THREE.SphereGeometry(r, a || 10, b || 8); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function withR(g, r) { g.userData.r = r; return g; }

  /* ---------- dinosaures ---------- */
  function fern() {
    var g = G(), m = mat(pick(["#2f8a3a", "#3aa046", "#276f30"]));
    for (var i = 0; i < 7; i++) {
      var p = G(); p.rotation.y = i / 7 * Math.PI * 2;
      var leaf = mk(cone(0.22, 1.6, 4), m, 0.55, 0.75, 0, 0, 0, -0.95); leaf.scale.z = 0.3; p.add(leaf); g.add(p);
    }
    return withR(g, 0.3);
  }
  function conifer() {
    var g = G();
    g.add(mk(cyl(0.25, 0.38, 5.4, 7), mat("#5a3b22"), 0, 2.7, 0));
    for (var i = 0; i < 4; i++) g.add(mk(cone(1.9 - i * 0.38, 1.9, 8), mat(i % 2 ? "#2a6b34" : "#1f5a2b"), 0, 3 + i * 1.05, 0));
    return withR(g, 0.55);
  }
  function cycad() {
    var g = G(), t = mk(cyl(0.22, 0.34, 3.4, 7), mat("#6b4a2a"), 0, 1.7, 0, 0, 0, rnd(-0.12, 0.12)); g.add(t);
    var lm = mat("#38a844");
    for (var i = 0; i < 9; i++) {
      var p = G(); p.position.y = 3.4; p.rotation.y = i / 9 * Math.PI * 2;
      var leaf = mk(cone(0.28, 2.6, 4), lm, 1.05, 0.15, 0, 0, 0, -1.25); leaf.scale.z = 0.25; p.add(leaf); g.add(p);
    }
    return withR(g, 0.4);
  }
  function nest() {
    var g = G(); g.add(mk(new THREE.TorusGeometry(0.85, 0.22, 6, 12), mat("#6b4a2a"), 0, 0.2, 0, Math.PI / 2, 0, 0));
    var cols = ["#efe6c8", "#cfe8c0", "#f0d9b5"];
    for (var i = 0; i < 4; i++) { var e = mk(sph(0.34, 10, 8), mat(cols[i % 3], { roughness: 0.6 }), Math.cos(i * 1.6) * 0.38, 0.5, Math.sin(i * 1.6) * 0.38); e.scale.y = 1.3; g.add(e); }
    return withR(g, 0.8);
  }
  function ribs() {
    var g = G(), bone = mat("#e9e1cc");
    for (var i = 0; i < 5; i++) { var a = mk(new THREE.TorusGeometry(1.1, 0.09, 6, 12, Math.PI), bone, 0, 0, i * 0.5 - 1); a.rotation.y = Math.PI / 2; a.rotation.x = 0; g.add(a); }
    g.add(mk(cyl(0.12, 0.12, 2.6, 6), bone, 0, 1.1, 0, Math.PI / 2, 0, 0));
    return withR(g, 1);
  }
  function volcano() {
    var g = G();
    g.add(mk(cone(9, 11, 14), mat("#4a3a33"), 0, 5.5, 0));
    var lv = glow("#ff6a1a", 1.4); lv.transparent = false;
    g.add(mk(cone(2.4, 2.6, 12), lv, 0, 10.4, 0));
    var top = mk(sph(1.4, 10, 8), glow("#ffb02e", 1.6), 0, 11.8, 0); g.add(top);
    g.userData.fx = [{ m: top, k: "pulse" }];
    return g;
  }
  function sauro() {
    var g = G(), c = mat("#7a9a6a"), c2 = mat("#68875a");
    var body = mk(sph(1, 12, 10), c, 0, 3.1, 0); body.scale.set(2.3, 1.3, 1.3); g.add(body);
    g.add(mk(cyl(0.32, 0.55, 4.2, 8), c2, 2.4, 4.9, 0, 0, 0, -0.5));
    g.add(mk(sph(0.5, 8, 6), c, 4.1, 7, 0));
    g.add(mk(cone(0.7, 4.6, 8), c2, -3.9, 2.9, 0, 0, 0, Math.PI / 2 + 0.2));
    [[1.3, .7], [1.3, -.7], [-1.3, .7], [-1.3, -.7]].forEach(function (p) { g.add(mk(cyl(0.32, 0.4, 2.3, 7), c2, p[0], 1.15, p[1])); });
    return g;
  }
  /* ---------- âge de pierre ---------- */
  function rocks() {
    var g = G(), m = mat(pick(["#7a6e60", "#6d6256", "#867a6a"]));
    for (var i = 0; i < 4; i++) { var s = rnd(0.5, 1.1), r = mk(new THREE.DodecahedronGeometry(s, 0), m, rnd(-0.8, 0.8), s * 0.6 + i * 0.1, rnd(-0.8, 0.8), rnd(0, 3), rnd(0, 3), 0); r.scale.y = 0.85; g.add(r); }
    return withR(g, 1.2);
  }
  function campfire() {
    var g = G(), st = mat("#6d6256");
    for (var i = 0; i < 7; i++) g.add(mk(new THREE.DodecahedronGeometry(0.18, 0), st, Math.cos(i / 7 * 6.28) * 0.7, 0.14, Math.sin(i / 7 * 6.28) * 0.7));
    var wood = mat("#4a2f1a");
    g.add(mk(cyl(0.09, 0.09, 1.1, 6), wood, 0, 0.18, 0, 0, 0, Math.PI / 2 - 0.2));
    g.add(mk(cyl(0.09, 0.09, 1.1, 6), wood, 0, 0.2, 0, 0, 1.5, Math.PI / 2 + 0.2));
    var f = mk(cone(0.34, 1.0, 7), basic("#ff9a3c", { transparent: true, opacity: 0.9 }), 0, 0.7, 0), f2 = mk(cone(0.2, 0.7, 6), basic("#ffe08a", { transparent: true, opacity: 0.95 }), 0, 0.55, 0);
    g.add(f); g.add(f2);
    g.userData.fx = [{ m: f, k: "flame", i: Math.random() * 6, y: 0.7 }, { m: f2, k: "flame", i: Math.random() * 6, y: 0.55 }];
    return withR(g, 0.8);
  }
  function hut() {
    var g = G(); g.add(mk(cone(1.7, 3.5, 8), mat("#b08a5a"), 0, 1.75, 0));
    for (var i = 0; i < 5; i++) { var a = i / 5 * 6.28; g.add(mk(cyl(0.04, 0.04, 1.1, 4), mat("#4a2f1a"), Math.cos(a) * 0.12, 3.8, Math.sin(a) * 0.12, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25)); }
    g.add(mk(box(0.7, 1.3, 0.1), mat("#2a1d12"), 0, 0.65, 1.45, -0.05, 0, 0));
    return withR(g, 1.5);
  }
  function tusks() {
    var g = G(), iv = mat("#efe6cf", { roughness: 0.5 });
    var a = mk(new THREE.TorusGeometry(1.1, 0.13, 6, 14, Math.PI * 0.85), iv, -0.55, 0.9, 0, 0, 0, Math.PI * 0.07); g.add(a);
    var b = mk(new THREE.TorusGeometry(1.1, 0.13, 6, 14, Math.PI * 0.85), iv, 0.55, 0.9, 0, 0, 0, Math.PI * 0.08); g.add(b);
    var sk = mk(sph(0.55, 8, 6), mat("#d8cfb8"), 0, 0.25, 0); sk.scale.y = 0.7; g.add(sk);
    return withR(g, 0.9);
  }
  function menhir() {
    var g = G(), m = mk(box(0.9, rnd(2.6, 3.8), 0.7), mat("#8a8176"), 0, 1.6, 0, rnd(-0.08, 0.08), rnd(0, 3), rnd(-0.08, 0.08));
    g.add(m);
    g.add(mk(box(0.5, 0.1, 0.05), basic("#c0482e"), 0, 1.7, 0.36)); g.add(mk(box(0.1, 0.5, 0.05), basic("#c0482e"), 0.1, 1.9, 0.36));
    return withR(g, 0.7);
  }
  function cliff() {
    var g = G(), m = mat(pick(["#6d6256", "#7a6e60"]));
    for (var i = 0; i < 4; i++) { var r = mk(new THREE.DodecahedronGeometry(rnd(3, 5), 0), m, (i - 1.5) * 4, rnd(1.5, 3), rnd(-1, 1), rnd(0, 3), rnd(0, 3), 0); r.scale.y = 1.4; g.add(r); }
    return g;
  }
  function mammoth() {
    var g = G(), fur = mat("#6b4a30");
    var body = mk(sph(1, 12, 10), fur, 0, 3, 0); body.scale.set(2.4, 1.7, 1.6); g.add(body);
    var head = mk(sph(1, 10, 8), fur, 2.7, 3.3, 0); head.scale.set(1.2, 1.3, 1.1); g.add(head);
    g.add(mk(cyl(0.3, 0.2, 2.8, 7), fur, 3.8, 1.9, 0, 0, 0, 0.25));
    g.add(mk(new THREE.TorusGeometry(1, 0.1, 6, 12, Math.PI * 0.7), mat("#efe6cf"), 3.4, 2.5, 0.55, 0, 0, -1.2));
    g.add(mk(new THREE.TorusGeometry(1, 0.1, 6, 12, Math.PI * 0.7), mat("#efe6cf"), 3.4, 2.5, -0.55, 0, 0, -1.2));
    [[1.5, .9], [1.5, -.9], [-1.5, .9], [-1.5, -.9]].forEach(function (p) { g.add(mk(cyl(0.45, 0.55, 2, 7), fur, p[0], 1, p[1])); });
    return g;
  }
  /* ---------- Antiquité ---------- */
  function column(broken) {
    var g = G(), m = mat("#ece6d6"), h = broken ? rnd(1.6, 2.8) : 4.4;
    g.add(mk(box(1.1, 0.3, 1.1), m, 0, 0.15, 0));
    g.add(mk(cyl(0.38, 0.45, h, 12), m, 0, 0.3 + h / 2, 0));
    if (!broken) g.add(mk(box(1.2, 0.3, 1.2), m, 0, 0.45 + h, 0));
    else g.add(mk(cyl(0.38, 0.38, 0.9, 12), m, 1.0, 0.38, 0.3, 0, 0.4, Math.PI / 2));
    return withR(g, 0.6);
  }
  function brokenColumn() { return column(true); }
  function temple() {
    var g = G(), m = mat("#efe8d8");
    for (var i = 0; i < 3; i++) g.add(mk(box(7 - i * 0.6, 0.3, 4.6 - i * 0.6), m, 0, 0.15 + i * 0.3, 0));
    g.add(mk(box(4.6, 3.6, 2.8), mat("#d8cfb8"), 0, 2.7, -0.4));
    for (var c = 0; c < 6; c++) { var x = -2.5 + c; g.add(mk(cyl(0.28, 0.32, 3.6, 10), m, x, 2.7, 1.7)); }
    g.add(mk(box(6, 0.4, 3.4), m, 0, 4.7, 0.1));
    var roof = mk(cone(3.9, 1.7, 4), mat("#c9a27a"), 0, 5.75, 0.1, 0, Math.PI / 4, 0); roof.scale.z = 0.62; g.add(roof);
    return withR(g, 3.1);
  }
  function statue() {
    var g = G(), m = mat("#ece6d6");
    g.add(mk(box(1.1, 1.1, 1.1), mat("#cfc6b0"), 0, 0.55, 0));
    g.add(mk(cyl(0.3, 0.42, 1.7, 8), m, 0, 1.95, 0)); g.add(mk(sph(0.27, 10, 8), m, 0, 3, 0));
    g.add(mk(cyl(0.07, 0.07, 1.1, 6), m, 0.45, 2.6, 0, 0, 0, -0.5));
    g.add(mk(cyl(0.03, 0.03, 1.5, 5), mat("#c9a02e", { metalness: 0.7 }), 0.75, 3, 0));
    return withR(g, 0.8);
  }
  function olive() {
    var g = G(); g.add(mk(cyl(0.18, 0.32, 1.9, 6), mat("#6e5a42"), 0, 0.95, 0, 0, 0, rnd(-0.15, 0.15)));
    for (var i = 0; i < 3; i++) { var s = mk(sph(0.9, 8, 6), mat("#8a9a6a"), rnd(-0.5, 0.5), 2.2 + i * 0.2, rnd(-0.5, 0.5)); s.scale.y = 0.65; g.add(s); }
    return withR(g, 0.5);
  }
  /* ---------- Moyen Âge ---------- */
  function tower(scale) {
    var g = G(), st = mat("#8d8a84"), s = scale || 1;
    g.add(mk(cyl(1.6 * s, 1.8 * s, 7 * s, 10), st, 0, 3.5 * s, 0));
    for (var i = 0; i < 8; i++) { var a = i / 8 * 6.28; g.add(mk(box(0.55 * s, 0.6 * s, 0.4 * s), st, Math.cos(a) * 1.55 * s, 7.3 * s, Math.sin(a) * 1.55 * s, 0, -a, 0)); }
    g.add(mk(cone(1.7 * s, 2.8 * s, 10), mat("#a33a2f"), 0, 8.7 * s, 0));
    g.add(mk(box(0.2 * s, 0.8 * s, 0.1 * s), mat("#14100c"), 0, 5 * s, 1.62 * s));
    return withR(g, 1.9 * s);
  }
  function wall() {
    var g = G(), st = mat("#97948c");
    g.add(mk(box(6, 3.4, 0.9), st, 0, 1.7, 0));
    for (var i = 0; i < 5; i++) g.add(mk(box(0.8, 0.6, 0.9), st, -2.4 + i * 1.2, 3.7, 0));
    return g;
  }
  function banner() {
    var g = G(); g.add(mk(cyl(0.06, 0.08, 4.8, 6), mat("#4a3a2a"), 0, 2.4, 0));
    var col = pick(["#b3262c", "#2a4ea0", "#c9a02e"]), f = mk(box(1.5, 1, 0.04), mat(col, { roughness: 0.7 }), 0.8, 4.1, 0);
    g.add(f); g.userData.fx = [{ m: f, k: "wave", i: Math.random() * 6 }];
    return withR(g, 0.15);
  }
  function haystack() {
    var g = G(); g.add(mk(cyl(0.95, 1.05, 1.1, 10), mat("#d6b24d"), 0, 0.55, 0)); g.add(mk(cone(1.05, 1, 10), mat("#c9a23a"), 0, 1.6, 0));
    return withR(g, 1);
  }
  function barrels() {
    var g = G(), m = mat("#6e4a2a");
    [[0, 0], [0.8, 0.2], [0.35, 0.7]].forEach(function (p, i) { g.add(mk(cyl(0.38, 0.38, 0.85, 10), m, p[0], 0.43, p[1])); g.add(mk(new THREE.TorusGeometry(0.38, 0.03, 4, 10), mat("#2b2b2f"), p[0], 0.43, p[1], Math.PI / 2, 0, 0)); });
    g.add(mk(cyl(0.36, 0.36, 0.85, 10), m, 0.38, 1.25, 0.25));
    return withR(g, 1);
  }
  function pine() {
    var g = G(); g.add(mk(cyl(0.2, 0.3, 1.8, 6), mat("#4a3322"), 0, 0.9, 0));
    for (var i = 0; i < 4; i++) g.add(mk(cone(1.5 - i * 0.3, 1.8, 8), mat("#1f4d2b"), 0, 2 + i * 1.0, 0));
    return withR(g, 0.5);
  }
  function torch() {
    var g = G(); g.add(mk(cyl(0.05, 0.07, 2.2, 5), mat("#4a3322"), 0, 1.1, 0));
    var f = mk(cone(0.2, 0.6, 6), basic("#ff9a3c", { transparent: true, opacity: 0.92 }), 0, 2.5, 0); g.add(f);
    g.userData.fx = [{ m: f, k: "flame", i: Math.random() * 6, y: 2.5 }];
    return withR(g, 0.15);
  }
  function castle() {
    var g = G(), st = mat("#8d8a84");
    g.add(mk(box(9, 11, 7), st, 0, 5.5, 0));
    for (var i = 0; i < 9; i++) g.add(mk(box(0.8, 0.8, 0.8), st, -4 + i, 11.4, 3.3));
    [[-5.5, 3.5], [5.5, 3.5], [-5.5, -3.5], [5.5, -3.5]].forEach(function (p) { var t = tower(1.1); t.position.set(p[0], 0, p[1]); g.add(t); });
    g.add(mk(box(2.2, 3.4, 0.3), mat("#2a1d12"), 0, 1.7, 3.55));
    return g;
  }
  /* ---------- Révolution ---------- */
  function barricade() {
    var g = G(), w = mat("#7a5a36"), d = mat("#4a3322");
    g.add(mk(box(1.4, 1.1, 1.1), w, -0.9, 0.55, 0, 0, 0.2, 0)); g.add(mk(box(1.2, 1, 1.1), w, 0.6, 0.5, 0.1, 0, -0.15, 0));
    g.add(mk(cyl(0.4, 0.4, 0.9, 10), d, 0, 1.55, 0)); g.add(mk(cyl(0.38, 0.38, 0.85, 10), d, -1.3, 1.5, 0.1));
    g.add(mk(new THREE.TorusGeometry(0.75, 0.09, 6, 14), d, 1.5, 0.85, 0.5, 0, 0.3, 0));
    g.add(mk(box(0.15, 2.4, 0.4), w, 0.2, 1.2, -0.6, 0, 0, 0.5)); g.add(mk(box(0.15, 2.2, 0.4), w, -0.4, 1.1, -0.6, 0, 0, -0.45));
    return withR(g, 1.4);
  }
  function tricolor(k) {
    var g = G(); g.add(mk(cyl(0.06, 0.08, 4.6, 6), mat("#3a2d22"), 0, 2.3, 0));
    var s = k || 1, cs = ["#1f3f9a", "#f4f4f4", "#d8262c"], fx = [];
    for (var i = 0; i < 3; i++) { var f = mk(box(0.5 * s, 1.3 * s, 0.04), mat(cs[i], { roughness: 0.7 }), (0.3 + i * 0.5) * s, 3.9, 0); g.add(f); fx.push({ m: f, k: "wave", i: i * 0.5 }); }
    g.userData.fx = fx; return withR(g, 0.15);
  }
  function cannon() {
    var g = G(), fe = mat("#2b2b2f", { metalness: 0.5 }), w = mat("#6a4a2a");
    g.add(mk(cyl(0.3, 0.42, 2.1, 10), fe, 0.2, 0.95, 0, 0, 0, Math.PI / 2 - 0.15));
    g.add(mk(box(1.6, 0.4, 0.8), w, 0, 0.6, 0));
    [0.5, -0.5].forEach(function (z) { g.add(mk(new THREE.TorusGeometry(0.55, 0.1, 6, 12), w, -0.1, 0.55, z)); });
    return withR(g, 1);
  }
  function lamp() {
    var g = G(); g.add(mk(cyl(0.06, 0.1, 3.4, 6), mat("#222226", { metalness: 0.4 }), 0, 1.7, 0));
    g.add(mk(sph(0.28, 8, 6), glow("#ffd37a", 1.2), 0, 3.5, 0));
    return withR(g, 0.2);
  }
  function townhouse() {
    var g = G(), w = rnd(4, 6), h = rnd(7, 10);
    g.add(mk(box(w, h, 4), mat(pick(["#d6c9a8", "#cdbf9c", "#dad0b4"])), 0, h / 2, 0));
    var roof = mk(box(w * 1.05, 2, 4.2), mat("#4a4f58"), 0, h + 1, 0); g.add(roof);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) g.add(mk(box(0.6, 1, 0.1), mat("#2b3544"), -w / 3 + c * w / 3, 1.8 + r * 2.4, 2.03));
    return g;
  }
  /* ---------- Temps modernes ---------- */
  function factory() {
    var g = G(), br = mat("#8a4a3a");
    g.add(mk(box(5.5, 3.6, 4), br, 0, 1.8, 0));
    for (var i = 0; i < 3; i++) g.add(mk(box(1.7, 1.2, 4.1), mat("#5a5f66"), -1.8 + i * 1.8, 4.1, 0, 0, 0, 0.0));
    g.add(mk(cyl(0.5, 0.7, 9, 10), mat("#7a3e30"), 2.2, 4.5, 0));
    var fx = [];
    for (var s = 0; s < 3; s++) { var p = mk(sph(0.7, 8, 6), basic("#9a9a9a", { transparent: true, opacity: 0.55 }), 2.2, 9.5 + s * 1.2, 0); g.add(p); fx.push({ m: p, k: "smoke", i: s, y: 9.5 }); }
    g.add(mk(box(1.2, 1.4, 0.1), glow("#ffb648", 0.6), -1.5, 1.6, 2.03));
    g.userData.fx = fx; return withR(g, 2.9);
  }
  function wagon() {
    var g = G(); g.add(mk(box(4.2, 0.12, 0.12), mat("#3a3a3e"), 0, 0.06, 0.8)); g.add(mk(box(4.2, 0.12, 0.12), mat("#3a3a3e"), 0, 0.06, -0.8));
    g.add(mk(box(3.4, 1.6, 1.8), mat("#3b5a7a"), 0, 1.2, 0));
    [[-1.1, 0.9], [1.1, 0.9], [-1.1, -0.9], [1.1, -0.9]].forEach(function (p) { g.add(mk(cyl(0.38, 0.38, 0.15, 12), mat("#222226"), p[0], 0.4, p[1], Math.PI / 2, 0, 0)); });
    return withR(g, 1.7);
  }
  function gaslamp() {
    var g = G(); g.add(mk(cyl(0.05, 0.09, 3, 6), mat("#1f3a2e", { metalness: 0.4 }), 0, 1.5, 0));
    g.add(mk(box(0.4, 0.55, 0.4), glow("#ffd37a", 1), 0, 3.2, 0)); g.add(mk(cone(0.35, 0.3, 4), mat("#1f3a2e"), 0, 3.6, 0, 0, Math.PI / 4, 0));
    return withR(g, 0.2);
  }
  function crates() {
    var g = G(), m = mat("#a98255");
    g.add(mk(box(1, 1, 1), m, 0, 0.5, 0, 0, 0.2, 0)); g.add(mk(box(0.9, 0.9, 0.9), m, 1.1, 0.45, 0.2, 0, -0.1, 0)); g.add(mk(box(0.8, 0.8, 0.8), m, 0.4, 1.35, 0, 0, 0.5, 0));
    return withR(g, 1);
  }
  function watertower() {
    var g = G(), st = mat("#6a5440");
    [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].forEach(function (p) { g.add(mk(cyl(0.07, 0.07, 4.6, 5), st, p[0], 2.3, p[1])); });
    g.add(mk(cyl(1.2, 1.2, 1.8, 12), mat("#7a5a44"), 0, 5.5, 0)); g.add(mk(cone(1.3, 0.8, 12), mat("#4a3a30"), 0, 6.8, 0));
    return withR(g, 0.9);
  }
  function brickblock() {
    var g = G(), w = rnd(4, 7), h = rnd(6, 11);
    g.add(mk(box(w, h, 4), mat(pick(["#8a4a3a", "#7a4034", "#94523f"])), 0, h / 2, 0));
    for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) { var lit = Math.random() < 0.3; g.add(mk(box(0.6, 0.9, 0.1), lit ? mat("#ffd37a", { emissive: "#ffb648", emissiveIntensity: 0.5 }) : mat("#26303c"), -w / 3 + c * w / 3, 1.5 + r * 2, 2.03)); }
    return g;
  }
  /* ---------- futur ---------- */
  function pylon() {
    var g = G(), c = pick(["#33e1ff", "#ff4fd8"]);
    g.add(mk(cyl(0.22, 0.4, 5.2, 8), mat("#10163a", { metalness: 0.6, roughness: 0.3 }), 0, 2.6, 0));
    for (var i = 0; i < 3; i++) g.add(mk(new THREE.TorusGeometry(0.42, 0.05, 6, 16), glow(c, 1.3), 0, 1.2 + i * 1.3, 0, Math.PI / 2, 0, 0));
    var o = mk(sph(0.32, 10, 8), glow(c, 1.6), 0, 5.5, 0); g.add(o); g.userData.fx = [{ m: o, k: "pulse" }];
    return withR(g, 0.6);
  }
  function hovercube() {
    var g = G(), c = pick(["#33e1ff", "#ff4fd8", "#9a6bff"]);
    var b = mk(box(0.8, 0.8, 0.8), glow(c, 0.9), 0, 2, 0); g.add(b);
    g.userData.fx = [{ m: b, k: "spin", i: Math.random() * 6, y: 2 }];
    return g;
  }
  function holoring() {
    var g = G(); g.add(mk(cyl(0.7, 0.9, 0.3, 14), mat("#10163a", { metalness: 0.6 }), 0, 0.15, 0));
    var r = mk(new THREE.TorusGeometry(0.9, 0.06, 8, 24), glow("#33e1ff", 1.4), 0, 1.5, 0); g.add(r);
    var o = mk(new THREE.OctahedronGeometry(0.4, 0), basic("#8ff3ff", { transparent: true, opacity: 0.75 }), 0, 1.5, 0); g.add(o);
    g.userData.fx = [{ m: r, k: "spin", i: 0, y: 1.5 }, { m: o, k: "spin", i: 2, y: 1.5 }];
    return withR(g, 0.9);
  }
  function skyscraper() {
    var g = G(), w = rnd(3, 5), h = rnd(10, 26), c = pick(["#33e1ff", "#ff4fd8", "#9a6bff"]);
    g.add(mk(box(w, h, w), mat("#0e1330", { metalness: 0.6, roughness: 0.25 }), 0, h / 2, 0));
    for (var i = 0; i < Math.floor(h / 3); i++) g.add(mk(box(w * 1.02, 0.12, w * 1.02), glow(c, 0.9), 0, 1.5 + i * 3, 0));
    g.add(mk(cyl(0.05, 0.05, 3, 4), glow(c, 1.4), 0, h + 1.5, 0));
    return g;
  }

  /* ============================== THEMES ============================== */
  function tex(draw, repeat) {
    var c = document.createElement("canvas"); c.width = c.height = 512;
    var x = c.getContext("2d"); draw(x, 512);
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat || 7, repeat || 7); return t;
  }
  function speckle(x, s, base, n, spread, rmin, rmax) {
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    for (var i = 0; i < n; i++) {
      var sh = Math.floor(Math.random() * spread * 2 - spread), r = rmin + Math.random() * (rmax - rmin), col = base.match(/\d+/g).map(Number);
      x.fillStyle = "rgba(" + Math.max(0, Math.min(255, col[0] + sh)) + "," + Math.max(0, Math.min(255, col[1] + sh)) + "," + Math.max(0, Math.min(255, col[2] + sh)) + ",.45)";
      x.beginPath(); x.arc(Math.random() * s, Math.random() * s, r, 0, 6.3); x.fill();
    }
  }
  function flags(x, s, base, line, sz) {
    x.fillStyle = base; x.fillRect(0, 0, s, s); x.strokeStyle = line; x.lineWidth = 2;
    for (var i = 0; i <= s; i += sz) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); }
    for (var k = 0; k < 160; k++) { x.fillStyle = "rgba(0,0,0," + (Math.random() * 0.08) + ")"; x.fillRect(Math.floor(Math.random() * s / sz) * sz, Math.floor(Math.random() * s / sz) * sz, sz, sz); }
  }
  var THEMES = {
    dino: {
      bg: "#8fcf8a", fog: [16, 50], hemi: ["#e6ffd0", "#3a5a2a", 0.95], sun: ["#fff1c0", 1.1], far: "#3f6a30", lobbyGround: "#4f7a3a", rim: "#7a5a33",
      ground: function (x, s) { speckle(x, s, "rgb(80,122,58)", 600, 18, 3, 12); x.fillStyle = "rgba(110,82,50,.35)"; for (var i = 0; i < 40; i++) { x.beginPath(); x.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 24, 6 + Math.random() * 12, Math.random() * 3, 0, 6.3); x.fill(); } },
      build: function (B) {
        B.scatter(9, 0.15, 0.95, function () { return Math.random() < 0.5 ? conifer() : cycad(); }, { collide: true });
        B.scatter(10, 0.1, 1, fern, {});
        B.scatter(3, 0.3, 0.85, nest, { collide: true }); B.scatter(2, 0.3, 0.9, ribs, { collide: true });
        B.back(volcano, 1, 0.5, 2.0, 1.15); B.back(volcano, 1, 4.2, 2.2, 0.8);
        B.back(sauro, 1, 2.3, 1.75, 1.15); B.back(sauro, 1, 5.4, 1.95, 1); B.back(sauro, 1, 3.5, 2.4, 1.3);
      }
    },
    stone: {
      bg: "#e0a878", fog: [15, 48], hemi: ["#ffe2c0", "#5a4838", 0.85], sun: ["#ffc98a", 1.15], far: "#7a6a56", lobbyGround: "#8b7b66", rim: "#5a4a3a",
      ground: function (x, s) { speckle(x, s, "rgb(139,123,102)", 700, 22, 2, 9); },
      build: function (B) {
        B.scatter(6, 0.2, 0.95, rocks, { collide: true }); B.scatter(3, 0.25, 0.8, hut, { collide: true });
        B.scatter(2, 0.15, 0.6, campfire, { collide: true }); B.scatter(3, 0.3, 0.9, tusks, { collide: true }); B.scatter(5, 0.2, 0.95, menhir, { collide: true });
        B.ring(8, 1.7, cliff, { k: 1.2, n2: 5 }); B.back(mammoth, 1, 1.4, 1.75, 1.2); B.back(mammoth, 1, 4.6, 2, 1);
      }
    },
    antiq: {
      bg: "#8fc9f2", fog: [18, 55], hemi: ["#eaf6ff", "#9a8a6a", 1.0], sun: ["#fff4d6", 1.2], far: "#cdbf98", lobbyGround: "#d9ccaa", rim: "#cfc6b0",
      ground: function (x, s) { flags(x, s, "rgb(222,210,178)", "rgba(120,104,70,.35)", 128); },
      build: function (B) {
        B.scatter(7, 0.2, 0.95, function () { return Math.random() < 0.45 ? brokenColumn() : column(); }, { collide: true });
        B.scatter(2, 0.45, 0.8, temple, { collide: true }); B.scatter(3, 0.3, 0.9, statue, { collide: true }); B.scatter(5, 0.15, 1, olive, { collide: true });
        B.ring(B.cnt(34, 22), 1.85, function () { var g = G(); g.add(mk(box(5.2, 11, 1.4), mat("#d8cba6"), 0, 5.5, 0)); g.add(mk(box(3, 4.4, 0.4), mat("#3a2f22"), 0, 3, 0.75)); g.add(mk(box(3, 3.2, 0.4), mat("#3a2f22"), 0, 8, 0.75)); return g; }, { k: 1, face: true });
      }
    },
    medieval: {
      bg: "#9db0c0", fog: [14, 46], hemi: ["#dbe7f2", "#4a5a30", 0.85], sun: ["#fff0d0", 1.0], far: "#55653a", lobbyGround: "#5d6b3a", rim: "#7a766e",
      ground: function (x, s) { speckle(x, s, "rgb(93,115,58)", 650, 16, 3, 10); x.fillStyle = "rgba(125,100,70,.4)"; x.fillRect(0, s * 0.4, s, s * 0.14); },
      build: function (B) {
        B.scatter(3, 0.4, 0.85, function () { return tower(); }, { collide: true }); B.scatter(5, 0.2, 0.95, pine, { collide: true });
        B.scatter(3, 0.3, 0.9, haystack, { collide: true }); B.scatter(3, 0.3, 0.95, barrels, { collide: true }); B.scatter(6, 0.3, 1, banner, {}); B.scatter(4, 0.25, 0.95, torch, {});
        B.ring(B.cnt(10, 8), 1.4, wall, { k: 1.5, face: true, tang: true }); B.back(castle, 1, 1.2, 2.2, 1.3);
      }
    },
    revol: {
      bg: "#b9a89a", fog: [13, 44], hemi: ["#f1e2d2", "#4a4540", 0.85], sun: ["#ffd6a0", 0.95], far: "#5a544e", lobbyGround: "#6f6a64", rim: "#4a4540",
      ground: function (x, s) { flags(x, s, "rgb(111,106,100)", "rgba(40,36,32,.55)", 32); },
      build: function (B) {
        B.scatter(5, 0.25, 0.9, barricade, { collide: true }); B.scatter(3, 0.25, 0.85, cannon, { collide: true });
        B.scatter(8, 0.2, 1, function () { return tricolor(); }, {}); B.scatter(5, 0.2, 0.95, lamp, {});
        B.ring(B.cnt(14, 9), 1.55, townhouse, { k: 1.25, face: true }); B.back(function () { return tricolor(3); }, 1, 0.8, 1.45, 1);
      }
    },
    modern: {
      bg: "#a6adb2", fog: [13, 44], hemi: ["#e4e9ed", "#44403c", 0.85], sun: ["#ffe6c0", 0.9], far: "#4a4d50", lobbyGround: "#555a58", rim: "#3a3a3e",
      ground: function (x, s) { flags(x, s, "rgb(85,90,88)", "rgba(30,30,32,.5)", 64); x.fillStyle = "rgba(255,200,80,.5)"; x.fillRect(0, s * 0.48, s, 4); },
      build: function (B) {
        B.scatter(3, 0.4, 0.85, factory, { collide: true }); B.scatter(2, 0.3, 0.8, wagon, { collide: true }); B.scatter(6, 0.2, 0.95, gaslamp, {});
        B.scatter(4, 0.25, 0.9, crates, { collide: true }); B.scatter(2, 0.5, 0.9, watertower, { collide: true });
        B.ring(B.cnt(16, 9), 1.55, brickblock, { k: 1.2, face: true });
      }
    },
    future: {
      bg: "#070b1f", fog: [14, 44], hemi: ["#7a9bff", "#1a0f3a", 0.6], sun: ["#9ad6ff", 0.7], far: "#05081a", lobbyGround: "#0b1230", rim: "#33e1ff", rimGlow: true,
      ground: function (x, s) { x.fillStyle = "#0b1230"; x.fillRect(0, 0, s, s); x.strokeStyle = "rgba(51,225,255,.6)"; x.lineWidth = 2; for (var i = 0; i <= s; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); } x.strokeStyle = "rgba(255,79,216,.35)"; for (var k = 32; k < s; k += 128) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, s); x.stroke(); } },
      build: function (B) {
        B.scatter(8, 0.2, 0.95, pylon, { collide: true }); B.scatter(5, 0.25, 0.95, hovercube, {}); B.scatter(3, 0.3, 0.85, holoring, { collide: true });
        B.ring(B.cnt(22, 12), 1.7, skyscraper, { k: 1.2 });
      }
    }
  };

  /* ============================== CONSTRUCTEUR DE DÉCOR ============================== */
  function builder(mode, ctx) {
    var B = { mode: mode, R: mode === "arena" ? ctx.R : 5, s: mode === "arena" ? 1 : 0.5, group: G(), fx: [], ctx: ctx };
    B.cnt = function (a, l) { return mode === "arena" ? a : l; };
    function front(x, z) { return mode === "lobby" && z > 0.8; }
    function add(g, x, z, o) {
      var k = (o && o.k) || 1;
      g.scale.setScalar(B.s * k); g.position.set(x, 0, z);
      if (o && o.face) g.rotation.y = Math.atan2(-x, -z);
      if (o && o.tang) g.rotation.y += Math.PI / 2 * 0;
      if (o && o.collide && mode === "arena" && ctx.obstacles) ctx.obstacles.push({ x: x, z: z, radius: (g.userData.r || 0.6) * B.s * k });
      B.group.add(g);
      if (g.userData.fx) g.userData.fx.forEach(function (f) { f.base = f.m.position.y; B.fx.push(f); });
    }
    B.scatter = function (n, f0, f1, make, o) {
      var cnt = mode === "arena" ? n : Math.max(1, Math.round(n * 0.5));
      for (var i = 0, t = 0; i < cnt && t < 60; t++) {
        var a = Math.random() * 6.283, d = B.R * (f0 + Math.random() * (f1 - f0));
        if (mode === "lobby") { d = 2.2 + Math.random() * 2.8; }
        var x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (front(x, z)) continue;
        add(make(), x, z, { collide: o && o.collide, k: (o && o.k) || 1 }); i++;
      }
    };
    B.ring = function (n, f, make, o) {
      var cnt = typeof n === "number" ? n : 12, d = B.R * f * (mode === "lobby" ? 1.1 : 1);
      for (var i = 0; i < cnt; i++) {
        var a = i / cnt * 6.283, x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (mode === "lobby" && z > -0.5) continue;
        add(make(), x, z, { k: (o && o.k) || 1, face: true });
      }
    };
    B.back = function (make, n, a0, f, k) {
      var a = a0, d = B.R * f * (mode === "lobby" ? 1.2 : 1), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (mode === "lobby") { a = 3.7 + (a % 1.6) ; x = Math.cos(a) * d; z = Math.sin(a) * d; }
      add(make(), x, z, { k: (k || 1) * (mode === "lobby" ? 0.9 : 1), face: true });
    };
    return B;
  }
  function discOfFar(R, color) {
    var d = mk(new THREE.CircleGeometry(R, 40), mat(color, { roughness: 1 }), 0, -0.02, 0, -Math.PI / 2, 0, 0); return d;
  }

  var arenaFx = [], lobbyFx = [];
  function runFx(list, now) {
    var t = now / 1000;
    for (var i = 0; i < list.length; i++) {
      var f = list[i], m = f.m; if (!m) continue;
      if (f.k === "flame") { var k = 1 + Math.sin(t * 9 + f.i * 2.1) * 0.18 + Math.sin(t * 14 + f.i) * 0.08; m.scale.set(1 / k * 0.95 + 0.05, k, 1 / k * 0.95 + 0.05); m.position.y = f.base + (k - 1) * 0.2; }
      else if (f.k === "wave") m.rotation.y = Math.sin(t * 3 + f.i * 2) * 0.35;
      else if (f.k === "pulse") { m.scale.setScalar(1 + Math.sin(t * 3) * 0.15); }
      else if (f.k === "spin") { m.rotation.y = t * 1.2 + f.i; m.rotation.x = Math.sin(t + f.i) * 0.3; m.position.y = f.base + Math.sin(t * 1.5 + f.i) * 0.25; }
      else if (f.k === "smoke") { var u = ((t * 0.25 + f.i / 3) % 1); m.position.y = f.base + u * 4; m.scale.setScalar(0.6 + u * 1.2); if (m.material) m.material.opacity = 0.55 * (1 - u); }
    }
  }
  function applyAtmos(scene, th, fogOverride) {
    scene.background = new THREE.Color(th.bg);
    scene.fog = new THREE.Fog(th.bg, fogOverride ? fogOverride[0] : th.fog[0], fogOverride ? fogOverride[1] : th.fog[1]);
  }

  /* ---- arène : appelée par game.js (chapitres 1-6 et 8) ---- */
  function buildArena(ctx, n) {
    var th = THEMES[CH[n - 1].key]; if (!th) return false;
    var scene = ctx.scene, R = ctx.R;
    applyAtmos(scene, th);
    if (ctx.hemi) { ctx.hemi.color.set(th.hemi[0]); ctx.hemi.groundColor.set(th.hemi[1]); ctx.hemi.intensity = th.hemi[2]; }
    if (ctx.sun) { ctx.sun.color.set(th.sun[0]); ctx.sun.intensity = th.sun[1]; }
    scene.add(discOfFar(R * 6, th.far));
    var g = mk(new THREE.PlaneGeometry(R * 2.4, R * 2.4, 1, 1), new THREE.MeshStandardMaterial({ map: tex(th.ground, 7), roughness: 0.95, metalness: 0 }), 0, 0, 0, -Math.PI / 2, 0, 0);
    scene.add(g);
    var B = builder("arena", ctx); th.build(B); scene.add(B.group); arenaFx = B.fx;
    var rim = mk(new THREE.TorusGeometry(R, 0.15, 8, 48), mat(th.rim, th.rimGlow ? { emissive: th.rim, emissiveIntensity: 1.2 } : { emissive: th.rim, emissiveIntensity: 0.1 }), 0, 0.1, 0, Math.PI / 2, 0, 0);
    scene.add(rim);
    if (th.rimGlow) { var bar = mk(new THREE.CylinderGeometry(R, R, 3.4, 72, 1, true), basic(th.rim, { transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }), 0, 1.7, 0); scene.add(bar); }
    return true;
  }
  /* ---- lobby ---- */
  function dressLobby(L, n) {
    var scene = L.scene;
    if (L._decor) { scene.remove(L._decor); L._decor.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); L._decor = null; }
    if (L._far) { scene.remove(L._far); L._far = null; }
    lobbyFx = [];
    var th = THEMES[CH[n - 1].key];
    if (!th) {
      scene.background = new THREE.Color("#0a0e14"); scene.fog = new THREE.Fog("#0a0e14", 6, 16);
      if (L.hemi) { L.hemi.color.set("#8fb8ff"); L.hemi.groundColor.set("#1a1410"); L.hemi.intensity = 0.6; }
      if (L.key) { L.key.color.set("#ffd8a0"); L.key.intensity = 1.1; }
      if (L.rim) L.rim.color.set("#45d6c4");
      if (L.ground) { L.ground.material.map = null; L.ground.material.color.set("#141c26"); L.ground.material.needsUpdate = true; }
      return;
    }
    applyAtmos(scene, th, [9, 26]);
    if (L.hemi) { L.hemi.color.set(th.hemi[0]); L.hemi.groundColor.set(th.hemi[1]); L.hemi.intensity = Math.max(0.7, th.hemi[2]); }
    if (L.key) { L.key.color.set(th.sun[0]); L.key.intensity = Math.max(1, th.sun[1]); }
    if (L.rim) L.rim.color.set(n === 8 ? "#ff4fd8" : "#fff3d0");
    if (L.ground) { L.ground.material.map = tex(th.ground, 2); L.ground.material.color.set("#ffffff"); L.ground.material.needsUpdate = true; }
    var far = discOfFar(60, th.far); far.position.y = -0.03; scene.add(far); L._far = far;
    var B = builder("lobby", { R: 5, scene: scene }); th.build(B); scene.add(B.group); L._decor = B.group; lobbyFx = B.fx;
  }

  /* ============================== LIVRE DES CHAPITRES ============================== */
  var ART = {
    dino: { sky: "linear-gradient(#8fe0ff,#d9f6b0 70%)", gr: "#4f7a3a", items: [["🌋", 74, 38, 4.2], ["🦕", 30, 40, 5], ["🌴", 8, 52, 3], ["🌿", 52, 70, 2.2], ["🦖", 62, 66, 2.6], ["🥚", 18, 78, 1.8], ["☀️", 12, 8, 2.6]] },
    stone: { sky: "linear-gradient(#ffb36b,#ffe0a6 70%)", gr: "#8b7b66", items: [["🏔️", 72, 34, 4.2], ["🦣", 32, 46, 4.6], ["🔥", 54, 74, 2.8], ["🪨", 10, 70, 2.4], ["🦴", 82, 78, 1.8], ["🌅", 14, 10, 2.6]] },
    antiq: { sky: "linear-gradient(#7cc4f4,#e8f4ff 70%)", gr: "#d9ccaa", items: [["🏛️", 60, 40, 5], ["🗿", 16, 56, 3.2], ["🏺", 84, 74, 2.2], ["⚔️", 38, 72, 2.4], ["🫒", 8, 76, 2.2], ["☀️", 14, 8, 2.6]] },
    medieval: { sky: "linear-gradient(#93a8bb,#d8e2ea 70%)", gr: "#5d6b3a", items: [["🏰", 56, 38, 5.4], ["🐎", 20, 64, 3], ["🛡️", 80, 72, 2.4], ["🚩", 84, 30, 2.6], ["🌲", 8, 52, 3], ["☁️", 22, 10, 3]] },
    revol: { sky: "linear-gradient(#b39b8c,#ecd9c8 70%)", gr: "#6f6a64", items: [["🚩", 52, 36, 4.2], ["💣", 22, 70, 2.4], ["🔔", 82, 36, 3], ["📜", 70, 74, 2.2], ["🐓", 12, 56, 3], ["🕯️", 40, 76, 2]] },
    modern: { sky: "linear-gradient(#a2aab0,#dfe3e6 70%)", gr: "#555a58", items: [["🏭", 58, 40, 5], ["🚂", 24, 64, 4], ["⚙️", 84, 72, 2.4], ["🎩", 10, 40, 2.6], ["🕰️", 80, 24, 2.6], ["💨", 66, 14, 2.4]] },
    now: { sky: "linear-gradient(#78b8ff,#dbeeff 70%)", gr: "#3d4a3a", items: [["🏙️", 60, 38, 5.2], ["🚗", 24, 68, 3.2], ["✈️", 74, 10, 2.8], ["📱", 84, 70, 2.2], ["🌳", 8, 54, 3]] },
    future: { sky: "linear-gradient(#0b1030,#3a1a6a 70%)", gr: "#0b1230", items: [["🌆", 58, 38, 5.2], ["🚀", 22, 22, 3.4], ["🛸", 78, 14, 3], ["🤖", 24, 66, 3.2], ["✨", 84, 56, 2.4], ["🪐", 10, 10, 2.6]] }
  };
  var bookEl = null, bookSel = 1, bookPts = 0;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pageHtml(sel) {
    var c = CH[sel - 1], cur = of_(bookPts), inf = info(bookPts), a = ART[c.key];
    var state = sel < cur ? "done" : sel === cur ? "cur" : "lock";
    var range = c.min + (CH[sel] ? " – " + (CH[sel].min - 1) : "+") + " médailles";
    var left = '<div class="bk-pg-in"><small class="bk-k">CHAPITRE</small><div class="bk-num">' + c.n + '</div><h2>' + esc(c.name) + '</h2>' +
      '<div class="bk-medals"><span>🏅</span><b>' + inf.medals + '</b><small>médailles (trophées)</small></div>' +
      '<div class="bk-range">' + range + "</div>";
    if (state === "cur") left += (inf.next ? '<div class="bk-bar"><i style="width:' + inf.pct.toFixed(1) + '%"></i></div><div class="bk-sub">' + inf.medals + " / " + inf.next.min + " vers le <b>chapitre " + inf.next.n + "</b><br>" + esc(inf.next.name) + ' · encore <b>' + (inf.next.min - inf.medals) + "</b> 🏅</div>" : '<div class="bk-sub">👑 Dernier chapitre atteint !</div>') + '<div class="bk-chip on">📍 Ton chapitre actuel</div>';
    else if (state === "done") left += '<div class="bk-chip ok">✅ Chapitre terminé</div><div class="bk-sub">Tes médailles ne descendent jamais sous le début de ton chapitre.</div>';
    else left += '<div class="bk-chip lk">🔒 Encore <b>' + (c.min - inf.medals) + "</b> médailles</div><div class=\"bk-sub\">Atteins " + c.min + " 🏅 pour débloquer ce monde.</div>";
    left += "</div>";
    var items = a.items.map(function (it, i) { return '<span class="bk-it" style="left:' + it[1] + "%;top:" + it[2] + "%;font-size:" + it[3] + "rem;animation-delay:" + (i * 0.35) + 's">' + it[0] + "</span>"; }).join("");
    var right = '<div class="bk-pg-in"><small class="bk-k">MONDE · ' + c.n + "/8</small><h3>" + esc(c.name) + '</h3><div class="bk-art ' + (state === "lock" ? "lk" : "") + '" style="background:' + a.sky + '"><i class="bk-gr" style="background:' + a.gr + '"></i>' + items + (state === "lock" ? '<em class="bk-lock">🔒</em>' : "") + '</div><p class="bk-desc">' + esc(c.desc) + '</p>' +
      '<div class="bk-nav"><button data-bk="prev"' + (sel <= 1 ? " disabled" : "") + ' aria-label="Précédent">◀</button><span>' + CH.map(function (x) { return '<i class="' + (x.n === sel ? "on " : "") + (x.n <= cur ? "un" : "") + '"></i>'; }).join("") + '</span><button data-bk="next"' + (sel >= CH.length ? " disabled" : "") + ' aria-label="Suivant">▶</button></div></div>';
    return { left: left, right: right };
  }
  function paintBook(dir) {
    if (!bookEl) return;
    var p = pageHtml(bookSel);
    bookEl.querySelector(".bk-back").innerHTML = p.left;
    var r = bookEl.querySelector(".bk-right"); r.innerHTML = p.right;
    if (dir) { r.classList.remove("turn", "turnb"); void r.offsetWidth; r.classList.add(dir < 0 ? "turnb" : "turn"); }
  }
  function openBook(points, opts) {
    closeBook();
    bookPts = Math.max(0, Number(points) || 0); bookSel = of_(bookPts);
    var ov = document.createElement("div"); ov.className = "bk-ov";
    ov.innerHTML = '<button class="bk-x" aria-label="Fermer">✕</button><div class="bk-stage"><div class="bk-book" id="bk-book">' +
      '<div class="bk-right"></div>' +
      '<div class="bk-cover"><div class="bk-front"><div class="bk-emb">📖</div><h1>TRUGO</h1><p>Le livre des chapitres</p><i class="bk-gem"></i></div><div class="bk-back"></div></div>' +
      "</div>" + (opts && opts.fresh ? '<div class="bk-new">🎉 Nouveau chapitre débloqué !</div>' : "") + "</div>";
    document.body.appendChild(ov); bookEl = ov;
    paintBook(0);
    ov.addEventListener("click", function (e) {
      if (e.target.closest(".bk-x") || e.target === ov) return closeBook();
      var b = e.target.closest("[data-bk]"); if (!b || b.disabled) return;
      var d = b.dataset.bk === "next" ? 1 : -1; bookSel = Math.max(1, Math.min(CH.length, bookSel + d)); paintBook(d);
    });
    var bk = ov.querySelector("#bk-book");
    setTimeout(function () { bk.classList.add("open"); }, 350);
  }
  function closeBook() { if (bookEl) { var e = bookEl; bookEl = null; e.classList.add("out"); setTimeout(function () { e.remove(); }, 250); } }

  /* nouveau chapitre atteint : ouvre le livre une fois */
  function checkNew(points, user) {
    var key = "trugo_chapter_seen_" + (user || ""), n = of_(points), seen = null;
    try { seen = Number(localStorage.getItem(key)) || null; } catch (e) {}
    try { localStorage.setItem(key, String(Math.max(n, seen || 0))); } catch (e) {}
    if (seen && n > seen) setTimeout(function () { openBook(points, { fresh: true }); }, 700);
  }

  window.TrugoChapters = {
    list: CH, of: of_, floor: floor_, info: info,
    openBook: openBook, closeBook: closeBook, checkNew: checkNew,
    buildArena: buildArena, dressLobby: dressLobby,
    update: function (now) { if (arenaFx.length) runFx(arenaFx, now); },
    resetArena: function () { arenaFx = []; },
    updateLobby: function (now) { if (lobbyFx.length) runFx(lobbyFx, now); }
  };
})();

"use strict";

(function () {
  var canvas = document.getElementById("gameCanvas");
  var stage = document.getElementById("stage");
  var statusEl = document.getElementById("status");
  if (!canvas || !stage) return;
  var ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  var BEST_KEY = "stack-it.best";
  var BLOCK_H = 16;
  var GROUND = 8;
  var PERFECT_PX = 4;
  var EDGE_GAP = 10;
  var BASE_CROSS = 1.35;
  var PACE_STEP = 0.055;
  var PACE_MAX = 3.2;
  var BASE_COLOR = "#5c3d78";
  var COLORS = [
    "#ff4d6d",
    "#ff8c42",
    "#ffe14a",
    "#5dff9a",
    "#3ecfff",
    "#7d8cff",
    "#ff6ad5",
  ];
  var SKY = [
    [16, 8, 36],
    [28, 16, 64],
    [48, 26, 104],
    [78, 38, 146],
    [126, 50, 142],
    [188, 68, 112],
    [232, 108, 74],
    [255, 166, 86],
  ];
  var FONT = {
    A: ["010", "101", "111", "101", "101"],
    B: ["110", "101", "110", "101", "110"],
    C: ["111", "100", "100", "100", "111"],
    D: ["110", "101", "101", "101", "110"],
    E: ["111", "100", "110", "100", "111"],
    F: ["111", "100", "110", "100", "100"],
    G: ["111", "100", "101", "101", "111"],
    H: ["101", "101", "111", "101", "101"],
    I: ["111", "010", "010", "010", "111"],
    J: ["001", "001", "001", "101", "010"],
    K: ["101", "101", "110", "101", "101"],
    L: ["100", "100", "100", "100", "111"],
    M: ["101", "111", "101", "101", "101"],
    N: ["110", "101", "101", "101", "101"],
    O: ["111", "101", "101", "101", "111"],
    P: ["110", "101", "110", "100", "100"],
    Q: ["111", "101", "101", "111", "001"],
    R: ["110", "101", "110", "101", "101"],
    S: ["111", "100", "111", "001", "111"],
    T: ["111", "010", "010", "010", "010"],
    U: ["101", "101", "101", "101", "111"],
    V: ["101", "101", "101", "101", "010"],
    W: ["101", "101", "101", "111", "101"],
    X: ["101", "101", "010", "101", "101"],
    Y: ["101", "101", "010", "010", "010"],
    Z: ["111", "001", "010", "100", "111"],
    "0": ["111", "101", "101", "101", "111"],
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
  };

  var stars = [];
  for (var i = 0; i < 28; i++) {
    stars.push({
      x: (i * 47 + 13) % 197,
      y: (i * 29 + 5) % 120,
      w: i % 7 === 0 ? 2 : 1,
    });
  }

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    reduceMotion = false;
  }

  var viewW = 180;
  var viewH = 320;
  var camera = 0;
  var pace = 1;
  var score = 0;
  var best = loadBest();
  var phase = "ready";
  var stack = [];
  var mover = null;
  var crumbs = [];
  var flash = 0;
  var popup = 0;
  var shake = 0;
  var nextDir = 1;
  var booted = false;
  var lockUntil = 0;
  var last = 0;

  function loadBest() {
    try {
      var n = Number(window.localStorage.getItem(BEST_KEY));
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    } catch (err) {
      return 0;
    }
    return 0;
  }

  function saveBest(n) {
    try {
      window.localStorage.setItem(BEST_KEY, String(n));
    } catch (err) {
      /* private mode and blocked storage still play */
    }
  }

  function setStatus(text) {
    if (statusEl && statusEl.textContent !== text) statusEl.textContent = text;
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var f = function (c) {
      return Math.max(0, Math.min(255, c + amt));
    };
    return (
      "rgb(" +
      f((n >> 16) & 255) +
      "," +
      f((n >> 8) & 255) +
      "," +
      f(n & 255) +
      ")"
    );
  }

  function makeBase() {
    var w = Math.max(28, Math.round(viewW * 0.46));
    var x = Math.round((viewW - w) / 2);
    return { x: x, y: GROUND, w: w, h: BLOCK_H, color: BASE_COLOR };
  }

  function limitsFor(prev, w) {
    return {
      left: prev.x - w - EDGE_GAP,
      right: prev.x + prev.w + EDGE_GAP,
    };
  }

  function spawn(prev) {
    var dir = nextDir > 0 ? 1 : -1;
    nextDir = -nextDir;
    var w = prev.w;
    if (w > viewW) w = viewW;
    var lim = limitsFor(prev, w);
    return {
      x: dir > 0 ? lim.left : lim.right,
      y: prev.y + BLOCK_H,
      w: w,
      h: BLOCK_H,
      dir: dir,
      acc: 0,
      color: COLORS[(stack.length - 1) % COLORS.length],
    };
  }

  function reset(nextPhase) {
    stack = [makeBase()];
    nextDir = 1;
    mover = spawn(stack[0]);
    crumbs = [];
    camera = 0;
    pace = 1;
    score = 0;
    flash = 0;
    popup = 0;
    shake = 0;
    phase = nextPhase;
    if (nextPhase === "ready") {
      setStatus("Tap, click, or press space to drop the block.");
    } else {
      setStatus("Score 0. Best " + best + ".");
    }
  }

  function scaleWorldX(s) {
    var b;
    for (var i = 0; i < stack.length; i++) {
      b = stack[i];
      b.x = Math.round(b.x * s);
      b.w = Math.max(1, Math.round(b.w * s));
    }
    if (mover) {
      mover.x = Math.round(mover.x * s);
      mover.w = Math.max(1, Math.round(mover.w * s));
    }
    for (var c = 0; c < crumbs.length; c++) {
      crumbs[c].x *= s;
      crumbs[c].w *= s;
      crumbs[c].vx *= s;
    }
  }

  function fitCanvas() {
    var vw = stage.clientWidth;
    var vh = stage.clientHeight;
    if (vw < 2 || vh < 2) return false;
    var sc = Math.max(1, Math.floor(vw / 120));
    while (sc > 1 && vh / sc < 220) sc -= 1;
    var lw = Math.min(200, Math.floor(vw / sc));
    var lh = Math.max(1, Math.floor(vh / sc));
    if (lw < 1) lw = 1;
    sc = Math.max(1, Math.min(Math.floor(vw / lw), Math.floor(vh / lh)));
    var prevW = viewW;
    viewW = lw;
    viewH = lh;
    canvas.width = lw;
    canvas.height = lh;
    canvas.style.width = lw * sc + "px";
    canvas.style.height = lh * sc + "px";
    ctx.imageSmoothingEnabled = false;
    if (booted && prevW > 0 && prevW !== lw) scaleWorldX(lw / prevW);
    return true;
  }

  function currentSpeed() {
    var width = mover ? mover.w : Math.round(viewW * 0.46);
    var travel = Math.max(20, width * 2 + EDGE_GAP * 2);
    var seconds = Math.max(0.34, BASE_CROSS / pace);
    return travel / seconds;
  }

  function stepMover(dt) {
    if (!mover || !stack.length) return;
    var lim = limitsFor(stack[stack.length - 1], mover.w);
    mover.acc += currentSpeed() * dt;
    var step = Math.min(64, Math.floor(mover.acc));
    mover.acc -= step;
    while (step > 0) {
      mover.x += mover.dir;
      if (mover.dir > 0 && mover.x >= lim.right) {
        mover.x = lim.right;
        mover.dir = -1;
      } else if (mover.dir < 0 && mover.x <= lim.left) {
        mover.x = lim.left;
        mover.dir = 1;
      }
      step -= 1;
    }
  }

  function pushCrumb(x, y, w, vx) {
    crumbs.push({
      x: x,
      y: y,
      w: w,
      h: BLOCK_H,
      vx: vx,
      vy: 60,
      life: 1.05,
      color: mover.color,
    });
  }

  function succeed(block, perfect) {
    stack.push(block);
    score += 1;
    if (score > best) {
      best = score;
      saveBest(best);
    }
    pace = Math.min(PACE_MAX, pace + PACE_STEP);
    if (perfect) {
      flash = 1;
      popup = 0.85;
    } else {
      shake = Math.max(shake, 1.8);
    }
    mover = spawn(block);
    setStatus("Score " + score + ". Best " + best + ".");
  }

  function fail() {
    pushCrumb(mover.x, mover.y, mover.w, mover.dir * 50);
    mover = null;
    phase = "over";
    shake = 4.5;
    popup = 0;
    setStatus(
      "Game over. Score " + score + ". Best " + best + ". Tap to retry."
    );
  }

  function drop() {
    if (!mover || phase === "over") return;
    if (phase === "ready") phase = "playing";
    var prev = stack[stack.length - 1];
    var left = Math.max(prev.x, mover.x);
    var right = Math.min(prev.x + prev.w, mover.x + mover.w);
    var overlap = right - left;
    if (overlap < 1) {
      fail();
      return;
    }
    var delta = mover.x - prev.x;
    if (Math.abs(delta) <= PERFECT_PX) {
      succeed(
        {
          x: prev.x,
          y: mover.y,
          w: prev.w,
          h: BLOCK_H,
          color: mover.color,
        },
        true
      );
      return;
    }
    var x = Math.round(left);
    var w = Math.round(right) - x;
    if (x < prev.x) x = prev.x;
    if (x + w > prev.x + prev.w) w = prev.x + prev.w - x;
    if (w < 1) {
      fail();
      return;
    }
    if (delta > 0) {
      var rightOver = mover.x + mover.w - (x + w);
      if (rightOver >= 1) pushCrumb(x + w, mover.y, rightOver, 42);
    } else {
      var leftOver = x - mover.x;
      if (leftOver >= 1) pushCrumb(mover.x, mover.y, leftOver, -42);
    }
    succeed({ x: x, y: mover.y, w: w, h: BLOCK_H, color: mover.color }, false);
  }

  function act(now) {
    if (!booted) return;
    if (now < lockUntil) return;
    if (phase === "over") {
      reset("playing");
      lockUntil = now + 280;
      return;
    }
    drop();
  }

  function update(dt) {
    if (mover && phase !== "over") stepMover(dt);
    var top = mover
      ? mover.y + mover.h
      : stack.length
        ? stack[stack.length - 1].y + BLOCK_H
        : 0;
    var target = Math.max(0, top - viewH * 0.56);
    var follow = 1 - Math.exp(-dt * (reduceMotion ? 14 : 3.1));
    camera += (target - camera) * follow;
    var kept = [];
    for (var i = 0; i < crumbs.length; i++) {
      var c = crumbs[i];
      c.vy -= 780 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life -= dt;
      if (c.life > 0) kept.push(c);
    }
    crumbs = kept;
    if (flash > 0) flash = Math.max(0, flash - dt * 2.4);
    if (popup > 0) popup = Math.max(0, popup - dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 9);
  }

  function screenRect(b) {
    return {
      x: Math.round(b.x),
      y: Math.round(viewH - (b.y + b.h - camera)),
      w: Math.max(1, Math.round(b.w)),
      h: Math.round(b.h),
    };
  }

  function drawBlock(b, outline) {
    var r = screenRect(b);
    if (r.y > viewH || r.y + r.h < 0) return r;
    var dark = shade(b.color, -58);
    var light = shade(b.color, 46);
    ctx.fillStyle = dark;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (r.w > 2 && r.h > 2) {
      ctx.fillStyle = b.color;
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
    if (r.w > 6 && r.h > 6) {
      ctx.fillStyle = light;
      ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 2);
      ctx.fillStyle = dark;
      for (var x = r.x + 8; x < r.x + r.w - 2; x += 8) {
        ctx.fillRect(x, r.y + 5, 1, r.h - 7);
      }
    }
    if (outline) {
      ctx.fillStyle = "#fff6e0";
      ctx.fillRect(r.x, r.y, r.w, 1);
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    }
    return r;
  }

  function drawSky() {
    var band = 8;
    for (var y = 0; y < viewH; y += band) {
      var t = y / Math.max(1, viewH - 1);
      var idx = Math.min(SKY.length - 1, Math.floor(t * SKY.length));
      var c = SKY[idx];
      ctx.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
      ctx.fillRect(0, y, viewW, band);
    }
  }

  function drawStars() {
    var drift = Math.floor(camera * 0.12);
    var flicker = Math.floor(performance.now() / 420);
    ctx.fillStyle = "#fff6e8";
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if ((i + flicker) % 13 === 0) continue;
      var x = (s.x + drift) % viewW;
      var y = s.y % Math.max(1, Math.floor(viewH * 0.48));
      ctx.globalAlpha = s.w === 2 ? 0.95 : 0.65;
      ctx.fillRect(x, y, s.w, s.w);
    }
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    var top = Math.round(viewH - (GROUND - camera));
    if (top >= viewH) return;
    var y0 = Math.max(0, top);
    ctx.fillStyle = "#24143f";
    ctx.fillRect(0, y0, viewW, viewH - y0);
    if (top >= 0 && top < viewH) {
      ctx.fillStyle = "#ffd36a";
      ctx.fillRect(0, top, viewW, 2);
      ctx.fillStyle = "#3c2264";
      for (var x = 0; x < viewW; x += 10) {
        ctx.fillRect(x, top + 4, 6, 2);
        ctx.fillRect(x + 5, top + 8, 6, 2);
      }
    }
  }

  function textWidth(str, scale) {
    return str.length * 4 * scale - scale;
  }

  function drawText(str, x, y, scale, color, align) {
    var s = String(str).toUpperCase();
    var width = textWidth(s, scale);
    var cx = Math.round(x);
    if (align === "center") cx = Math.round(x - width / 2);
    else if (align === "right") cx = Math.round(x - width);
    var cy = Math.round(y);
    for (var i = 0; i < s.length; i++) {
      var glyph = FONT[s[i]];
      if (glyph) {
        for (var r = 0; r < 5; r++) {
          for (var c = 0; c < 3; c++) {
            if (glyph[r][c] !== "1") continue;
            ctx.fillStyle = "#1a0b28";
            ctx.fillRect(cx + c * scale + 1, cy + r * scale + 1, scale, scale);
            ctx.fillStyle = color;
            ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
          }
        }
      }
      cx += 4 * scale;
    }
  }

  function drawBanner(text, y, color) {
    var scale = 2;
    var tw = textWidth(text, scale);
    var w = tw + 16;
    var h = 5 * scale + 10;
    var x = Math.round((viewW - w) / 2);
    y = Math.round(y);
    ctx.fillStyle = "#140a22";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
    drawText(text, viewW / 2, y + 5, scale, color, "center");
  }

  function drawHud() {
    drawText(String(score), viewW / 2, 8, 3, "#fff6e0", "center");
    if (best > 0) {
      drawText("BEST " + best, viewW / 2, 28, 1, "#f0c98a", "center");
    }
    if (phase === "ready") {
      drawBanner("TAP TO START", Math.round(viewH * 0.36), "#fff6e0");
    } else if (phase === "over") {
      var y = Math.round(viewH * 0.4);
      drawBanner("GAME OVER", y, "#ff5d73");
      drawBanner("TAP TO RETRY", y + 24, "#fff6e0");
    }
    if (popup > 0) {
      var py = 46;
      if (mover) {
        py = Math.round(viewH - (mover.y + mover.h - camera) - 18);
      }
      if (py < 42) py = 42;
      drawText("PERFECT", viewW / 2, py, 2, "#fff36a", "center");
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawSky();
    drawStars();
    ctx.save();
    if (shake > 0 && !reduceMotion) {
      var mag = shake > 2.2 ? 2 : 1;
      var ox = Math.floor(performance.now() / 45) % 2 === 0 ? -mag : mag;
      ctx.translate(ox, 0);
    }
    drawGround();
    for (var i = 0; i < stack.length; i++) drawBlock(stack[i], false);
    for (var j = 0; j < crumbs.length; j++) {
      ctx.globalAlpha = Math.max(0, Math.min(1, crumbs[j].life));
      drawBlock(crumbs[j], false);
      ctx.globalAlpha = 1;
    }
    if (mover && phase !== "over") drawBlock(mover, true);
    if (flash > 0 && stack.length > 1) {
      var r = screenRect(stack[stack.length - 1]);
      ctx.globalAlpha = Math.min(0.92, flash);
      ctx.fillStyle = "#fffef6";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawHud();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) {
      last = 0;
      return;
    }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    update(dt);
    draw();
  }

  function onPointer(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.isPrimary === false) return;
    if (e.cancelable) e.preventDefault();
    act(performance.now());
  }

  function onKey(e) {
    if (e.code !== "Space" && e.key !== " ") return;
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    act(performance.now());
  }

  window.addEventListener("pointerdown", onPointer, { passive: false });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", fitCanvas);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitCanvas);
  }
  document.addEventListener(
    "touchmove",
    function (e) {
      if (e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  function boot() {
    if (!fitCanvas()) {
      requestAnimationFrame(boot);
      return;
    }
    reset("ready");
    booted = true;
    requestAnimationFrame(loop);
  }

  boot();
})();

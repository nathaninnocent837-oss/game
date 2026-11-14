/* Compte à rebours de recherche de joueurs : anneau néon, radar, pulsation à chaque seconde */
(function () {
  "use strict";
  function setup() {
    var timer = document.getElementById("mm-timer"), wrap = document.querySelector("#screen-matchmaking .mm-wrap");
    if (!timer || !wrap || wrap.querySelector(".cd-ring")) return !!(wrap && wrap.querySelector(".cd-ring"));
    var C = 2 * Math.PI * 88, box = document.createElement("div");
    box.className = "cd-ring";
    box.innerHTML =
      '<svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="cdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb648"/><stop offset="1" stop-color="#ff5c68"/></linearGradient></defs>' +
      '<circle class="cd-bg" cx="100" cy="100" r="88"/><circle class="cd-ticks" cx="100" cy="100" r="96"/>' +
      '<circle class="cd-fg" cx="100" cy="100" r="88" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="0"/></svg>' +
      '<div class="cd-radar"></div><div class="cd-num"></div>';
    wrap.insertBefore(box, wrap.firstChild);
    var num = box.querySelector(".cd-num"), fg = box.querySelector(".cd-fg"), max = 10;
    num.appendChild(timer);
    function paint() {
      var n = parseInt(timer.textContent, 10); if (isNaN(n)) return;
      if (n > max) max = n;
      fg.style.strokeDashoffset = String(C * (1 - Math.max(0, n) / max));
      box.classList.toggle("hot", n <= 3 && n > 0);
      box.classList.toggle("done", n <= 0);
      num.classList.remove("tick"); void num.offsetWidth; num.classList.add("tick");
    }
    new MutationObserver(paint).observe(timer, { childList: true, characterData: true, subtree: true });
    new MutationObserver(function () { if (!document.getElementById("screen-matchmaking").classList.contains("active")) max = 10; })
      .observe(document.getElementById("screen-matchmaking"), { attributes: true, attributeFilter: ["class"] });
    paint();
    return true;
  }
  if (!setup()) { document.addEventListener("DOMContentLoaded", setup); setTimeout(setup, 1000); }
})();

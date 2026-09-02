/* =========================================================
   STEAM WRAPPED — вся логика страницы.
   Данные приходят из assets/js/data.js (window.STEAM_DATA).
   ========================================================= */
(function () {
  "use strict";

  var D = window.STEAM_DATA;
  if (!D) { console.error("Нет данных: assets/js/data.js не загрузился"); return; }

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- утилиты ---------- */

  var nf = new Intl.NumberFormat("ru-RU");
  function num(n) { return nf.format(Math.round(n)); }

  // склонение: plural(5, ['час','часа','часов'])
  function plural(n, forms) {
    n = Math.abs(Math.round(n)) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  function dec(n, d) {
    d = d === undefined ? 1 : d;
    return n.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function parseDate(iso) {
    if (!iso) return null;
    // даты без времени парсим как локальный полдень, чтобы не уезжать на день
    // в зависимости от часового пояса зрителя
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : new Date(iso);
    return isNaN(d) ? null : d;
  }

  function fmtDate(iso) {
    var d = parseDate(iso);
    if (!d) return "—";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }

  function daysAgo(iso) {
    var d = parseDate(iso);
    if (!d) return null;
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
  }

  // 0.1 часа не должны превращаться в «0»: маленьким числам оставляем десятые
  function smartDec(n) {
    return dec(n, n >= 10 ? 0 : 1);
  }

  /* ---------- разбор данных ---------- */

  var games   = (D.games || []).slice().sort(function (a, b) { return b.hours - a.hours; });
  var played  = games.filter(function (g) { return g.hours > 0; });
  var backlog = games.filter(function (g) { return !g.hours; });
  var totals  = D.totals || {};

  var soulmate = (D.soulmateAppid && games.filter(function (g) { return g.appid === D.soulmateAppid; })[0]) || played[0];

  var totalHours = totals.hoursTotal != null
    ? totals.hoursTotal
    : played.reduce(function (s, g) { return s + g.hours; }, 0);

  var hours2w = totals.hoursTwoWeeks != null
    ? totals.hoursTwoWeeks
    : games.reduce(function (s, g) { return s + (g.hours2w || 0); }, 0);

  var gamesOwned = totals.gamesOwned != null ? totals.gamesOwned : games.length;
  var neverPlayed = totals.gamesNeverPlayed != null ? totals.gamesNeverPlayed : backlog.length;

  /* ---------- шапка ---------- */

  document.title = "Steam Wrapped · " + (D.meta.persona || "profile");
  $("#brandName").textContent = D.meta.persona || "—";
  $("#year").textContent = new Date().getFullYear();
  $("#heroEyebrow").textContent = "Личная статистика" +
    (D.meta.memberSince ? " · в Steam с " + fmtDate(D.meta.memberSince) : "") +
    " · данные от " + fmtDate(D.meta.generatedAt);
  $$(".hero__title")[0].innerHTML = (D.meta.persona || "profile") + "<br><b>в цифрах.</b>";

  var pl = $("#profileLink");
  if (D.meta.profileUrl) pl.href = D.meta.profileUrl; else pl.style.display = "none";

  var av = $("#avatar");
  if (D.meta.avatar) {
    var img = new Image();
    img.src = D.meta.avatar;
    img.alt = D.meta.persona || "avatar";
    img.onload = function () { av.innerHTML = ""; av.appendChild(img); };
    img.onerror = function () { av.textContent = (D.meta.persona || "?").charAt(0).toUpperCase(); };
  } else {
    av.textContent = (D.meta.persona || "?").charAt(0).toUpperCase();
  }

  $("#sourceBadge").innerHTML = "источник данных: <b>" +
    (D.meta.source === "steam-api" ? "Steam Web API" :
     D.meta.source === "manual" ? "ручная сборка" : "образец") + "</b>";

  /* ---------- подсказки под главными цифрами ---------- */

  $("#hintGames").textContent = num(neverPlayed) + " " + plural(neverPlayed, ["игра ждёт", "игры ждут", "игр ждут"]) + " своего часа";
  $("#hintHours").textContent = "это " + dec(totalHours / 24, 0) + " " + plural(totalHours / 24, ["день", "дня", "дней"]) + " нон-стоп";
  $("#hint2w").textContent = "≈ " + dec(hours2w / 14, 1) + " ч в день";

  /* ---------- анимированные счётчики ---------- */

  var counters = {
    games: gamesOwned,
    hours: totalHours,
    hours2w: hours2w,
    smHours: soulmate ? soulmate.hours : 0
  };

  function animate(node, to) {
    var dur = 1200, t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = num(to * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counterObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      animate(e.target, counters[e.target.dataset.count] || 0);
      counterObserver.unobserve(e.target);
    });
  }, { threshold: 0.4 });

  $$("[data-count]").forEach(function (n) { counterObserver.observe(n); });

  /* ---------- бегущая строка ---------- */

  (function marquee() {
    var h = soulmate ? soulmate.hours : totalHours;
    var items = [
      num(gamesOwned) + " " + plural(gamesOwned, ["игра", "игры", "игр"]) + " в библиотеке",
      num(totalHours) + " " + plural(totalHours, ["час", "часа", "часов"]) + " всего",
      dec(totalHours / 24, 0) + " " + plural(totalHours / 24, ["день", "дня", "дней"]) + " нон-стоп",
      num(neverPlayed) + " " + plural(neverPlayed, ["игра", "игры", "игр"]) + " не запущены ни разу",
      soulmate ? soulmate.name + " — " + num(h) + " ч" : "",
      num(hours2w) + " " + plural(hours2w, ["час", "часа", "часов"]) + " за две недели",
      D.meta.memberSince ? "в Steam с " + new Date(D.meta.memberSince).getFullYear() + " года" : "",
      "и это только Steam"
    ].filter(Boolean);
    var line = items.map(function (t) { return "<span><i>✦</i>" + t + "</span>"; }).join("");
    $("#marquee").innerHTML = line + line; // дубль для бесшовной прокрутки
  })();

  /* ---------- 01 · главная игра жизни ---------- */

  if (soulmate) {
    var h = soulmate.hours;

    /* единица пересчёта подбирается под саму игру: у Доты матчи,
       у шутеров раунды, у фермы игровые дни, дальше — по жанру */
    var unit = (function (g) {
      var name = g.name.toLowerCase();
      var genres = (g.genres || []).join(" ");
      if (/dota|league of legends|smite|deadlock|heroes of the storm/.test(name))
        return { min: 38, word: "матчей", note: "по 38 минут — столько длится средняя катка" };
      if (/counter-strike|valorant|rainbow six|call of duty/.test(name))
        return { min: 2.5, word: "раундов", note: "если считать по 2,5 минуты на каждый" };
      if (/stardew|animal crossing|sims/.test(name))
        return { min: 20, word: "игровых дней", note: "по 20 минут реального времени каждый" };
      if (/Гонки/.test(genres))
        return { min: 6, word: "заездов", note: "по шесть минут за круг почёта" };
      if (/Стратегия/.test(genres))
        return { min: 45, word: "партий", note: "по 45 минут — от первого хода до победы" };
      return { min: 120, word: "вечеров", note: "по два часа, от «на часик» до «ещё один»" };
    })(soulmate);

    $("#smName").textContent = soulmate.name;
    $("#smShare").textContent =
      "Это " + dec(h / totalHours * 100, 0) + "% всего времени в Steam. " +
      (soulmate.lastPlayed ? "Последний заход — " + fmtDate(soulmate.lastPlayed) + "." : "");

    var facts = [
      [dec(h / 24, 1),        "<b>дней</b> подряд, без сна, еды и уведомлений"],
      [dec(h / 168, 1),       "<b>рабочих месяцев</b> по 40 часов в неделю"],
      [dec(h / 8760 * 100, 1) + "%", "календарного <b>года жизни</b>"],
      [num(h / 11.4),         "<b>трилогий «Властелин колец»</b> в режиссёрской версии"],
      [dec(h / 600, 1),       "<b>иностранных языков</b> до уверенного B2 (600 ч каждый)"],
      [num(h * 5),            "<b>километров</b> пешком, если бы шла вместо игры — это дальше, чем от Минска до Токио"],
      [num(h * 60 / unit.min), "<b>" + unit.word + "</b> " + unit.note],
      [dec(h / 3.5, 0),       "<b>марафонов</b> можно было бы пробежать (по 3,5 ч)"]
    ];

    var fw = $("#facts");
    facts.forEach(function (f) {
      var row = el("div", "fact");
      row.appendChild(el("div", "fact__num", f[0]));
      row.appendChild(el("div", "fact__text", f[1]));
      fw.appendChild(row);
    });
  }

  /* ---------- 02 · топ игр ---------- */

  (function topGames() {
    var top = played.slice(0, 10);
    if (!top.length) return;
    var max = top[0].hours;
    var wrap = $("#bars");
    var ramp = ["#FF5C38", "#FF8A3D", "#FFC53D", "#B6D93F", "#22D3A5",
                "#2BC7C7", "#4CC2FF", "#6E9CFF", "#8B5CF6", "#B45CF6"];

    // два колосса почти вровень (Dota и CS2) — каждому свой акцент,
    // чтобы второе место не выглядело безнадёжным
    var colossi = top.length > 1 && top[1].hours / top[0].hours >= 0.8;

    // хвост десятки — тёплый спектр без коралла и льда колоссов
    var tail = ["#FFC53D", "#B6D93F", "#22D3A5", "#2BC7C7",
                "#6E9CFF", "#8B5CF6", "#B45CF6", "#FF8AB4"];
    var colors = top.map(function (g, i) {
      if (colossi && i === 0) return "#FF5C38";   // коралл — лидер
      if (colossi && i === 1) return "#4CC2FF";   // лёд — второй колосс
      return colossi ? tail[i - 2] : ramp[i];
    });

    // подпись к секции считается на лету — зависит от расклада часов
    var note = $("#topNote");
    if (note) {
      var topSum = top.reduce(function (s, g) { return s + g.hours; }, 0);
      var rest9 = topSum - top[0].hours;
      var leadShare = top[0].hours / topSum * 100;
      var txt;
      if (top[0].hours >= rest9) {
        txt = "Одна игра забрала больше времени, чем остальные девять вместе — " +
              "<b>" + dec(leadShare, 0) + "%</b> всей десятки. Длина полос — доля от лидера.";
      } else if (colossi) {
        txt = "Два колосса почти вровень: <b>" + top[0].name + "</b> и <b>" + top[1].name +
              "</b> держат <b>" + dec((top[0].hours + top[1].hours) / topSum * 100, 0) +
              "%</b> времени десятки. Дальше — уже про вкус, а не про привычку.";
      } else {
        txt = "Лидер — только <b>" + dec(leadShare, 0) + "%</b> десятки: время честно " +
              "размазано по разным играм. Длина полос — доля от лидера.";
      }
      note.innerHTML = txt;
    }

    top.forEach(function (g, i) {
      var isColossus = colossi && i < 2;
      var row = el("div", "bar" + (isColossus ? " bar--colossus" : ""));
      row.style.setProperty("--bc", colors[i]);
      // у колоссов полоса заливается своим цветом целиком: иначе градиент
      // уводил Доту в лёд CS2, и два акцента переставали различаться
      row.style.setProperty("--bc2", isColossus ? colors[i] : colors[(i + 1) % colors.length]);
      row.appendChild(el("div", "bar__rank", String(i + 1).padStart(2, "0")));

      var body = el("div", "bar__body");
      body.appendChild(el("div", "bar__name", g.name));
      var track = el("div", "bar__track");
      var fill = el("div", "bar__fill");
      fill.dataset.w = (g.hours / max * 100).toFixed(2) + "%";
      track.appendChild(fill);
      body.appendChild(track);
      row.appendChild(body);

      row.appendChild(el("div", "bar__value", num(g.hours) + "<span>ч</span>"));
      wrap.appendChild(row);
    });

    var barObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        $$(".bar__fill", wrap).forEach(function (f, i) {
          setTimeout(function () { f.style.width = f.dataset.w; }, i * 70);
        });
        barObserver.disconnect();
      });
    }, { threshold: 0.2 });
    barObserver.observe(wrap);
  })();

  /* ---------- 03 · чем занимаюсь сейчас ---------- */

  (function recent() {
    var wrap = $("#recent");
    var list = games.filter(function (g) { return (g.hours2w || 0) > 0; })
                    .sort(function (a, b) { return b.hours2w - a.hours2w; })
                    .slice(0, 4);

    if (!list.length) {
      list = played.slice()
        .filter(function (g) { return g.lastPlayed; })
        .sort(function (a, b) { return new Date(b.lastPlayed) - new Date(a.lastPlayed); })
        .slice(0, 4);
    }

    if (!list.length) {
      wrap.appendChild(el("div", "rcard", "<div class='rcard__name'>Тишина в эфире</div>"));
      return;
    }

    var rc = ["#22D3A5", "#4CC2FF", "#FFC53D", "#8B5CF6"];
    list.forEach(function (g, i) {
      var card = el("div", "rcard");
      card.style.setProperty("--rc", rc[i % rc.length]);
      var d = daysAgo(g.lastPlayed);
      card.innerHTML =
        "<div class='eyebrow'>" + (i === 0 ? "<span class='pulse'></span>главное занятие" : "также в ротации") + "</div>" +
        "<div class='rcard__name'>" + g.name + "</div>" +
        "<div class='rcard__big'>" + smartDec(g.hours2w || 0) + "<span>ч за 2 недели</span></div>" +
        "<div class='rcard__meta'>" +
          (d === null ? "" : (d === 0 ? "играла сегодня" : d + " " + plural(d, ["день", "дня", "дней"]) + " назад")) +
          " · всего " + smartDec(g.hours) + " ч</div>";
      wrap.appendChild(card);
    });
  })();

  /* ---------- 04 · донат по жанрам ---------- */

  var genreData = (function () {
    // если данные пришли с готовой разбивкой по жанрам (fetch_data.py) —
    // верим ей: она посчитана по всей библиотеке, а не по выгрузке топа
    if (D.genreHours && D.genreHours.length) {
      return D.genreHours.slice();
    }
    var map = {};
    played.forEach(function (g) {
      var gs = (g.genres && g.genres.length) ? g.genres : ["Без жанра"];
      // часы делим поровну между жанрами игры, чтобы не раздувать сумму
      gs.forEach(function (name) {
        map[name] = (map[name] || 0) + g.hours / gs.length;
      });
    });
    var arr = Object.keys(map).map(function (k) { return { name: k, hours: map[k] }; })
                              .sort(function (a, b) { return b.hours - a.hours; });
    // всё, что мельче, схлопываем в «Прочее»
    if (arr.length > 6) {
      var rest = arr.slice(6).reduce(function (s, x) { return s + x.hours; }, 0);
      arr = arr.slice(0, 6);
      if (rest > 0) arr.push({ name: "Прочее", hours: rest });
    }
    return arr;
  })();

  (function donut() {
    var svg = $("#donut"), legend = $("#legend");
    var sum = genreData.reduce(function (s, x) { return s + x.hours; }, 0);
    if (!sum) return;

    var R = 78, C = 2 * Math.PI * R, off = 0;
    var palette = ["#FF5C38", "#8B5CF6", "#22D3A5", "#FFC53D", "#4CC2FF",
                   "#FF8AB4", "#FF8A3D", "#6E9CFF", "#5F5B55"];

    var ns = "http://www.w3.org/2000/svg";
    genreData.forEach(function (g, i) {
      var frac = g.hours / sum;
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("class", "donut__seg");
      c.setAttribute("cx", 100); c.setAttribute("cy", 100); c.setAttribute("r", R);
      c.setAttribute("fill", "none");
      c.setAttribute("stroke", palette[i % palette.length]);
      c.setAttribute("stroke-width", 22);
      c.setAttribute("stroke-dasharray", (frac * C - 2).toFixed(2) + " " + C);
      c.setAttribute("stroke-dashoffset", (-off).toFixed(2));
      c.dataset.i = i;
      svg.appendChild(c);
      off += frac * C;

      var row = el("div", "legend__row");
      row.dataset.i = i;
      var dot = el("span", "legend__dot"); dot.style.background = palette[i % palette.length];
      row.appendChild(dot);
      row.appendChild(el("span", "legend__name", g.name));
      row.appendChild(el("span", "legend__pct", pctStr(frac * 100) + "%"));
      row.appendChild(el("span", "legend__hours", num(g.hours) + " ч"));
      legend.appendChild(row);

      row.addEventListener("mouseenter", function () { highlight(i, g); });
      row.addEventListener("mouseleave", function () { highlight(null); });
      c.addEventListener("mouseenter", function () { highlight(i, g); });
      c.addEventListener("mouseleave", function () { highlight(null); });
    });

    var dv = $("#donutValue"), dl = $("#donutLabel");
    var defaultValue = String(genreData.length), defaultLabel = plural(genreData.length, ["жанр", "жанра", "жанров"]);
    dv.textContent = defaultValue; dl.textContent = defaultLabel;

    function pctStr(p) {
      return dec(p, p < 1 ? 1 : 0);
    }

    function highlight(i, g) {
      $$(".donut__seg", svg).forEach(function (s) { s.classList.remove("is-hover"); });
      if (i === null) {
        svg.classList.remove("has-hover");
        dv.textContent = defaultValue; dl.textContent = defaultLabel;
        return;
      }
      svg.classList.add("has-hover");
      svg.querySelector('.donut__seg[data-i="' + i + '"]').classList.add("is-hover");
      dv.textContent = pctStr(g.hours / sum * 100) + "%";
      dl.textContent = g.name;
    }
  })();

  /* ---------- 05 · судьба вечера ---------- */

  (function fate() {
    var stage = $("#fateStage"), btn = $("#fateBtn");

    if (!backlog.length) {
      btn.disabled = true;
      if (neverPlayed > 0) {
        // цифра есть, списка нет: данные собирались вручную / выгрузка неполная
        $("#fateCount").textContent = "В бэклоге " + num(neverPlayed) + " " +
          plural(neverPlayed, ["игра", "игры", "игр"]) +
          ", но их имена подтянутся при ближайшем обновлении данных";
        stage.innerHTML =
          "<div class='fate__slot fate__slot--empty'>" + num(neverPlayed) + " игр ждут<br>своего часа</div>" +
          "<div class='fate__slot fate__slot--empty'>список появится<br>после обновления данных</div>" +
          "<div class='fate__slot fate__slot--empty'>а пока —<br>решай сама</div>";
      } else {
        $("#fateCount").textContent = "Бэклог пуст — редкое достижение";
      }
      return;
    }

    $("#fateCount").textContent = "В бэклоге " + num(neverPlayed) + " " +
      plural(neverPlayed, ["игра", "игры", "игр"]) + ", ни одна не запущена";

    function pick3() {
      var pool = backlog.slice(), out = [];
      while (out.length < Math.min(3, backlog.length) && pool.length) {
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      return out;
    }

    function render(list, rolling) {
      stage.innerHTML = "";
      list.forEach(function (g, i) {
        var slot = el("div", "fate__slot" + (rolling ? " is-rolling" : ""));
        slot.innerHTML =
          "<div class='fate__idx'>ВАРИАНТ " + String(i + 1).padStart(2, "0") + "</div>" +
          "<div class='fate__name'>" + g.name + "</div>" +
          "<div class='fate__tags'>" + ((g.genres || []).join(" · ") || "жанр неизвестен") + "</div>" +
          (g.appid ? "<a class='fate__link' target='_blank' rel='noopener' href='https://store.steampowered.com/app/" + g.appid + "/'>страница в Steam ↗</a>" : "");
        stage.appendChild(slot);
      });
    }

    btn.addEventListener("click", function () {
      btn.disabled = true;
      var ticks = 0;
      var spin = setInterval(function () {
        render(pick3(), true);
        if (++ticks > 9) {
          clearInterval(spin);
          render(pick3(), false);
          btn.disabled = false;
          btn.textContent = "Ещё раз 🎲";
        }
      }, 70);
    });
  })();

  /* ---------- 06 · карточка для шаринга ---------- */

  var shareCanvas = $("#shareCanvas");

  /* аватар для карточки. Файл лежит рядом, в assets/img — это тот же
     источник, что и на странице, никаких внешних запросов. */
  var avatarImg = null;
  if (D.meta && D.meta.avatar) {
    avatarImg = new Image();
    avatarImg.onload = function () { redrawCard(); };
    avatarImg.onerror = function () { avatarImg = null; redrawCard(); };
    avatarImg.src = D.meta.avatar;
  }

  function redrawCard() {
    var c = shareCanvas, x = c.getContext("2d");
    var W = c.width, H = c.height;
    var INK = "#F2F0EC", DIM = "#7C7871";
    var C1 = "#FF5C38", C2 = "#8B5CF6", C3 = "#22D3A5", C4 = "#FFC53D", C5 = "#4CC2FF";
    var css = getComputedStyle(document.documentElement);
    var SANS = (css.getPropertyValue("--display") || "").trim() || 'Arial, sans-serif';
    var WD = (css.getPropertyValue("--w-display") || "700").trim();

    // фон + цветные пятна
    x.fillStyle = "#0A0A0C"; x.fillRect(0, 0, W, H);
    function blob(cx, cy, r, color) {
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    blob(W * 0.10, H * 0.02, W * 0.85, "rgba(255,92,56,0.30)");
    blob(W * 0.95, H * 0.20, W * 0.70, "rgba(139,92,246,0.24)");
    blob(W * 0.10, H * 0.95, W * 0.75, "rgba(76,194,255,0.18)");
    blob(W * 0.85, H * 0.80, W * 0.60, "rgba(34,211,165,0.14)");

    var M = 88;

    function line(y) {
      x.strokeStyle = "rgba(255,255,255,0.14)"; x.lineWidth = 1;
      x.beginPath(); x.moveTo(M, y + 0.5); x.lineTo(W - M, y + 0.5); x.stroke();
    }
    function label(t, y, color) {
      x.fillStyle = color || DIM; x.font = "700 22px " + SANS;
      if ("letterSpacing" in x) x.letterSpacing = "4px";
      x.fillText(t.toUpperCase(), M, y);
      if ("letterSpacing" in x) x.letterSpacing = "0px";
    }
    function fit(t, maxW, font) {
      x.font = font;
      var s2 = t;
      while (x.measureText(s2).width > maxW && s2.length > 4) s2 = s2.slice(0, -2);
      return s2 === t ? t : s2 + "…";
    }

    // шапка
    label("STEAM WRAPPED", 118);
    x.fillStyle = C4; x.font = "700 22px " + SANS;
    x.textAlign = "right"; x.fillText((D.meta.generatedAt || "").slice(0, 7), W - M, 118); x.textAlign = "left";
    line(148);

    // аватар: квадрат со скруглением, как на странице. Пока картинка
    // не загрузилась, на его месте — плашка с первой буквой ника.
    var AV = 128, avX = M, avY = 184, R = 34;
    function roundRect(px, py, pw, ph, r) {
      x.beginPath();
      x.moveTo(px + r, py);
      x.arcTo(px + pw, py, px + pw, py + ph, r);
      x.arcTo(px + pw, py + ph, px, py + ph, r);
      x.arcTo(px, py + ph, px, py, r);
      x.arcTo(px, py, px + pw, py, r);
      x.closePath();
    }
    var persona = D.meta.persona || "profile";
    x.save();
    roundRect(avX, avY, AV, AV, R);
    x.clip();
    if (avatarImg && avatarImg.complete && avatarImg.naturalWidth) {
      // вписываем по короткой стороне, без искажения пропорций
      var s = Math.max(AV / avatarImg.naturalWidth, AV / avatarImg.naturalHeight);
      var dw = avatarImg.naturalWidth * s, dh = avatarImg.naturalHeight * s;
      x.drawImage(avatarImg, avX + (AV - dw) / 2, avY + (AV - dh) / 2, dw, dh);
    } else {
      var ag = x.createLinearGradient(avX, avY, avX + AV, avY + AV);
      ag.addColorStop(0, C1); ag.addColorStop(1, C4);
      x.fillStyle = ag; x.fillRect(avX, avY, AV, AV);
      x.fillStyle = "#0A0A0C"; x.font = "800 58px " + SANS;
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(persona.charAt(0).toUpperCase(), avX + AV / 2, avY + AV / 2 + 4);
      x.textAlign = "left"; x.textBaseline = "alphabetic";
    }
    x.restore();
    x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 1;
    roundRect(avX + 0.5, avY + 0.5, AV - 1, AV - 1, R); x.stroke();

    // ник — правее аватара, по центру его высоты
    var nameX = avX + AV + 34;
    x.fillStyle = INK; x.font = WD + " 76px " + SANS;
    x.fillText(fit(persona, W - nameX - M, WD + " 76px " + SANS), nameX, 274);
    // градиент считаем от начала самой строки, иначе коралловый край
    // рампы остаётся левее текста и в надпись не попадает
    var grad = x.createLinearGradient(nameX, 0, W - M, 0);
    grad.addColorStop(0, C1); grad.addColorStop(0.45, C4); grad.addColorStop(0.8, C2); grad.addColorStop(1, C5);
    x.fillStyle = grad; x.font = WD + " 76px " + SANS;
    x.fillText("в цифрах.", nameX, 372);

    // три цифры
    var cols = [
      [num(gamesOwned), "игр", C1],
      [num(totalHours), "часов", C4],
      [num(hours2w), "ч / 2 нед", C3]
    ];
    var colW = (W - M * 2) / 3;
    line(470);
    cols.forEach(function (col, i) {
      var cx = M + colW * i;
      x.fillStyle = col[2]; x.fillRect(cx, 508, 46, 5);
      x.fillStyle = col[2]; x.font = WD + " 64px " + SANS;
      x.fillText(col[0], cx, 600);
      x.fillStyle = DIM; x.font = "600 24px " + SANS;
      x.fillText(col[1], cx, 642);
    });
    line(712);

    // игра жизни
    if (soulmate) {
      label("ГЛАВНАЯ ИГРА ЖИЗНИ", 780, C1);
      x.fillStyle = INK; x.font = WD + " 46px " + SANS;
      x.fillText(fit(soulmate.name, W - M * 2, WD + " 46px " + SANS), M, 862);

      var hh = num(soulmate.hours);
      var g2 = x.createLinearGradient(M, 0, W * 0.8, 0);
      g2.addColorStop(0, C1); g2.addColorStop(1, C4);
      x.fillStyle = g2; x.font = WD + " 104px " + SANS;
      x.fillText(hh, M, 986);
      var w = x.measureText(hh).width;
      x.fillStyle = DIM; x.font = "600 28px " + SANS;
      x.fillText("часов = " + dec(soulmate.hours / 24, 1) + " дней нон-стоп", M + w + 22, 986);
      line(1042);
    }

    // топ-3
    label("ТОП-3 ПО ЧАСАМ", 1082, C5);
    var tcol = [C1, C4, C3];
    played.slice(0, 3).forEach(function (g, i) {
      var y = 1136 + i * 48;
      x.fillStyle = tcol[i]; x.font = "700 20px " + SANS;
      x.fillText(String(i + 1).padStart(2, "0"), M, y);
      x.fillStyle = INK; x.font = "700 24px " + SANS;
      x.fillText(fit(g.name, W - M * 2 - 280, "700 24px " + SANS), M + 62, y);
      x.fillStyle = tcol[i]; x.font = WD + " 26px " + SANS;
      x.textAlign = "right"; x.fillText(num(g.hours) + " ч", W - M, y); x.textAlign = "left";
    });

    // подпись: своя полоса воздуха снизу. Линия отбивки далеко и от
    // топ-3, и от самой подписи — иначе низ выглядит слипшимся.
    line(1262);
    x.fillStyle = "#5A5751"; x.font = "600 22px " + SANS;
    x.fillText("steam wrapped · сделано вручную", M, H - 55);
    if (D.meta.memberSince) {
      x.textAlign = "right";
      x.fillText("в Steam с " + String(D.meta.memberSince).slice(0, 4), W - M, H - 55);
      x.textAlign = "left";
    }
  }
  redrawCard();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawCard);

  /* ---------- скачать / скопировать ---------- */

  var toast = $("#toast"), toastT;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove("is-on"); }, 2400);
  }

  $("#dlBtn").addEventListener("click", function () {
    var a = document.createElement("a");
    a.download = "steam-wrapped-" + (D.meta.persona || "profile") + ".png";
    a.href = shareCanvas.toDataURL("image/png");
    a.click();
    say("Карточка скачана ✓");
  });

  $("#copyBtn").addEventListener("click", function () {
    if (!navigator.clipboard || !window.ClipboardItem) { say("Браузер не умеет копировать картинки — скачай PNG"); return; }
    shareCanvas.toBlob(function (blob) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
        .then(function () { say("Скопировано в буфер ✓"); })
        .catch(function () { say("Не вышло скопировать — скачай PNG"); });
    });
  });

  /* ---------- появление секций ---------- */

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("is-in"); revealObserver.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  $$(".reveal").forEach(function (n) { revealObserver.observe(n); });
})();

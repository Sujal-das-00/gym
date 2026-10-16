// Landing page behaviour: mobile menu, header shadow, section highlight, scroll reveal.
(function () {
  "use strict";

  var header = document.getElementById("siteHeader");
  var nav = document.getElementById("siteNav");
  var toggle = document.getElementById("navToggle");

  document.getElementById("year").textContent = new Date().getFullYear();

  function setMenu(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.querySelector("use").setAttribute("href", "/landing/icons.svg#" + (open ? "close" : "menu"));
  }
  toggle.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
  nav.addEventListener("click", function (e) { if (e.target.tagName === "A") setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  function onScroll() { header.classList.toggle("scrolled", window.scrollY > 8); }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });


  // ---------------- Pricing plan switch ----------------
  var card = document.getElementById("pricingCard");
  var planBtns = document.querySelectorAll("[data-plan-btn]");
  function setPlan(plan) {
    card.setAttribute("data-plan", plan);
    planBtns.forEach(function (b) {
      var on = b.getAttribute("data-plan-btn") === plan;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    card.querySelectorAll("[data-plan-pane]").forEach(function (p) {
      p.hidden = p.getAttribute("data-plan-pane") !== plan;
    });
  }
  planBtns.forEach(function (b) {
    b.addEventListener("click", function () { setPlan(b.getAttribute("data-plan-btn")); });
  });

  // ---------------- Video tutorials ----------------
  // The same tutorial playlist the dashboard's Help page uses.
  var VIDEOS = {
    en: ["wAyRPe5MnWs", "JJUd74MImwk", "F5Yvjwk2y0k", "IbRn_dhzLu8", "PLPzr2_JF8E", "UhkA6SyKWQo", "srUNRxxDg70", "8ChNKDJLnYA", "ueazXm8nysE", "TepIMumzUD8"],
    hi: ["kJXSpjgrGl8", "wOcj_oj4e5U", "RGDDi0VK1n4", "bCDzyT6r88c", "0LG7Cy5_WUU", "rUk_rUHzm1w", "431vcdrpdJM", "4MwMe1_gHfU", "SzuNqvxuCsY", "qL_luF56NxI"],
  };
  // Titles follow the playlist order above.
  var TITLES = {
    en: ["Managing Members", "Gym Settings", "Recording Payments", "Marking Attendance Manually", "Dashboard Overview", "QR Check-in", "Trainer Management", "Expense Tracker", "Attendance History", "Adding a New Member"],
    hi: ["सदस्यों का प्रबंधन", "जिम सेटिंग्स", "भुगतान दर्ज करना", "मैन्युअल उपस्थिति लगाना", "डैशबोर्ड की जानकारी", "QR चेक-इन", "ट्रेनर प्रबंधन", "खर्च ट्रैकर", "उपस्थिति इतिहास", "नया सदस्य जोड़ना"],
  };
  var LABEL = { en: function (n) { return TITLES.en[n - 1]; }, hi: function (n) { return TITLES.hi[n - 1]; } };
  var grid = document.getElementById("videoGrid");
  var dialog = document.getElementById("videoDialog");
  var frame = document.getElementById("videoFrame");

  function renderVideos(lang) {
    grid.textContent = "";
    VIDEOS[lang].forEach(function (id, i) {
      var label = LABEL[lang](i + 1);
      var card = document.createElement("button");
      card.type = "button";
      card.className = "video-card";
      card.style.animationDelay = i * 30 + "ms";
      card.innerHTML = '<span class="video-thumb"><img loading="lazy" width="320" height="180" alt="" src="https://i.ytimg.com/vi/' + id + '/mqdefault.jpg"><span class="video-play"><span><svg class="i" aria-hidden="true"><use href="/landing/icons.svg#play"/></svg></span></span></span><span class="video-label"></span>';
      card.querySelector(".video-label").textContent = label;
      card.addEventListener("click", function () { play(id, label); });
      grid.appendChild(card);
    });
  }

  function play(id, label) {
    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
    iframe.title = label;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
  }
  // Removing the iframe is what stops the video and its audio.
  function stop() { frame.textContent = ""; }
  dialog.addEventListener("close", stop);
  document.getElementById("videoClose").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });

  Array.prototype.forEach.call(document.querySelectorAll(".video-tab"), function (tab) {
    tab.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".video-tab"), function (t) {
        var on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", String(on));
      });
      renderVideos(tab.getAttribute("data-lang"));
    });
  });
  renderVideos("en");

  // ---------------- Live numbers ----------------
  // Real aggregate counts from /api/public/stats. If the request fails the strip
  // simply stays hidden; there are no fallback numbers.
  var statsEl = document.getElementById("stats");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nf = new Intl.NumberFormat("en-IN");

  function countUp(el, to) {
    if (reduce || to < 2) { el.textContent = nf.format(to); return; }
    var start = null, ms = 1100;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min((t - start) / ms, 1);
      el.textContent = nf.format(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  fetch("/api/public/stats").then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (data) {
    statsEl.hidden = false;
    var run = function () {
      Array.prototype.forEach.call(statsEl.querySelectorAll("[data-stat]"), function (el) {
        countUp(el, Number(data[el.getAttribute("data-stat")]) || 0);
      });
    };
    if (!("IntersectionObserver" in window)) return run();
    var once = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { once.disconnect(); run(); }
    }, { threshold: 0.4 });
    once.observe(statsEl);
  }).catch(function () { /* stays hidden */ });

  // ---------------- Testimonials ----------------
  var quotes = window.GYMBOO_TESTIMONIALS || [];
  if (quotes.length) {
    var quoteGrid = document.getElementById("quoteGrid");
    quotes.forEach(function (q) {
      var card = document.createElement("figure");
      card.className = "quote reveal";
      var text = document.createElement("blockquote");
      text.textContent = q.quote;
      var cap = document.createElement("figcaption");
      var who = document.createElement("strong");
      who.textContent = q.name;
      var meta = document.createElement("span");
      meta.textContent = [q.role, q.gym, q.city].filter(Boolean).join(", ");
      cap.appendChild(who);
      cap.appendChild(meta);
      card.appendChild(text);
      card.appendChild(cap);
      quoteGrid.appendChild(card);
    });
    document.getElementById("testimonials").hidden = false;
  }

  // ---------------- Team ----------------
  var team = window.GYMBOO_TEAM || {};
  var teamRoot = document.getElementById("teamRoot");

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function avatar(person, cls) {
    var wrap = el("div", cls);
    if (person.photo) {
      var img = document.createElement("img");
      img.src = person.photo;
      img.alt = person.name;
      img.loading = "lazy";
      wrap.appendChild(img);
    } else {
      wrap.classList.add("initials");
      wrap.textContent = String(person.name || "").split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
    }
    return wrap;
  }

  if (team.ceo || (team.teams && team.teams.length)) {
    if (team.ceo) {
      var c = team.ceo;
      var feature = el("article", "ceo reveal");
      feature.appendChild(avatar(c, "ceo-photo"));
      var body = el("div", "ceo-body");
      body.appendChild(el("p", "eyebrow", c.role || "Founder & CEO"));
      body.appendChild(el("h3", "display", c.name));
      String(c.story || "").split(/\n\n+/).forEach(function (para) { if (para) body.appendChild(el("p", "", para)); });
      feature.appendChild(body);
      teamRoot.appendChild(feature);
    }
    var teamGrid = el("div", "team-grid");
    (team.teams || []).forEach(function (t, i) {
      var card = el("article", "team-card reveal");
      card.style.setProperty("--d", i * 60 + "ms");
      card.appendChild(el("h3", "", t.title));
      if (t.story) card.appendChild(el("p", "team-story", t.story));
      var people = el("ul", "team-people");
      (t.members || []).forEach(function (m) {
        var li = el("li");
        li.appendChild(avatar(m, "person-photo"));
        var info = el("div");
        info.appendChild(el("strong", "", m.name));
        if (m.role) info.appendChild(el("span", "", m.role));
        li.appendChild(info);
        people.appendChild(li);
      });
      card.appendChild(people);
      teamGrid.appendChild(card);
    });
    teamRoot.appendChild(teamGrid);
    document.getElementById("team").hidden = false;
  }

  if (!("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (el) { el.classList.add("in"); });
    return;
  }

  // Reveal each block once, as it first scrolls into view.
  var revealer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      revealer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (el) { revealer.observe(el); });

  // Underline the nav link of the section currently in view.
  var links = {};
  Array.prototype.forEach.call(nav.querySelectorAll("a[href^='#']"), function (a) { links[a.getAttribute("href").slice(1)] = a; });
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var link = links[entry.target.id];
      if (link) link.classList.toggle("active", entry.isIntersecting);
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  Object.keys(links).forEach(function (id) {
    var section = document.getElementById(id);
    if (section) spy.observe(section);
  });
})();

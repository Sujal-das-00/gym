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

  // ---------------- Numbers ----------------
  var STATS = { gyms: 280, members: 7000, dailyActiveUsers: 600 };
  var statsEl = document.getElementById("stats");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nf = new Intl.NumberFormat("en-IN");

  function countUp(el, to) {
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduce) { el.textContent = nf.format(to) + suffix; return; }
    var start = null, ms = 1100;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min((t - start) / ms, 1);
      el.textContent = nf.format(Math.round(to * (1 - Math.pow(1 - p, 3)))) + (p < 1 ? "" : suffix);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var runStats = function () {
    Array.prototype.forEach.call(statsEl.querySelectorAll("[data-stat]"), function (el) {
      countUp(el, STATS[el.getAttribute("data-stat")] || 0);
    });
  };
  if ("IntersectionObserver" in window) {
    var once = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { once.disconnect(); runStats(); }
    }, { threshold: 0.4 });
    once.observe(statsEl);
  } else {
    runStats();
  }

  // ---------------- Testimonials ----------------
  // A grid on wide screens, a swipeable carousel on phones (see landing.css).
  var quotes = window.GYMBOO_TESTIMONIALS || [];
  var quoteGrid = document.getElementById("quoteGrid");
  var quoteDots = document.getElementById("quoteDots");
  if (quotes.length) {
    var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.5 6 20.9l1.3-6.7-5-4.7 6.8-.8z"/></svg>';
    quotes.forEach(function (q, i) {
      var card = document.createElement("figure");
      card.className = "quote";
      var stars = document.createElement("div");
      stars.className = "quote-stars";
      stars.setAttribute("role", "img");
      stars.setAttribute("aria-label", "Rated 5 out of 5");
      stars.innerHTML = STAR + STAR + STAR + STAR + STAR;
      var text = document.createElement("blockquote");
      text.textContent = q.quote;
      var cap = document.createElement("figcaption");
      var initials = document.createElement("span");
      initials.className = "quote-avatar";
      initials.setAttribute("aria-hidden", "true");
      initials.textContent = String(q.name || "").split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
      var info = document.createElement("div");
      var who = document.createElement("strong");
      who.textContent = q.name;
      var meta = document.createElement("span");
      meta.className = "quote-topic";
      meta.textContent = [q.role, q.gym, q.city].filter(Boolean).join(", ");
      info.appendChild(who);
      info.appendChild(meta);
      cap.appendChild(initials);
      cap.appendChild(info);
      card.appendChild(stars);
      card.appendChild(text);
      card.appendChild(cap);
      quoteGrid.appendChild(card);

      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "quote-dot" + (i === 0 ? " active" : "");
      dot.setAttribute("tabindex", "-1");
      dot.addEventListener("click", function () {
        quoteGrid.scrollTo({ left: card.offsetLeft - quoteGrid.offsetLeft, behavior: reduce ? "auto" : "smooth" });
      });
      quoteDots.appendChild(dot);
    });
    var syncDots = function () {
      var cards = quoteGrid.children, best = 0, bestGap = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var gap = Math.abs(cards[i].offsetLeft - quoteGrid.offsetLeft - quoteGrid.scrollLeft);
        if (gap < bestGap) { bestGap = gap; best = i; }
      }
      Array.prototype.forEach.call(quoteDots.children, function (d, i) { d.classList.toggle("active", i === best); });
    };
    quoteGrid.addEventListener("scroll", function () { window.requestAnimationFrame(syncDots); }, { passive: true });
  } else {
    document.getElementById("testimonials").hidden = true;
  }

  // ---------------- Give a review ----------------
  var rvDialog = document.getElementById("reviewDialog");
  var rvForm = document.getElementById("reviewForm");
  var rvError = document.getElementById("reviewError");
  var rvOk = document.getElementById("reviewOk");
  var rvSend = document.getElementById("reviewSend");

  document.getElementById("reviewOpen").addEventListener("click", function () {
    rvForm.reset();
    rvError.textContent = "";
    rvOk.hidden = true;
    rvSend.hidden = false;
    rvSend.disabled = false;
    if (rvDialog.showModal) rvDialog.showModal(); else rvDialog.setAttribute("open", "");
  });
  document.getElementById("reviewCancel").addEventListener("click", function () { rvDialog.close(); });
  rvDialog.addEventListener("click", function (e) { if (e.target === rvDialog) rvDialog.close(); });

  rvForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {
      name: rvForm.name.value.trim(),
      gymName: rvForm.gymName.value.trim(),
      message: rvForm.message.value.trim(),
      website: rvForm.website.value,
    };
    if (!data.name || !data.gymName) { rvError.textContent = "Please enter your name and your gym's name."; return; }
    if (data.message.length < 20) { rvError.textContent = "Please write at least a couple of sentences."; return; }
    rvError.textContent = "";
    rvSend.disabled = true;
    fetch("/api/public/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) throw new Error(body.error || "Something went wrong. Please try again.");
        });
      })
      .then(function () { rvOk.hidden = false; rvSend.hidden = true; })
      .catch(function (err) { rvError.textContent = err.message; rvSend.disabled = false; });
  });

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

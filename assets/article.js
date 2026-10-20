/* First-party helpers: table of contents, and tick/cross marks on
   comparison cells that are plainly Yes or No. No network calls. */
(function () {
  function slug(text) {
    return text
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 72) || "section";
  }

  function buildToc() {
    var main = document.querySelector(".article-main");
    if (!main) return;
    var headings = Array.prototype.filter.call(main.querySelectorAll("h2"), function (h) {
      if (h.closest(".verdict, .author-box, .toc, .side-panel, .method, .updates")) return false;
      var label = (h.textContent || "").replace(/\s+/g, " ").trim();
      return label && label.toLowerCase() !== "affiliate note";
    });
    if (headings.length < 4) return;

    var used = {};
    var nav = document.createElement("nav");
    nav.className = "toc";
    nav.setAttribute("aria-label", "On this page");
    var title = document.createElement("h2");
    title.textContent = "On this page";
    var list = document.createElement("ol");
    headings.forEach(function (h) {
      var label = h.textContent.replace(/\s+/g, " ").trim();
      var id = h.id || slug(label);
      while (used[id] || (document.getElementById(id) && document.getElementById(id) !== h)) {
        id += "-2";
      }
      used[id] = true;
      h.id = id;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + id;
      a.textContent = label;
      li.appendChild(a);
      list.appendChild(li);
    });
    nav.appendChild(title);
    nav.appendChild(list);

    var anchor = main.querySelector(".verdict") || main.querySelector(".byline") || main.querySelector("h1");
    if (anchor) anchor.insertAdjacentElement("afterend", nav);
  }

  function markCells() {
    var cells = document.querySelectorAll(".article-main td");
    Array.prototype.forEach.call(cells, function (td) {
      var text = (td.textContent || "").replace(/\s+/g, " ").trim();
      if (/^Yes(\s*\(.*\))?$/.test(text)) td.classList.add("cell-yes");
      else if (/^No(\s*\(.*\))?$/.test(text)) td.classList.add("cell-no");
    });
  }

  function ready() {
    buildToc();
    markCells();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();

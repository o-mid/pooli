(function () {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const params = new URLSearchParams(location.search);
  const exportSlide = params.get("slide");
  const printAll = params.get("print") === "1" || params.get("print") === "true";
  const total = slides.length;

  function show(i) {
    const n = Math.max(0, Math.min(total - 1, i));
    slides.forEach((s, idx) => s.classList.toggle("is-on", idx === n));
    document.body.dataset.slide = String(n + 1);
    if (!exportSlide && !printAll && location.hash !== "#s" + (n + 1)) {
      history.replaceState(null, "", "#s" + (n + 1));
    }
  }

  function current() {
    return slides.findIndex((s) => s.classList.contains("is-on"));
  }

  if (printAll) {
    document.body.classList.add("print");
    slides.forEach((s) => s.classList.add("is-on"));
    return;
  }

  function fit() {
    if (document.body.classList.contains("export") || document.body.classList.contains("print")) {
      document.querySelector(".deck-stage").style.transform = "";
      return;
    }
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const stage = document.querySelector(".deck-stage");
    stage.style.transformOrigin = "center center";
    stage.style.transform = "scale(" + s + ")";
  }

  if (exportSlide) {
    document.body.classList.add("export");
    const n = parseInt(exportSlide, 10) - 1;
    show(Number.isFinite(n) ? n : 0);
    return;
  }

  const fromHash = /^#s(\d+)$/.exec(location.hash || "");
  show(fromHash ? parseInt(fromHash[1], 10) - 1 : 0);

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
      e.preventDefault();
      show(current() + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      show(current() - 1);
    } else if (e.key === "Home") {
      show(0);
    } else if (e.key === "End") {
      show(total - 1);
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const mid = window.innerWidth / 2;
    show(current() + (e.clientX >= mid ? 1 : -1));
  });

  window.addEventListener("resize", fit);
  fit();
})();

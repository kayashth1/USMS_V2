/**
 * USMS Demo Presentation Generator
 * Logs in as Principal + Super Admin, screenshots every page,
 * and generates a self-contained usms-demo.html presentation.
 *
 * Usage:
 *   npm install playwright   (first time only)
 *   node demo-capture.js
 */

const { chromium } = require("playwright");
const fs = require("fs");

const BASE_URL = "http://localhost:5173";
const VIEWPORT = { width: 1440, height: 900 };

// ── Page definitions ──────────────────────────────────────────────────────────

const PRINCIPAL_PAGES = [
  {
    path: "/dashboard",
    title: "Dashboard",
    desc: "At-a-glance school overview — student count, today's attendance rate, fee collection status, and quick-action shortcuts.",
  },
  {
    path: "/students",
    title: "Students",
    desc: "Complete student management: add new students, search by name or roll number, filter by class, and access individual profiles.",
  },
  {
    path: "/teachers",
    title: "Teachers",
    desc: "Teacher directory with contact details, assigned subjects, class responsibilities, and full profile management.",
  },
  {
    path: "/attendance",
    title: "Attendance",
    desc: "Class-wise daily attendance marking, monthly calendar view, and attendance analytics per student and class.",
  },
  {
    path: "/fees-v2",
    title: "Fee Management",
    desc: "Manage fee structures, track installment payments, view outstanding dues, and generate payment receipts.",
  },
  {
    path: "/timetable",
    title: "Timetable",
    desc: "Create and manage weekly class timetables with teacher and subject assignments per period.",
  },
  {
    path: "/notices",
    title: "Notices",
    desc: "Publish circulars, announcements, and event notices visible to students and parents.",
  },
  {
    path: "/books",
    title: "Books & Digital Library",
    desc: "Manage physical book inventory and browse / assign digital learning resources and collections to classes.",
  },
  {
    path: "/exams",
    title: "Exams",
    desc: "Schedule examinations, manage exam timetables, and record student results.",
  },
  {
    path: "/promotion",
    title: "Student Promotion",
    desc: "End-of-year promotion workflow to advance students to the next grade with full audit trail.",
  },
  {
    path: "/academic-rollover",
    title: "Academic Rollover",
    desc: "Year-end rollover process: archive the current session and set up the new academic year in one flow.",
  },
  {
    path: "/reports",
    title: "Reports",
    desc: "Generate and export detailed reports for attendance, fees, academics, and student performance.",
  },
  {
    path: "/vehicle",
    title: "Vehicle Tracking",
    desc: "School transport management — routes, drivers, bus assignments, and tracking.",
  },
  {
    path: "/alumni",
    title: "Alumni",
    desc: "Maintain records of graduated students and track alumni information over the years.",
  },
  {
    path: "/settings",
    title: "Settings",
    desc: "Configure school-wide settings: classes, subjects, time periods, teacher assignments, and preferences.",
  },
];

const SUPERADMIN_PAGES = [
  {
    path: "/superadmin",
    title: "Super Admin Dashboard",
    desc: "Platform-wide overview — total schools, active students, system health, and recent activity across all institutions.",
  },
  {
    path: "/superadmin/schools",
    title: "Schools Management",
    desc: "View, onboard, and manage all schools registered on the USMS platform with subscription and status control.",
  },
  {
    path: "/superadmin/library",
    title: "Digital Library",
    desc: "Upload and manage digital learning resources (PDFs, videos, docs) and curated collections available to schools.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|superadmin)/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}

async function capture(page, path) {
  console.log(`  → ${path}`);
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000); // let charts/animations settle
  const buf = await page.screenshot({ fullPage: true });
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const slides = [];

  // ── Login page screenshot ─────────────────────────────────────────────────
  console.log("\n📸 Capturing login page…");
  {
    const ctx  = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const img = `data:image/png;base64,${(await page.screenshot({ fullPage: true })).toString("base64")}`;
    slides.push({ section: "Overview", title: "Login", desc: "Secure login portal for School Principals and Super Admins.", img });
    await ctx.close();
  }

  // ── Principal pages ───────────────────────────────────────────────────────
  console.log("\n📸 Capturing Principal panel…");
  {
    const ctx  = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    await login(page, "kv2@gmail.com", "kv2@123");
    for (const p of PRINCIPAL_PAGES) {
      const img = await capture(page, p.path);
      slides.push({ section: "Principal Panel", ...p, img });
    }
    await ctx.close();
  }

  // ── Super Admin pages ─────────────────────────────────────────────────────
  console.log("\n📸 Capturing Super Admin panel…");
  {
    const ctx  = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    await login(page, "eakpustak@gmail.com", "eakpustak@321");
    for (const p of SUPERADMIN_PAGES) {
      const img = await capture(page, p.path);
      slides.push({ section: "Super Admin Panel", ...p, img });
    }
    await ctx.close();
  }

  await browser.close();

  // ── Generate HTML ─────────────────────────────────────────────────────────
  console.log("\n🎨 Generating presentation…");
  fs.writeFileSync("usms-demo.html", buildHTML(slides), "utf8");
  console.log(`\n✅ Done! Open usms-demo.html in your browser.`);
  console.log(`   Total slides: ${slides.length}`);
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildNav(slides) {
  let html = "";
  let lastSection = null;
  slides.forEach((s, i) => {
    if (s.section !== lastSection) {
      html += `<div class="nav-section">${s.section}</div>`;
      lastSection = s.section;
    }
    html += `
      <div class="nav-item" data-index="${i}" onclick="goTo(${i})">
        <span class="nav-num">${i + 1}</span>
        <span class="nav-label">${s.title}</span>
      </div>`;
  });
  return html;
}

function buildHTML(slides) {
  const slideItems = slides
    .map(
      (s, i) => `
    <div class="slide" data-index="${i}">
      <div class="slide-header">
        <div class="section-badge">${s.section}</div>
        <h2 class="slide-title">${s.title}</h2>
        <p class="slide-desc">${s.desc}</p>
      </div>
      <div class="slide-img-wrap">
        <img src="${s.img}" alt="${s.title}" loading="lazy" />
      </div>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>USMS — School ERP Demo</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d0f1a;
    color: #f1f5f9;
    height: 100vh;
    display: flex;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: 230px;
    background: #131622;
    border-right: 1px solid #1e2235;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #2a2d3e transparent;
  }
  .sidebar-logo {
    padding: 20px 18px 16px;
    border-bottom: 1px solid #1e2235;
  }
  .logo-mark {
    font-size: 22px;
    font-weight: 900;
    color: #818cf8;
    letter-spacing: -1px;
  }
  .logo-sub {
    font-size: 10px;
    color: #475569;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .nav-section {
    padding: 14px 18px 4px;
    font-size: 9px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 1.2px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 18px;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: all 0.12s;
  }
  .nav-item:hover  { background: #1a1e30; }
  .nav-item.active { background: #1e2238; border-left-color: #818cf8; }
  .nav-num {
    font-size: 10px;
    color: #475569;
    width: 16px;
    text-align: right;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .nav-label {
    font-size: 12px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav-item.active .nav-label { color: #a5b4fc; }

  /* ── Main ── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 24px;
    background: #131622;
    border-bottom: 1px solid #1e2235;
    flex-shrink: 0;
    gap: 12px;
  }
  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .counter {
    font-size: 12px;
    color: #475569;
    font-variant-numeric: tabular-nums;
    min-width: 48px;
  }
  .progress-bar {
    width: 120px;
    height: 3px;
    background: #1e2235;
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #818cf8;
    border-radius: 2px;
    transition: width 0.2s;
  }
  .toolbar-btns {
    display: flex;
    gap: 6px;
  }
  .btn {
    padding: 5px 14px;
    border-radius: 6px;
    border: 1px solid #1e2235;
    background: #1a1e30;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn:hover:not(:disabled)  { background: #252840; border-color: #818cf8; color: #c7d2fe; }
  .btn:disabled { opacity: 0.3; cursor: default; }
  .toolbar-hint {
    font-size: 10px;
    color: #334155;
  }

  /* ── Slides ── */
  .slides-wrap {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
  .slide {
    position: absolute;
    inset: 0;
    display: none;
    flex-direction: column;
    padding: 24px 28px 20px;
    gap: 14px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #2a2d3e transparent;
  }
  .slide.active { display: flex; }

  .slide-header { flex-shrink: 0; }
  .section-badge {
    display: inline-block;
    background: rgba(99,102,241,0.15);
    color: #a5b4fc;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
    border: 1px solid rgba(99,102,241,0.25);
  }
  .slide-title {
    font-size: 24px;
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.2;
  }
  .slide-desc {
    font-size: 13px;
    color: #64748b;
    margin-top: 5px;
    max-width: 640px;
    line-height: 1.65;
  }
  .slide-img-wrap {
    flex: 1;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #1e2235;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
    background: #fff;
    min-height: 0;
  }
  .slide-img-wrap img {
    width: 100%;
    display: block;
    height: auto;
  }
</style>
</head>
<body>

<nav class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-mark">USMS</div>
    <div class="logo-sub">School ERP · Demo</div>
  </div>
  <div id="nav">${buildNav(slides)}</div>
</nav>

<div class="main">
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="counter" id="counter">1 / ${slides.length}</span>
      <div class="progress-bar">
        <div class="progress-fill" id="progress" style="width:${(1 / slides.length) * 100}%"></div>
      </div>
    </div>
    <div class="toolbar-btns">
      <button class="btn" id="prevBtn" onclick="prev()">← Prev</button>
      <button class="btn" id="nextBtn" onclick="next()">Next →</button>
    </div>
    <span class="toolbar-hint">Arrow keys to navigate</span>
  </div>

  <div class="slides-wrap">
    ${slideItems}
  </div>
</div>

<script>
  const total   = ${slides.length};
  let   current = 0;

  const slideEls  = document.querySelectorAll(".slide");
  const navEls    = document.querySelectorAll(".nav-item");
  const counter   = document.getElementById("counter");
  const progress  = document.getElementById("progress");
  const prevBtn   = document.getElementById("prevBtn");
  const nextBtn   = document.getElementById("nextBtn");

  function goTo(n) {
    slideEls[current].classList.remove("active");
    navEls[current].classList.remove("active");
    current = Math.max(0, Math.min(total - 1, n));
    slideEls[current].classList.add("active");
    slideEls[current].scrollTop = 0;
    navEls[current].classList.add("active");
    navEls[current].scrollIntoView({ block: "nearest", behavior: "smooth" });
    counter.textContent  = (current + 1) + " / " + total;
    progress.style.width = ((current + 1) / total * 100) + "%";
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === total - 1;
  }

  function prev() { goTo(current - 1); }
  function next() { goTo(current + 1); }

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") next();
    if (e.key === "ArrowLeft"  || e.key === "ArrowUp")  prev();
  });

  goTo(0);
</script>
</body>
</html>`;
}

run().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

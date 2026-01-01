// adhd.js
// One-question-at-a-time ADHD questionnaire (0–4 scoring)
// Stores answers in localStorage["adhd_answers"] and final result in localStorage["adhd_result"]

(() => {

  const QUESTIONS = [
    "How often do you have trouble wrapping up final details of a project?",
    "How often do you have difficulty getting things in order?",
    "How often do you have problems remembering appointments?",
    "How often do you avoid tasks that require a lot of thought?",
    "How often do you fidget or squirm when sitting?",
    "How often do you feel overly active?",
    "How often do you make careless mistakes?",
    "How often do you have difficulty sustaining attention?",
    "How often do you feel restless?",
    "How often do you talk excessively?",
    "How often do you interrupt others?",
    "How often do you misplace things?",
    "How often do you act without thinking?",
    "How often do you feel distracted easily?",
    "How often do you struggle following instructions?"
  ];

  const OPTIONS = ["Never", "Rarely", "Sometimes", "Often", "Very Often"];
  const TOTAL = QUESTIONS.length;

  // DOM
  const qIndexEl = document.getElementById("qIndex");
  const progressFill = document.getElementById("progressFill");
  const questionArea = document.getElementById("questionArea");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  // Load answers or initialize
  let answers = JSON.parse(localStorage.getItem("adhd_answers") || "null");
  if (!Array.isArray(answers) || answers.length !== TOTAL) {
    answers = new Array(TOTAL).fill(null);
    localStorage.setItem("adhd_answers", JSON.stringify(answers));
  }

  function renderQuestion(i) {
    questionArea.innerHTML = "";
    qIndexEl.textContent = i + 1;

    const qCard = document.createElement("div");
    qCard.className = "question-card";

    const qText = document.createElement("p");
    qText.textContent = `${i + 1}. ${QUESTIONS[i]}`;
    qCard.appendChild(qText);

    const opts = document.createElement("div");
    opts.className = "options";

    OPTIONS.forEach((label, val) => {
      const opt = document.createElement("label");
      opt.className = "option";
      opt.dataset.value = val;
      opt.tabIndex = 0;

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `q${i}`;
      input.value = val;
      input.setAttribute("aria-label", label);

      opt.appendChild(input);

      const span = document.createElement("span");
      span.textContent = label;
      opt.appendChild(span);

      opt.addEventListener("click", () => {
        opts.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
        opt.classList.add("selected");
        input.checked = true;

        answers[i] = Number(val);
        localStorage.setItem("adhd_answers", JSON.stringify(answers));
      });

      opt.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          opt.click();
        }
      });

      if (answers[i] !== null && answers[i] === val) {
        opt.classList.add("selected");
        input.checked = true;
      }

      opts.appendChild(opt);
    });

    qCard.appendChild(opts);
    questionArea.appendChild(qCard);

    // Progress bar
    progressFill.style.width = `${Math.round(((i + 1) / TOTAL) * 100)}%`;

    prevBtn.disabled = i === 0;
    nextBtn.textContent = (i === TOTAL - 1) ? "Submit" : "Next";
  }

  // Navigation
  prevBtn.addEventListener("click", () => {
    if (current > 0) {
      current--;
      renderQuestion(current);
    }
  });

  nextBtn.addEventListener("click", () => {
    if (answers[current] === null) {
      alert("Please select an option to continue.");
      return;
    }

    if (current < TOTAL - 1) {
      current++;
      renderQuestion(current);
    } else {
      computeAndRedirect();
    }
  });

  function computeAndRedirect() {
    const inattention = answers.slice(0, 7).reduce((a, b) => a + b, 0);
    const hyperactivity = answers.slice(7, 11).reduce((a, b) => a + b, 0);
    const impulsivity = answers.slice(11, 15).reduce((a, b) => a + b, 0);

    const total = inattention + hyperactivity + impulsivity;
    const rawProb = (total / 60) * 100;

    const prob = Math.min(99, Math.max(8, Math.round(rawProb)));

    // Clear localStorage
    localStorage.removeItem("adhd_answers");
    localStorage.removeItem("adhd_result");

    // Redirect to Flask route with detailed query params
    const redirectURL = `/adhd_result_local?score=${total}&inattention=${inattention}&hyperactivity=${hyperactivity}&impulsivity=${impulsivity}`;
    window.location.href = redirectURL;
  }

  let current = 0;
  renderQuestion(current);

})();

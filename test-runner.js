
function renderTeacherTrainingTest(testKey) {
  const TEST_META = window.TEACHER_TRAINING_TESTS[testKey];
  const config = window.MATHCHAMPS_TEACHER_TRAINING_CONFIG || {};

  function setStatus(type, message, targetId = "statusBox") {
    const box = document.getElementById(targetId);
    box.className = "status-box " + type;
    box.textContent = message;
  }
  function clean(value) {
    return String(value ?? "").replace(/[\n\r]+/g, " ").trim();
  }
  function participantKey(email) {
    return TEST_META.testId + "|" + String(email || "").trim().toLowerCase();
  }
  function resultPrefix() {
    return config.resultPrefix + "/" + TEST_META.testId;
  }
  function hasStorageConfig() {
    return Boolean(config.supabaseUrl && config.storageKey && config.resultPrefix);
  }
  function collectAnswers(form) {
    const answers = {};
    TEST_META.questions.forEach((question, index) => {
      const key = "q" + (index + 1);
      answers[key] = form.querySelector('input[name="' + key + '"]:checked')?.value || "";
    });
    return answers;
  }
  function countCorrect(answers) {
    return TEST_META.questions.reduce((count, question, index) => {
      const key = "q" + (index + 1);
      return count + (answers[key] === question.answer ? 1 : 0);
    }, 0);
  }
  function calculateScore(answers) {
    return Math.round((countCorrect(answers) / TEST_META.questions.length) * 100);
  }
  async function listExistingResults() {
    if (!hasStorageConfig()) return [];
    const response = await fetch(config.supabaseUrl + "/storage/v1/object/list/html-pages", {
      method: "POST",
      headers: {
        apikey: config.storageKey,
        Authorization: "Bearer " + config.storageKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prefix: resultPrefix(),
        limit: 1000,
        offset: 0,
        sortBy: { column: "created_at", order: "desc" }
      })
    });
    if (!response.ok) throw new Error(await response.text());
    const files = await response.json();
    const rows = [];
    for (const file of files.filter((item) => item.name && item.name.endsWith(".json"))) {
      const url = config.supabaseUrl + "/storage/v1/object/public/html-pages/" + resultPrefix() + "/" + file.name + "?v=" + Date.now();
      const itemResponse = await fetch(url);
      if (itemResponse.ok) rows.push(await itemResponse.json());
    }
    return rows;
  }
  async function hasAlreadySubmitted(email) {
    const key = participantKey(email);
    if (localStorage.getItem("mathchamps-teacher-training-submitted:" + key)) return true;
    const existing = await listExistingResults();
    return existing.some((row) => {
      const rowEmail = String(row.email || row.participant_email || "").trim().toLowerCase();
      const rowTestId = String(row.testId || row.test_id || "");
      return (row.participant_key && row.participant_key === key) || (rowEmail === String(email).trim().toLowerCase() && rowTestId === TEST_META.testId);
    });
  }
  async function saveResponse(payload) {
    if (!hasStorageConfig()) throw new Error("Konfigurasi storage hasil belum lengkap di test-config.js.");
    const random = Math.random().toString(36).slice(2, 10);
    const fileName = Date.now() + "-" + random + ".json";
    const objectPath = resultPrefix() + "/" + fileName;
    const response = await fetch(config.supabaseUrl + "/storage/v1/object/html-pages/" + objectPath, {
      method: "POST",
      headers: {
        apikey: config.storageKey,
        Authorization: "Bearer " + config.storageKey,
        "Content-Type": "application/json",
        "x-upsert": "false"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    return fileName;
  }

  document.getElementById("startButton").addEventListener("click", async () => {
    const form = document.getElementById("testForm");
    const email = form.email.value.trim().toLowerCase();
    const name = clean(form.teacherName.value);
    const branch = clean(form.branchName.value);
    const startButton = document.getElementById("startButton");
    if (!email || !name || !branch) {
      setStatus("warn", "Isi Email Pengajar, Nama Lengkap, dan Cabang dulu ya. Untuk kelas online, isi Cabang dengan ONLINE.");
      return;
    }
    startButton.disabled = true;
    setStatus("warn", "Mengecek data pengajar...");
    try {
      if (await hasAlreadySubmitted(email)) {
        setStatus("warn", "Email ini sudah pernah submit test ini. Jika ada kesalahan, hubungi trainer/admin.");
        startButton.disabled = false;
        return;
      }
      document.getElementById("quizParticipant").textContent = name + " | " + branch;
      document.getElementById("introCard").classList.add("hidden");
      document.getElementById("quizCard").classList.remove("hidden");
      window.scrollTo(0, 0);
    } catch (error) {
      console.error(error);
      setStatus("err", "Belum bisa mengecek data. Cek koneksi internet lalu coba lagi.");
      startButton.disabled = false;
    }
  });

  document.getElementById("testForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim().toLowerCase();
    const name = clean(form.teacherName.value);
    const branch = clean(form.branchName.value);
    if (!email || !name || !branch) {
      setStatus("warn", "Isi data pengajar dulu ya sebelum submit.", "quizStatusBox");
      return;
    }
    const answers = collectAnswers(form);
    if (Object.values(answers).some((answer) => !answer)) {
      setStatus("warn", "Masih ada soal yang belum dijawab.", "quizStatusBox");
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus("warn", "Menyimpan jawaban ke dashboard hasil...", "quizStatusBox");
    try {
      if (await hasAlreadySubmitted(email)) {
        setStatus("warn", "Email ini sudah pernah submit test ini. Jika ada kesalahan, hubungi trainer/admin.", "quizStatusBox");
        submitButton.disabled = false;
        return;
      }
      const now = new Date();
      const correct = countCorrect(answers);
      const score = calculateScore(answers);
      const answerLabels = TEST_META.questions.map((question, index) => answers["q" + (index + 1)]);
      const payload = {
        submitted_at: now.toISOString(),
        submittedAt: now.toISOString(),
        submitted_date: now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" }),
        submitted_time: now.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        program: "Holiday Program Mathpreneur F&B - Teacher Training",
        testId: TEST_META.testId,
        test_id: TEST_META.testId,
        kind: TEST_META.kindId,
        kind_label: TEST_META.kind,
        email,
        participant_email: email,
        name,
        teacherName: name,
        branch,
        branchName: branch,
        classMode: branch.toUpperCase() === "ONLINE" ? "Online" : "Offline",
        correct,
        totalQuestions: TEST_META.questions.length,
        score,
        participant_key: participantKey(email),
        answers,
        answer_labels: answerLabels,
        questions: TEST_META.questions.map((question) => question.question)
      };
      await saveResponse(payload);
      localStorage.setItem("mathchamps-teacher-training-submitted:" + participantKey(email), "1");
      setStatus("ok", "Jawaban tersimpan. Skor kamu: " + score + ". Trainer bisa melihat hasilnya di dashboard.", "quizStatusBox");
    } catch (error) {
      console.error(error);
      setStatus("err", "Jawaban belum berhasil tersimpan. Cek koneksi internet lalu coba submit lagi.", "quizStatusBox");
      submitButton.disabled = false;
    }
  });
}

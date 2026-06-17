
const config = window.MATHCHAMPS_TEACHER_TRAINING_CONFIG || {};
const tests = window.TEACHER_TRAINING_TESTS || {};
let allRows = [];
const statusBox = document.getElementById("resultsStatus");
const spreadsheetLink = document.getElementById("spreadsheetLink");
if (config.spreadsheetUrl) spreadsheetLink.href = config.spreadsheetUrl;
else spreadsheetLink.style.display = "none";

function setStatus(type, message) {
  statusBox.className = "status-box " + type;
  statusBox.textContent = message;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}
function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function testLabel(testId, fallback) {
  const found = Object.values(tests).find((test) => test.testId === testId);
  return found ? found.title : fallback || testId;
}
function normalize(row) {
  const submittedAt = row.submitted_at || row.submittedAt || "";
  return {
    date: row.submitted_date || formatDate(submittedAt),
    time: row.submitted_time || formatTime(submittedAt),
    submittedAt,
    testId: row.testId || row.test_id || "",
    testTitle: testLabel(row.testId || row.test_id || "", row.kind_label || ""),
    email: row.email || row.participant_email || "",
    participant: row.name || row.teacherName || "",
    branch: row.branch || row.branchName || "",
    correct: Number(row.correct || 0),
    totalQuestions: Number(row.totalQuestions || 0),
    score: Number(row.score || 0),
    answers: Array.isArray(row.answer_labels) ? row.answer_labels.join(", ") : Object.values(row.answers || {}).join(", ")
  };
}
function filteredRows() {
  const test = document.getElementById("testFilter").value;
  const branch = document.getElementById("branchFilter").value.toLowerCase();
  const keyword = document.getElementById("keywordFilter").value.toLowerCase();
  return allRows.filter((row) =>
    (!test || row.testId === test) &&
    (!branch || row.branch.toLowerCase().includes(branch)) &&
    (!keyword || (row.participant + " " + row.email).toLowerCase().includes(keyword))
  );
}
function render() {
  const rows = filteredRows();
  document.getElementById("totalSubmits").textContent = rows.length;
  document.getElementById("avgScore").textContent = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;
  document.getElementById("preCount").textContent = rows.filter((row) => row.testId === "teacher-training-pre").length;
  document.getElementById("postCount").textContent = rows.filter((row) => row.testId !== "teacher-training-pre").length;
  const body = document.getElementById("resultsBody");
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9">Belum ada data yang sesuai filter.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => '<tr>' +
    '<td>' + escapeHtml(row.date) + '</td>' +
    '<td>' + escapeHtml(row.time) + '</td>' +
    '<td>' + escapeHtml(row.testTitle) + '</td>' +
    '<td>' + escapeHtml(row.participant) + '</td>' +
    '<td>' + escapeHtml(row.email) + '</td>' +
    '<td>' + escapeHtml(row.branch) + '</td>' +
    '<td><strong>' + row.correct + '/' + row.totalQuestions + '</strong></td>' +
    '<td><strong>' + row.score + '</strong></td>' +
    '<td>' + escapeHtml(row.answers) + '</td>' +
  '</tr>').join("");
}
async function listStoredResults(testId) {
  const prefix = config.resultPrefix + "/" + testId;
  const response = await fetch(config.supabaseUrl + "/storage/v1/object/list/html-pages", {
    method: "POST",
    headers: {
      apikey: config.storageKey,
      Authorization: "Bearer " + config.storageKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prefix,
      limit: 1000,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" }
    })
  });
  if (!response.ok) throw new Error(await response.text());
  const files = await response.json();
  const rows = [];
  for (const file of files.filter((item) => item.name && item.name.endsWith(".json"))) {
    const url = config.supabaseUrl + "/storage/v1/object/public/html-pages/" + prefix + "/" + file.name + "?v=" + Date.now();
    const itemResponse = await fetch(url);
    if (itemResponse.ok) rows.push(await itemResponse.json());
  }
  return rows;
}
async function loadResults() {
  try {
    setStatus("warn", "Memuat data hasil...");
    if (!config.supabaseUrl || !config.storageKey || !config.resultPrefix) {
      throw new Error("Konfigurasi hasil belum lengkap di test-config.js.");
    }
    const chunks = await Promise.all(Object.values(tests).map((test) => listStoredResults(test.testId)));
    allRows = chunks.flat().map(normalize)
      .filter((row) => row.email || row.participant)
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    setStatus("ok", "Data berhasil dimuat: " + allRows.length + " submit.");
    render();
  } catch (error) {
    console.error(error);
    setStatus("err", "Data belum berhasil dimuat. Cek koneksi internet atau konfigurasi hasil di test-config.js.");
  }
}
function toCsvValue(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}
function exportCsv() {
  const rows = filteredRows();
  const header = ["tanggal_submit", "waktu_submit", "submitted_at_iso", "jenis_test", "nama_pengajar", "email", "cabang", "benar", "total_soal", "nilai", "jawaban"];
  const lines = [header.map(toCsvValue).join(",")];
  rows.forEach((row) => {
    lines.push([
      row.date,
      row.time,
      row.submittedAt,
      row.testTitle,
      row.participant,
      row.email,
      row.branch,
      row.correct,
      row.totalQuestions,
      row.score,
      row.answers
    ].map(toCsvValue).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hasil-test-teacher-training-mathpreneur-fnb.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
Object.values(tests).forEach((test) => {
  const opt = document.createElement("option");
  opt.value = test.testId;
  opt.textContent = test.title;
  document.getElementById("testFilter").appendChild(opt);
});
["testFilter", "branchFilter", "keywordFilter"].forEach((id) => {
  document.getElementById(id).addEventListener("input", render);
});
document.getElementById("refreshBtn").addEventListener("click", loadResults);
document.getElementById("exportBtn").addEventListener("click", exportCsv);
loadResults();

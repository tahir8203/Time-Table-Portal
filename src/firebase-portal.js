import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence,
  onAuthStateChanged, signInWithPopup, signOut,
} from "firebase/auth";
import {
  getFirestore, collection, doc, getDoc, getDocs, deleteDoc, query,
  orderBy, limit, serverTimestamp, writeBatch, runTransaction,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configured = [
  firebaseConfig.apiKey, firebaseConfig.authDomain,
  firebaseConfig.projectId, firebaseConfig.appId,
].every((value) => value && !/^(replace_me|your-)/i.test(value));
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || "(default)";

let auth = null;
let db = null;
let user = null;
let activeId = null;
let activeName = "";
let timetables = [];
let versions = [];
let versionsForId = null;
let mountNode = null;
let busy = false;
let errorMessage = "";
let pendingFingerprint = "";
let pendingSince = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function currentState() {
  if (!window.S || !Array.isArray(window.S.classes) || !Array.isArray(window.S.teachers)) {
    throw new Error("The current timetable is not ready yet.");
  }
  return clone(window.S);
}

function normalizeState(value) {
  const state = clone(value);
  state.meta ||= {};
  state.tt ||= {};
  state.locks ||= {};
  state.leave ||= {};
  state.cover ||= {};
  state.rules ||= { maxConsecutive: 6, defaultMax: 8 };
  if (!state.plan && typeof window.planFrom === "function") state.plan = window.planFrom(state);
  return state;
}

function timetableName() {
  const state = window.S || {};
  const school = state.meta?.school || "School timetable";
  return `${school}${state.meta?.wef ? ` — ${state.meta.wef}` : ""}`;
}

function cleanName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Please enter a name for this timetable.");
  return name.slice(0, 100);
}

function setBadge(text, kind = "") {
  const badge = document.getElementById("cloudBadge");
  if (!badge) return;
  badge.textContent = text;
  badge.className = `cloudbadge ${kind}`.trim();
}

function updatedLabel(value) {
  if (!value) return "Just now";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function docCollection() {
  if (!db || !user) throw new Error("Please sign in first.");
  return collection(db, "users", user.uid, "timetables");
}

function timetableRef(id) {
  return doc(db, "users", user.uid, "timetables", id);
}

function parentRecord(name, state, includeCreated, versionCount) {
  const value = {
    name,
    school: state.meta?.school || "",
    effectiveFrom: state.meta?.wef || "",
    state,
    ownerUid: user.uid,
    schemaVersion: 3,
    versionCount,
    updatedAt: serverTimestamp(),
  };
  if (includeCreated) value.createdAt = serverTimestamp();
  return value;
}

function versionRecord(state, number, reason) {
  return {
    state,
    versionNumber: number,
    reason,
    ownerUid: user.uid,
    school: state.meta?.school || "",
    effectiveFrom: state.meta?.wef || "",
    createdAt: serverTimestamp(),
  };
}

async function createCloudTimetable(name, state, reason = "Created") {
  const parent = doc(docCollection());
  const version = doc(collection(parent, "versions"));
  const batch = writeBatch(db);
  batch.set(parent, parentRecord(name, state, true, 1));
  batch.set(version, versionRecord(state, 1, reason));
  await batch.commit();
  return parent.id;
}

async function updateCloudTimetable(id, name, state, reason) {
  const parent = timetableRef(id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(parent);
    if (!snapshot.exists()) throw new Error("That cloud timetable no longer exists.");
    const nextVersion = Number(snapshot.data().versionCount || 1) + 1;
    const version = doc(collection(parent, "versions"));
    transaction.update(parent, parentRecord(name, state, false, nextVersion));
    transaction.set(version, versionRecord(state, nextVersion, reason));
  });
}

async function reloadLibrary() {
  if (!user) {
    timetables = [];
    render();
    return;
  }
  const snapshot = await getDocs(query(docCollection(), orderBy("updatedAt", "desc")));
  timetables = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const active = timetables.find((item) => item.id === activeId);
  if (active) activeName = active.name || activeName;
  render();
}

function friendlyError(error) {
  const code = error?.code || "";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was cancelled.";
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups and try again.";
  if (code === "auth/unauthorized-domain") return "This website domain must be added to Firebase Authentication → Authorized domains.";
  if (code === "permission-denied") return "Firebase refused access. Deploy the included Firestore rules and try again.";
  if (code === "unavailable") return "Firebase is temporarily unavailable. Check your internet connection and try again.";
  return error?.message || "The cloud operation could not be completed.";
}

async function perform(action, { successMessage = "", silent = false } = {}) {
  if (busy) return false;
  busy = true;
  errorMessage = "";
  setBadge("Cloud: saving…", "on");
  render();
  try {
    await action();
    if (successMessage && !silent && typeof window.toast === "function") window.toast(successMessage);
    return true;
  } catch (error) {
    console.error(error);
    errorMessage = friendlyError(error);
    setBadge("Cloud save failed", "warn");
    return false;
  } finally {
    busy = false;
    render();
  }
}

function applyTimetable(item, destination = "dash") {
  if (!item?.state) throw new Error("This cloud record does not contain timetable data.");
  window.S = normalizeState(item.state);
  window.DIRTY = false;
  activeId = item.id;
  activeName = item.name || timetableName();
  pendingFingerprint = JSON.stringify(window.S);
  pendingSince = 0;
  if (typeof window.applyTheme === "function") window.applyTheme(window.S.meta?.theme || "classic");
  window.VIEW = destination;
  window.drawNav();
  window.render();
}

async function saveAsNew() {
  const input = document.getElementById("cloudName");
  const name = cleanName(input?.value || timetableName());
  await perform(async () => {
    const state = currentState();
    activeId = await createCloudTimetable(name, state, "Created as a new timetable");
    activeName = name;
    window.DIRTY = false;
    pendingFingerprint = JSON.stringify(state);
    await reloadLibrary();
  }, { successMessage: "New online timetable saved" });
}

async function saveChanges(options = {}) {
  if (!activeId) return false;
  const input = document.getElementById("cloudName");
  const name = cleanName(input?.value || activeName || timetableName());
  const state = currentState();
  return perform(async () => {
    await updateCloudTimetable(activeId, name, state, options.automatic ? "Automatic save" : "Manual save");
    activeName = name;
    window.DIRTY = false;
    pendingFingerprint = JSON.stringify(state);
    pendingSince = 0;
    await reloadLibrary();
  }, { successMessage: "Saved online with a new version", silent: options.automatic });
}

async function openTimetable(id) {
  await perform(async () => {
    const snapshot = await getDoc(timetableRef(id));
    if (!snapshot.exists()) throw new Error("That timetable no longer exists.");
    applyTimetable({ id: snapshot.id, ...snapshot.data() });
  }, { successMessage: "Online timetable opened" });
}

async function duplicateTimetable(id) {
  await perform(async () => {
    const snapshot = await getDoc(timetableRef(id));
    if (!snapshot.exists()) throw new Error("That timetable no longer exists.");
    const source = snapshot.data();
    const name = cleanName(`Copy of ${source.name || "Timetable"}`);
    activeId = await createCloudTimetable(name, normalizeState(source.state), "Duplicated from another timetable");
    activeName = name;
    applyTimetable({ id: activeId, name, state: source.state });
    await reloadLibrary();
  }, { successMessage: "Online copy created" });
}

async function deleteTimetableTree(id) {
  const parent = timetableRef(id);
  const snapshot = await getDocs(collection(parent, "versions"));
  const refs = snapshot.docs.map((item) => item.ref);
  for (let start = 0; start < refs.length; start += 400) {
    const batch = writeBatch(db);
    refs.slice(start, start + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  await deleteDoc(parent);
}

async function removeTimetable(id) {
  const item = timetables.find((entry) => entry.id === id);
  if (!window.confirm(`Delete “${item?.name || "this timetable"}” from Firebase? Its saved versions will no longer be available in the portal.`)) return;
  await perform(async () => {
    await deleteTimetableTree(id);
    if (activeId === id) { activeId = null; activeName = ""; }
    if (versionsForId === id) { versionsForId = null; versions = []; }
    await reloadLibrary();
  }, { successMessage: "Online timetable deleted" });
}

async function newTimetableFromSetup() {
  const next = normalizeState(currentState());
  next.tt = {};
  next.locks = {};
  next.leave = {};
  next.cover = {};
  next.plan = {};
  next.classes.forEach((schoolClass) => { next.plan[schoolClass.id] = []; });
  next.meta.wef = "";
  const name = `${next.meta.school || "School"} — New timetable ${new Date().toLocaleDateString()}`;
  await perform(async () => {
    const id = await createCloudTimetable(cleanName(name), next, "Created from the existing school setup");
    applyTimetable({ id, name, state: next }, "grid");
    await reloadLibrary();
  }, { successMessage: "New online timetable created" });
}

async function showVersions(id) {
  await perform(async () => {
    const snapshot = await getDocs(query(collection(timetableRef(id), "versions"), orderBy("createdAt", "desc"), limit(50)));
    versionsForId = id;
    versions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  });
}

async function restoreVersion(versionId) {
  const selected = versions.find((item) => item.id === versionId);
  const parent = timetables.find((item) => item.id === versionsForId);
  if (!selected || !parent) return;
  if (!window.confirm(`Restore version ${selected.versionNumber}? The current state stays in history as an earlier version.`)) return;
  await perform(async () => {
    const restored = normalizeState(selected.state);
    await updateCloudTimetable(parent.id, parent.name, restored, `Restored version ${selected.versionNumber}`);
    applyTimetable({ id: parent.id, name: parent.name, state: restored });
    await reloadLibrary();
  }, { successMessage: "Version restored and saved online" });
}

async function bootstrapInitialTimetable() {
  if (timetables.length) return;
  const state = currentState();
  const name = timetableName();
  activeId = await createCloudTimetable(name, state, "Initial timetable imported to Firebase");
  activeName = name;
  window.DIRTY = false;
  pendingFingerprint = JSON.stringify(state);
  await reloadLibrary();
}

async function signIn() {
  await perform(async () => { await signInWithPopup(auth, new GoogleAuthProvider()); });
}

async function logOut() {
  await perform(async () => {
    await signOut(auth);
    activeId = null;
    activeName = "";
    versionsForId = null;
    versions = [];
  });
}

function setupHtml() {
  return `<div class="card"><h2>Firebase connection required</h2><div class="body cloudsetup">
    <div class="banner warn" style="margin:0">This online-only portal needs its Firebase project settings before timetable data can be edited or saved.</div>
    <div>Add the seven <b>VITE_FIREBASE_*</b> values to Vercel, enable Google sign-in and the Firestore database, and deploy <b>firestore.rules</b>.</div>
  </div></div>`;
}

function signedOutHtml() {
  return `<div class="card"><div class="body cloudhero">
    <div><h2>Sign in to continue</h2><p>All timetable data is online. Sign in with Google to open your Firebase timetable library and its saved versions.</p></div>
    <button class="btn pri" id="cloudSignIn" ${busy ? "disabled" : ""}>${busy ? "Signing in…" : "Sign in with Google"}</button>
  </div>${errorMessage ? `<div class="body clouderror">${escapeHtml(errorMessage)}</div>` : ""}</div>`;
}

function libraryRows() {
  if (!timetables.length) return `<tr><td colspan="5" class="cloudempty">Creating the first online timetable…</td></tr>`;
  return timetables.map((item) => `<tr>
    <td><div class="cloudmeta"><b>${escapeHtml(item.name || "Untitled timetable")}${item.id === activeId ? '<span class="cloudactive">OPEN</span>' : ""}</b><small>${escapeHtml(item.school || "School not named")}</small></div></td>
    <td>${escapeHtml(item.effectiveFrom || "—")}</td>
    <td>${Number(item.versionCount || 1)}</td>
    <td>${escapeHtml(updatedLabel(item.updatedAt))}</td>
    <td><div class="cloudactions">
      <button class="btn sm" data-cloud-open="${item.id}" ${busy ? "disabled" : ""}>Open</button>
      <button class="btn sm" data-cloud-history="${item.id}" ${busy ? "disabled" : ""}>Versions</button>
      <button class="btn sm" data-cloud-copy="${item.id}" ${busy ? "disabled" : ""}>Duplicate</button>
      <button class="btn sm" data-cloud-delete="${item.id}" ${busy ? "disabled" : ""}>Delete</button>
    </div></td>
  </tr>`).join("");
}

function versionsHtml() {
  if (!versionsForId) return "";
  const parent = timetables.find((item) => item.id === versionsForId);
  const rows = versions.length ? versions.map((item) => `<tr>
    <td><b>Version ${Number(item.versionNumber || 1)}</b></td>
    <td>${escapeHtml(item.reason || "Saved")}</td>
    <td>${escapeHtml(updatedLabel(item.createdAt))}</td>
    <td><button class="btn sm" data-cloud-restore="${item.id}" ${busy ? "disabled" : ""}>Restore</button></td>
  </tr>`).join("") : `<tr><td colspan="4" class="cloudempty">No versions found.</td></tr>`;
  return `<div class="card"><h2>Version history <span class="hint">${escapeHtml(parent?.name || "Timetable")}</span></h2><div class="tw"><table>
    <thead><tr><th>Version</th><th>Saved by</th><th>Saved at</th><th>Action</th></tr></thead><tbody>${rows}</tbody>
  </table></div></div>`;
}

function signedInHtml() {
  const photo = user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" alt="">` : "";
  return `<div class="bar">
    <div class="clouduser">${photo}<span class="who"><b>${escapeHtml(user.displayName || "Signed in")}</b><small>${escapeHtml(user.email || "")}</small></span></div>
    <span class="spacer"></span>
    <button class="btn" id="cloudRefresh" ${busy ? "disabled" : ""}>Refresh</button>
    <button class="btn" id="cloudSignOut" ${busy ? "disabled" : ""}>Sign out</button>
  </div>
  <div class="card"><h2>Online saving</h2><div class="body">
    <div class="cloudsave">
      <label class="fld">Timetable name<input type="text" id="cloudName" maxlength="100" value="${escapeHtml(activeName || timetableName())}"></label>
      <button class="btn pri" id="cloudSaveNew" ${busy ? "disabled" : ""}>Save as new</button>
      <button class="btn" id="cloudUpdate" ${busy || !activeId ? "disabled" : ""}>Save now</button>
    </div>
    <div class="bar" style="margin-bottom:0"><button class="btn" id="cloudNew" ${busy ? "disabled" : ""}>New timetable from same school setup</button><span class="small muted">Opened timetables save automatically after editing pauses. Every save creates a Firebase version.</span></div>
    ${errorMessage ? `<div class="clouderror">${escapeHtml(errorMessage)}</div>` : ""}
  </div></div>
  <div class="card"><h2>Online timetables <span class="hint">${timetables.length} in Firebase</span></h2><div class="tw"><table>
    <thead><tr><th>Name</th><th>Effective from</th><th>Versions</th><th>Last saved</th><th>Actions</th></tr></thead>
    <tbody>${libraryRows()}</tbody>
  </table></div></div>${versionsHtml()}`;
}

function bindRenderedControls() {
  document.getElementById("cloudSignIn")?.addEventListener("click", signIn);
  document.getElementById("cloudSignOut")?.addEventListener("click", logOut);
  document.getElementById("cloudRefresh")?.addEventListener("click", () => perform(reloadLibrary));
  document.getElementById("cloudSaveNew")?.addEventListener("click", saveAsNew);
  document.getElementById("cloudUpdate")?.addEventListener("click", () => saveChanges());
  document.getElementById("cloudNew")?.addEventListener("click", newTimetableFromSetup);
  mountNode?.querySelectorAll("[data-cloud-open]").forEach((button) => button.addEventListener("click", () => openTimetable(button.dataset.cloudOpen)));
  mountNode?.querySelectorAll("[data-cloud-history]").forEach((button) => button.addEventListener("click", () => showVersions(button.dataset.cloudHistory)));
  mountNode?.querySelectorAll("[data-cloud-copy]").forEach((button) => button.addEventListener("click", () => duplicateTimetable(button.dataset.cloudCopy)));
  mountNode?.querySelectorAll("[data-cloud-delete]").forEach((button) => button.addEventListener("click", () => removeTimetable(button.dataset.cloudDelete)));
  mountNode?.querySelectorAll("[data-cloud-restore]").forEach((button) => button.addEventListener("click", () => restoreVersion(button.dataset.cloudRestore)));
}

function render() {
  if (!configured) {
    setBadge("Firebase setup needed", "warn");
    if (mountNode) mountNode.innerHTML = setupHtml();
    return;
  }
  if (!user) {
    setBadge("Cloud: sign in", "warn");
    if (mountNode) mountNode.innerHTML = signedOutHtml();
  } else {
    setBadge(busy ? "Cloud: saving…" : `Cloud: ${timetables.length} online`, "on");
    if (mountNode) mountNode.innerHTML = signedInHtml();
  }
  bindRenderedControls();
}

function forceCloudView() {
  if (!configured || user || window.VIEW === "cloud") return;
  window.VIEW = "cloud";
  window.drawNav();
  window.render();
}

window.CloudPortal = {
  mount(node) { mountNode = node; render(); },
  requiresSignIn() { return configured && !user; },
  async getIdToken() {
    if (!auth?.currentUser) throw new Error("Please sign in before generating a PDF.");
    return auth.currentUser.getIdToken();
  },
};

setInterval(() => {
  if (!configured || !user || !activeId || busy || !window.DIRTY || !window.S) return;
  const fingerprint = JSON.stringify(window.S);
  if (fingerprint !== pendingFingerprint) {
    pendingFingerprint = fingerprint;
    pendingSince = Date.now();
    setBadge("Cloud: changes pending", "warn");
    return;
  }
  if (pendingSince && Date.now() - pendingSince >= 2500) saveChanges({ automatic: true });
}, 800);

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app, databaseId);
  setPersistence(auth, browserLocalPersistence).catch((error) => console.warn("Sign-in persistence unavailable", error));
  onAuthStateChanged(auth, async (nextUser) => {
    user = nextUser;
    errorMessage = "";
    if (user) {
      try {
        await reloadLibrary();
        if (timetables.length && !activeId) applyTimetable(timetables[0], "cloud");
        await bootstrapInitialTimetable();
      } catch (error) {
        errorMessage = friendlyError(error);
      }
    } else {
      timetables = [];
      forceCloudView();
    }
    render();
  });
  setTimeout(forceCloudView, 0);
} else {
  render();
}

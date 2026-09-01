import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
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
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every((value) => value && !/^(replace_me|your-)/i.test(value));

let auth = null;
let db = null;
let user = null;
let activeId = null;
let activeName = "";
let timetables = [];
let mountNode = null;
let busy = false;
let errorMessage = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
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

function timetableName() {
  const state = window.S || {};
  const school = state.meta?.school || "School timetable";
  const effective = state.meta?.wef ? ` — ${state.meta.wef}` : "";
  return `${school}${effective}`;
}

function cleanName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Please enter a name for this timetable.");
  return name.slice(0, 100);
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
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function docCollection() {
  if (!db || !user) throw new Error("Please sign in first.");
  return collection(db, "users", user.uid, "timetables");
}

function record(name, includeCreated = false) {
  const state = currentState();
  const value = {
    name,
    school: state.meta?.school || "",
    effectiveFrom: state.meta?.wef || "",
    state,
    ownerUid: user.uid,
    schemaVersion: 2,
    updatedAt: serverTimestamp(),
  };
  if (includeCreated) value.createdAt = serverTimestamp();
  return value;
}

async function reloadLibrary() {
  if (!user) {
    timetables = [];
    render();
    return;
  }
  const snapshot = await getDocs(query(docCollection(), orderBy("updatedAt", "desc")));
  timetables = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  render();
}

async function perform(action, successMessage) {
  if (busy) return;
  busy = true;
  errorMessage = "";
  render();
  try {
    await action();
    if (successMessage && typeof window.toast === "function") window.toast(successMessage);
  } catch (error) {
    console.error(error);
    errorMessage = friendlyError(error);
  } finally {
    busy = false;
    render();
  }
}

function friendlyError(error) {
  const code = error?.code || "";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was cancelled.";
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups and try again.";
  if (code === "auth/unauthorized-domain") return "This website domain must be added to Firebase Authentication → Authorized domains.";
  if (code === "permission-denied") return "Firebase refused access. Deploy the included Firestore security rules and try again.";
  if (code === "unavailable") return "Firebase is temporarily unavailable. Check your internet connection and try again.";
  return error?.message || "The cloud operation could not be completed.";
}

async function saveAsNew() {
  const input = document.getElementById("cloudName");
  const name = cleanName(input?.value || timetableName());
  await perform(async () => {
    const created = await addDoc(docCollection(), record(name, true));
    activeId = created.id;
    activeName = name;
    window.DIRTY = false;
    await reloadLibrary();
  }, "Timetable saved to Firebase");
}

async function saveChanges() {
  if (!activeId) return;
  const input = document.getElementById("cloudName");
  const name = cleanName(input?.value || activeName || timetableName());
  await perform(async () => {
    await updateDoc(doc(db, "users", user.uid, "timetables", activeId), record(name));
    activeName = name;
    window.DIRTY = false;
    await reloadLibrary();
  }, "Cloud timetable updated");
}

function applyTimetable(item) {
  if (!item?.state) throw new Error("This cloud record does not contain timetable data.");
  window.S = normalizeState(item.state);
  window.DIRTY = false;
  activeId = item.id;
  activeName = item.name || timetableName();
  if (typeof window.applyTheme === "function") window.applyTheme(window.S.meta?.theme || "classic");
  window.VIEW = "dash";
  window.drawNav();
  window.render();
}

async function openTimetable(id) {
  await perform(async () => {
    const snapshot = await getDoc(doc(db, "users", user.uid, "timetables", id));
    if (!snapshot.exists()) throw new Error("That timetable no longer exists.");
    applyTimetable({ id: snapshot.id, ...snapshot.data() });
  }, "Cloud timetable opened");
}

async function duplicateTimetable(id) {
  await perform(async () => {
    const snapshot = await getDoc(doc(db, "users", user.uid, "timetables", id));
    if (!snapshot.exists()) throw new Error("That timetable no longer exists.");
    const source = snapshot.data();
    const name = cleanName(`Copy of ${source.name || "Timetable"}`);
    const created = await addDoc(docCollection(), {
      ...source,
      name,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    activeId = created.id;
    activeName = name;
    window.S = normalizeState(source.state);
    window.DIRTY = false;
    await reloadLibrary();
  }, "Copy created in your cloud library");
}

async function removeTimetable(id) {
  const item = timetables.find((entry) => entry.id === id);
  if (!window.confirm(`Delete “${item?.name || "this timetable"}” from Firebase? This cannot be undone.`)) return;
  await perform(async () => {
    await deleteDoc(doc(db, "users", user.uid, "timetables", id));
    if (activeId === id) {
      activeId = null;
      activeName = "";
    }
    await reloadLibrary();
  }, "Cloud timetable deleted");
}

function newTimetableFromSetup() {
  if (window.DIRTY && !window.confirm("Start a new timetable? Save or download the current changes first if you need them.")) return;
  const next = normalizeState(currentState());
  next.tt = {};
  next.locks = {};
  next.leave = {};
  next.cover = {};
  next.plan = {};
  next.classes.forEach((schoolClass) => { next.plan[schoolClass.id] = []; });
  next.meta.wef = "";
  window.S = next;
  window.DIRTY = true;
  activeId = null;
  activeName = "";
  window.VIEW = "grid";
  window.drawNav();
  window.render();
  if (typeof window.toast === "function") window.toast("New blank timetable created");
}

async function signIn() {
  await perform(async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  });
}

async function logOut() {
  await perform(async () => {
    await signOut(auth);
    activeId = null;
    activeName = "";
  });
}

function setupHtml() {
  return `<div class="card"><h2>Connect Firebase once</h2><div class="body cloudsetup">
    <div class="banner warn" style="margin:0">Cloud saving is ready in the portal, but this copy does not yet have your Firebase project settings.</div>
    <div>Create a Firebase web app, enable Google sign-in and Firestore, then copy <b>.env.example</b> to <b>.env.local</b> and paste the six values from Firebase. Add the same values to Vercel before deployment.</div>
    <div class="small muted">Your existing timetable still works normally. Use <b>Save data file</b> for offline backups until Firebase is connected.</div>
  </div></div>`;
}

function signedOutHtml() {
  return `<div class="card"><div class="body cloudhero">
    <div><h2>Your timetable library</h2><p>Sign in with Google to save several named timetables privately in Firebase, open them later and use the same library from any computer.</p></div>
    <button class="btn pri" id="cloudSignIn" ${busy ? "disabled" : ""}>${busy ? "Signing in…" : "Sign in with Google"}</button>
  </div>${errorMessage ? `<div class="body clouderror">${escapeHtml(errorMessage)}</div>` : ""}</div>`;
}

function libraryRows() {
  if (!timetables.length) return `<tr><td colspan="4" class="cloudempty">No cloud timetables yet. Name the current timetable above and save it as your first one.</td></tr>`;
  return timetables.map((item) => `<tr>
    <td><div class="cloudmeta"><b>${escapeHtml(item.name || "Untitled timetable")}${item.id === activeId ? '<span class="cloudactive">OPEN</span>' : ""}</b><small>${escapeHtml(item.school || "School not named")}</small></div></td>
    <td>${escapeHtml(item.effectiveFrom || "—")}</td>
    <td>${escapeHtml(updatedLabel(item.updatedAt))}</td>
    <td><div class="cloudactions">
      <button class="btn sm" data-cloud-open="${item.id}" ${busy ? "disabled" : ""}>Open</button>
      <button class="btn sm" data-cloud-copy="${item.id}" ${busy ? "disabled" : ""}>Duplicate</button>
      <button class="btn sm" data-cloud-delete="${item.id}" ${busy ? "disabled" : ""}>Delete</button>
    </div></td>
  </tr>`).join("");
}

function signedInHtml() {
  const photo = user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" alt="">` : "";
  return `<div class="bar">
    <div class="clouduser">${photo}<span class="who"><b>${escapeHtml(user.displayName || "Signed in")}</b><small>${escapeHtml(user.email || "")}</small></span></div>
    <span class="spacer"></span>
    <button class="btn" id="cloudRefresh" ${busy ? "disabled" : ""}>Refresh</button>
    <button class="btn" id="cloudSignOut" ${busy ? "disabled" : ""}>Sign out</button>
  </div>
  <div class="card"><h2>Save the timetable now on screen</h2><div class="body">
    <div class="cloudsave">
      <label class="fld">Timetable name<input type="text" id="cloudName" maxlength="100" value="${escapeHtml(activeName || timetableName())}"></label>
      <button class="btn pri" id="cloudSaveNew" ${busy ? "disabled" : ""}>Save as new</button>
      <button class="btn" id="cloudUpdate" ${busy || !activeId ? "disabled" : ""}>Save changes</button>
    </div>
    <div class="bar" style="margin-bottom:0"><button class="btn" id="cloudNew" ${busy ? "disabled" : ""}>New timetable from same school setup</button><span class="small muted">Keeps teachers, classes, subjects and timings, but clears lessons, leave and cover.</span></div>
    ${errorMessage ? `<div class="clouderror">${escapeHtml(errorMessage)}</div>` : ""}
  </div></div>
  <div class="card"><h2>Saved timetables <span class="hint">${timetables.length} in Firebase</span></h2><div class="tw"><table>
    <thead><tr><th>Name</th><th>Effective from</th><th>Last saved</th><th>Actions</th></tr></thead>
    <tbody>${libraryRows()}</tbody>
  </table></div></div>
  <div class="small muted">Cloud records are private to this Google account. The JSON save/open buttons remain available as an independent offline backup.</div>`;
}

function bindRenderedControls() {
  document.getElementById("cloudSignIn")?.addEventListener("click", signIn);
  document.getElementById("cloudSignOut")?.addEventListener("click", logOut);
  document.getElementById("cloudRefresh")?.addEventListener("click", () => perform(reloadLibrary, "Cloud library refreshed"));
  document.getElementById("cloudSaveNew")?.addEventListener("click", saveAsNew);
  document.getElementById("cloudUpdate")?.addEventListener("click", saveChanges);
  document.getElementById("cloudNew")?.addEventListener("click", newTimetableFromSetup);
  mountNode?.querySelectorAll("[data-cloud-open]").forEach((button) => button.addEventListener("click", () => openTimetable(button.dataset.cloudOpen)));
  mountNode?.querySelectorAll("[data-cloud-copy]").forEach((button) => button.addEventListener("click", () => duplicateTimetable(button.dataset.cloudCopy)));
  mountNode?.querySelectorAll("[data-cloud-delete]").forEach((button) => button.addEventListener("click", () => removeTimetable(button.dataset.cloudDelete)));
}

function render() {
  if (!configured) {
    setBadge("Cloud setup needed", "warn");
    if (mountNode) mountNode.innerHTML = setupHtml();
    return;
  }
  if (!user) {
    setBadge("Cloud: sign in");
    if (mountNode) mountNode.innerHTML = signedOutHtml();
  } else {
    setBadge(`Cloud: ${timetables.length} saved`, "on");
    if (mountNode) mountNode.innerHTML = signedInHtml();
  }
  bindRenderedControls();
}

window.CloudPortal = {
  mount(node) {
    mountNode = node;
    render();
  },
};

if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn("Could not enable local sign-in persistence", error);
  });
  onAuthStateChanged(auth, async (nextUser) => {
    user = nextUser;
    errorMessage = "";
    if (user) {
      try {
        await reloadLibrary();
      } catch (error) {
        errorMessage = friendlyError(error);
      }
    } else {
      timetables = [];
    }
    render();
  });
} else {
  render();
}

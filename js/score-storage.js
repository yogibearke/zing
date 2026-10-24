/**
 * Zing! - Score Storage, MusicXML Metadata Parser & Server Sync Module
 * Beheerderspaswoord: tatjana01
 */

const ScoreStorage = (() => {
  const DB_NAME = 'zing_scores_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'scores';
  const ADMIN_HASH = 'ebb405dd6f19f67f0373594641d74c6babb55ea9ec6a108b53c3353267db0676'; // sha256 van tatjana01
  const STORAGE_KEY_ADMIN = 'zing_admin_token';

  // --- 1. IndexedDB Wrapper ---
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }

  async function saveScoreLocally(scoreData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(scoreData);
      req.onsuccess = () => resolve(scoreData);
      req.onerror = () => reject(req.error);
    });
  }

  async function getScoreLocally(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllLocalScores() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteScoreLocally(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- 2. MusicXML Metadata Extractie ---
  function parseMusicXMLMetadata(xmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'application/xml');

      // Titel
      let title = 'Nieuwe Partituur';
      const wtitle = doc.querySelector('work > work-title') || doc.querySelector('movement-title');
      if (wtitle && wtitle.textContent.trim()) {
        title = wtitle.textContent.trim();
      }

      // Componist
      let composer = 'Onbekende Componist';
      const compEl = doc.querySelector('identification > creator[type="composer"]') || doc.querySelector('creator');
      if (compEl && compEl.textContent.trim()) {
        composer = compEl.textContent.trim();
      }

      // Stemmen / Instrumenten
      const parts = [];
      doc.querySelectorAll('part-list > score-part').forEach(sp => {
        const pname = sp.querySelector('part-name');
        if (pname && pname.textContent.trim()) {
          parts.push(pname.textContent.trim());
        }
      });

      // Key genereren (slug)
      const cleanSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || ('score-' + Date.now());

      return {
        key: cleanSlug,
        title,
        composer,
        parts: parts.length > 0 ? parts : ['Sopraan', 'Alt', 'Tenor', 'Bas']
      };
    } catch (e) {
      console.warn('Fout bij parsen van MusicXML metadata:', e);
      return {
        key: 'score-' + Date.now(),
        title: 'Geüploade Partituur',
        composer: '',
        parts: ['Sopraan', 'Alt', 'Tenor', 'Bas']
      };
    }
  }

  // --- 3. Paswoord Verificatie (tatjana01) ---
  async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function verifyPassword(inputPassword) {
    if (!inputPassword) return false;
    const trimmed = inputPassword.trim();
    if (trimmed === 'tatjana01') return true;
    const hash = await sha256(trimmed);
    return hash === ADMIN_HASH;
  }

  function isAdminAuthenticated() {
    return localStorage.getItem(STORAGE_KEY_ADMIN) === 'true';
  }

  function setAdminAuthenticated(remember) {
    if (remember) {
      localStorage.setItem(STORAGE_KEY_ADMIN, 'true');
    } else {
      sessionStorage.setItem(STORAGE_KEY_ADMIN, 'true');
    }
  }

  function clearAdminSession() {
    localStorage.removeItem(STORAGE_KEY_ADMIN);
    sessionStorage.removeItem(STORAGE_KEY_ADMIN);
  }

  // --- 4. Server Sync & GitHub API Operations ---
  const REPO_OWNER = 'yogibearke';
  const REPO_NAME = 'zing';
  const SCORES_PATH = 'assets/sample-scores';

  async function getGitHubFileSha(filename, githubToken) {
    try {
      const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SCORES_PATH}/${filename}`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (githubToken) headers['Authorization'] = `token ${githubToken}`;

      const res = await fetch(url, { headers });
      if (res.status === 200) {
        const data = await res.json();
        return data.sha;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function uploadOrUpdateFileOnGitHub(filename, contentBase64, commitMessage, githubToken) {
    const existingSha = await getGitHubFileSha(filename, githubToken);
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SCORES_PATH}/${filename}`;

    const body = {
      message: commitMessage,
      content: contentBase64
    };
    if (existingSha) {
      body.sha = existingSha;
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }
    return await res.json();
  }

  async function deleteFileOnGitHub(filename, commitMessage, githubToken) {
    const sha = await getGitHubFileSha(filename, githubToken);
    if (!sha) return true; // Reeds niet aanwezig

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SCORES_PATH}/${filename}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: commitMessage,
        sha
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }
    return true;
  }

  // UTF-8 string naar Base64
  function utf8ToBase64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
  }

  // Blob of ArrayBuffer naar Base64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  return {
    openDB,
    saveScoreLocally,
    getScoreLocally,
    getAllLocalScores,
    deleteScoreLocally,
    parseMusicXMLMetadata,
    verifyPassword,
    isAdminAuthenticated,
    setAdminAuthenticated,
    clearAdminSession,
    uploadOrUpdateFileOnGitHub,
    deleteFileOnGitHub,
    utf8ToBase64,
    blobToBase64
  };
})();

// FILE: ~/gate-frontend/src/authStore.js
// Minimal auth store (Zustand) with localStorage persistence.

import { create } from "zustand";

const LS_TOKEN = "token";
const LS_EMAIL = "email";

function safeGet(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const useAuthStore = create((set, get) => ({
  token: safeGet(LS_TOKEN),
  email: safeGet(LS_EMAIL),
  user: null,

  isAuthed() {
    return !!get().token;
  },

  setSession({ token, email, user }) {
    if (token) safeSet(LS_TOKEN, token);
    if (email) safeSet(LS_EMAIL, email);
    set({ token: token || "", email: email || "", user: user || null });
  },

  clearSession() {
    safeRemove(LS_TOKEN);
    safeRemove(LS_EMAIL);
    set({ token: "", email: "", user: null });
  },
}));

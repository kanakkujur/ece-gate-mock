// FILE: gate-backend/src/constants/subjects.js

export const SUBJECTS = {
  GE: ["General Aptitude"],

  EC: [
    "Engineering Mathematics",
    "Networks",
    "Signals & Systems",
    "Electronic Devices",
    "Analog Circuits",
    "Digital Circuits",
    "Control Systems",
    "Communication Systems",
    "Electromagnetics",
    "Computer Organization",
  ],
};

// ✅ Named exports your other files can import directly
export const GE_SUBJECTS = SUBJECTS.GE;
export const EC_SUBJECTS = SUBJECTS.EC;

// Helpful derived helpers
export const EC_SUBJECT_SET = new Set(EC_SUBJECTS);
export const ALL_SUBJECTS = [...GE_SUBJECTS, ...EC_SUBJECTS];

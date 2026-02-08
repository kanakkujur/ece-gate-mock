export const SUBJECTS = {
  GE: [
    "General Aptitude",
  ],

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

// Helpful derived helpers
export const EC_SUBJECT_SET = new Set(SUBJECTS.EC);
export const ALL_SUBJECTS = [...SUBJECTS.GE, ...SUBJECTS.EC];

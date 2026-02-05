\# STAGE 4 — Exam Engine, Question Bank Integration \& History Tracking



This stage connects the backend PostgreSQL question bank with the frontend exam system, enabling:



• Real test generation  

• Live exam interface  

• Scoring \& accuracy calculation  

• Persistent test history  

• Resume-ready architecture  



---



\## ✅ Objectives Achieved



✔ Questions fetched dynamically from database  

✔ JWT protected test APIs  

✔ Exam UI with palette, timer, review flags  

✔ Score \& accuracy computed  

✔ Test sessions stored in PostgreSQL  

✔ Dashboard analytics updated  



---



\## 🗄 Database Tables



\### questions

Stores GATE question bank



| column | description |

|-------|------------|

| id | primary key |

| subject | topic subject |

| topic | sub topic |

| type | MCQ / MSQ / NAT |

| marks | marks |

| neg\_marks | negative |

| question | question text |

| options | json options |

| answer | correct answer |



---



\### test\_sessions

Stores exam attempts



| column | description |

|-------|------------|

| id | primary key |

| user\_id | FK users |

| score | total score |

| accuracy | % accuracy |

| answers | json responses |

| totalquestions | count |

| created\_at | timestamp |



---



\## 🔐 Backend APIs



\### Generate test


GET /api/test/generate?count=65\&subjects=EC





Returns random questions from DB.



---



\### Submit test





POST /api/test/submit





Body:

```json

{

&nbsp; "score": 2,

&nbsp; "accuracy": 40,

&nbsp; "answers": {...},

&nbsp; "totalQuestions": 5

}



History

GET /api/test/history





Returns past attempts.



🧠 Frontend Exam Engine



Features:



✅ Question navigation

✅ Answer persistence

✅ Mark for review

✅ Timer auto submit

✅ Palette color states

✅ Score calculation



📊 Dashboard



Now displays:



• Latest test accuracy

• Average score

• Attempt count

• Full history tiles



🧪 Verified Results



✔ Questions load from DB

✔ Exam runs end-to-end

✔ Submissions saved

✔ History visible

✔ Analytics update



Example:



Score: 2

Accuracy: 40%

Attempts: 1



🚀 Stage 4 Status



🎉 COMPLETED SUCCESSFULLY



The platform now functions as a real GATE mock test system with:



• Persistent data

• Real exam flow

• Analytics

• Secure auth



➡ Ready for STAGE 5



Next logical steps:



• Resume unfinished exams

• Question difficulty scaling

• AI paper generation using blueprint

• Performance graphs

• Subject-wise analytics


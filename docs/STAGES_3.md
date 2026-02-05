\# STAGE 3 — Frontend auth + protected API wiring (Blueprint UI proof)



\*\*Status:\*\* ✅ Completed  

\*\*Repo root:\*\* `D:\\ece-gate-mock`  

\*\*Frontend:\*\* `D:\\ece-gate-mock\\gate-frontend`  

\*\*Backend:\*\* `D:\\ece-gate-mock\\gate-backend`



---



\## Goal

\- Wire frontend login/signup to backend auth

\- Persist JWT in browser storage

\- Attach JWT automatically on all API calls

\- Call protected backend endpoint from UI (`/api/ai/blueprint`)

\- Provide UI proof via toggle display



---



\## API base setup



Local frontend env:



`.env.local`

```env

VITE\_API\_BASE=http://localhost:4000/api



Restart frontend after env change.



JWT storage



Auth store persists:



token



email



Restores session on refresh automatically.



Protected API helper



All frontend calls go through apiFetch() which:



Adds Authorization: Bearer <token>



Auto-logs out on 401



Blueprint UI integration



Added in App.jsx:



State

const \[blueprint, setBlueprint] = useState(null);



Toggle button (top bar)

<button onClick={async () => {

&nbsp; if (blueprint !== null) {

&nbsp;   setBlueprint(null);

&nbsp;   return;

&nbsp; }

&nbsp; const data = await apiFetch("/ai/blueprint?mode=main", { token });

&nbsp; setBlueprint(data);

}}>

&nbsp; {blueprint ? "Hide Blueprint" : "Blueprint"}

</button>



Render blueprint JSON

{screen === "dashboard" \&\& blueprint \&\& (

&nbsp; <pre>{JSON.stringify(blueprint, null, 2)}</pre>

)}



useMemo fix



Dependency array updated to avoid stale UI:



\[isAuthed, email, clearSession, token, blueprint]



Verification steps



Backend running on localhost:4000



Frontend running on localhost:5173



Login from UI



Click Blueprint



JSON appears (200 OK from protected endpoint)



Click Hide Blueprint → JSON hides



Result



✔ JWT verified end-to-end from UI

✔ Protected API consumed securely

✔ Frontend ↔ Backend fully integrated



Next stage



STAGE 4:



Exam submission persistence



Accuracy + score correctness audit



Analytics stability


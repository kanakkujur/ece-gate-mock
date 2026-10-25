import {validDiagram,circuitQuestion} from './circuits.js';
export const SUBJECTS = ['Networks', 'Electronic Devices', 'Analog Circuits', 'Digital Circuits', 'Signals & Systems', 'Control Systems', 'Communication Systems', 'Electromagnetics', 'Engineering Mathematics', 'General Aptitude'];

export function normalizeSet(raw) {
  if (!raw || !Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 100) throw new Error('A set must contain 1–100 questions.');
  const questions = raw.questions.map((q, index) => {
    if(q.diagram && !validDiagram(q.diagram)) throw new Error(`Question ${index + 1} has an unsupported circuit diagram.`);
    const type = String(q.type || 'MCQ').toUpperCase();
    const marks = Number(q.marks) === 2 ? 2 : 1;
    if (!['MCQ','MSQ','NAT'].includes(type) || typeof q.question !== 'string' || !q.question.trim() || q.question.length > 12000) throw new Error(`Question ${index + 1} is invalid.`);
    const options = type === 'NAT' ? null : Object.fromEntries(['A','B','C','D'].map((k,i) => [k, String(Array.isArray(q.options) ? q.options[i] ?? '' : q.options?.[k] ?? '').replace(/^[A-D][).]\s*/, '')]));
    if (options && Object.values(options).some(v => !v.trim())) throw new Error(`Question ${index + 1} needs four options.`);
    let answer = q.answer;
    if (type === 'MCQ') {
      answer = String(answer).trim().toUpperCase();
      if (!['A','B','C','D'].includes(answer)) throw new Error(`Question ${index + 1} has an invalid answer key.`);
    } else if (type === 'MSQ') {
      answer = [...new Set((Array.isArray(answer) ? answer : String(answer).split(',')).map(x => String(x).trim().toUpperCase()))].sort();
      if (answer.length < 2 || answer.some(x => !['A','B','C','D'].includes(x))) throw new Error(`Question ${index + 1} needs at least two correct choices.`);
    } else if (answer === null || String(answer).trim() === '' || !Number.isFinite(Number(answer))) throw new Error(`Question ${index + 1} needs a numeric answer.`);
    return { ...q, id: index, type, marks, options, answer, question:q.question.trim(), solution:String(q.solution || q.explanation || ''), neg_marks:type === 'MCQ' ? marks/3 : 0 };
  });
  return { id: raw.id || crypto.randomUUID(), title:String(raw.title || `${raw.subject || 'Imported'} practice`), subject:String(raw.subject || 'Mixed ECE'), topic:String(raw.topic || 'Mixed'), difficulty:raw.difficulty || 'medium', source:raw.source || 'Imported set', createdAt:raw.createdAt || new Date().toISOString(), questions };
}

export function scoreSet(set, answers) {
  const items = set.questions.map((q,i) => {
    const given = answers[i];
    const skipped = given == null || given === '' || (Array.isArray(given) && !given.length);
    let correct = false;
    if (!skipped) {
      if (q.type === 'NAT') correct = Number.isFinite(Number(given)) && Math.abs(Number(given) - Number(q.answer)) <= 0.01 + Number.EPSILON;
      else if (q.type === 'MSQ') correct = JSON.stringify([...new Set(Array.isArray(given) ? given : [])].sort()) === JSON.stringify(q.answer);
      else correct = given === q.answer;
    }
    return {given:given ?? '', correct, skipped, score:correct ? q.marks : skipped || q.type !== 'MCQ' ? 0 : -q.marks/3};
  });
  const correct = items.filter(x=>x.correct).length;
  const attempted = items.filter(x=>!x.skipped).length;
  return {items, score:items.reduce((s,x)=>s+x.score,0), maxScore:set.questions.reduce((s,q)=>s+q.marks,0), correct, attempted, wrong:attempted-correct, skipped:items.length-attempted, accuracy:attempted ? Math.round(correct/attempted*100) : 0};
}

export const STARTER = normalizeSet({id:'ece-starter-v1', title:'The ECE warm-up',subject:'Mixed ECE',topic:'Core fundamentals',difficulty:'easy',source:'Included practice · checked examples',questions:[
  {type:'MCQ',marks:1,question:'A 12 V ideal source is connected across a 4 Ω resistor. What current flows through it?',options:{A:'2 A',B:'3 A',C:'4 A',D:'48 A'},answer:'B',solution:'Ohm’s law gives I = V/R = 12/4 = 3 A.'},
  {type:'MSQ',marks:2,question:'Which of the following gates are universal gates? Select every correct option.',options:{A:'NAND',B:'NOR',C:'XOR',D:'AND'},answer:['A','B'],solution:'NAND alone or NOR alone can implement NOT, AND and OR, and therefore any Boolean function.'},
  {type:'NAT',marks:2,question:'An ideal inverting op-amp has an input resistance of 10 kΩ and a feedback resistance of 50 kΩ. Enter its voltage gain.',options:null,answer:-5,solution:'For an ideal inverting amplifier, Av = −Rf/Rin = −50/10 = −5.'},
  {type:'MCQ',marks:1,question:'For a continuous-time linear time-invariant system to be BIBO stable, its impulse response h(t) must be:',options:{A:'Periodic',B:'Absolutely integrable',C:'Even',D:'Non-negative at all times'},answer:'B',solution:'BIBO stability requires the integral of |h(t)| over all time to be finite.'},
  {type:'NAT',marks:2,question:'A signal is band-limited to 4 kHz. What is its Nyquist sampling rate, in kHz?',options:null,answer:8,solution:'The Nyquist rate is twice the highest frequency: 2 × 4 = 8 kHz. For practical reconstruction use a rate above this limit.'},
  {type:'MCQ',marks:1,question:'A binary counter uses four flip-flops. How many distinct states can it represent?',options:{A:'4',B:'8',C:'16',D:'32'},answer:'C',solution:'Each flip-flop stores one bit, giving 2⁴ = 16 states.'}
]});

export const CIRCUIT_STARTER=normalizeSet({id:"circuits-starter-v1",title:"Circuit desk · Four visual problems",subject:"Networks & Analog Circuits",topic:"Circuit fundamentals",difficulty:"easy",source:"Verified circuit templates",questions:[0,1,2,3].map(index=>circuitQuestion({subject:index===3?"Analog Circuits":"Networks",type:"NAT",marks:2,index}))});

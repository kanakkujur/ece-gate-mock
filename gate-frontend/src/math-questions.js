// Numeric givens, answer keys and explanations are derived together.
// These are formula-based practice variants, not official past-paper questions.
export function mathematicsQuestion({subject,type,marks,index,topic='Mixed fundamentals'}) {
  if(subject!=='Engineering Mathematics')return null;
  const a=2+(Math.floor(index/13)+index%13)%17,b=1+index%7,c=1+index%4,n=10+index;
  const families=[
    ['matrix trace and determinant',`A = diag(${a}, ${b}) is a real 2 × 2 diagonal matrix.`,a+b,a*b,
      'the trace of A','the determinant of A',`tr(A) = ${a}+${b} = ${a+b}; det(A) = ${a}×${b} = ${a*b}.`],
    ['polynomial differentiation',`f(x) = ${a}x³ + ${b}x. Evaluate derivatives at x = ${c}.`,3*a*c*c+b,6*a*c,
      "f′(x) at the specified point","f″(x) at the specified point",`f′(x) = ${3*a}x²+${b}, so f′(${c}) = ${3*a*c*c+b}. f″(x) = ${6*a}x, so f″(${c}) = ${6*a*c}.`],
    ['definite integrals',`f(x) = ${a}x + ${b}, on the interval [0, ${c}].`,a*c*c/2+b*c,a*c+b,
      `the integral of f(x) from 0 to ${c}`,`f(${c})`,`∫₀^${c} (${a}x+${b}) dx = ${a}×${c}²/2+${b}×${c} = ${a*c*c/2+b*c}. Also f(${c}) = ${a*c+b}.`],
    ['first order differential equations',`y′(t) = ${a}y(t), y(0) = ${b}. Let T = ln(2)/${a}.`,2*b,a*b,
      'y(T)',"y′(0)",`y(t) = ${b}exp(${a}t). Thus y(T) = ${b}exp(ln 2) = ${2*b}; y′(0) = ${a}y(0) = ${a*b}.`],
    ['complex numbers',`z = ${a} + j${b}, where j² = −1.`,a*a+b*b,a*a-b*b,
      '|z|²','the real part of z²',`|z|² = ${a}²+${b}² = ${a*a+b*b}. z² = (${a}²−${b}²)+j(2×${a}×${b}), whose real part is ${a*a-b*b}.`],
    ['binomial distributions',`X is binomial with n = ${n} independent trials and success probability p = 1/2.`,n/2,n/4,
      'E[X]','Var(X)',`For Binomial(n,p), E[X]=np=${n}/2=${n/2}, and Var(X)=np(1−p)=${n}/4=${n/4}.`],
    ['Laplace transforms',`f(t) = exp(−${a}t), t ≥ 0. F(s) is its unilateral Laplace transform.`,1/(a+b),1/a,
      `F(${b})`,'F(0)',`F(s)=∫₀^∞ exp(−(s+${a})t)dt=1/(s+${a}) for Re(s)>−${a}. Thus F(${b})=1/${a+b} and F(0)=1/${a}.`],
    ['vector calculus divergence',`F(x,y,z) = (${a}x, ${b}y, ${c}z). The unit cube is 0 ≤ x,y,z ≤ 1.`,a+b+c,a+b+c,
      'the divergence of F','the outward flux through the unit cube',`∇·F=${a}+${b}+${c}=${a+b+c}. The divergence theorem gives outward flux = ∭(∇·F)dV = ${a+b+c}×1 = ${a+b+c}.`],
    ['uniform distributions',`X is continuous uniform on [${b}, ${a+b}].`,b+a/2,a*a/12,
      'E[X]','Var(X)',`The interval width is ${a}. E[X]=(${b}+${a+b})/2=${b+a/2}; Var(X)=(${a+b}−${b})²/12=${a*a}/12.`],
    ['exponential distributions',`X has the exponential density f(x) = ${a}exp(−${a}x), x ≥ 0.`,1/a,1/(a*a),
      'E[X]','Var(X)',`An exponential random variable of rate λ has E[X]=1/λ and Var(X)=1/λ². Here λ=${a}, so E[X]=1/${a} and Var(X)=1/${a*a}.`],
    ['symmetric matrix eigenvalues',`A = [[${a}, ${b}], [${b}, ${a}]] is a real symmetric matrix.`,a+b,a-b,
      'the largest eigenvalue of A','the smallest eigenvalue of A',`det(A−λI)=(${a}−λ)²−${b}²=0, so λ=${a}±${b}. Since ${b}>0, λmax=${a+b} and λmin=${a-b}.`],
    ['linear differential equations',`y′(t) + ${a}y(t) = ${b} is a stable first-order differential equation.`,b/a,1/a,
      'the equilibrium value of y','the time constant',`At equilibrium y′=0, so y=${b}/${a}. The homogeneous solution is C exp(−${a}t), giving time constant 1/${a}.`],
    ['gradient and Laplacian',`f(x,y) = ${a}x² + ${b}y². Evaluate at (1,1).`,4*(a*a+b*b),2*(a+b),
      '|∇f|²','the Laplacian of f',`∇f(1,1)=(2×${a},2×${b}), hence |∇f|²=4(${a}²+${b}²)=${4*(a*a+b*b)}. ∇²f=2${a}+2${b}=${2*(a+b)}.`]
  ];
  // A specific topic uses only matching families; unsupported topics use the model.
  const requested=topic.toLowerCase();
  let family=index%families.length;
  if(!/mixed|fundamentals|full.*syllabus/.test(requested)) {
    const matches=families.map((f,i)=>({i,score:f[0].split(' ').filter(w=>w.length>3&&requested.includes(w)).length})).filter(x=>x.score>0).sort((x,y)=>y.score-x.score);
    if(!matches.length)return null;
    family=matches[index%matches.filter(m=>m.score===matches[0].score).length].i;
  }
  const [label,context,primary,secondary,primaryName,secondaryName,derivation]=families[family];
  const round=v=>Number(v.toFixed(4));
  let question,options=null,answer;
  if(type==='MSQ') {
    const facts=[{text:`${primaryName} = ${round(primary)}`,correct:true},{text:`${primaryName} = ${round(primary+1)}`,correct:false},{text:`${secondaryName} = ${round(secondary)}`,correct:true},{text:`${secondaryName} = ${round(secondary+2)}`,correct:false}];
    const shifted=facts.map((_,i)=>facts[(i+index)%4]);
    options=Object.fromEntries(shifted.map((f,i)=>[['A','B','C','D'][i],f.text]));
    answer=shifted.flatMap((f,i)=>f.correct?['ABCD'[i]]:[]);
    question=`${context} Which statements are correct? Values shown are rounded to four decimal places where needed.`;
  } else {
    question=`${context} Find ${primaryName}. Give the answer to four decimal places where needed.`;
    if(type==='NAT')answer=round(primary);
    else {
      const choices=[primary,primary+1,primary+2,primary+3].map(round);
      const offset=index%4;
      options=Object.fromEntries(choices.map((_,i)=>[['A','B','C','D'][i],String(choices[(i+offset)%4])]));
      answer='ABCD'[(4-offset)%4];
    }
  }
  return {subject,type,marks,topic:label,question,options,answer,solution:derivation,source:'Calculated mathematics template',neg_marks:type==='MCQ'?marks/3:0};
}

// These questions, diagrams and answer keys share the same numeric source.
// Supported topologies are explicit; arbitrary AI-drawn circuits are not accepted.
export function circuitQuestion({subject, type, marks, index}) {
  if(!['MCQ','NAT'].includes(type)||!['Networks','Analog Circuits'].includes(subject))return null;
  const r1=(index%8+2)*1000, r2=(index%5+2)*1000, voltage=index%9+3;
  const kind=subject==='Analog Circuits'?'inverting-opamp':['series','parallel','voltage-divider'][index%3];
  const diagram={kind,r1,r2,voltage};
  let value,question,solution,unit;
  if(kind==='series') {
    value=(r1+r2)/1000;unit='kΩ';question='For the circuit shown, find the total resistance seen by the ideal voltage source, in kΩ.';
    solution=`R₁ and R₂ are in series. R_eq = R₁ + R₂ = ${r1/1000} + ${r2/1000} = ${value} kΩ.`;
  }else if(kind==='parallel') {
    value=r1*r2/(r1+r2)/1000;unit='kΩ';question='For the circuit shown, find the equivalent resistance across the ideal source, in kΩ. Round to two decimal places.';
    solution=`R₁ and R₂ are in parallel. R_eq = R₁R₂/(R₁+R₂) = (${r1/1000} × ${r2/1000})/(${r1/1000} + ${r2/1000}) = ${value.toFixed(2)} kΩ.`;
  }else if(kind==='voltage-divider') {
    value=voltage*r2/(r1+r2);unit='V';question='For the unloaded voltage divider shown, find Vout relative to ground, in volts. Round to two decimal places.';
    solution=`No load draws current from Vout. Vout = VsR₂/(R₁+R₂) = ${voltage} × ${r2/1000}/(${r1/1000}+${r2/1000}) = ${value.toFixed(2)} V.`;
  }else {
    value=-r2/r1;unit='V/V';question='Assuming an ideal op-amp operating in its linear region with negative feedback, find the closed-loop voltage gain Vout/Vin of the circuit shown. Round to two decimal places.';
    solution=`The non-inverting input is grounded, so the inverting input is at virtual ground. Av = −Rf/Rin = −${r2/1000}/${r1/1000} = ${value.toFixed(2)} V/V. Supply rails are omitted.`;
  }
  const numeric=Number(value.toFixed(2));
  const correctPosition=index%4;
  const values=[numeric,numeric+1,numeric+2,numeric+3];
  const options=Object.fromEntries(['A','B','C','D'].map((key,i)=>[key,`${values[(i-correctPosition+4)%4]} ${unit}`]));
  return {type,marks,subject,topic:kind,question,diagram,options:type==='MCQ'?options:null,answer:type==='MCQ'?['A','B','C','D'][correctPosition]:numeric,solution,source:'Verified circuit template',neg_marks:type==='MCQ'?marks/3:0};
}

export function validDiagram(d) {
  return d && ['series','parallel','voltage-divider','inverting-opamp'].includes(d.kind) && [d.r1,d.r2,d.voltage].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1e9);
}

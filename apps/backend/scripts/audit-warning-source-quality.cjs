// Read-only live source audit. No import/reset, inferred grades, or upstream writes.
const fs = require('node:fs');
const path = require('node:path');
const { prisma } = require('../lib/prisma.ts');
const source = require('./import-apidog-data.cjs');
const { sourceGradeStatus } = require('../lib/source-grade-status.cjs');
const { sourceAcademicPeriod } = require('../lib/source-academic-period.cjs');
const clean = source.clean;
const identity = (...values) => JSON.stringify(values);
const number = value => value == null ? null : Number(value);
const selectedFields = ['StudentID','StudyProgramID','CurriculumID','CurriculumName','CurriculumNamePrint','StudyUnitID','ScheduleStudyUnitID','Credits','DiemTK_10','DiemTK_4','DiemTK_Chu','IsPass','IsGather','NotScore','NotComputeAverageScore','Note','MD5','TB_HK_10','TB_HK_4','TB_TL_HK_10','TB_TL_HK_4','Dat_HK','Dat_TL_HK','YearStudy','NamHoc','TermID','HocKy','_TermID'];
const select = row => Object.fromEntries(selectedFields.filter(key => row[key] !== undefined).map(key => [key,row[key]]));
function normalizeGrade(row) {
  const score10=source.scoreParts(row.DiemTK_10,10),score4=source.scoreParts(row.DiemTK_4,4);
  let letter=clean(row.DiemTK_Chu)||null, special=score10.special||score4.special;
  if(letter&&(letter.toUpperCase()==='VT'||(score10.value==null&&score4.value==null&&letter.toUpperCase()!=='N/A'))){special ||= letter.slice(0,16);letter=null;}
  const notScore=source.marker(row.NotScore);
  return {score10:score10.value,score4:score4.value,letterCode:letter,specialCode:special,isPass:source.marker(row.IsPass),isGather:source.marker(row.IsGather),notScore,notComputeAverageScore:source.marker(row.NotComputeAverageScore),scoreStatus:sourceGradeStatus({notScore,special,score10:score10.value,score4:score4.value,letter,isPass:source.marker(row.IsPass)})};
}
function parseTranscript(data) {
  const rows=[],unscoped=[];
  for(const year of data)for(const term of year.DanhSachDiem||[]) {
    const records=term.DanhSachDiemHK||[];
    const period=sourceAcademicPeriod(year.NamHoc,clean(term.HocKy)||clean(term.TermID),records);
    if(!period){unscoped.push(...records.map(select));continue;}
    const {yearCode,termCode}=period;
    for(const row of records)rows.push({year:yearCode,term:termCode,program:clean(row.StudyProgramID),courseCode:clean(row.CurriculumID),unit:clean(row.StudyUnitID),schedule:clean(row.ScheduleStudyUnitID),credits:source.parseInteger(row.Credits),grade:normalizeGrade(row),raw:select(row)});
  }
  return {rows,unscoped};
}
async function main() {
  const output=path.resolve(__dirname,'../../../docs/reports');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
  const call=await source.createSourceClient();
  const [students,classes,years,terms,offerings,grades,summaries,decisions,unscoped] = await Promise.all([
    prisma.student.findMany({where:{deletedAt:null},orderBy:{sStudentId:'asc'}}),prisma.class.findMany({where:{deletedAt:null}}),
    prisma.academicYear.findMany(),prisma.academicTerm.findMany(),prisma.studentCourseOffering.findMany(),prisma.studentCourseGrade.findMany(),
    prisma.studentTermSummary.findMany(),prisma.studentDecision.findMany({where:{deletedAt:null}}),prisma.unscopedGradeRecord.findMany(),
  ]);
  const yearById=new Map(years.map(row=>[row.id,row.sYearCode]));
  const periods=new Map(terms.map(row=>[row.id,[yearById.get(row.academicYearId),row.sTermCode]]));
  const gradesByOffering=new Map(grades.map(row=>[row.offeringId,row]));
  const classData=await source.mapLimit(classes.filter(row=>/^ITK(?:46|47|48|49)[A-C]$/.test(row.classId)),4,async cls=>{
    const [roster,hk2,hk3,conduct] = await Promise.all([
      call('LayDanhSachSinhVienTheoLop',{Id:cls.classId}),
      call('LayBangDiemSinhVienTheoLop',{Id:cls.classId,YearStudy:'2025-2026',TermId:'HK02'}),
      call('LayBangDiemSinhVienTheoLop',{Id:cls.classId,YearStudy:'2025-2026',TermId:'HK03'}),
      call('LayBangDiemRenLuyenTheoLop',{Id:cls.classId,YearStudy:'2025-2026',TermId:'HK02'}),
    ]);
    if(!Array.isArray(roster)||!Array.isArray(hk2)||!Array.isArray(hk3)||!Array.isArray(conduct?.resultDanhSach))throw new Error('Invalid class data');
    return {classCode:cls.classId,roster,hk2,hk3,conduct};
  });
  console.log(JSON.stringify({stage:'class_sources',classes:classData.length}));
  let completed=0;
  const records=await source.mapLimit(students,4,async student=>{
    const [transcript,apiDecisions]=await Promise.all([
      call('LayBangDiemSinhVien',{p1:student.sStudentId,p2:student.sStudyProgramId,p3:'ALL',p4:'ALL'}),
      call('LayDanhSachQuyetDinh',{p1:student.sStudentId}),
    ]);
    if(!Array.isArray(transcript)||!Array.isArray(apiDecisions))throw new Error('Invalid student source');
    const parsed=parseTranscript(transcript);
    const rowKey = row=>identity(row.year,row.term,row.courseCode,row.unit,row.schedule);
    const apiMap=new Map(),duplicateKeys=[];
    for(const row of parsed.rows){const key=rowKey(row);if(apiMap.has(key)&&JSON.stringify(apiMap.get(key))!==JSON.stringify(row))duplicateKeys.push(key);apiMap.set(key,row);}
    const dbMap=new Map(offerings.filter(row=>row.studentId===student.id).map(row=>[identity(...periods.get(row.academicTermId),row.sCurriculumId,row.sStudyUnitId,row.sScheduleStudyUnitId),row]));
    const differences=[];
    const compare=(key,field,api,db)=>{if(api!==db)differences.push({key,field,api,system:db});};
    for(const [key,row] of apiMap){const db=dbMap.get(key);if(!db){differences.push({key,field:'missing_system_offering'});continue;}
      const grade=gradesByOffering.get(db.id);if(!grade){differences.push({key,field:'missing_system_grade'});continue;}
      compare(key,'credits',row.credits,db.sCredits);compare(key,'program',row.program,clean(db.sProgramCode));
      for(const [field,value] of Object.entries(row.grade))compare(key,field,value,['score10','score4'].includes(field)?number(grade[field]):grade[field]);
    }
    for(const key of dbMap.keys())if(!apiMap.has(key))differences.push({key,field:'missing_api_offering'});
    const summaryGroups=new Map();
    for(const row of parsed.rows){const key=identity(row.year,row.term,row.program);if(!summaryGroups.has(key))summaryGroups.set(key,[]);summaryGroups.get(key).push(row);}
    const summaryChecks=[];
    for(const [key,rows]of summaryGroups){
      const db=summaries.find(row=>row.studentId===student.id&&identity(...periods.get(row.academicTermId),row.sProgramCode)===key);
      const raw=rows[0].raw,summaryDifferences=[];
      for(const [field,sourceField,max]of [['gpa4','TB_HK_4',4],['gpa10','TB_HK_10',10],['cumulativeGpa4','TB_TL_HK_4',4],['cumulativeGpa10','TB_TL_HK_10',10],['creditsEarned','Dat_HK',Infinity],['cumulativeCredits','Dat_TL_HK',Infinity]]){
        const value=source.parseNumber(raw[sourceField],max===Infinity?-Infinity:0,max);
        if(!db||number(db[field])!==value)summaryDifferences.push({field,api:value,system:number(db?.[field])});
      }
      const distinctGpas=[...new Set(rows.map(row=>clean(row.raw.TB_HK_4)))];
      summaryChecks.push({key,summaryDifferences,sourceGpa:raw.TB_HK_4??null,distinctGpas,gradeKinds:rows.reduce((counts,row)=>{const kind=row.grade.specialCode||row.grade.scoreStatus;counts[kind]=(counts[kind]||0)+1;return counts;},{})});
    }
    const dbDecisions=decisions.filter(row=>row.studentId===student.id);
    const decisionKey=row=>identity(row.DecisionTypeID,clean(row.DecisionNumber));
    const normalizedDecisions=new Map(apiDecisions.map(row=>[decisionKey(row),{type:Number(row.DecisionTypeID),number:clean(row.DecisionNumber),name:clean(row.DecisionName),text:clean(row.FullText),year:clean(row.YearStudy),term:source.normalizeTerm(row.TermID),signedAt:source.parseDate(row.SignDate)?.toISOString()||null}]));
    const decisionDifferences=[];
    for(const row of normalizedDecisions.values()){
      const db=dbDecisions.find(item=>item.decisionTypeId===row.type&&item.sDecisionNumber===row.number);
      if(!db){decisionDifferences.push({number:row.number,field:'missing_system_decision'});continue;}
      for(const [field,a,b]of [['name',row.name,db.sDecisionName],['text',row.text,db.sFullText],['year',row.year,db.sYearStudy],['term',row.term,db.sTermId],['signedAt',row.signedAt,db.sSignDate?.toISOString()||null]])if(a!==b)decisionDifferences.push({number:row.number,field,api:a,system:b});
    }
    const cls=classData.find(row=>row.classCode===student.sClassStudentId);
    const roster=cls?.roster.find(row=>clean(row.StudentID)===student.sStudentId);
    const classSummary=cls?.hk2.find(row=>clean(row.StudentID)===student.sStudentId);
    const target=parsed.rows.filter(row=>row.year==='2025-2026'&&row.term==='HK02'&&row.program===student.sStudyProgramId);
    const result={studentId:student.id,studentCode:student.sStudentId,studentName:student.sFullName,classCode:student.sClassStudentId,programCode:student.sStudyProgramId,active:student.sIsInClass,
      roster:roster?{programCode:clean(roster.StudyProgramID),isInClass:roster.IsInClass}:null,
      classHk2:classSummary?{gpa4:classSummary.AverageScore4,credits:classSummary.STC}:null,
      targetRows:target.length,sourceRows:parsed.rows.length,systemRows:dbMap.size,sourceUnscoped:parsed.unscoped,systemUnscoped:unscoped.filter(row=>row.studentId===student.id).map(row=>({id:row.id,courseCode:row.sCourseCode,reason:row.reason,payload:select(row.sourcePayload)})),
      duplicateKeys,differences,summaryChecks,decisionDifferences,decisions:[...normalizedDecisions.values()],rows:parsed.rows};
    completed++;if(completed%50===0||completed===students.length)console.log(JSON.stringify({stage:'student_sources',completed,total:students.length}));
    return result;
  });
  const relevantClassData=classData.map(cls=>({classCode:cls.classCode,conduct:cls.conduct.resultDanhSach.map(row=>({StudentID:row.StudentID,StatusID:row.StatusID,StudentScore:row.StudentScore,ClassScore:row.ClassScore,DepartmentScore:row.DepartmentScore,LastScore:row.LastScore})),conductMetadata:Object.fromEntries(Object.entries(cls.conduct).filter(([key])=>key!=='resultDanhSach'))}));
  const summary={checkedAt:new Date().toISOString(),students:records.length,sourceRows:records.reduce((n,row)=>n+row.sourceRows,0),systemRows:records.reduce((n,row)=>n+row.systemRows,0),gradeDifferences:records.reduce((n,row)=>n+row.differences.length,0),summaryDifferences:records.reduce((n,row)=>n+row.summaryChecks.reduce((n,row)=>n+row.summaryDifferences.length,0),0),decisionDifferences:records.reduce((n,row)=>n+row.decisionDifferences.length,0),unscopedRows:records.reduce((n,row)=>n+row.sourceUnscoped.length,0),duplicateKeys:records.reduce((n,row)=>n+row.duplicateKeys.length,0)};
  fs.mkdirSync(output,{recursive:true});
  const snapshotPath=path.resolve(__dirname,`../../../.tmp/warning-source-quality-snapshot-${day}.json`);
  fs.mkdirSync(path.dirname(snapshotPath),{recursive:true});
  fs.writeFileSync(snapshotPath,JSON.stringify({summary,classData:relevantClassData,students:records})+'\n');
  fs.writeFileSync(path.join(output,`warning-source-quality-${day}.json`),JSON.stringify({summary,classData:relevantClassData,students:records.map(({rows,...student})=>({...student,problemExamples:rows.filter(row=>row.grade.scoreStatus==='unknown'||row.year==='2025-2026'&&row.term==='HK02'&&source.parseNumber(row.raw.TB_HK_4,0,4)==null)}))},null,2)+'\n');
  console.log(JSON.stringify(summary));
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({failed:true,type:error.name,code:error.cause?.code||null}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
module.exports={parseTranscript,normalizeGrade};

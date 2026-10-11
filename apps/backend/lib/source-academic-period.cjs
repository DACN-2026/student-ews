const clean = value => value == null ? '' : String(value).trim();
const year = value => {
  const text=clean(value), match=text.match(/^(\d{4})-(\d{4})$/);
  return match && Number(match[2]) === Number(match[1])+1 ? text : null;
};
const term = value => {
  const match=clean(value).toUpperCase().match(/^(?:HK)?0?([1-3])$/);
  return match ? `HK0${match[1]}` : null;
};
/** Row NamHoc/HocKy/_TermID may be internal indices; require an explicit period.
 * @param {unknown} outerYear
 * @param {unknown} outerTerm
 * @param {Array<Record<string, unknown>>} rows
 */
function sourceAcademicPeriod(outerYear, outerTerm, rows) {
  const rowYears=[...new Set(rows.map(row=>year(row.YearStudy)||year(row.NamHoc)).filter(Boolean))];
  const rowTerms=[...new Set(rows.map(row=>term(row.TermID)).filter(Boolean))];
  const y=year(outerYear)||(rowYears.length===1?rowYears[0]:null);
  const t=term(outerTerm)||(rowTerms.length===1?rowTerms[0]:null);
  if(!y||!t||rowYears.some(value=>value!==y)||rowTerms.some(value=>value!==t))return null;
  return {yearCode:y,termCode:t};
}
module.exports={sourceAcademicPeriod};

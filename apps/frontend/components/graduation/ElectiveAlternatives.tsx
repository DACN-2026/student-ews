export type ElectiveReplacementGroup = {
  courseCode: string;
  block: string;
  blockName: string;
  courses: Array<{ courseCode: string; courseName: string; credits: number }>;
};

export default function ElectiveAlternatives({ id, courseName, group }: {
  id: string;
  courseName: string;
  group?: ElectiveReplacementGroup;
}) {
  return (
    <section id={id} aria-label={`Môn tự chọn thay thế cho ${courseName}`} className="space-y-3 text-xs">
      {group ? (
        <>
          <div>
            <h4 className="font-semibold text-slate-900">Khối {group.block} · {group.blockName}</h4>
          </div>
          {group.courses.length === 0 ? (
            <p className="text-slate-600">Không còn môn tự chọn chưa học trong khối này. Cần học lại môn chưa đạt.</p>
          ) : <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th scope="col" className="py-2 pr-4 text-left table-cell-left">Mã HP</th>
                <th scope="col" className="py-2 pr-4 text-left table-cell-left">Tên học phần</th>
                <th scope="col" className="py-2 text-center table-cell-center">Số TC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {group.courses.map(course => (
                <tr key={course.courseCode}>
                  <td className="py-2 pr-4 font-mono text-slate-700 text-left table-cell-left">{course.courseCode}</td>
                  <td className="py-2 pr-4 text-slate-800 text-left table-cell-left">{course.courseName}</td>
                  <td className="py-2 font-mono text-slate-700 text-center table-cell-center">{course.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>}
          <p className="text-slate-500">Bù nợ của học kỳ khác cần tín chỉ đạt dư so với kế hoạch học kỳ. Học hè đạt lại môn tương ứng cũng giải quyết nợ; lịch sử F/VT được giữ nguyên.</p>
        </>
      ) : (
        <p className="text-slate-600">Chưa xác định được khối tự chọn tương ứng trong CTĐT K44 của chuyên ngành này.</p>
      )}
    </section>
  );
}

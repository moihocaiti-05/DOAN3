const ExcelJS = require('exceljs');
const milestoneRepository = require('../repositories/milestone.repository');
const groupRepository = require('../repositories/group.repository');
const AppError = require('../utils/AppError');

// ===== FILE MẪU IMPORT CÔNG VIỆC (giống bản v3: có menu chọn + các sheet Danh sách mốc / Thành viên / Nhãn) =====

// Số dòng của sheet "Danh sách task" được gắn menu / kiểm tra (dòng 2 đến dòng này)
const TASK_LAST_ROW = 300;

// Tên các sheet (đặt thành hằng số để công thức và menu dùng chung, tránh gõ sai chữ)
const SHEET_TASK = 'Danh sách task';
const SHEET_GUIDE = 'Hướng dẫn';
const SHEET_MILESTONE = 'Danh sách mốc';
const SHEET_MEMBER = 'Thành viên';
const SHEET_TAG = 'Nhãn';

// Màu tiêu đề: xanh = ô tự gõ, vàng = ô CHỌN trong menu (giống v3)
const FILL_BLUE = 'FFDCE9FB';
const FILL_YELLOW = 'FFFFF3C4';
const FILL_GREY = 'FFE5E7EB';

// Viền mỏng cho các ô của bảng
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
};

// Kiểm tra quyền XEM nhóm (giống ensureCanViewGroup trong task.service.js):
// thành viên đã đồng ý hoặc Giảng viên đã đồng ý đều được tải file mẫu của nhóm
const ensureCanViewGroup = async (userId, groupId) => {
  if (!userId) throw new AppError('Thiếu thông tin người dùng', 401);
  if (!groupId) throw new AppError('Thiếu mã nhóm', 400);

  const supervisorship = await groupRepository.findSupervisorship(userId, groupId);
  if (supervisorship) return;

  const membership = await groupRepository.findMembership(userId, groupId);
  if (membership) return;

  throw new AppError('Bạn không có quyền xem dữ liệu của nhóm này', 403);
};

// Lấy danh sách TÊN NHÃN của nhóm (ngân hàng nhãn mỗi nhóm).
// LƯU Ý: hàm này thử vài cách đọc vì chưa xem file Tag của dự án; nếu sheet "Nhãn" bị trống
// thì chỉ cần sửa riêng hàm này cho đúng tên repository / hàm của bạn.
const getGroupTagNames = async (groupId) => {
  // Lấy tên từ 1 phần tử nhãn, chấp nhận vài kiểu đặt tên trường
  const nameOf = (t) => (t && (t.name || t.tagName || t.title || (t.tag && t.tag.name))) || '';
  let list = [];

  // Cách 1: dùng repository của Tag (nếu có và có hàm lấy theo nhóm)
  try {
    const tagRepository = require('../repositories/tag.repository');
    const fn = tagRepository.findByGroup || tagRepository.getByGroup || tagRepository.findAllByGroup;
    if (typeof fn === 'function') list = await fn(groupId);
  } catch (e) {
    list = [];
  }

  // Cách 2: đọc thẳng bảng Tag bằng Prisma nếu cách 1 không ra gì
  if (!Array.isArray(list) || list.length === 0) {
    try {
      const mod = require('../config/prisma');
      const prisma = mod.prisma || mod.default || mod;
      list = await prisma.tag.findMany({ where: { groupId } });
    } catch (e) {
      list = [];
    }
  }

  // Bỏ trùng + bỏ rỗng + xếp theo bảng chữ cái tiếng Việt
  const names = (Array.isArray(list) ? list : []).map(nameOf).map((s) => String(s).trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'vi'));
};

// Đổi danh sách mốc PHẲNG của nhóm thành các dòng có SỐ MỤC LỤC như v3:
// 1 = mốc lớn, 1.1 = mốc con của 1, 1.1.1 = mốc con của 1.1; kèm đường dẫn "Cha > Con"
const buildMilestoneRows = (flat) => {
  // Gom các mốc theo mốc cha (mốc gốc có parentId = null)
  const childrenOf = new Map();
  flat.forEach((m) => {
    const key = m.parentId || null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(m);
  });
  // Mỗi nhóm anh em xếp theo thứ tự "order" rồi theo tên
  childrenOf.forEach((arr) =>
    arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title).localeCompare(String(b.title), 'vi'))
  );

  const rows = [];
  const visited = new Set(); // chặn vòng lặp nếu dữ liệu mốc bị sai
  const walk = (parentKey, prefix, parentPath) => {
    (childrenOf.get(parentKey) || []).forEach((m, i) => {
      if (visited.has(m.id)) return;
      visited.add(m.id);
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const path = parentPath ? `${parentPath} > ${m.title}` : m.title;
      rows.push({ num, title: m.title, path });
      walk(m.id, num, path);
    });
  };
  walk(null, '', '');
  return rows;
};

// Công thức cột C của sheet "Danh sách mốc": tự ghép đường dẫn đầy đủ từ số mục lục (y hệt v3)
const milestonePathFormula = (r) =>
  `IF(A${r}="","",IF(ISERROR(FIND(".",A${r})),B${r},` +
  `IFERROR(INDEX($C$6:C${r - 1},MATCH(LEFT(A${r},FIND("~",SUBSTITUTE(A${r},".","~",LEN(A${r})-LEN(SUBSTITUTE(A${r},".",""))))-1),$A$6:A${r - 1},0))&" > "&B${r},` +
  `"LỖI: thiếu mốc cha")))`;

exports.generateTemplate = async (groupId, actorId) => {
  // ----- 1. Lấy dữ liệu thật của nhóm (nếu có groupId) -----
  let memberEmails = [];
  let milestoneRows = [];
  let tagNames = [];
  if (groupId) {
    await ensureCanViewGroup(actorId, groupId);
    const members = await groupRepository.getMembers(groupId);
    memberEmails = members
      .filter((m) => m.status === 'ACCEPTED' && m.user && m.user.email)
      .map((m) => m.user.email);
    milestoneRows = buildMilestoneRows(await milestoneRepository.findByGroup(groupId));
    tagNames = await getGroupTagNames(groupId);
  }

  // Dòng cuối của từng sheet phụ: chừa thêm chỗ trống để người dùng gõ thêm (menu tự dài ra theo số dòng có chữ)
  const memberLast = Math.max(60, memberEmails.length + 21); // cột A, từ dòng 2
  const tagLast = Math.max(60, tagNames.length + 21); // cột A, từ dòng 2
  const milestoneLast = Math.max(66, 6 + milestoneRows.length + 20); // dữ liệu bắt đầu ở dòng 7

  const workbook = new ExcelJS.Workbook();

  // ----- 2. Sheet chính "Danh sách task" (sheet ĐẦU TIÊN - hệ thống chỉ import sheet này) -----
  const sheet = workbook.addWorksheet(SHEET_TASK, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }], // cố định cột A và dòng tiêu đề
  });
  const headers = [
    { text: 'Tên công việc', fill: FILL_BLUE, width: 32 },
    { text: 'Mô tả', fill: FILL_BLUE, width: 36 },
    { text: 'Email người phụ trách (CHỌN)', fill: FILL_YELLOW, width: 32 },
    { text: 'Độ ưu tiên (CHỌN)', fill: FILL_YELLOW, width: 18 },
    { text: 'Deadline (yyyy-mm-dd)', fill: FILL_BLUE, width: 16 },
    { text: 'Tên mốc (CHỌN trong danh sách; để trống nếu không có)', fill: FILL_YELLOW, width: 50 },
    { text: 'Nhãn (CHỌN; muốn thêm nhãn thứ 2 thì gõ dấu phẩy rồi tên nhãn)', fill: FILL_YELLOW, width: 30 },
    { text: 'Thuộc công việc cha (CHỌN nếu đây là việc CON; để trống nếu là việc chính)', fill: FILL_YELLOW, width: 34 },
    { text: 'Kiểm tra (tự báo lỗi, hệ thống không đọc cột này)', fill: FILL_GREY, width: 44 },
  ];
  headers.forEach((h, i) => {
    sheet.getColumn(i + 1).width = h.width;
    const cell = sheet.getCell(1, i + 1);
    cell.value = h.text;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: h.fill } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    cell.border = THIN_BORDER;
  });
  sheet.getRow(1).height = 79.5;
  sheet.autoFilter = `A1:H${TASK_LAST_ROW}`; // bộ lọc ngay ở dòng tiêu đề (chỉ để xem, không ảnh hưởng import)

  // ----- 3. Sheet "Hướng dẫn" -----
  const guide = workbook.addWorksheet(SHEET_GUIDE);
  guide.getColumn(1).width = 115;
  const guideLines = [
    ['HƯỚNG DẪN ĐIỀN FILE IMPORT CÔNG VIỆC', true],
    ["Chỉ sheet đầu tiên 'Danh sách task' được import. Các sheet còn lại chỉ để hỗ trợ (danh sách mốc, thành viên, nhãn).", false],
    ['Cột có chữ (CHỌN) màu vàng: bấm vào ô sẽ hiện mũi tên ▼ bên phải, bấm mũi tên để chọn. Không cần gõ.', false],
    ['', false],
    ['1) CHỌN GÌ Ở CỘT NÀO', true],
    ["   Email người phụ trách: chọn email thành viên (sheet 'Thành viên'). Để trống nếu chưa giao.", false],
    ['   Độ ưu tiên: low (thấp) / medium (vừa) / high (cao).', false],
    ['   Deadline: gõ ngày dạng 2026-12-25. Excel không có lịch bật lên, nhưng ô sẽ báo nếu gõ sai.', false],
    ["   Tên mốc: chọn một dòng đường dẫn, ví dụ 'Giai đoạn 3 - Lập trình > Backend > Xác thực'. Việc không thuộc mốc nào thì để trống.", false],
    ["   Nhãn: chọn 1 nhãn. Muốn 2 nhãn thì gõ thêm dấu phẩy và tên nhãn thứ hai, ví dụ 'Backend,Khẩn'.", false],
    ['   Thuộc công việc cha: chỉ dùng cho việc CON, chọn tên việc chính. Việc chính để trống. (Nhớ chỉ chọn việc chính, không chọn việc con khác. Việc cha phải nằm ở dòng phía TRÊN.)', false],
    ['', false],
    ['2) MỐC LÀ GÌ?', true],
    ["   Mốc là các giai đoạn của đồ án, xếp thành cây, đánh số như mục lục sách ở sheet 'Danh sách mốc':", false],
    ['   1  Giai đoạn 1 - Khảo sát  ← mốc lớn;   1.1  Khảo sát người dùng  ← mốc con;   3.1.1  Xác thực  ← mốc cấp 3', false],
    ["   Cần mốc mới: thêm một dòng (số + tên) ở sheet 'Danh sách mốc', rồi quay lại chọn. Mốc nào chưa có trên hệ thống sẽ được tự tạo khi import.", false],
    ['', false],
    ['3) BỘ LỌC', true],
    ['   Dòng tiêu đề có sẵn bộ lọc: bấm mũi tên ở tiêu đề cột để lọc theo người, mốc, độ ưu tiên... Lọc chỉ để xem, không ảnh hưởng việc import.', false],
    ['', false],
    ['4) CỘT KIỂM TRA (cột I, màu xám)', true],
    ["   Tự báo lỗi từng dòng: email không có trong nhóm, độ ưu tiên sai, deadline sai, mốc chưa có, việc cha không nằm ở dòng trên. Hiện 'OK' là ổn. Hệ thống không đọc cột này.", false],
    ['', false],
    ['5) Xóa các dòng ví dụ (xóa nội dung, giữ lại ô) trước khi nhập việc thật. Chỉ import 1 LẦN.', true],
  ];
  guideLines.forEach(([text, bold], i) => {
    const c = guide.getCell(`A${i + 1}`);
    c.value = text;
    c.alignment = { wrapText: true };
    if (bold) c.font = { bold: true };
  });

  // ----- 4. Sheet "Danh sách mốc": khai cây mốc MỘT LẦN ở đây, ô chọn bên sheet chính lấy từ cột C -----
  const msSheet = workbook.addWorksheet(SHEET_MILESTONE);
  msSheet.getColumn(1).width = 12;
  msSheet.getColumn(2).width = 36;
  msSheet.getColumn(3).width = 70;
  msSheet.getCell('A1').value = "DANH SÁCH MỐC - khai cây mốc MỘT LẦN ở đây; ô chọn ở cột 'Tên mốc' bên sheet 'Danh sách task' lấy từ cột C";
  msSheet.getCell('A1').font = { bold: true };
  msSheet.getCell('A2').value = 'Đánh số như mục lục: 1 là mốc lớn, 1.1 là mốc con của 1, 1.1.1 là mốc con của 1.1.';
  msSheet.getCell('A3').value = 'Thêm mốc mới: gõ xuống dòng trống ngay dưới bảng (số + tên). Mốc cha phải nằm TRÊN mốc con của nó. Cột C tự điền, đừng gõ.';
  ['A6', 'B6', 'C6'].forEach((addr, i) => {
    const c = msSheet.getCell(addr);
    c.value = ['Số mốc', 'Tên mốc', 'Đường dẫn đầy đủ (hiện trong ô chọn)'][i];
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_BLUE } };
  });
  for (let r = 7; r <= milestoneLast; r++) {
    const row = milestoneRows[r - 7]; // dòng này có mốc thật của nhóm hay là dòng trống để gõ thêm
    const a = msSheet.getCell(`A${r}`);
    a.numFmt = '@'; // định dạng Text để gõ 1.1 không bị Excel đổi thành số
    if (row) {
      a.value = row.num;
      msSheet.getCell(`B${r}`).value = row.title;
    }
    // Công thức ghép đường dẫn; kèm kết quả tính sẵn để xem được cả khi chưa tính lại
    msSheet.getCell(`C${r}`).value = { formula: milestonePathFormula(r), result: row ? row.path : '' };
  }

  // ----- 5. Sheet "Thành viên" -----
  const memberSheet = workbook.addWorksheet(SHEET_MEMBER);
  memberSheet.getColumn(1).width = 60;
  memberSheet.getCell('A1').value =
    'Email thành viên trong nhóm (chỉ ghi Sinh viên, Giảng viên không được giao việc)';
  memberSheet.getCell('A1').font = { bold: true };
  memberEmails.forEach((e, i) => {
    memberSheet.getCell(`A${i + 2}`).value = e;
  });

  // ----- 6. Sheet "Nhãn" -----
  const tagSheet = workbook.addWorksheet(SHEET_TAG);
  tagSheet.getColumn(1).width = 40;
  tagSheet.getCell('A1').value = 'Danh sách nhãn để chọn (thêm nhãn mới: gõ xuống dòng trống dưới cùng)';
  tagSheet.getCell('A1').font = { bold: true };
  tagNames.forEach((t, i) => {
    tagSheet.getCell(`A${i + 2}`).value = t;
  });

  // ----- 7. Menu chọn: dùng OFFSET + COUNTA nên thêm dòng ở sheet phụ là menu tự dài ra (giống v3) -----
  const emailList = `OFFSET('${SHEET_MEMBER}'!$A$2,0,0,MAX(1,COUNTA('${SHEET_MEMBER}'!$A$2:$A$${memberLast})),1)`;
  const milestoneList = `OFFSET('${SHEET_MILESTONE}'!$C$7,0,0,MAX(1,COUNTA('${SHEET_MILESTONE}'!$A$7:$A$${milestoneLast})),1)`;
  const tagList = `OFFSET('${SHEET_TAG}'!$A$2,0,0,MAX(1,COUNTA('${SHEET_TAG}'!$A$2:$A$${tagLast})),1)`;

  // 2 dòng ví dụ (chữ nghiêng xám): dòng 2 là việc chính, dòng 3 là việc CON của dòng 2
  const exampleDeadline = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 14));
  const exampleMain = {
    A: 'Viết mục tiêu đề tài',
    B: 'Nêu rõ mục tiêu nghiên cứu',
    C: memberEmails[0] || '',
    D: 'medium',
    E: exampleDeadline,
    F: milestoneRows[0] ? milestoneRows[0].path : '',
    G: tagNames[0] || '',
  };
  const exampleChild = {
    A: 'Viết đặt vấn đề',
    B: 'Phần mở đầu của mục tiêu đề tài',
    C: memberEmails[0] || '',
    D: 'low',
    H: exampleMain.A,
  };
  [exampleMain, exampleChild].forEach((ex, idx) => {
    const r = idx + 2;
    Object.entries(ex).forEach(([col, val]) => {
      if (val === '' || val === undefined) return;
      sheet.getCell(`${col}${r}`).value = val;
    });
    // Chữ nghiêng xám cho dễ nhận ra là dòng ví dụ
    for (let c = 1; c <= 8; c++) sheet.getCell(r, c).font = { italic: true, color: { argb: 'FF9CA0A8' } };
  });

  for (let r = 2; r <= TASK_LAST_ROW; r++) {
    // Viền cho cả bảng A..H
    for (let c = 1; c <= 8; c++) sheet.getCell(r, c).border = THIN_BORDER;

    // Định dạng ngày cho cột E (menu / kiểm tra của cả cột được gắn 1 lần ở dưới, không gắn từng ô)
    sheet.getCell(`E${r}`).numFmt = 'yyyy-mm-dd';

    // Cột I - Kiểm tra: gom các lỗi thường gặp, kiểm tra lần lượt từ trên xuống, gặp lỗi đầu tiên thì báo
    const memberRange = `'${SHEET_MEMBER}'!$A$2:$A$${memberLast}`;
    const milestoneRange = `'${SHEET_MILESTONE}'!$C$7:$C$${milestoneLast}`;
    sheet.getCell(`I${r}`).value = {
      formula:
        `IF(A${r}="",IF(COUNTA(B${r}:H${r})>0,"Thiếu Tên công việc",""),` +
        `IF(AND(C${r}<>"",COUNTIF(${memberRange},C${r})=0),"Email không có trong sheet Thành viên",` +
        `IF(AND(D${r}<>"",ISERROR(MATCH(D${r},{"low","medium","high"},0))),"Độ ưu tiên phải là low / medium / high",` +
        `IF(AND(E${r}<>"",NOT(ISNUMBER(E${r}))),"Deadline chưa phải ngày hợp lệ",` +
        `IF(AND(F${r}<>"",COUNTIF(${milestoneRange},F${r})=0),"Mốc chưa có trong sheet Danh sách mốc (import sẽ tạo mốc mới)",` +
        `IF(AND(H${r}<>"",COUNTIF($A$1:A${r - 1},H${r})=0),"Việc cha không ở dòng phía trên (bỏ qua nếu đã có sẵn trong nhóm)",` +
        `"OK"))))))`,
    };
    sheet.getCell(`I${r}`).border = THIN_BORDER;
  }

  // Gắn menu / kiểm tra theo CẢ VÙNG cột (mỗi cột 1 vùng, không chồng nhau - tránh Excel báo file lỗi)
  // showErrorMessage=false nghĩa là vẫn cho gõ tay giá trị ngoài menu (như v3), ví dụ nhiều nhãn "Backend,Khẩn"
  const dvRange = (col) => `${col}2:${col}${TASK_LAST_ROW}`;
  // Cột C - Email: chọn từ sheet Thành viên
  sheet.dataValidations.add(dvRange('C'), {
    type: 'list', allowBlank: true, formulae: [emailList], showErrorMessage: false,
  });
  // Cột D - Độ ưu tiên
  sheet.dataValidations.add(dvRange('D'), {
    type: 'list', allowBlank: true, formulae: ['"low,medium,high"'], showErrorMessage: false,
  });
  // Cột E - Deadline: hiện ô nhắc khi bấm vào và chặn gõ chữ không phải ngày
  // (ngày mốc phải là đối tượng Date, nếu truyền chuỗi công thức thì ExcelJS ghi ra NaN)
  sheet.dataValidations.add(dvRange('E'), {
    type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2020, 0, 1))],
    showInputMessage: true, promptTitle: 'Deadline', prompt: 'Gõ ngày dạng 2026-12-25',
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Sai ngày', error: 'Gõ ngày dạng 2026-12-25 (năm-tháng-ngày).',
  });
  // Cột F - Tên mốc: chọn từ cột C của sheet Danh sách mốc
  sheet.dataValidations.add(dvRange('F'), {
    type: 'list', allowBlank: true, formulae: [milestoneList], showErrorMessage: false,
  });
  // Cột G - Nhãn: chọn từ sheet Nhãn (muốn nhiều nhãn thì gõ tay cách nhau dấu phẩy)
  sheet.dataValidations.add(dvRange('G'), {
    type: 'list', allowBlank: true, formulae: [tagList], showErrorMessage: false,
  });
  // Cột H - Thuộc công việc cha: chọn từ các tên ở cột A
  sheet.dataValidations.add(dvRange('H'), {
    type: 'list', allowBlank: true, formulae: [`$A$2:$A$${TASK_LAST_ROW}`], showErrorMessage: false,
  });

  // Tô đỏ ô Kiểm tra khi có lỗi (khác rỗng và khác "OK")
  sheet.addConditionalFormatting({
    ref: `I2:I${TASK_LAST_ROW}`,
    rules: [{
      type: 'expression',
      formulae: ['AND(I2<>"",I2<>"OK")'],
      style: { font: { color: { argb: 'FFB42318' }, bold: true } },
    }],
  });

  return workbook;
};
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { supervisorApi } from '../services/supervisorApi';
import '../styles/supervisor-charts.css';

// ===== Cấu hình menu: mỗi nhóm có tiêu đề và các mục; "key" dùng để biết đang chọn biểu đồ nào =====
// timeBased = true nghĩa là biểu đồ phụ thuộc "Khoảng thời gian"; false thì các nút 4/8/12/26 tuần bị mờ đi
const MENU = [
  {
    section: 'Tiến độ',
    items: [
      {
        key: 'completed',
        timeBased: true,
        label: 'Việc hoàn thành mỗi tuần',
        desc: 'Số việc hoàn thành trong từng tuần. Đường đi xuống nhiều tuần liền nghĩa là nhóm đang chậm lại. Chỉ tính việc đang ở trạng thái Hoàn thành.',
      },
      {
        key: 'cumulative',
        timeBased: true,
        label: 'Tiến độ tích lũy (%)',
        desc: 'Tại cuối mỗi tuần, nhóm đã xong bao nhiêu phần trăm số việc đã có. Tỉ lệ có thể giảm khi nhóm thêm việc mới.',
      },
      {
        key: 'late',
        timeBased: true,
        label: 'Việc trễ hạn theo tuần',
        desc: 'Với các việc có hạn chót rơi vào mỗi tuần: cột xám là tổng số việc đến hạn, cột đỏ là số việc xong trễ hoặc đến nay vẫn chưa xong. Chọn "Toàn bộ" để thấy cả các tuần sắp tới.',
      },
      {
        key: 'duration',
        timeBased: true,
        label: 'Thời gian làm xong 1 việc',
        desc: 'Số ngày trung bình từ lúc tạo việc đến lần hoàn thành đầu tiên, tính theo tuần hoàn thành. Tuần không có việc nào xong thì đường bị ngắt.',
      },
    ],
  },
  {
    section: 'Thành viên',
    items: [
      {
        key: 'members',
        timeBased: true,
        label: 'Đóng góp từng thành viên',
        desc: 'Số việc mỗi thành viên hoàn thành trong từng tuần (mỗi người một màu, xếp chồng lên nhau). Nhìn vào biết tuần nào ai làm nhiều, ai ít.',
      },
      {
        key: 'reopen',
        timeBased: false,
        label: 'Số lần làm lại',
        desc: 'Tổng số lần việc bị kéo ra khỏi Hoàn thành để làm lại, theo thành viên và theo mốc. Số cao cho thấy phần việc đó chất lượng chưa đạt ngay lần đầu. Tính trên toàn bộ thời gian.',
      },
    ],
  },
  {
    section: 'Mốc và hoạt động',
    items: [
      {
        key: 'milestones',
        timeBased: false,
        label: '% hoàn thành từng mốc',
        desc: 'Mỗi thanh là một mốc (mốc con thụt vào dưới mốc lớn). Số liệu của mốc lớn đã gộp cả các mốc con bên trong. Tính trên toàn bộ thời gian.',
      },
      {
        key: 'activity',
        timeBased: true,
        label: 'Mức độ hoạt động theo tuần',
        desc: 'Số hoạt động của các thành viên trong nhóm mỗi tuần (tạo việc, đổi trạng thái, bình luận...). Cột thấp hoặc về 0 nghĩa là nhóm đang im lặng. Hoạt động của Giảng viên không được tính.',
      },
    ],
  },
];

// Gộp tất cả mục thành 1 mảng phẳng để tra cứu theo key
const ALL_ITEMS = MENU.flatMap((s) => s.items);
const VALID_KEYS = ALL_ITEMS.map((i) => i.key);

// Các nút chọn khoảng thời gian (value 0 = toàn bộ, kéo tới ngày kết thúc)
// MỚI SỬA: thêm nút 26 tuần
const RANGES = [
  { value: 4, label: '4 tuần' },
  { value: 8, label: '8 tuần' },
  { value: 12, label: '12 tuần' },
  { value: 26, label: '26 tuần' },
  { value: 0, label: 'Toàn bộ' },
];
const VALID_WEEKS = RANGES.map((r) => r.value);

// ===== Kiểu dùng chung cho biểu đồ =====
const AXIS_TICK = { fill: 'currentColor', fontSize: 12 }; // chữ trục lấy màu chữ của khung bao ngoài nên hợp mọi giao diện
const AXIS_LINE = 'rgba(128, 128, 128, 0.5)';
const GRID_STROKE = 'rgba(128, 128, 128, 0.3)';
const MARGIN = { top: 24, right: 20, left: 0, bottom: 0 }; // MỚI SỬA: top 24 để chừa chỗ cho chữ "Hôm nay" / "Kết thúc" trên vạch đứng

// Hộp tooltip dùng biến màu theme của dự án nên tự đổi theo giao diện Sáng / Tối / Ấm / Xanh
const TOOLTIP = {
  contentStyle: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-text)',
  },
  itemStyle: { color: 'var(--color-text)' },
  labelStyle: { color: 'var(--color-text)', fontWeight: 600 },
};

// Bảng màu cho từng thành viên (quá 10 người thì quay vòng); "Chưa giao" luôn màu xám
const MEMBER_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];
const UNASSIGNED_COLOR = '#94a3b8';
const memberColor = (m, i) => (m.id === null ? UNASSIGNED_COLOR : MEMBER_COLORS[i % MEMBER_COLORS.length]);

// Cắt tên quá dài để không đè lên biểu đồ (tooltip vẫn hiện tên đầy đủ)
const shorten = (text, max = 22) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Chiều cao biểu đồ cột ngang theo số dòng (mỗi dòng ~40px) để các thanh không bị dẹt hay chen nhau
const barsHeight = (rows, min = 160) => Math.min(Math.max(rows * 40 + 50, min), 700);

// Cộng tổng 1 mảng số (bỏ qua giá trị null của các tuần chưa tới)
const sum = (arr) => arr.reduce((s, n) => s + (n || 0), 0);

// MỚI THÊM: đổi "2026-12-20" thành "20/12/2026" để hiển thị
const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Xếp chú thích màu thành nhiều dòng khi vẽ ảnh PNG
// (chú thích của recharts là thẻ HTML nằm ngoài SVG nên không tự có trong ảnh, phải tự vẽ)
const layoutLegend = (ctx, items, maxWidth) => {
  const placed = [];
  let x = 0;
  let line = 0;
  items.forEach((it) => {
    const w = 12 + 6 + ctx.measureText(it.name).width + 18; // ô màu + khoảng cách + chữ + khoảng trống
    if (x + w > maxWidth && x > 0) {
      x = 0;
      line += 1;
    }
    placed.push({ ...it, x, line });
    x += w;
  });
  return { placed, lines: placed.length ? line + 1 : 0 };
};

export default function SupervisorCharts() {
  const { groupId } = useParams(); // lấy mã nhóm từ đường dẫn /supervisor/groups/:groupId/charts
  const navigate = useNavigate();

  // Biểu đồ đang chọn và khoảng thời gian được lưu trên địa chỉ trang (?chart=...&weeks=...)
  // nên tải lại trang (F5) hoặc gửi đường dẫn cho người khác vẫn mở đúng biểu đồ đó
  const [searchParams, setSearchParams] = useSearchParams();
  const urlChart = searchParams.get('chart');
  const urlWeeks = searchParams.get('weeks');
  const activeKey = VALID_KEYS.includes(urlChart) ? urlChart : 'completed'; // mặc định mở biểu đồ đầu tiên
  const weeks = urlWeeks !== null && VALID_WEEKS.includes(Number(urlWeeks)) ? Number(urlWeeks) : 8; // mặc định 8 tuần

  // replace: true để mỗi lần bấm không thêm 1 mục vào lịch sử (nút Back của trình duyệt vẫn quay về trang trước)
  const selectChart = (key) => setSearchParams({ chart: key, weeks: String(weeks) }, { replace: true });
  const selectWeeks = (value) => setSearchParams({ chart: activeKey, weeks: String(value) }, { replace: true });

  const [data, setData] = useState(null); // dữ liệu Backend trả về
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false); // đang tạo ảnh PNG
  const [downloadError, setDownloadError] = useState(''); // câu báo lỗi khi tạo ảnh thất bại

  const panelRef = useRef(null); // khung biểu đồ: lấy màu nền thật để tô nền cho ảnh
  const chartRef = useRef(null); // khung bao biểu đồ đang hiện: tìm các thẻ SVG bên trong để xuất ảnh

  // Gọi API lúc vào trang và mỗi khi đổi nhóm / đổi khoảng thời gian
  // Chỉ gọi 1 lần cho TẤT CẢ biểu đồ, nên chuyển qua lại giữa các mục là tức thì
  useEffect(() => {
    let cancelled = false; // tránh cập nhật giao diện khi người dùng đã rời trang hoặc đổi lựa chọn
    setLoading(true);
    setError('');
    supervisorApi
      .getCharts(groupId, weeks)
      .then((res) => {
        if (!cancelled) setData(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Không tải được dữ liệu biểu đồ. Hãy thử lại.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, weeks]);

  const weekly = data?.weekly || [];
  const members = data?.members || [];
  const memberWeekly = data?.memberWeekly || [];
  const milestones = data?.milestones || [];
  const summary = data?.summary;

  // MỚI THÊM: tách các tuần đã/đang diễn ra và các tuần chưa tới (chỉ có khi chọn "Toàn bộ" và còn trước ngày kết thúc)
  const pastWeekly = weekly.filter((w) => !w.isFuture);
  const futureWeekly = weekly.filter((w) => w.isFuture);
  // Tuần hiện tại chưa đủ 7 ngày thì số liệu của nó chưa phải số cuối cùng
  const weekIncomplete = !!summary && summary.daysIntoWeek < 7;
  // Các tuần đã kết thúc hẳn (bỏ tuần hiện tại nếu nó chưa hết), dùng để so sánh công bằng
  const fullWeeks = pastWeekly.filter((w) => !(weekIncomplete && w.isCurrent));

  // MỚI THÊM: cấu hình trục ngang dùng chung cho các biểu đồ theo tuần
  // - Từ 20 tuần trở lên: nhãn hiện thưa đều (khoảng 12 nhãn) thay vì để thư viện tự ẩn lộn xộn
  // - Tuần hiện tại có dấu * ở cuối nhãn (tuần chưa kết thúc)
  const crowded = weekly.length >= 20;
  const xAxisProps = {
    dataKey: 'label',
    tick: AXIS_TICK,
    stroke: AXIS_LINE,
    interval: crowded ? Math.ceil(weekly.length / 12) - 1 : 'preserveEnd',
    tickFormatter: (l) => (l === data?.currentLabel ? `${l}*` : l),
  };
  // Từ 16 tuần trở lên: bỏ chấm tròn trên đường cho đỡ rối
  const dotProp = weekly.length > 16 ? false : { r: 4 };

  // MỚI THÊM: 2 vạch đứng "Hôm nay" và "Kết thúc" cho các biểu đồ theo tuần
  // Trả về MẢNG phần tử (recharts đọc được mảng làm con của biểu đồ); mỗi vạch cần "key"
  const refLines = () => {
    if (!data || !data.currentLabel) return [];
    const lines = [];
    const sameWeek = data.endLabel && data.endLabel === data.currentLabel;
    lines.push(
      <ReferenceLine
        key="today"
        x={data.currentLabel}
        stroke="#f59e0b"
        strokeDasharray="4 4"
        label={{ value: sameWeek ? 'Hôm nay · Kết thúc' : 'Hôm nay', position: 'top', fill: '#f59e0b', fontSize: 11 }}
      />
    );
    if (data.endLabel && !sameWeek) {
      lines.push(
        <ReferenceLine
          key="end"
          x={data.endLabel}
          stroke="#ef4444"
          strokeDasharray="4 4"
          label={{ value: 'Kết thúc', position: 'top', fill: '#ef4444', fontSize: 11 }}
        />
      );
    }
    return lines;
  };

  // Dữ liệu cho biểu đồ "Số lần làm lại"
  // Theo thành viên: chỉ giữ người có việc bị làm lại, người nhiều nhất xếp trên
  const reopenByMember = members
    .filter((m) => m.reopenTotal > 0)
    .map((m) => ({ name: m.name, value: m.reopenTotal }))
    .sort((a, b) => b.value - a.value);
  // Theo mốc: giữ đúng thứ tự cây mốc; thêm dòng "Chưa gắn mốc" nếu có việc làm lại nằm ngoài mốc
  const reopenByMilestone = [
    ...milestones
      .filter((m) => m.reopenTotal > 0)
      .map((m) => ({ name: m.title, value: m.reopenTotal })),
    ...((data?.unlinkedReopen || 0) > 0 ? [{ name: 'Chưa gắn mốc', value: data.unlinkedReopen }] : []),
  ];

  // Dữ liệu cho biểu đồ "% hoàn thành từng mốc": mốc con thụt vào bằng khoảng trắng cứng + mũi tên để nhìn ra cấu trúc cây
  const milestoneBars = milestones.map((m) => ({
    ...m,
    label: m.depth === 0 ? m.title : `${'\u00A0\u00A0'.repeat(m.depth)}↳ ${m.title}`,
  }));

  // Biểu đồ cột ngang dùng chung cho "làm lại theo thành viên" và "làm lại theo mốc"
  const renderReopenBars = (rows, color) => (
    <ResponsiveContainer width="100%" height={barsHeight(rows.length, 120)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} stroke={AXIS_LINE} />
        <YAxis type="category" dataKey="name" width={150} tick={AXIS_TICK} stroke={AXIS_LINE} tickFormatter={(v) => shorten(v)} />
        <Tooltip {...TOOLTIP} formatter={(value) => [`${value} lần`, 'Làm lại']} />
        <Bar dataKey="value" name="Làm lại" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );

  // ===== NHẬN XÉT TỰ ĐỘNG cho từng biểu đồ =====
  // Trả về mảng các câu nhận xét, tính từ số liệu đã có (không gọi thêm API)
  // MỚI SỬA: chỉ so sánh trên các tuần ĐÃ qua; tuần hiện tại chưa hết thì nói rõ "mới qua N/7 ngày" thay vì kết luận "giảm"
  const buildInsights = (key) => {
    if (!data || !summary || pastWeekly.length === 0) return [];
    const lines = [];

    if (key === 'completed') {
      const a = summary.doneThisWeek;
      const b = summary.doneLastWeek;
      if (weekIncomplete) {
        lines.push(`Tuần này (mới qua ${summary.daysIntoWeek}/7 ngày) đã xong ${a} việc; tuần trước xong ${b} việc.`);
      } else if (a === 0 && b === 0) {
        lines.push('Tuần này và tuần trước nhóm chưa hoàn thành việc nào.');
      } else if (b === 0) {
        lines.push(`Tuần này hoàn thành ${a} việc, tuần trước chưa có việc nào.`);
      } else {
        const pct = Math.round(((a - b) / b) * 100);
        lines.push(
          pct === 0
            ? `Tuần này hoàn thành bằng tuần trước (${a} việc).`
            : `Tuần này hoàn thành ${a} việc, ${pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(pct)}% so với tuần trước (${b} việc).`
        );
      }
      if (fullWeeks.length > 0) {
        const best = fullWeeks.reduce((m, w) => (w.completed > m.completed ? w : m), fullWeeks[0]);
        if (best.completed > 0) lines.push(`Tuần hiệu quả nhất trong khoảng đang xem: bắt đầu ${best.label} (${best.completed} việc).`);
      }
    }

    if (key === 'cumulative') {
      const first = pastWeekly[0];
      const last = pastWeekly[pastWeekly.length - 1];
      lines.push(
        first.cumulativePercent === last.cumulativePercent
          ? `Tiến độ giữ nguyên ${last.cumulativePercent}% từ tuần bắt đầu ${first.label}.`
          : `Từ tuần bắt đầu ${first.label} đến nay, tiến độ ${last.cumulativePercent > first.cumulativePercent ? 'tăng' : 'giảm'} từ ${first.cumulativePercent}% lên ${last.cumulativePercent}%.`
      );
      lines.push(`Hiện còn ${summary.totalTasks - summary.doneTasks} việc chưa xong trên tổng ${summary.totalTasks} việc.`);
    }

    if (key === 'late') {
      const totalLate = sum(pastWeekly.map((w) => w.late));
      if (totalLate === 0) {
        lines.push('Không có việc nào trễ hạn trong khoảng đang xem.');
      } else {
        const worst = pastWeekly.reduce((m, w) => (w.late > m.late ? w : m), pastWeekly[0]);
        lines.push(`Có ${totalLate} việc trễ hạn trong khoảng đang xem; nhiều nhất là tuần bắt đầu ${worst.label} (${worst.late} việc).`);
      }
      if (summary.lateNow > 0) lines.push(`Hiện còn ${summary.lateNow} việc đã quá hạn mà chưa xong.`);
      // MỚI THÊM: báo trước các tuần sắp tới có nhiều việc đến hạn (chỉ có khi chọn "Toàn bộ")
      const upcoming = futureWeekly.filter((w) => w.due > 0);
      if (upcoming.length > 0) {
        const peak = upcoming.reduce((m, w) => (w.due > m.due ? w : m), upcoming[0]);
        lines.push(`Các tuần sắp tới có ${sum(upcoming.map((w) => w.due))} việc đến hạn; dồn nhiều nhất là tuần bắt đầu ${peak.label} (${peak.due} việc).`);
      }
    }

    if (key === 'duration') {
      const withData = weekly.filter((w) => w.avgDays !== null);
      if (withData.length > 0) {
        const slowest = withData.reduce((m, w) => (w.avgDays > m.avgDays ? w : m), withData[0]);
        lines.push(`Tuần làm lâu nhất: bắt đầu ${slowest.label} (trung bình ${slowest.avgDays} ngày/việc).`);
      }
      if (withData.length >= 2) {
        const f = withData[0].avgDays;
        const l = withData[withData.length - 1].avgDays;
        if (f !== l) lines.push(`Thời gian làm xong 1 việc ${l < f ? 'đang giảm (nhanh hơn)' : 'đang tăng (chậm hơn)'}: từ ${f} ngày còn ${l} ngày.`);
      }
    }

    if (key === 'members') {
      const pastMember = memberWeekly.filter((w) => !w.isFuture);
      const totals = members.map((m) => ({ m, n: sum(pastMember.map((w) => w[m.key])) }));
      const all = sum(totals.map((t) => t.n));
      if (all > 0) {
        const top = totals.reduce((best, t) => (t.n > best.n ? t : best), totals[0]);
        lines.push(`${top.m.name} làm xong nhiều nhất: ${top.n} việc (${Math.round((top.n / all) * 100)}% của nhóm trong khoảng đang xem).`);
      }
      // Người còn việc đang giữ nhưng 3 tuần đã kết thúc gần nhất không xong việc nào (không tính tuần hiện tại nếu chưa hết)
      const recent = pastMember.filter((w) => !(weekIncomplete && w.isCurrent)).slice(-3);
      if (recent.length > 0) {
        const silent = members.filter(
          (m) => m.id !== null && m.totalAssigned - m.totalDone > 0 && sum(recent.map((w) => w[m.key])) === 0
        );
        if (silent.length > 0) {
          lines.push(`Chưa xong việc nào trong ${recent.length} tuần gần nhất dù còn việc đang giữ: ${silent.map((m) => m.name).join(', ')}.`);
        }
      }
    }

    if (key === 'reopen') {
      const total = sum(reopenByMember.map((r) => r.value)) + (data.unlinkedReopen || 0);
      lines.push(`Tổng cộng có ${total} lần việc bị làm lại.`);
      if (reopenByMember.length > 0) lines.push(`Thành viên có nhiều việc bị làm lại nhất: ${reopenByMember[0].name} (${reopenByMember[0].value} lần).`);
      if (reopenByMilestone.length > 0) {
        const topM = reopenByMilestone.reduce((best, r) => (r.value > best.value ? r : best), reopenByMilestone[0]);
        lines.push(`Mốc có nhiều việc bị làm lại nhất: ${topM.name} (${topM.value} lần).`);
      }
    }

    if (key === 'milestones') {
      const withTasks = milestones.filter((m) => m.totalTasks > 0);
      const done100 = withTasks.filter((m) => m.percent === 100).length;
      lines.push(`${done100}/${milestones.length} mốc đã hoàn thành 100%.`);
      const open = withTasks.filter((m) => m.percent < 100);
      if (open.length > 0) {
        const lowest = open.reduce((m, r) => (r.percent < m.percent ? r : m), open[0]);
        lines.push(`Mốc đang thấp nhất: ${lowest.title} (${lowest.percent}%, ${lowest.doneTasks}/${lowest.totalTasks} việc).`);
      }
      const empty = milestones.filter((m) => m.totalTasks === 0).length;
      if (empty > 0) lines.push(`${empty} mốc chưa có việc nào gắn vào.`);
    }

    if (key === 'activity') {
      const last = pastWeekly[pastWeekly.length - 1].activity;
      const before = pastWeekly.slice(0, -1);
      const avg = before.length ? Math.round(sum(before.map((w) => w.activity)) / before.length) : 0;
      lines.push(
        weekIncomplete
          ? `Tuần hiện tại (mới qua ${summary.daysIntoWeek}/7 ngày) có ${last} hoạt động; trung bình các tuần trước là ${avg}.`
          : `Tuần hiện tại có ${last} hoạt động; trung bình các tuần trước là ${avg}.`
      );
      // Im lặng 2 tuần liền: chỉ xét các tuần đã kết thúc hẳn để không báo nhầm vào đầu tuần
      const lastTwo = fullWeeks.slice(-2);
      if (lastTwo.length === 2 && lastTwo.every((w) => w.activity === 0) && fullWeeks.slice(0, -2).some((w) => w.activity > 0)) {
        lines.push('Nhóm không có hoạt động nào trong 2 tuần gần nhất, có thể cần nhắc nhóm.');
      }
    }

    return lines;
  };

  // Mỗi biểu đồ gồm: hasData (có dữ liệu để vẽ chưa), empty (câu báo khi chưa có), render (hàm vẽ),
  // legend (chú thích màu, chỉ dùng để vẽ vào ảnh PNG)
  const charts = {
    // 1) Việc hoàn thành mỗi tuần: biểu đồ ĐƯỜNG
    completed: {
      hasData: weekly.some((w) => w.completed > 0),
      empty: 'Chưa có việc nào hoàn thành trong khoảng thời gian này.',
      render: () => (
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={weekly} margin={MARGIN}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={AXIS_LINE} />
            <Tooltip {...TOOLTIP} labelFormatter={(l) => `Tuần bắt đầu ${l}`} />
            {refLines()}
            <Line type="monotone" dataKey="completed" name="Việc hoàn thành" stroke="#2563eb" strokeWidth={3} dot={dotProp} />
          </LineChart>
        </ResponsiveContainer>
      ),
    },

    // 2) Tiến độ tích lũy %: biểu đồ VÙNG (đường tô màu bên dưới)
    cumulative: {
      hasData: (data?.totalTasks || 0) > 0,
      empty: 'Nhóm chưa có việc nào.',
      render: () => (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={weekly} margin={MARGIN}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} stroke={AXIS_LINE} />
            <Tooltip
              {...TOOLTIP}
              labelFormatter={(l) => `Cuối tuần bắt đầu ${l}`}
              // Hiện thêm "xong/tổng" cho dễ hiểu: phần tử thứ 3 của formatter chứa dữ liệu của tuần đang rê chuột vào
              formatter={(value, name, item) => [
                `${value}% (${item.payload.cumulativeDone}/${item.payload.cumulativeTotal} việc)`,
                'Tiến độ',
              ]}
            />
            {refLines()}
            <Area type="monotone" dataKey="cumulativePercent" name="Tiến độ" stroke="#16a34a" fill="#16a34a" fillOpacity={0.3} strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      ),
    },

    // 3) Việc trễ hạn theo tuần: biểu đồ CỘT (cột xám = đến hạn, cột đỏ = trễ)
    late: {
      hasData: weekly.some((w) => w.due > 0),
      empty: 'Chưa có việc nào có hạn chót trong khoảng thời gian này.',
      legend: [
        { name: 'Có hạn trong tuần', color: '#94a3b8' },
        { name: 'Trễ hạn', color: '#ef4444' },
      ],
      render: () => (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={weekly} margin={MARGIN}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={AXIS_LINE} />
            <Tooltip {...TOOLTIP} labelFormatter={(l) => `Tuần bắt đầu ${l}`} />
            <Legend />
            {refLines()}
            <Bar dataKey="due" name="Có hạn trong tuần" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="late" name="Trễ hạn" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ),
    },

    // 4) Thời gian làm xong 1 việc: biểu đồ ĐƯỜNG theo tuần + số lớn "Trung bình X ngày"
    duration: {
      hasData: (data?.avgDaysCount || 0) > 0,
      empty: 'Chưa có việc nào hoàn thành để tính thời gian.',
      render: () => (
        <>
          <p className="ch-big-number">
            Trung bình {data.avgDaysOverall} ngày <small>(toàn nhóm, dựa trên {data.avgDaysCount} việc đã xong)</small>
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weekly} margin={MARGIN}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
              <XAxis {...xAxisProps} />
              <YAxis tick={AXIS_TICK} stroke={AXIS_LINE} unit=" ngày" />
              <Tooltip
                {...TOOLTIP}
                labelFormatter={(l) => `Tuần bắt đầu ${l}`}
                formatter={(value, name, item) => [`${value} ngày (${item.payload.avgCount} việc)`, 'Thời gian trung bình']}
              />
              {refLines()}
              {/* connectNulls={false}: tuần không có việc xong thì ngắt đường chứ không nối qua */}
              <Line type="monotone" dataKey="avgDays" name="Thời gian trung bình" stroke="#f59e0b" strokeWidth={3} dot={dotProp} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      ),
    },

    // 5) Đóng góp từng thành viên theo tuần: biểu đồ CỘT CHỒNG, mỗi người một màu
    members: {
      hasData: memberWeekly.some((w) => members.some((m) => w[m.key] > 0)),
      empty: 'Chưa có thành viên nào hoàn thành việc trong khoảng thời gian này.',
      legend: members.map((m, i) => ({ name: m.name, color: memberColor(m, i) })),
      render: () => (
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={memberWeekly} margin={MARGIN}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={AXIS_LINE} />
            <Tooltip {...TOOLTIP} labelFormatter={(l) => `Tuần bắt đầu ${l}`} />
            <Legend />
            {refLines()}
            {/* stackId giống nhau nên các cột của cùng 1 tuần xếp chồng lên nhau; mỗi thành viên 1 màu */}
            {members.map((m, i) => (
              <Bar key={m.key} dataKey={m.key} name={m.name} stackId="members" fill={memberColor(m, i)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ),
    },

    // 6) Số lần làm lại: 2 biểu đồ CỘT NGANG xếp trên dưới (theo thành viên, theo mốc)
    reopen: {
      hasData: reopenByMember.length > 0 || reopenByMilestone.length > 0,
      empty: 'Chưa có việc nào bị làm lại.',
      render: () => (
        <>
          <h3 className="ch-panel-title" style={{ fontSize: 15 }}>Theo thành viên</h3>
          {reopenByMember.length > 0 ? renderReopenBars(reopenByMember, '#ef4444') : <p className="ch-empty">Chưa có dữ liệu.</p>}
          <h3 className="ch-panel-title" style={{ fontSize: 15, marginTop: 20 }}>Theo mốc</h3>
          {reopenByMilestone.length > 0 ? renderReopenBars(reopenByMilestone, '#f59e0b') : <p className="ch-empty">Chưa có dữ liệu.</p>}
        </>
      ),
    },

    // 8) % hoàn thành từng mốc: biểu đồ CỘT NGANG, nền xám phía sau thể hiện mức 100%
    milestones: {
      hasData: milestones.length > 0,
      empty: 'Nhóm chưa có mốc nào.',
      render: () => (
        <ResponsiveContainer width="100%" height={barsHeight(milestoneBars.length, 200)}>
          <BarChart data={milestoneBars} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS_TICK} stroke={AXIS_LINE} />
            <YAxis type="category" dataKey="label" width={190} tick={AXIS_TICK} stroke={AXIS_LINE} tickFormatter={(v) => shorten(v, 28)} />
            <Tooltip
              {...TOOLTIP}
              // Tiêu đề tooltip hiện tên mốc ĐẦY ĐỦ (trục đã cắt ngắn)
              labelFormatter={(l, payload) => payload?.[0]?.payload?.title || l}
              formatter={(value, name, item) => [
                `${value}% (${item.payload.doneTasks}/${item.payload.totalTasks} việc)`,
                'Hoàn thành',
              ]}
            />
            {/* background: vẽ thanh nền xám đủ 100% phía sau để thấy còn thiếu bao nhiêu */}
            <Bar dataKey="percent" name="Hoàn thành" fill="#16a34a" background={{ fill: 'rgba(128, 128, 128, 0.2)' }} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ),
    },

    // 7) Mức độ hoạt động của nhóm theo tuần: biểu đồ CỘT
    activity: {
      hasData: weekly.some((w) => w.activity > 0),
      empty: 'Chưa có hoạt động nào trong khoảng thời gian này.',
      render: () => (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={weekly} margin={MARGIN}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
            <XAxis {...xAxisProps} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={AXIS_LINE} />
            <Tooltip {...TOOLTIP} labelFormatter={(l) => `Tuần bắt đầu ${l}`} />
            {refLines()}
            <Bar dataKey="activity" name="Số hoạt động" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ),
    },
  };

  const activeItem = ALL_ITEMS.find((i) => i.key === activeKey); // mục đang chọn (để lấy tiêu đề + giải thích)
  const current = charts[activeKey]; // biểu đồ đang chọn
  const canDownload = !loading && !error && current.hasData && !downloading;

  // ===== TẢI ẢNH PNG của biểu đồ đang xem =====
  // Cách làm: lấy các thẻ SVG mà recharts đã vẽ, chuyển thành ảnh, rồi ghép lên 1 canvas cùng tiêu đề + chú thích màu
  const handleDownloadPng = async () => {
    const wrap = chartRef.current;
    if (!wrap || !data) return;

    // Bỏ các SVG nhỏ là biểu tượng trong chú thích của recharts (chú thích sẽ được tự vẽ lại bên dưới)
    const svgs = Array.from(wrap.querySelectorAll('svg.recharts-surface')).filter(
      (s) => !s.closest('.recharts-legend-wrapper')
    );
    if (svgs.length === 0) return;

    setDownloading(true);
    setDownloadError('');
    try {
      // Lấy màu chữ, kiểu chữ và màu nền ĐANG HIỂN THỊ để ảnh xuất ra giống giao diện hiện tại (sáng / tối / ấm / xanh)
      const cs = window.getComputedStyle(wrap);
      const textColor = cs.color;
      const fontFamily = cs.fontFamily;
      const bg = panelRef.current ? window.getComputedStyle(panelRef.current).backgroundColor : '#ffffff';

      // Chuyển 1 thẻ SVG thành ảnh: phải ghi sẵn màu chữ và kiểu chữ vì SVG đứng riêng không thừa hưởng từ trang
      const toImage = (svg) =>
        new Promise((resolve, reject) => {
          const rect = svg.getBoundingClientRect();
          const clone = svg.cloneNode(true);
          clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          clone.setAttribute('width', rect.width);
          clone.setAttribute('height', rect.height);
          clone.style.color = textColor; // chữ trên trục dùng currentColor nên lấy theo màu này
          clone.style.fontFamily = fontFamily;
          const xml = new XMLSerializer().serializeToString(clone);
          const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ img, width: rect.width, height: rect.height });
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Không chuyển được biểu đồ thành ảnh'));
          };
          img.src = url;
        });

      const items = await Promise.all(svgs.map(toImage));

      // Tính kích thước ảnh: phần đầu (tiêu đề) + các biểu đồ + chú thích màu
      const PAD = 20;
      const HEADER = 64;
      const SCALE = 2; // vẽ gấp đôi để ảnh nét
      const contentWidth = Math.max(...items.map((it) => it.width));
      const width = contentWidth + PAD * 2;

      const measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = `13px ${fontFamily}`;
      const legend = layoutLegend(measureCtx, current.legend || [], contentWidth);

      const chartsHeight = sum(items.map((it) => it.height + 8));
      const height = HEADER + chartsHeight + legend.lines * 22 + PAD;

      const canvas = document.createElement('canvas');
      canvas.width = width * SCALE;
      canvas.height = height * SCALE;
      const ctx = canvas.getContext('2d');
      ctx.scale(SCALE, SCALE);

      // Nền
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Tiêu đề: tên nhóm + tên biểu đồ, và dòng phụ ghi ngày xuất + khoảng thời gian
      ctx.fillStyle = textColor;
      ctx.font = `700 18px ${fontFamily}`;
      ctx.fillText(`${data.groupName} - ${activeItem.label}`, PAD, PAD + 18);
      ctx.globalAlpha = 0.7;
      ctx.font = `400 13px ${fontFamily}`;
      const rangeText = activeItem.timeBased && weeks !== 0 ? `${weeks} tuần gần nhất` : 'toàn bộ thời gian';
      ctx.fillText(`Xuất ngày ${new Date().toLocaleDateString('vi-VN')} - ${rangeText}`, PAD, PAD + 40);
      ctx.globalAlpha = 1;

      // Các biểu đồ (có 2 cái xếp trên dưới ở mục "Số lần làm lại")
      let y = HEADER;
      items.forEach((it) => {
        ctx.drawImage(it.img, PAD, y, it.width, it.height);
        y += it.height + 8;
      });

      // Chú thích màu (nếu biểu đồ có)
      ctx.font = `13px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      legend.placed.forEach((it) => {
        const ly = y + it.line * 22 + 11;
        ctx.fillStyle = it.color;
        ctx.fillRect(PAD + it.x, ly - 6, 12, 12);
        ctx.fillStyle = textColor;
        ctx.fillText(it.name, PAD + it.x + 18, ly);
      });

      // Đổi canvas thành file PNG rồi tự bấm link để trình duyệt tải xuống
      canvas.toBlob((blob) => {
        if (!blob) {
          setDownloadError('Không tạo được ảnh, hãy thử lại.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bieu-do-${activeKey}-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch {
      setDownloadError('Không tạo được ảnh, hãy thử lại.');
    } finally {
      setDownloading(false);
    }
  };

  const insights = current.hasData ? buildInsights(activeKey) : []; // nhận xét của biểu đồ đang chọn

  return (
    <div className="sv-page">
      {/* MỚI SỬA: thêm class ch-content để nới độ rộng trang tới 1400px */}
      <main className="sv-content ch-content">
        {/* Hàng đầu: nút quay lại + tên nhóm + chọn khoảng thời gian */}
        <div className="ch-top">
          <button className="sv-chip" onClick={() => navigate('/supervisor')}>
            ← Quay lại
          </button>
          <h1 className="sv-title">Biểu đồ nhóm{data?.groupName ? `: ${data.groupName}` : ''}</h1>
          <span className="ch-top-spacer" />
          <span className="ch-range-label">
            {activeItem.timeBased ? 'Khoảng thời gian:' : 'Biểu đồ này không phụ thuộc khoảng thời gian'}
          </span>
          {RANGES.map((r) => (
            <button
              key={r.value}
              className={`sv-chip ${weeks === r.value ? 'sv-chip-active' : ''}`}
              onClick={() => selectWeeks(r.value)}
              disabled={!activeItem.timeBased} // làm mờ nút khi biểu đồ không dùng khoảng thời gian
              style={!activeItem.timeBased ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* MỚI THÊM: hôm nay là ngày nào, ngày kết thúc lấy từ đâu (để Giảng viên biết vạch "Kết thúc" dựa vào đâu) */}
        {data && (
          <p className="ch-meta">
            Hôm nay: {new Date().toLocaleDateString('vi-VN')}
            {data.endDate
              ? ` · Ngày kết thúc: ${fmtDate(data.endDate)} (${data.endSource === 'milestone' ? 'hạn chót muộn nhất của các mốc' : 'hạn chót muộn nhất của các việc'})`
              : ' · Chưa có hạn chót nào để xác định ngày kết thúc'}
          </p>
        )}

        {/* Hàng thẻ tóm tắt - nhìn là nắm được tình hình nhóm */}
        {summary && (
          <div className="ch-kpis">
            <div className="ch-kpi">
              <p className="ch-kpi-label">Tổng số việc</p>
              <p className="ch-kpi-value">{summary.totalTasks}</p>
            </div>
            <div className="ch-kpi">
              <p className="ch-kpi-label">Đã hoàn thành</p>
              <p className="ch-kpi-value">
                {summary.doneTasks} <small>({summary.percent}%)</small>
              </p>
            </div>
            {/* Có việc trễ hạn thì thẻ đổi sang màu cảnh báo */}
            <div className={`ch-kpi ${summary.lateNow > 0 ? 'ch-kpi-danger' : ''}`}>
              <p className="ch-kpi-label">Đang trễ hạn</p>
              <p className="ch-kpi-value">{summary.lateNow}</p>
            </div>
            <div className="ch-kpi">
              <p className="ch-kpi-label">Hoàn thành tuần này</p>
              <p className="ch-kpi-value">{summary.doneThisWeek}</p>
              {/* MỚI SỬA: tuần chưa đủ 7 ngày thì KHÔNG so sánh bằng mũi tên đỏ, chỉ ghi chú màu xám */}
              {weekIncomplete ? (
                <p className="ch-delta ch-delta-flat">
                  Mới qua {summary.daysIntoWeek}/7 ngày · tuần trước: {summary.doneLastWeek}
                </p>
              ) : (
                (() => {
                  const diff = summary.doneThisWeek - summary.doneLastWeek;
                  const cls = diff > 0 ? 'ch-delta-up' : diff < 0 ? 'ch-delta-down' : 'ch-delta-flat';
                  const text = diff === 0 ? 'Bằng tuần trước' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} so với tuần trước`;
                  return <p className={`ch-delta ${cls}`}>{text}</p>;
                })()
              )}
            </div>
            <div className="ch-kpi">
              <p className="ch-kpi-label">Thời gian TB / việc</p>
              <p className="ch-kpi-value">{data.avgDaysOverall === null ? '—' : `${data.avgDaysOverall} ngày`}</p>
            </div>
          </div>
        )}

        <div className="ch-layout">
          {/* Menu bên trái: bấm mục nào thì biểu đồ đó hiện ra */}
          <nav className="ch-menu">
            {MENU.map((s) => (
              <div key={s.section} className="ch-menu-section">
                <p className="ch-menu-title">{s.section}</p>
                {s.items.map((item) => (
                  <button
                    key={item.key}
                    className={`ch-menu-item ${activeKey === item.key ? 'ch-menu-item-active' : ''}`}
                    onClick={() => selectChart(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Khung biểu đồ bên phải: chỉ vẽ biểu đồ của mục đang chọn */}
          <section className="ch-panel" ref={panelRef}>
            <div className="ch-panel-head">
              <div>
                <h2 className="ch-panel-title">{activeItem.label}</h2>
                <p className="ch-panel-desc">{activeItem.desc}</p>
              </div>
              {/* Nút tải ảnh PNG, mờ đi khi chưa có biểu đồ để tải */}
              <button className="ch-download" onClick={handleDownloadPng} disabled={!canDownload}>
                {downloading ? 'Đang tạo ảnh...' : 'Tải ảnh PNG'}
              </button>
            </div>
            {downloadError && <p className="ch-download-error">{downloadError}</p>}

            {loading ? (
              <p className="ch-empty">Đang tải...</p>
            ) : error ? (
              <p className="ch-empty">{error}</p>
            ) : current.hasData ? (
              <>
                {/* key={activeKey}: đổi mục thì khung được tạo lại, hiệu ứng hiện dần chạy lại; ref dùng để xuất ảnh */}
                <div key={activeKey} className="ch-chart-wrap" ref={chartRef}>
                  {current.render()}
                </div>

                {/* MỚI THÊM: ghi chú giải thích dấu * và các tuần chưa tới (chỉ với biểu đồ theo tuần) */}
                {activeItem.timeBased && (weekIncomplete || futureWeekly.length > 0) && (
                  <p className="ch-note">
                    {weekIncomplete && `* Tuần đang diễn ra (mới qua ${summary.daysIntoWeek}/7 ngày) nên số liệu còn có thể tăng. `}
                    {futureWeekly.length > 0 && 'Các tuần sau vạch "Hôm nay" chưa tới nên chưa có số liệu.'}
                  </p>
                )}
                {/* MỚI THÊM: báo khi "Toàn bộ" dài hơn 52 tuần nên bị cắt bớt phần đầu */}
                {activeItem.timeBased && weeks === 0 && data.truncated && (
                  <p className="ch-note">Chế độ "Toàn bộ" chỉ hiển thị tối đa 52 tuần, các tuần cũ hơn đã được ẩn.</p>
                )}

                {/* Nhận xét tự động dưới biểu đồ */}
                {insights.length > 0 && (
                  <div className="ch-insights">
                    <p className="ch-insights-title">Nhận xét</p>
                    <ul>
                      {insights.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="ch-empty">{current.empty}</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
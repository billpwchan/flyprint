import type { Locale } from "./i18n";
import type { Sky } from "./daylight";

type Copy = {
  nav: { overview: string; trips: string; places: string; fleet: string; log: string; label: string };
  time: { label: string; all: string; hint: string; flights: (n: string) => string };
  search: { open: string; placeholder: string; close: string; recent: string; years: string; cities: string; trips: string; flights: string; move: string; go: string; none: (query: string) => string };
  figures: { km: string; laps: string; hours: string; countries: string; cities: string; legs: string; inAir: string };
  tripsView: { title: (count: string) => string; yearTitle: (year: number, count: string) => string; lead: (returns: string) => string; none: string };
  language: string;
  sheet: string;
  units: { km: string; flights: (n: string) => string; nights: (n: number) => string; legs: (n: number) => string; hours: string; oneWay: string; moved: string };
  hero: {
    since: (year: number, count: string) => string;
    detail: (km: string, laps: string, hours: string, airports: string, countries: string) => string;
  };
  readings: {
    title: string;
    paceCurrent: (year: number, count: string) => string;
    pacePast: (year: number, count: string) => string;
    pacePeak: string;
    paceDetail: (prevYear: number, prev: string, peakYear: number, peak: string, prevIsPeak: boolean) => string;
    pair: (a: string, b: string, count: string) => string;
    pairDetail: (rest: string) => string;
    pairJoin: (a: string, b: string, count: string) => string;
    firsts: (year: number, count: string) => string;
    longest: (km: string) => string;
    longestDetail: (route: string, date: string, duration: string) => string;
    list: (items: string[]) => string;
    listMore: (items: string[]) => string;
  };
  trips: {
    title: string;
    yearLine: (count: string, km: string) => string;
    oneWay: (from: string, to: string) => string;
  };
  stage: { zoomIn: string; zoomOut: string; reset: string; unsupported: string };
  trip: {
    notFound: string;
    stay: (city: string, nights: number) => string;
    visit: (city: string, wait: string) => string;
    connection: (city: string, wait: string) => string;
    ground: (city: string, nights: number) => string;
    oneWay: string;
    moved: string;
    aircraftUnknown: string;
    previous: string;
    next: string;
  };
  years: {
    hero: (year: number, count: string, current: boolean) => string;
    empty: (year: number) => string;
    month: (month: number) => string;
    busiest: (month: string, count: string) => string;
    went: (places: string) => string;
    newCities: (count: string) => string;
    airline: (name: string, count: string) => string;
    airlineRest: (rest: string) => string;
    airlineJoin: (name: string, count: string) => string;
  };
  // The picture of a year, trip or flight made to be sent, shown before it goes.
  cards: {
    open: string; share: string; save: string; copy: string; copied: string; making: string; hold: string; failed: string; close: string;
    // The year card also comes as a short film.
    kinds: string; picture: string; video: string; shareVideo: string; saveVideo: string; makingVideo: (percent: string) => string; videoReady: string; videoHold: string; videoFailed: string;
  };
  places: {
    hero: (countries: string, cities: string) => string;
    yearHero: (year: number, countries: string, cities: string) => string;
    fresh: (count: string) => string;
    new: string;
    detail: (airports: string, city: string | null, month: string | null) => string;
    growth: (year: number, count: string) => string;
    most: (city: string, count: string) => string;
    mostRest: (rest: string) => string;
    farthest: (city: string) => string;
    farthestDetail: (home: string, km: string) => string;
    homes: (count: string) => string;
    homeSince: (city: string, year: string) => string;
    countries: string;
    countryLine: (cities: string, arrivals: string) => string;
    arrivals: string;
    first: string;
  };
  place: {
    notFound: string;
    lead: (first: string, last: string, arrivals: string) => string;
    once: (date: string) => string;
    connections: string;
    showAll: (count: string) => string;
    trips: string;
    airports: string;
    runways: (count: string, longest: string) => string;
    unsurveyed: (count: string) => string;
  };
  log: {
    label: string;
    search: string;
    count: (count: string) => string;
    found: (count: string) => string;
    none: (query: string) => string;
    clear: string;
    cities: string;
  };
  flight: {
    notFound: string;
    aircraft: string;
    basis: { operated: string; scheduled: string; typical: string };
    operatedBy: (airline: string, flight: string) => string;
    sameTail: (count: string) => string;
    firstType: string;
    route: string;
    routeLine: (index: string, total: string, reverse: string) => string;
    trip: string;
    tripLeg: (index: string, total: string) => string;
    ordinal: (count: string) => string;
    milestone: (count: string) => string;
    time: { recorded: string; historical_schedule: string; estimated: string };
    previous: string;
    next: string;
    with: string;
    sky: { sunrise: (after: string, left: boolean) => string; sunset: (after: string, left: boolean) => string; night: string; minutes: (count: number) => string };
  };
  pair: {
    title: (name: string) => string;
    with: (name: string) => string;
    hero: (name: string, count: string) => string;
    yearHero: (year: number, name: string, count: string) => string;
    none: (name: string) => string;
    noneLead: string;
    yearNone: (year: number) => string;
    first: (date: string) => string;
    route: (a: string, b: string, count: string) => string;
    cities: (count: string) => string;
    farthest: (km: string) => string;
    ahead: (common: string, mine: string) => string;
    aheadDetail: (name: string, places: string) => string;
    apart: (mine: string, name: string, theirs: string) => string;
    apartDetail: (places: string, name?: string) => string;
    trips: string;
    tripShare: (shared: number, total: number) => string;
    view: string;
    together: string;
    everything: string;
    me: string;
    sharing: string;
    shareAll: (name: string) => string;
    shareHint: (name: string) => string;
    bothShare: (name: string) => string;
    theyShare: (name: string) => string;
    theyKeep: (name: string) => string;
    unlink: (name: string) => string;
    unlinkConfirm: string;
    unlinkHint: string;
    notFound: string;
    notFoundLead: string;
    sample: string;
  };
  meta: { years: (year: number) => string; trip: string; flight: string };
  map: { flights: (count: string) => string; route: (count: string) => string };
};

const cjkList = (items: string[]) => items.join("、");

// Chinese templates put a space either side of a name, so a Latin name reads
// "和 Bill 一起"; a Chinese name closes up to "和小林一起".
const CJK = "\\p{Script=Han}\\u3000-\\u303f\\uff00-\\uffef";
const BETWEEN_CJK = new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, "gu");
export function closedUp<T extends object>(block: T): T {
  return Object.fromEntries(Object.entries(block).map(([key, value]) => [
    key,
    typeof value === "function" ? (...args: unknown[]) => String(value(...args)).replace(BETWEEN_CJK, "") : value,
  ])) as T;
}

const hans: Copy = {
  nav: { overview: "概览", trips: "旅程", places: "足迹", fleet: "机队", log: "航班", label: "主导航" },
  time: { label: "按年份查看", all: "全部年份", hint: "选一年", flights: (n) => `${n} 次` },
  search: { open: "搜索", placeholder: "城市、旅程、航班或年份", close: "关闭", recent: "最近的旅程", years: "年份", cities: "城市", trips: "旅程", flights: "航班", move: "选择", go: "打开", none: (query) => `没有和“${query}”相关的记录` },
  figures: { km: "公里", laps: "圈绕地球", hours: "小时在空中", countries: "个国家和地区", cities: "座城市", legs: "段航班", inAir: "在空中" },
  tripsView: { title: (count) => `${count} 次出行`, yearTitle: (year, count) => `${year} 年出行 ${count} 次`, lead: (returns) => returns !== "0" ? `另有 ${returns} 次单独的回程。` : "", none: "这一年没有旅程" },
  language: "语言",
  sheet: "调整面板高度",
  units: { km: "公里", flights: (n) => `${n} 次`, nights: (n) => n ? `${n} 晚` : "当天", legs: (n) => `${n} 段`, hours: "小时", oneWay: "单程", moved: "迁居" },
  hero: {
    since: (year, count) => `${year} 年以来，飞了 ${count} 次`,
    detail: (km, laps, hours, airports, countries) => `${km} 公里，约绕地球 ${laps} 圈。在空中 ${hours} 小时，到过 ${countries} 个国家和地区的 ${airports} 座机场。`,
  },
  readings: {
    title: "值得记住的",
    paceCurrent: (year, count) => `${year} 年已经飞了 ${count} 次`,
    pacePast: (year, count) => `${year} 年飞了 ${count} 次`,
    pacePeak: "是飞得最多的一年",
    paceDetail: (prevYear, prev, peakYear, peak, prevIsPeak) => prevIsPeak ? `${prevYear} 年全年 ${prev} 次，是目前最多的一年` : `${prevYear} 年 ${prev} 次；最多的一年是 ${peakYear} 年，${peak} 次`,
    pair: (a, b, count) => `${a}—${b}往返最多，${count} 次`,
    pairDetail: (rest) => `其次是${rest}`,
    pairJoin: (a, b, count) => `${a}—${b} ${count} 次`,
    firsts: (year, count) => `${year} 年第一次到了 ${count} 座机场`,
    longest: (km) => `最远的一程 ${km} 公里`,
    longestDetail: (route, date, duration) => `${route} · ${date} · ${duration}`,
    list: cjkList,
    listMore: (items) => `${cjkList(items)}等`,
  },
  trips: {
    title: "旅程",
    yearLine: (count, km) => `${count} 次 · ${km} 公里`,
    oneWay: (from, to) => `${from} → ${to}`,
  },
  stage: { zoomIn: "放大", zoomOut: "缩小", reset: "回到全球", unsupported: "这个浏览器无法显示地图" },
  trip: {
    notFound: "没有找到这段旅程",
    stay: (city, nights) => `在${city}停留 ${nights} 晚`,
    visit: (city, wait) => wait ? `在${city}停留 ${wait}` : `当天往返${city}`,
    connection: (city, wait) => wait ? `${city}转机 · ${wait}` : `${city}转机`,
    ground: (city, nights) => nights ? `${nights} 晚后从${city}出发` : `当天从${city}出发`,
    oneWay: "单程",
    moved: "迁居",
    aircraftUnknown: "机型未记录",
    previous: "上一个旅程",
    next: "下一个旅程",
  },
  years: {
    hero: (year, count, current) => current ? `${year} 年至今飞了 ${count} 次` : `${year} 年飞了 ${count} 次`,
    empty: (year) => `${year} 年没有飞行记录`,
    month: (month) => `${month}月`,
    busiest: (month, count) => `${month}最忙，飞了 ${count} 次`,
    went: (places) => `去了${places}`,
    newCities: (count) => `第一次去了 ${count} 座城市`,
    airline: (name, count) => `坐得最多的是${name}，${count} 次`,
    airlineRest: (rest) => `其次是${rest}`,
    airlineJoin: (name, count) => `${name} ${count} 次`,
  },
  places: {
    hero: (countries, cities) => `到过 ${countries} 个国家和地区的 ${cities} 座城市`,
    yearHero: (year, countries, cities) => `${year} 年去了 ${countries} 个国家和地区的 ${cities} 座城市`,
    fresh: (count) => `其中 ${count} 座是第一次去。`,
    new: "新",
    detail: (airports, city, month) => `经过 ${airports} 座机场。${city && month ? `最近第一次去的地方是${city}，${month}。` : ""}`,
    growth: (year, count) => `${year} 年去的新城市最多，${count} 座`,
    most: (city, count) => `去得最多的是${city}，到达 ${count} 次`,
    mostRest: (rest) => `其次是${rest}`,
    farthest: (city) => `最远到过${city}`,
    farthestDetail: (home, km) => `离${home} ${km} 公里`,
    homes: (count) => `在 ${count} 座城市住过`,
    homeSince: (city, year) => `${year} 年${city}`,
    countries: "国家和地区",
    countryLine: (cities, arrivals) => `${cities} 座城市 · 到达 ${arrivals} 次`,
    arrivals: "到达",
    first: "首次",
  },  cards: { open: "分享图片", share: "分享图片", save: "保存图片", copy: "复制图片", copied: "已复制", making: "正在生成", hold: "长按图片保存", failed: "这张图没能生成", close: "关闭",
    kinds: "图片或视频", picture: "图片", video: "视频", shareVideo: "分享视频", saveVideo: "保存视频", makingVideo: (percent) => `正在生成视频 ${percent}`, videoReady: "视频生成好了",
    videoHold: "要保存视频，请点右上角，在浏览器打开", videoFailed: "这段视频没能生成" },

  place: {
    notFound: "档案里没有这座城市",
    lead: (first, last, arrivals) => `第一次是 ${first}，最近一次是 ${last}。一共到达 ${arrivals} 次。`,
    once: (date) => `${date}来过一次。`,
    connections: "从这里飞往",
    showAll: (count) => `显示全部 ${count} 座城市`,
    trips: "到过这里的旅程",
    airports: "机场",
    runways: (count, longest) => `${count} 条跑道，最长 ${longest} 米`,
    unsurveyed: (count) => `其中 ${count} 条没有测绘坐标，图中未画`,
  },
  log: {
    label: "搜索记录",
    search: "航班、城市、航司或机型",
    count: (count) => `${count} 次航班`,
    found: (count) => `找到 ${count} 次航班`,
    none: (query) => `没有找到“${query}”`,
    clear: "清除",
    cities: "城市",
  },
  flight: {
    notFound: "档案里没有这次航班",
    aircraft: "机型",
    basis: { operated: "实际执飞", scheduled: "计划机型", typical: "这条航线的常用机型" },
    operatedBy: (airline, flight) => `由${airline} ${flight} 实际承运`,
    sameTail: (count) => `这架飞机坐过 ${count} 次`,
    firstType: "第一次坐这个机型",
    route: "这条航线",
    routeLine: (index, total, reverse) => `${total === "1" ? "只飞过这一次" : `第 ${index} 次，一共 ${total} 次`}${reverse !== "0" ? `；反方向 ${reverse} 次` : ""}`,
    trip: "所属旅程",
    tripLeg: (index, total) => `第 ${index} 段，共 ${total} 段`,
    ordinal: (count) => `第 ${count} 次飞行`,
    milestone: (count) => `第 ${count} 次飞行`,
    time: { recorded: "时刻为原始记录", historical_schedule: "时刻按当时的航班时刻表", estimated: "没有记录时刻，飞行时长按距离估算" },
    previous: "上一次飞行",
    next: "下一次飞行",
    with: "同飞",
    sky: {
      sunrise: (after, left) => `起飞 ${after}后日出，在${left ? "左" : "右"}侧窗外`,
      sunset: (after, left) => `起飞 ${after}后日落，在${left ? "左" : "右"}侧窗外`,
      night: "全程夜航",
      minutes: (count) => `${count} 分钟`,
    },
  },
  pair: closedUp({
    title: (name) => `我和 ${name}`,
    with: (name) => `与 ${name} 同飞`,
    hero: (name, count) => `和 ${name} 一起飞了 ${count} 次`,
    yearHero: (year, name, count) => `${year} 年和 ${name} 一起飞了 ${count} 次`,
    none: (name) => `还没有和 ${name} 都记下的航班`,
    noneLead: "同一班飞机两个人都记进自己的账户后，就会出现在这里。",
    yearNone: (year) => `${year} 年没有一起飞`,
    first: (date) => `第一次一起飞是${date}`,
    route: (a, b, count) => `${a}—${b}一起飞得最多，${count} 次`,
    cities: (count) => `一起到过 ${count} 座城市`,
    farthest: (km) => `一起飞过最远的一程 ${km} 公里`,
    ahead: (common, mine) => `两人都到过的 ${common} 座城市里，${mine === "0" ? "没有一座" : `${mine} 座`}是你先到的`,
    aheadDetail: (name, places) => `${name} 先到的：${places}`,
    apart: (mine, name, theirs) => theirs === "0" ? `${mine} 座城市只有你到过` : mine === "0" ? `${theirs} 座城市只有 ${name} 到过` : `只有你到过 ${mine} 座城市，只有 ${name} 到过 ${theirs} 座`,
    apartDetail: (places, name) => `只有${name ? ` ${name} ` : "你"}到过的：${places}`,
    trips: "一起的旅程",
    tripShare: (shared, total) => `${total} 段里 ${shared} 段一起`,
    view: "地球上显示",
    together: "同飞",
    everything: "加上各自的",
    me: "我",
    sharing: "共享",
    shareAll: (name) => `让 ${name} 看到我全部的航线`,
    shareHint: (name) => `关闭时，${name} 只能看到你们都记了的航班。`,
    bothShare: (name) => `${name} 也打开了，你们可以叠加各自的航线。`,
    theyShare: (name) => `${name} 已经打开；你也打开后，就能叠加各自的航线。`,
    theyKeep: (name) => `${name} 没有打开。两人都打开才能叠加各自的航线。`,
    unlink: (name) => `解除和 ${name} 的联动`,
    unlinkConfirm: "再点一次确认解除",
    unlinkHint: "解除后，你们各自的航班都不受影响。",
    notFound: "没有这个联动",
    notFoundLead: "可能已经解除了，或者这个地址属于别的账户。",
    sample: "示例数据：两个人的同飞页",
  }),
  meta: { years: (year) => `${year} 年`, trip: "旅程", flight: "航班" },
  map: { flights: (count) => `${count} 次`, route: (count) => `这条航线 ${count} 次` },
};

const hant: Copy = {
  ...hans,
  nav: { overview: "概覽", trips: "旅程", places: "足跡", fleet: "機隊", log: "航班", label: "主導覽" },
  time: { label: "按年份檢視", all: "全部年份", hint: "選一年", flights: (n) => `${n} 次` },
  search: { open: "搜尋", placeholder: "城市、旅程、航班或年份", close: "關閉", recent: "最近的旅程", years: "年份", cities: "城市", trips: "旅程", flights: "航班", move: "選擇", go: "開啟", none: (query) => `沒有和「${query}」相關的記錄` },
  figures: { km: "公里", laps: "圈繞地球", hours: "小時在空中", countries: "個國家和地區", cities: "座城市", legs: "段航班", inAir: "在空中" },
  tripsView: { title: (count) => `${count} 次出行`, yearTitle: (year, count) => `${year} 年出行 ${count} 次`, lead: (returns) => returns !== "0" ? `另有 ${returns} 次單獨的回程。` : "", none: "這一年沒有旅程" },
  language: "語言",
  sheet: "調整面板高度",
  units: { km: "公里", flights: (n) => `${n} 次`, nights: (n) => n ? `${n} 晚` : "即日", legs: (n) => `${n} 段`, hours: "小時", oneWay: "單程", moved: "遷居" },
  hero: {
    since: (year, count) => `${year} 年以來，飛了 ${count} 次`,
    detail: (km, laps, hours, airports, countries) => `${km} 公里，約繞地球 ${laps} 圈。在空中 ${hours} 小時，到過 ${countries} 個國家和地區的 ${airports} 座機場。`,
  },
  readings: {
    title: "值得記住的",
    paceCurrent: (year, count) => `${year} 年已經飛了 ${count} 次`,
    pacePast: (year, count) => `${year} 年飛了 ${count} 次`,
    pacePeak: "是飛得最多的一年",
    paceDetail: (prevYear, prev, peakYear, peak, prevIsPeak) => prevIsPeak ? `${prevYear} 年全年 ${prev} 次，是目前最多的一年` : `${prevYear} 年 ${prev} 次；最多的一年是 ${peakYear} 年，${peak} 次`,
    pair: (a, b, count) => `${a}—${b}往返最多，${count} 次`,
    pairDetail: (rest) => `其次是${rest}`,
    pairJoin: (a, b, count) => `${a}—${b} ${count} 次`,
    firsts: (year, count) => `${year} 年第一次到了 ${count} 座機場`,
    longest: (km) => `最遠的一程 ${km} 公里`,
    longestDetail: (route, date, duration) => `${route} · ${date} · ${duration}`,
    list: cjkList,
    listMore: (items) => `${cjkList(items)}等`,
  },
  trips: { title: "旅程", yearLine: (count, km) => `${count} 次 · ${km} 公里`, oneWay: (from, to) => `${from} → ${to}` },
  stage: { zoomIn: "放大", zoomOut: "縮小", reset: "回到全球", unsupported: "這個瀏覽器無法顯示地圖" },
  trip: {
    notFound: "找不到這段旅程",
    stay: (city, nights) => `在${city}停留 ${nights} 晚`,
    visit: (city, wait) => wait ? `在${city}停留 ${wait}` : `即日往返${city}`,
    connection: (city, wait) => wait ? `${city}轉機 · ${wait}` : `${city}轉機`,
    ground: (city, nights) => nights ? `${nights} 晚後從${city}出發` : `同日從${city}出發`,
    oneWay: "單程",
    moved: "遷居",
    aircraftUnknown: "機型未記錄",
    previous: "上一個旅程",
    next: "下一個旅程",
  },
  years: {
    hero: (year, count, current) => current ? `${year} 年至今飛了 ${count} 次` : `${year} 年飛了 ${count} 次`,
    empty: (year) => `${year} 年沒有飛行記錄`,
    month: (month) => `${month}月`,
    busiest: (month, count) => `${month}最忙，飛了 ${count} 次`,
    went: (places) => `去了${places}`,
    newCities: (count) => `第一次去了 ${count} 座城市`,
    airline: (name, count) => `坐得最多的是${name}，${count} 次`,
    airlineRest: (rest) => `其次是${rest}`,
    airlineJoin: (name, count) => `${name} ${count} 次`,
  },
  places: {
    hero: (countries, cities) => `到過 ${countries} 個國家和地區的 ${cities} 座城市`,
    yearHero: (year, countries, cities) => `${year} 年去了 ${countries} 個國家和地區的 ${cities} 座城市`,
    fresh: (count) => `其中 ${count} 座是第一次去。`,
    new: "新",
    detail: (airports, city, month) => `經過 ${airports} 座機場。${city && month ? `最近第一次去的地方是${city}，${month}。` : ""}`,
    growth: (year, count) => `${year} 年去的新城市最多，${count} 座`,
    most: (city, count) => `去得最多的是${city}，到達 ${count} 次`,
    mostRest: (rest) => `其次是${rest}`,
    farthest: (city) => `最遠到過${city}`,
    farthestDetail: (home, km) => `離${home} ${km} 公里`,
    homes: (count) => `在 ${count} 座城市住過`,
    homeSince: (city, year) => `${year} 年${city}`,
    countries: "國家和地區",
    countryLine: (cities, arrivals) => `${cities} 座城市 · 到達 ${arrivals} 次`,
    arrivals: "到達",
    first: "首次",
  },  cards: { open: "分享圖片", share: "分享圖片", save: "儲存圖片", copy: "複製圖片", copied: "已複製", making: "正在產生", hold: "長按圖片儲存", failed: "這張圖沒能產生", close: "關閉",
    kinds: "圖片或影片", picture: "圖片", video: "影片", shareVideo: "分享影片", saveVideo: "儲存影片", makingVideo: (percent) => `正在產生影片 ${percent}`, videoReady: "影片產生好了",
    videoHold: "要儲存影片，請點右上角，在瀏覽器開啟", videoFailed: "這段影片沒能產生" },

  place: {
    notFound: "檔案裡沒有這座城市",
    lead: (first, last, arrivals) => `第一次是 ${first}，最近一次是 ${last}。一共到達 ${arrivals} 次。`,
    once: (date) => `${date}來過一次。`,
    connections: "從這裡飛往",
    showAll: (count) => `顯示全部 ${count} 座城市`,
    trips: "到過這裡的旅程",
    airports: "機場",
    runways: (count, longest) => `${count} 條跑道，最長 ${longest} 米`,
    unsurveyed: (count) => `其中 ${count} 條沒有測繪座標，圖中未畫`,
  },
  log: {
    label: "搜尋記錄",
    search: "航班、城市、航空公司或機型",
    count: (count) => `${count} 次航班`,
    found: (count) => `找到 ${count} 次航班`,
    none: (query) => `找不到「${query}」`,
    clear: "清除",
    cities: "城市",
  },
  flight: {
    notFound: "檔案裡沒有這次航班",
    aircraft: "機型",
    basis: { operated: "實際執飛", scheduled: "計劃機型", typical: "這條航線的常用機型" },
    operatedBy: (airline, flight) => `由${airline} ${flight} 實際承運`,
    sameTail: (count) => `這架飛機坐過 ${count} 次`,
    firstType: "第一次坐這個機型",
    route: "這條航線",
    routeLine: (index, total, reverse) => `${total === "1" ? "只飛過這一次" : `第 ${index} 次，一共 ${total} 次`}${reverse !== "0" ? `；反方向 ${reverse} 次` : ""}`,
    trip: "所屬旅程",
    tripLeg: (index, total) => `第 ${index} 段，共 ${total} 段`,
    ordinal: (count) => `第 ${count} 次飛行`,
    milestone: (count) => `第 ${count} 次飛行`,
    time: { recorded: "時刻為原始記錄", historical_schedule: "時刻按當時的航班時刻表", estimated: "沒有記錄時刻，飛行時長按距離估算" },
    previous: "上一次飛行",
    next: "下一次飛行",
    with: "同飛",
    sky: {
      sunrise: (after, left) => `起飛 ${after}後日出，在${left ? "左" : "右"}邊窗外`,
      sunset: (after, left) => `起飛 ${after}後日落，在${left ? "左" : "右"}邊窗外`,
      night: "全程夜航",
      minutes: (count) => `${count} 分鐘`,
    },
  },
  pair: closedUp({
    title: (name) => `我和 ${name}`,
    with: (name) => `與 ${name} 同飛`,
    hero: (name, count) => `和 ${name} 一起飛了 ${count} 次`,
    yearHero: (year, name, count) => `${year} 年和 ${name} 一起飛了 ${count} 次`,
    none: (name) => `還沒有和 ${name} 都記下的航班`,
    noneLead: "同一班飛機兩個人都記進自己的帳戶後，就會出現在這裏。",
    yearNone: (year) => `${year} 年沒有一起飛`,
    first: (date) => `第一次一起飛是${date}`,
    route: (a, b, count) => `${a}—${b}一起飛得最多，${count} 次`,
    cities: (count) => `一起到過 ${count} 座城市`,
    farthest: (km) => `一起飛過最遠的一程 ${km} 公里`,
    ahead: (common, mine) => `兩人都到過的 ${common} 座城市裏，${mine === "0" ? "沒有一座" : `${mine} 座`}是你先到的`,
    aheadDetail: (name, places) => `${name} 先到的：${places}`,
    apart: (mine, name, theirs) => theirs === "0" ? `${mine} 座城市只有你到過` : mine === "0" ? `${theirs} 座城市只有 ${name} 到過` : `只有你到過 ${mine} 座城市，只有 ${name} 到過 ${theirs} 座`,
    apartDetail: (places, name) => `只有${name ? ` ${name} ` : "你"}到過的：${places}`,
    trips: "一起的旅程",
    tripShare: (shared, total) => `${total} 段裏 ${shared} 段一起`,
    view: "地球上顯示",
    together: "同飛",
    everything: "加上各自的",
    me: "我",
    sharing: "共享",
    shareAll: (name) => `讓 ${name} 看到我全部的航線`,
    shareHint: (name) => `關閉時，${name} 只能看到你們都記了的航班。`,
    bothShare: (name) => `${name} 也打開了，你們可以疊加各自的航線。`,
    theyShare: (name) => `${name} 已經打開；你也打開後，就能疊加各自的航線。`,
    theyKeep: (name) => `${name} 沒有打開。兩人都打開才能疊加各自的航線。`,
    unlink: (name) => `解除和 ${name} 的聯動`,
    unlinkConfirm: "再按一次確認解除",
    unlinkHint: "解除後，你們各自的航班都不受影響。",
    notFound: "沒有這個聯動",
    notFoundLead: "可能已經解除了，或者這個地址屬於別的帳戶。",
    sample: "示例資料：兩個人的同飛頁",
  }),
  meta: { years: (year) => `${year} 年`, trip: "旅程", flight: "航班" },
  map: { flights: (count) => `${count} 次`, route: (count) => `這條航線 ${count} 次` },
};

const plural = (count: string, one: string, many: string) => count === "1" ? one : many;
export const ordinalEn = (count: string) => {
  const n = Number(count.replace(/,/g, "")), tail = n % 100;
  const suffix = tail >= 11 && tail <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${count}${suffix}`;
};
const MONTHS_LONG_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const englishList = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const en: Copy = {
  nav: { overview: "Overview", trips: "Trips", places: "Footprint", fleet: "Fleet", log: "Flights", label: "Main" },
  time: { label: "Show a year", all: "All years", hint: "Pick a year", flights: (n) => plural(n, "1 flight", `${n} flights`) },
  search: { open: "Search", placeholder: "City, trip, flight or year", close: "Close", recent: "Recent trips", years: "Years", cities: "Cities", trips: "Trips", flights: "Flights", move: "Move", go: "Open", none: (query) => `Nothing matches “${query}”` },
  figures: { km: "km", laps: "laps of Earth", hours: "hours aloft", countries: "countries & regions", cities: "cities", legs: "flights", inAir: "in the air" },
  tripsView: { title: (count) => plural(count, "1 trip", `${count} trips`), yearTitle: (year, count) => `${plural(count, "1 trip", `${count} trips`)} in ${year}`, lead: (returns) => returns !== "0" ? `Plus ${plural(returns, "1 separate flight home", `${returns} separate flights home`)}.` : "", none: "No trips this year" },
  language: "Language",
  sheet: "Resize panel",
  units: { km: "km", flights: (n) => plural(n, "1 flight", `${n} flights`), nights: (n) => n === 0 ? "Day trip" : n === 1 ? "1 night" : `${n} nights`, legs: (n) => n === 1 ? "1 leg" : `${n} legs`, hours: "hours", oneWay: "One way", moved: "Moved" },
  hero: {
    since: (year, count) => `${count} flights since ${year}`,
    detail: (km, laps, hours, airports, countries) => `${km} km, about ${laps} times around the Earth. ${hours} hours in the air, through ${airports} airports in ${countries} countries and regions.`,
  },
  readings: {
    title: "Worth remembering",
    paceCurrent: (year, count) => `${count} flights so far in ${year}`,
    pacePast: (year, count) => `${count} flights in ${year}`,
    pacePeak: "the busiest year yet",
    paceDetail: (prevYear, prev, peakYear, peak, prevIsPeak) => prevIsPeak ? `${prev} in ${prevYear}, the busiest year yet` : `${prev} in ${prevYear}. The busiest was ${peakYear}, with ${peak}`,
    pair: (a, b, count) => `${a}–${b} is the most flown, ${count} times`,
    pairDetail: (rest) => `Then ${rest}`,
    pairJoin: (a, b, count) => `${a}–${b} (${count})`,
    firsts: (year, count) => `${count} new airports in ${year}`,
    longest: (km) => `The longest flight was ${km} km`,
    longestDetail: (route, date, duration) => `${route} · ${date} · ${duration}`,
    list: englishList,
    listMore: (items) => `${items.join(", ")} and more`,
  },
  trips: { title: "Trips", yearLine: (count, km) => `${count} flights · ${km} km`, oneWay: (from, to) => `${from} → ${to}` },
  stage: { zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Back to globe", unsupported: "This browser can’t show the map" },
  trip: {
    notFound: "This trip isn’t in the archive",
    stay: (city, nights) => nights === 1 ? `1 night in ${city}` : `${nights} nights in ${city}`,
    visit: (city, wait) => wait ? `${wait} in ${city}` : `Day visit to ${city}`,
    connection: (city, wait) => wait ? `Connection in ${city} · ${wait}` : `Connection in ${city}`,
    ground: (city, nights) => nights === 0 ? `Same day, on from ${city}` : nights === 1 ? `1 night, then on from ${city}` : `${nights} nights, then on from ${city}`,
    oneWay: "One way",
    moved: "Moved",
    aircraftUnknown: "Aircraft not recorded",
    previous: "Previous trip",
    next: "Next trip",
  },
  years: {
    hero: (year, count, current) => current ? `${plural(count, "1 flight", `${count} flights`)} so far in ${year}` : `${plural(count, "1 flight", `${count} flights`)} in ${year}`,
    empty: (year) => `No flights in ${year}`,
    month: (month) => MONTHS_LONG_EN[month - 1],
    busiest: (month, count) => `${month} was the busiest month, with ${count} flights`,
    went: (places) => `To ${places}`,
    newCities: (count) => plural(count, "A new city", `${count} new cities`),
    airline: (name, count) => `Mostly ${name}, ${plural(count, "1 flight", `${count} flights`)}`,
    airlineRest: (rest) => `Then ${rest}`,
    airlineJoin: (name, count) => `${name} (${count})`,
  },
  places: {
    hero: (countries, cities) => `${plural(cities, "1 city", `${cities} cities`)} in ${plural(countries, "1 country or region", `${countries} countries and regions`)}`,
    yearHero: (year, countries, cities) => `${plural(cities, "1 city", `${cities} cities`)} in ${plural(countries, "1 country or region", `${countries} countries and regions`)} in ${year}`,
    fresh: (count) => `${plural(count, "1 was", `${count} were`)} new.`,
    new: "New",
    detail: (airports, city, month) => `Through ${plural(airports, "1 airport", `${airports} airports`)}.${city && month ? ` The latest new place was ${city}, in ${month}.` : ""}`,
    growth: (year, count) => `${year} brought the most new cities, ${count}`,
    most: (city, count) => `${city} is the most visited, ${plural(count, "1 arrival", `${count} arrivals`)}`,
    mostRest: (rest) => `Then ${rest}`,
    farthest: (city) => `The farthest was ${city}`,
    farthestDetail: (home, km) => `${km} km from ${home}`,
    homes: (count) => `Lived in ${count} cities`,
    homeSince: (city, year) => `${city} (${year})`,
    countries: "Countries and regions",
    countryLine: (cities, arrivals) => `${plural(cities, "1 city", `${cities} cities`)} · ${plural(arrivals, "1 arrival", `${arrivals} arrivals`)}`,
    arrivals: "Arrivals",
    first: "First",
  },  cards: { open: "Share image", share: "Share image", save: "Save image", copy: "Copy image", copied: "Copied", making: "Making the picture", hold: "Press and hold the picture to save it", failed: "This picture couldn’t be made", close: "Close",
    kinds: "Image or video", picture: "Image", video: "Video", shareVideo: "Share video", saveVideo: "Save video", makingVideo: (percent) => `Making the video · ${percent}`, videoReady: "The video is ready",
    videoHold: "To save the video, open this page in your browser from the menu at the top right", videoFailed: "This video couldn’t be made" },

  place: {
    notFound: "This city isn’t in the archive",
    lead: (first, last, arrivals) => `First on ${first}, most recently on ${last}. ${plural(arrivals, "1 arrival", `${arrivals} arrivals`)} in all.`,
    once: (date) => `Once, on ${date}.`,
    connections: "Flown to from here",
    showAll: (count) => `Show all ${count} cities`,
    trips: "Trips that came here",
    airports: "Airports",
    runways: (count, longest) => `${plural(count, "1 runway", `${count} runways`)}, longest ${longest} m`,
    unsurveyed: (count) => `${plural(count, "1 is", `${count} are`)} not surveyed and not drawn`,
  },
  log: {
    label: "Search the log",
    search: "Flight, city, airline or aircraft",
    count: (count) => plural(count, "1 flight", `${count} flights`),
    found: (count) => plural(count, "1 flight found", `${count} flights found`),
    none: (query) => `Nothing matches “${query}”`,
    clear: "Clear",
    cities: "Cities",
  },
  flight: {
    notFound: "This flight isn’t in the archive",
    aircraft: "Aircraft",
    basis: { operated: "As flown", scheduled: "Scheduled aircraft", typical: "Usual aircraft on this route" },
    operatedBy: (airline, flight) => `Operated by ${airline} as ${flight}`,
    sameTail: (count) => `On this exact aircraft ${count} times`,
    firstType: "First time on this type",
    route: "This route",
    routeLine: (index, total, reverse) => `${total === "1" ? "The only time" : `${ordinalEn(index)} of ${total}`}${reverse !== "0" ? `; ${plural(reverse, "once", `${reverse} times`)} the other way` : ""}`,
    trip: "Trip",
    tripLeg: (index, total) => `Flight ${index} of ${total}`,
    ordinal: (count) => `${ordinalEn(count)} flight`,
    milestone: (count) => `${ordinalEn(count)} flight`,
    time: { recorded: "Times as recorded", historical_schedule: "Times from the schedule in force", estimated: "No times recorded; flight time estimated from distance" },
    previous: "Previous flight",
    next: "Next flight",
    with: "Together",
    sky: {
      sunrise: (after, left) => `Sunrise ${after} after take-off, off the ${left ? "left" : "right"} side`,
      sunset: (after, left) => `Sunset ${after} after take-off, off the ${left ? "left" : "right"} side`,
      night: "Dark all the way",
      minutes: (count) => `${count} min`,
    },
  },
  pair: {
    title: (name) => `Me & ${name}`,
    with: (name) => `With ${name}`,
    hero: (name, count) => `${plural(count, "1 flight", `${count} flights`)} with ${name}`,
    yearHero: (year, name, count) => `${plural(count, "1 flight", `${count} flights`)} with ${name} in ${year}`,
    none: (name) => `No flights logged by both you and ${name} yet`,
    noneLead: "A flight shows up here once both of you have it in your own accounts.",
    yearNone: (year) => `No flights together in ${year}`,
    first: (date) => `First flew together on ${date}`,
    route: (a, b, count) => `${a}–${b} together most often, ${plural(count, "once", `${count} times`)}`,
    cities: (count) => `${plural(count, "1 city", `${count} cities`)} together`,
    farthest: (km) => `The longest flight together was ${km} km`,
    ahead: (common, mine) => `Of the ${common} cities you have both been to, you got to ${mine === "0" ? "none" : mine} first`,
    aheadDetail: (name, places) => `${name} was first to ${places}`,
    apart: (mine, name, theirs) => theirs === "0" ? `${plural(mine, "1 city", `${mine} cities`)} only you have been to`
      : mine === "0" ? `${plural(theirs, "1 city", `${theirs} cities`)} only ${name} has been to`
      : `${plural(mine, "1 city", `${mine} cities`)} only you have been to; ${theirs} only ${name}`,
    apartDetail: (places, name) => `Only ${name ?? "you"}: ${places}`,
    trips: "Trips together",
    tripShare: (shared, total) => `${shared} of ${total} flights together`,
    view: "On the globe",
    together: "Together",
    everything: "All routes",
    me: "Me",
    sharing: "Sharing",
    shareAll: (name) => `Let ${name} see all my routes`,
    shareHint: (name) => `When off, ${name} sees only the flights you both logged.`,
    bothShare: (name) => `${name} shares theirs too, so you can lay both maps over each other.`,
    theyShare: (name) => `${name} shares theirs; turn yours on to lay both maps over each other.`,
    theyKeep: (name) => `${name} keeps theirs private. Both need to share to see each other's routes.`,
    unlink: (name) => `Unlink from ${name}`,
    unlinkConfirm: "Press again to unlink",
    unlinkHint: "Unlinking leaves both of your flights as they are.",
    notFound: "No such link",
    notFoundLead: "It may have been removed, or this address belongs to another account.",
    sample: "Sample data: a page for two",
  },
  meta: { years: (year) => String(year), trip: "Trip", flight: "Flight" },
  map: { flights: (count) => plural(count, "1 flight", `${count} flights`), route: (count) => plural(count, "the only flight on this route", `${count} flights on this route`) },
};

export const ui: Record<Locale, Copy> = { "zh-Hans": hans, "zh-Hant": hant, en };

const intlLocale = (locale: Locale) => locale === "en" ? "en-GB" : locale === "zh-Hant" ? "zh-HK" : "zh-CN";
const numberFormats = new Map<string, Intl.NumberFormat>();
export function formatNumber(value: number, locale: Locale, digits = 0) {
  const key = `${locale}${digits}`;
  let format = numberFormats.get(key);
  if (!format) { format = new Intl.NumberFormat(locale === "en" ? "en-US" : intlLocale(locale), { maximumFractionDigits: digits, minimumFractionDigits: digits }); numberFormats.set(key, format); }
  return format.format(value);
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

// Dates are spelled out here, not by Intl.DateTimeFormat: the server's and the
// browser's ICU data can disagree, and the first render must match exactly.
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];

export function formatDate(date: string, locale: Locale) {
  const [year, month, day] = parts(date);
  return locale === "en" ? `${day} ${MONTHS_LONG_EN[month - 1]} ${year}` : `${year}年${month}月${day}日`;
}

export function formatMonth(date: string, locale: Locale) {
  const [year, month] = parts(date);
  return locale === "en" ? `${MONTHS_LONG_EN[month - 1]} ${year}` : `${year}年${month}月`;
}

const WEEKDAYS: Record<Locale, string[]> = {
  "zh-Hans": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  "zh-Hant": ["週日", "週一", "週二", "週三", "週四", "週五", "週六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Trip dates read like "8月26日 – 30日" / "26 – 30 Aug"; the year comes from the section.
export function formatDayRange(start: string, end: string, locale: Locale) {
  const [, sm, sd] = start.split("-").map(Number), [, em, ed] = end.split("-").map(Number);
  if (locale === "en") {
    if (start === end) return `${sd} ${MONTHS_EN[sm - 1]}`;
    return sm === em ? `${sd}–${ed} ${MONTHS_EN[sm - 1]}` : `${sd} ${MONTHS_EN[sm - 1]} – ${ed} ${MONTHS_EN[em - 1]}`;
  }
  const day = (m: number, d: number) => `${m}月${d}日`;
  if (start === end) return day(sm, sd);
  return sm === em && start.slice(0, 4) === end.slice(0, 4) ? `${day(sm, sd)} – ${ed}日` : `${day(sm, sd)} – ${day(em, ed)}`;
}

export function formatDay(date: string, locale: Locale) {
  const [year, month, day] = date.split("-").map(Number);
  return locale === "en" ? `${day} ${MONTHS_EN[month - 1]} ${year}` : `${year}年${month}月${day}日`;
}

export function formatLegDate(date: string, locale: Locale) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[locale][utc(date).getUTCDay()];
  return locale === "en" ? `${weekday} ${day} ${MONTHS_EN[month - 1]} ${year}` : `${year}年${month}月${day}日 ${weekday}`;
}

export function formatTripRange(start: string, end: string, locale: Locale) {
  const [sy] = start.split("-");
  const [ey] = end.split("-");
  const range = formatDayRange(start, end, locale);
  if (locale === "en") return sy === ey ? `${range} ${sy}` : `${formatDayRange(start, start, locale)} ${sy} – ${formatDayRange(end, end, locale)} ${ey}`;
  return sy === ey ? `${sy}年${range}` : `${sy}年${formatDayRange(start, start, locale)} – ${ey}年${formatDayRange(end, end, locale)}`;
}

export function formatDuration(minutes: number, locale: Locale) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (locale === "en") return !hours ? `${rest}m` : rest ? `${hours}h ${rest}m` : `${hours}h`;
  const [h, m] = locale === "zh-Hant" ? ["小時", "分"] : ["小时", "分"];
  if (!hours) return locale === "zh-Hant" ? `${rest} 分鐘` : `${rest} 分钟`;
  return rest ? `${hours} ${h} ${rest} ${m}` : `${hours} ${h}`;
}

// Sunrise and sunset on the way, with the window to watch from; a flight in
// the dark from end to end says so.
export function describeSky(sky: Sky, locale: Locale) {
  const text = ui[locale].flight.sky;
  const after = (minute: number) => minute < 60 ? text.minutes(minute) : formatDuration(minute, locale);
  const lines = sky.events.map((event, index) => {
    const line = text[event.kind](after(event.minute), event.side === "left");
    return index && locale === "en" ? line[0].toLowerCase() + line.slice(1) : line;
  });
  if (lines.length) return lines.join(locale === "en" ? "; " : "；");
  return sky.light.every((point) => point.degrees < 0) ? text.night : null;
}

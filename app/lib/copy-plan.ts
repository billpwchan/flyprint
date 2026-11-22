import type { Locale } from "./i18n";
import { closedUp, formatDuration, ordinalEn } from "./copy";
import type { Countdown } from "./plan";

// Words for flights still ahead: what comes next, how long until, and what it will be the first of.

type Event = "sunrise" | "sunset";
type Side = "left" | "right";

const hans = {
  next: "下一程",
  togetherNext: "下次一起飞",
  meetNext: "下次见面",
  meet: (when: string, city: string) => `${when}在${city}会合`,
  you: "你",
  lands: (time: string) => `${time} 到`,
  ahead: "即将出行",
  underway: "进行中",
  legs: (count: string) => `${count} 程`,
  more: (count: string) => `之后还有 ${count} 程`,
  booked: (count: string) => `另有 ${count} 程即将出行`,
  days: (count: number) => `还有 ${count} 天`,
  daysShort: (count: number) => `${count} 天后`,
  tomorrow: (time: string) => time ? `明天 ${time} 起飞` : "明天",
  today: (time: string) => time ? `今天 ${time} 起飞` : "今天",
  tomorrowShort: "明天",
  todayShort: "今天",
  inTime: (duration: string) => `还有 ${duration}`,
  airborne: "飞行中",
  landsIn: (duration: string) => `${duration}后落地`,
  landed: "已落地",
  firstCountry: (name: string) => `第一次去${name}`,
  firstCity: (name: string) => `第一次去${name}`,
  firstAirline: (name: string) => `第一次坐${name}`,
  firstType: (name: string) => `第一次坐 ${name}`,
  farthest: "最远的一程",
  ordinal: (count: string) => `将是第 ${count} 次飞行`,
  route: (count: string) => count === "0" ? "第一次飞这条航线" : `之前飞过 ${count} 次`,
  firstVisit: (date: string) => `将在${date}第一次到访。`,
  tripsHere: "去这里的旅程",
  nextVisit: (date: string) => `下次到访是${date}。`,
  event: { sunrise: "日出", sunset: "日落" } as Record<Event, string>,
  side: { left: "左侧", right: "右侧" } as Record<Side, string>,
  seatPick: (letter: string) => `选 ${letter} 座靠窗可以看到`,
  typeLater: "机型待定",
  seatYours: (seat: string, side: string, event: string, match: boolean) => match ? `你的 ${seat} 在${side}，看得到${event}` : `你的 ${seat} 在${side}，${event}在另一侧`,
  estimated: "位置按时刻表估算",
  noneYet: "第一程还没出发",
  noneYetLead: "飞完之后，这里会开始记下你飞过的地方。",
};

type PlanCopy = typeof hans;

const hant: PlanCopy = {
  next: "下一程",
  togetherNext: "下次一起飛",
  meetNext: "下次見面",
  meet: (when, city) => `${when}在${city}會合`,
  you: "你",
  lands: (time) => `${time} 到`,
  ahead: "即將出行",
  underway: "進行中",
  legs: (count) => `${count} 程`,
  more: (count) => `之後還有 ${count} 程`,
  booked: (count) => `另有 ${count} 程即將出行`,
  days: (count) => `還有 ${count} 天`,
  daysShort: (count) => `${count} 天後`,
  tomorrow: (time) => time ? `明天 ${time} 起飛` : "明天",
  today: (time) => time ? `今天 ${time} 起飛` : "今天",
  tomorrowShort: "明天",
  todayShort: "今天",
  inTime: (duration) => `還有 ${duration}`,
  airborne: "飛行中",
  landsIn: (duration) => `${duration}後降落`,
  landed: "已降落",
  firstCountry: (name) => `第一次去${name}`,
  firstCity: (name) => `第一次去${name}`,
  firstAirline: (name) => `第一次搭${name}`,
  firstType: (name) => `第一次搭 ${name}`,
  farthest: "最遠的一程",
  ordinal: (count) => `將是第 ${count} 次飛行`,
  route: (count) => count === "0" ? "第一次飛這條航線" : `之前飛過 ${count} 次`,
  firstVisit: (date) => `將在${date}第一次到訪。`,
  tripsHere: "去這裡的旅程",
  nextVisit: (date) => `下次到訪是${date}。`,
  event: { sunrise: "日出", sunset: "日落" },
  side: { left: "左側", right: "右側" },
  seatPick: (letter) => `選 ${letter} 座靠窗可以看到`,
  typeLater: "機型待定",
  seatYours: (seat, side, event, match) => match ? `你的 ${seat} 在${side}，看得到${event}` : `你的 ${seat} 在${side}，${event}在另一側`,
  estimated: "位置按時刻表估算",
  noneYet: "第一程還未出發",
  noneYetLead: "飛完之後，這裡會開始記下你飛過的地方。",
};

const en: PlanCopy = {
  next: "Next flight",
  togetherNext: "Next flight together",
  meetNext: "Next time together",
  meet: (when, city) => `Together in ${city} ${when}`,
  you: "You",
  lands: (time) => `lands ${time}`,
  ahead: "Upcoming",
  underway: "Under way",
  legs: (count) => count === "1" ? "1 flight" : `${count} flights`,
  more: (count) => `${count} more booked`,
  booked: (count) => `${count} booked`,
  days: (count) => `In ${count} days`,
  daysShort: (count) => `in ${count} days`,
  tomorrow: (time) => time ? `Tomorrow, departs ${time}` : "Tomorrow",
  today: (time) => time ? `Today, departs ${time}` : "Today",
  tomorrowShort: "tomorrow",
  todayShort: "today",
  inTime: (duration) => `in ${duration}`,
  airborne: "In the air",
  landsIn: (duration) => `lands in ${duration}`,
  landed: "Landed",
  firstCountry: (name) => `First time in ${name}`,
  firstCity: (name) => `First time in ${name}`,
  firstAirline: (name) => `First flight with ${name}`,
  firstType: (name) => `First time on the ${name}`,
  farthest: "Longest flight yet",
  ordinal: (count) => `Will be your ${ordinalEn(count)} flight`,
  route: (count) => count === "0" ? "First time on this route" : count === "1" ? "Flown once before" : `Flown ${count} times before`,
  firstVisit: (date) => `First visit on ${date}.`,
  tripsHere: "Trips here",
  nextVisit: (date) => `Next visit on ${date}.`,
  event: { sunrise: "the sunrise", sunset: "the sunset" },
  side: { left: "the left", right: "the right" },
  seatPick: (letter) => `A window seat at ${letter} will see it`,
  typeLater: "Aircraft not yet assigned",
  seatYours: (seat, side, event, match) => match ? `Seat ${seat} is on ${side}, facing ${event}` : `Seat ${seat} is on ${side}; ${event} is on the other side`,
  estimated: "Position estimated from the schedule",
  noneYet: "Your first flight is still ahead",
  noneYetLead: "Once it lands, this is where the places you have flown begin to add up.",
};

export const planUi: Record<Locale, PlanCopy> = { "zh-Hans": closedUp(hans), "zh-Hant": closedUp(hant), en };

// The countdown as the line under "Next flight": in the air, it says when it lands.
export function countdownHeadline(countdown: Countdown, depart: string, locale: Locale) {
  if (countdown.kind !== "airborne") return countdownText(countdown, depart, locale);
  const line = planUi[locale].landsIn(formatDuration(countdown.minutes, locale));
  return line[0].toUpperCase() + line.slice(1);
}

// The countdown as a phrase: the long form under a heading, the short one beside a row.
export function countdownText(countdown: Countdown, depart: string, locale: Locale, short = false) {
  const text = planUi[locale];
  switch (countdown.kind) {
    case "days": return short ? text.daysShort(countdown.days) : text.days(countdown.days);
    case "tomorrow": return short ? text.tomorrowShort : text.tomorrow(depart);
    case "today": {
      if (short || countdown.minutes === null) return short ? text.todayShort : text.today(depart);
      return `${text.today(depart)} · ${text.inTime(formatDuration(Math.max(1, countdown.minutes), locale))}`;
    }
    case "airborne": return short ? text.airborne : `${text.airborne} · ${text.landsIn(formatDuration(countdown.minutes, locale))}`;
    case "landed": return text.landed;
  }
}

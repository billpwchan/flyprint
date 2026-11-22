import { closedUp } from "./copy";
import type { Locale } from "./i18n";

// Words for the parts of the site people meet before or outside an account:
// the first visit, someone's public page, sharing your own, the legal pages
// and getting back into an account.
export type PublicCopy = {
  // meta: how the site describes itself in link previews and search results.
  intro: { line: string; meta: string; start: string; signIn: string; sample: string; samplePair: string };
  shared: {
    title: (name: string) => string;
    description: (flights: string, km: string, countries: string) => string;
    yours: string;
    own: string;
    mine: string;
    edit: string;
    missing: string;
    missingLead: string;
    home: string;
  };
  share: {
    title: string;
    lead: string;
    on: string;
    working: string;
    copy: string;
    copied: string;
    send: string;
    open: string;
    off: string;
    offConfirm: string;
    offHint: string;
    entry: string;
  };
  // agree: the sign-up line, in parts: before, the terms, between, the privacy policy, after;
  // agreeImport: the same for a visitor's first import, which starts a trial.
  legal: { privacy: string; terms: string; agree: [string, string, string, string, string]; agreeImport: [string, string, string, string, string] };
  lost: { title: string; lead: string; home: string };
  reset: {
    forgot: string;
    title: string;
    lead: string;
    send: string;
    sent: (email: string) => string;
    newTitle: string;
    newLead: string;
    save: string;
    done: string;
    expired: string;
    subject: string;
    mail: (link: string) => string;
  };
};

const hans: PublicCopy = {
  intro: {
    line: "把飞过的每一班航班放到一个地球上。导入航旅纵横截图、行程单或 Flighty 的导出，一分钟出图。",
    meta: "把飞过的每一班航班放到一个地球上：飞了多远、去过哪里、和谁一起飞。",
    start: "开始记录",
    signIn: "登录",
    sample: "下面是示例旅客 Lin 的地图",
    samplePair: "和 Theo 的同飞页",
  },
  shared: closedUp({
    title: (name: string) => `${name} 的飞行地图`,
    description: (flights: string, km: string, countries: string) => `${flights} 次飞行，${km} 公里，${countries} 个国家和地区。`,
    yours: "这是你的公开主页",
    own: "记录你自己的航班",
    mine: "回到我的地图",
    edit: "分享设置",
    missing: "这个公开主页已关闭",
    missingLead: "主人停止了分享，或者链接打错了。",
    home: "看看航迹",
  }),
  share: {
    title: "公开主页",
    lead: "打开后，拿到链接的人能看到你飞过的航线、由它们连成的旅程和去过的城市，以及统计。座位、和谁一起飞、还没飞的行程都不会公开；刚飞的航班落地 3 天后才出现，不会暴露你此刻在哪里。",
    on: "生成公开链接",
    working: "正在生成…",
    copy: "复制链接",
    copied: "已复制",
    send: "分享",
    open: "打开",
    off: "停止公开",
    offConfirm: "再点一次停止",
    offHint: "停止后这个链接失效，再打开会是一个新链接。",
    entry: "分享我的地图",
  },
  legal: {
    privacy: "隐私政策",
    terms: "使用条款",
    agree: ["注册即表示你同意", "使用条款", "和", "隐私政策", "。"],
    agreeImport: ["开始读取即表示你同意", "使用条款", "和", "隐私政策", "。"],
  },
  lost: { title: "这里没有页面", lead: "链接可能打错了，或者这页已经移走。", home: "回到地图" },
  reset: {
    forgot: "忘记密码？",
    title: "重设密码",
    lead: "输入注册用的邮箱，我们会发一个重设链接过去。",
    send: "发送链接",
    sent: (email) => `如果 ${email} 注册过，重设链接已经发出，1 小时内有效。`,
    newTitle: "设一个新密码",
    newLead: "设好后，其他设备上的登录会退出。",
    save: "保存并登录",
    done: "密码已更新",
    expired: "这个链接已失效，请重新申请。",
    subject: "重设你的航迹密码",
    mail: (link) => `有人（希望是你）申请重设航迹密码。\n\n打开这个链接设一个新密码，1 小时内有效：\n${link}\n\n如果不是你申请的，忽略这封邮件就好，密码不会变。`,
  },
};

const hant: PublicCopy = {
  intro: {
    line: "把飛過的每一班航班放到一個地球上。匯入航旅縱橫截圖、行程單或 Flighty 的匯出，一分鐘出圖。",
    meta: "把飛過的每一班航班放到一個地球上：飛了多遠、去過哪裡、和誰一起飛。",
    start: "開始記錄",
    signIn: "登入",
    sample: "下面是示例旅客 Lin 的地圖",
    samplePair: "和 Theo 的同飛頁",
  },
  shared: closedUp({
    title: (name: string) => `${name} 的飛行地圖`,
    description: (flights: string, km: string, countries: string) => `${flights} 次飛行，${km} 公里，${countries} 個國家和地區。`,
    yours: "這是你的公開主頁",
    own: "記錄你自己的航班",
    mine: "回到我的地圖",
    edit: "分享設定",
    missing: "這個公開主頁已關閉",
    missingLead: "主人停止了分享，或者連結打錯了。",
    home: "看看航跡",
  }),
  share: {
    title: "公開主頁",
    lead: "開啟後，拿到連結的人能看到你飛過的航線、由它們連成的旅程和去過的城市，以及統計。座位、和誰一起飛、還沒飛的行程都不會公開；剛飛的航班落地 3 天後才出現，不會暴露你此刻在哪裡。",
    on: "產生公開連結",
    working: "正在產生…",
    copy: "複製連結",
    copied: "已複製",
    send: "分享",
    open: "打開",
    off: "停止公開",
    offConfirm: "再按一次停止",
    offHint: "停止後這個連結失效，再開啟會是一個新連結。",
    entry: "分享我的地圖",
  },
  legal: {
    privacy: "私隱政策",
    terms: "使用條款",
    agree: ["註冊即表示你同意", "使用條款", "和", "私隱政策", "。"],
    agreeImport: ["開始讀取即表示你同意", "使用條款", "和", "私隱政策", "。"],
  },
  lost: { title: "這裡沒有頁面", lead: "連結可能打錯了，或者這頁已經移走。", home: "回到地圖" },
  reset: {
    forgot: "忘記密碼？",
    title: "重設密碼",
    lead: "輸入註冊用的電郵，我們會寄一個重設連結過去。",
    send: "寄出連結",
    sent: (email) => `如果 ${email} 註冊過，重設連結已經寄出，1 小時內有效。`,
    newTitle: "設一個新密碼",
    newLead: "設好後，其他裝置上的登入會登出。",
    save: "儲存並登入",
    done: "密碼已更新",
    expired: "這個連結已失效，請重新申請。",
    subject: "重設你的航跡密碼",
    mail: (link) => `有人（希望是你）申請重設航跡密碼。\n\n打開這個連結設一個新密碼，1 小時內有效：\n${link}\n\n如果不是你申請的，忽略這封電郵就好，密碼不會變。`,
  },
};

const plural = (count: string, one: string, many: string) => count === "1" ? one : many;

const en: PublicCopy = {
  intro: {
    line: "Every flight you've taken, on one globe. Bring screenshots, e-tickets or a Flighty export and see your map in a minute.",
    meta: "Every flight you've taken, on one globe: how far, where, and with whom.",
    start: "Start your map",
    signIn: "Sign in",
    sample: "Below: the map of a sample traveller, Lin",
    samplePair: "Lin and Theo's page",
  },
  shared: {
    title: (name) => `${name}'s flights`,
    description: (flights, km, countries) => `${plural(flights, "1 flight", `${flights} flights`)}, ${km} km, ${plural(countries, "1 country or region", `${countries} countries and regions`)}.`,
    yours: "This is your public page",
    own: "Map your own flights",
    mine: "Back to my map",
    edit: "Sharing settings",
    missing: "This page is no longer shared",
    missingLead: "Its owner stopped sharing it, or the link is mistyped.",
    home: "See Flyprint",
  },
  share: {
    title: "Public page",
    lead: "Anyone with the link can see the routes you've flown, the trips and cities they make up, and what they add up to. Seats, who you flew with and flights still ahead stay private, and a new flight appears only 3 days after it lands, so the page never shows where you are right now.",
    on: "Create a public link",
    working: "Creating…",
    copy: "Copy link",
    copied: "Copied",
    send: "Share",
    open: "Open",
    off: "Stop sharing",
    offConfirm: "Press again to stop",
    offHint: "The link stops working. Sharing again makes a new one.",
    entry: "Share my map",
  },
  legal: {
    privacy: "Privacy",
    terms: "Terms",
    agree: ["By signing up you agree to the ", "terms", " and the ", "privacy policy", "."],
    agreeImport: ["By starting you agree to the ", "terms", " and the ", "privacy policy", "."],
  },
  lost: { title: "Nothing here", lead: "The link may be mistyped, or the page has moved.", home: "Back to the map" },
  reset: {
    forgot: "Forgot password?",
    title: "Reset your password",
    lead: "Enter the email you signed up with and we'll send a link to set a new one.",
    send: "Send link",
    sent: (email) => `If ${email} has an account, a reset link is on its way. It works for an hour.`,
    newTitle: "Choose a new password",
    newLead: "Other devices will be signed out.",
    save: "Save and sign in",
    done: "Password updated",
    expired: "This link has expired. Ask for a new one.",
    subject: "Reset your Flyprint password",
    mail: (link) => `Someone (hopefully you) asked to reset your Flyprint password.\n\nOpen this link within an hour to choose a new one:\n${link}\n\nIf it wasn't you, ignore this email and your password stays the same.`,
  },
};

export const publicUi: Record<Locale, PublicCopy> = { "zh-Hans": hans, "zh-Hant": hant, en };

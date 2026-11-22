import type { Locale } from "./i18n";

// The privacy policy and the terms, in plain words. They describe what the
// code does; a change to what is kept or sent changes them too.
export type LegalDoc = { title: string; updated: string; sections: { heading: string; body: string[] }[] };
type Legal = { privacy: LegalDoc; terms: LegalDoc; contact: (address: string) => string; other: { privacy: string; terms: string } };

const UPDATED = { hans: "2026 年 11 月 21 日更新", hant: "2026 年 11 月 21 日更新", en: "Updated 21 November 2026" };

const hans: Legal = {
  privacy: {
    title: "隐私政策",
    updated: UPDATED.hans,
    sections: [
      { heading: "我们保存什么", body: [
        "账户：邮箱、你填的名字、航线颜色，以及密码的加盐散列（我们看不到密码本身）。",
        "试用：不注册就导入时，航班存在一个没有邮箱和密码的试用账户里，7 天内注册或登录就留下，否则连同导入记录一起删除；结束试用会立即删除。",
        "航班：你导入或填写的日期、航班号、航空公司、航线、起降时间、座位、舱位和机型，以及每次导入的记录。",
        "关系：你和谁联动、各自选择的共享范围，以及公开主页是否打开。",
      ] },
      { heading: "导入时发生什么", body: [
        "上传的文件只在内存里读取，读完即丢弃，不保存原件。",
        "截图、PDF 和无法直接解析的内容会发送给 Anthropic 的 Claude 识别航班，按 Anthropic 的商业服务条款处理。Flighty 等 App 的导出、表格、登机牌、日历和条码在我们的服务器上解析；其中本站还不认识的机场和航司，只把它们的代码（机场连同本站机场表里的英文城市、机场和国家名）交给 Claude 取三种语言的名字，不带日期、航班号或你是谁。",
        "识别结果先作为草稿给你核对，你确认后才保存；放弃导入时草稿一并删除。",
      ] },
      { heading: "谁能看到你的航班", body: [
        "默认只有你自己。",
        "联动后，对方能看到你们两人都记了的航班；只有双方都选择“全部航线”，才互相看到各自的其他航线。对方永远看不到你的座位和舱位。任一方可以随时解除。",
        "公开主页需要你自己打开。打开后，拿到链接的人能看到你已经飞过的航线、由它们连成的旅程和城市、当地起降时刻和统计，看不到座位、舱位、和谁同飞和飞机注册号，也看不到还没飞的行程；航班落地 3 天后才出现在公开主页上。关闭后旧链接立即失效。",
      ] },
      { heading: "第三方", body: [
        "机型照片由你的浏览器直接从 Planespotters 加载，对方会看到你的 IP 和所查的飞机注册号。",
        "航班和停留的天气由本站的服务器向 Open-Meteo 查询（数据以 CC BY 4.0 授权），只发出机场的位置和日期，不带你的 IP、账户或航班。",
        "城市的卫星影像由本站的服务器向 EOX 取 Sentinel-2 cloudless 2024 拼成（含经修改的 Copernicus Sentinel 2024 数据，CC BY-NC-SA 4.0），城市中心的位置向 Open-Meteo 的地名库查询；每座城市只取一次、存在本站，只发出城市的名字和位置，不带你的 IP、账户或航班。地球的昼夜照片是 NASA 的 Blue Marble 和 Black Marble（公有领域）。",
        "申请重设密码时，邮件通过 Resend 发送，对方会处理你的邮箱地址和邮件内容。",
        "地图和航空公司标志都由本站提供，字体用你设备自带的，不加载其他第三方脚本。",
      ] },
      { heading: "Cookie", body: [
        "必要的三个：登录会话、界面语言、你的时区（用来按你的日历计算到下一班的天数）。另有一个只在你点了带来源标记的链接（地址里有 ref=）进来时才出现：它记下来源的名字，30 天后过期；本站只按来源累计每天的访问、试用和注册人数，不和你的账户关联。没有广告或跨站追踪。",
      ] },
      { heading: "存放和保留", body: [
        "数据存放在 AWS 东京区域的服务器上，传输全程加密。",
        "数据库每天备份一次，保留 7 天。删除账户会立即删除你的航班、导入、会话和联动；备份里的副本最迟 7 天后随备份轮换消失。",
      ] },
      { heading: "你可以做什么", body: [
        "在账户设置里随时导出全部航班、修改资料、改密码、关闭公开主页或删除账户。",
      ] },
    ],
  },
  terms: {
    title: "使用条款",
    updated: UPDATED.hans,
    sections: [
      { heading: "服务", body: ["航迹帮你记录、查看和分享自己飞过的航班。目前免费提供。"] },
      { heading: "账户", body: ["请用你能收信的邮箱注册，保管好密码。账户下发生的操作由你负责。"] },
      { heading: "你的内容", body: [
        "你导入的航班归你所有。我们只为向你提供服务而保存和处理它们。",
        "请只导入你有权使用的信息；替别人导入行程前先征得对方同意。",
      ] },
      { heading: "分享", body: ["打开公开主页或联动，即表示你同意对应的人看到隐私政策里写明的那部分内容。"] },
      { heading: "合理使用", body: ["不要攻击、批量抓取、滥用或干扰本服务，也不要用它冒充他人。违反的账户可能被暂停或删除。"] },
      { heading: "准确性", body: ["自动识别、机型、距离和时间都可能有误，请自行核对。本服务不用于航空安全、出行凭证或法律用途。"] },
      { heading: "商标", body: ["航空公司名称和标志属于各自的所有者，这里只用来标明你乘坐的航空公司，不代表任何合作或认可。"] },
      { heading: "变更和终止", body: [
        "服务可能调整或停止。影响你数据的重大变更会提前在网站上告知，并保证你能先导出数据。",
        "你可以随时删除账户。",
      ] },
      { heading: "责任", body: ["服务按现状提供。在法律允许的范围内，我们不对因使用或无法使用本服务造成的间接损失负责。"] },
    ],
  },
  contact: (address) => `有任何问题，写信到 ${address}。`,
  other: { privacy: "隐私政策", terms: "使用条款" },
};

const hant: Legal = {
  privacy: {
    title: "私隱政策",
    updated: UPDATED.hant,
    sections: [
      { heading: "我們保存甚麼", body: [
        "帳戶：電郵、你填的名字、航線顏色，以及密碼的加鹽雜湊（我們看不到密碼本身）。",
        "試用：不註冊就匯入時，航班存在一個沒有電郵和密碼的試用帳戶裡，7 天內註冊或登入就留下，否則連同匯入記錄一起刪除；結束試用會立即刪除。",
        "航班：你匯入或填寫的日期、航班號、航空公司、航線、起降時間、座位、艙等和機型，以及每次匯入的記錄。",
        "關係：你和誰聯動、各自選擇的共享範圍，以及公開主頁是否開啟。",
      ] },
      { heading: "匯入時發生甚麼", body: [
        "上載的檔案只在記憶體裡讀取，讀完即丟棄，不保存原件。",
        "截圖、PDF 和無法直接解析的內容會傳送給 Anthropic 的 Claude 識別航班，按 Anthropic 的商業服務條款處理。Flighty 等 App 的匯出、表格、登機證、日曆和條碼在我們的伺服器上解析；其中本站還不認識的機場和航空公司，只把它們的代碼（機場連同本站機場表裡的英文城市、機場和國家名）交給 Claude 取三種語言的名稱，不帶日期、航班號或你是誰。",
        "識別結果先作為草稿給你核對，你確認後才保存；放棄匯入時草稿一併刪除。",
      ] },
      { heading: "誰能看到你的航班", body: [
        "預設只有你自己。",
        "聯動後，對方能看到你們兩人都記了的航班；只有雙方都選擇「全部航線」，才互相看到各自的其他航線。對方永遠看不到你的座位和艙等。任一方可以隨時解除。",
        "公開主頁需要你自己開啟。開啟後，拿到連結的人能看到你已經飛過的航線、由它們連成的旅程和城市、當地起降時刻和統計，看不到座位、艙等、和誰同飛和飛機註冊編號，也看不到還沒飛的行程；航班落地 3 天後才出現在公開主頁上。關閉後舊連結立即失效。",
      ] },
      { heading: "第三方", body: [
        "機型照片由你的瀏覽器直接從 Planespotters 載入，對方會看到你的 IP 和所查的飛機註冊編號。",
        "航班和停留的天氣由本站的伺服器向 Open-Meteo 查詢（資料以 CC BY 4.0 授權），只送出機場的位置和日期，不帶你的 IP、帳戶或航班。",
        "城市的衛星影像由本站的伺服器向 EOX 取 Sentinel-2 cloudless 2024 拼成（含經修改的 Copernicus Sentinel 2024 資料，CC BY-NC-SA 4.0），城市中心的位置向 Open-Meteo 的地名庫查詢；每座城市只取一次、存在本站，只送出城市的名字和位置，不帶你的 IP、帳戶或航班。地球的晝夜照片是 NASA 的 Blue Marble 和 Black Marble（公有領域）。",
        "申請重設密碼時，郵件透過 Resend 發送，對方會處理你的電郵地址和郵件內容。",
        "地圖和航空公司標誌都由本站提供，字體用你裝置內建的，不載入其他第三方腳本。",
      ] },
      { heading: "Cookie", body: [
        "必要的三個：登入工作階段、介面語言、你的時區（用來按你的日曆計算到下一班的天數）。另有一個只在你點了帶來源標記的連結（網址裡有 ref=）進來時才出現：它記下來源的名稱，30 天後過期；本站只按來源累計每天的瀏覽、試用和註冊人數，不和你的帳戶關聯。沒有廣告或跨站追蹤。",
      ] },
      { heading: "存放和保留", body: [
        "資料存放在 AWS 東京區域的伺服器上，傳輸全程加密。",
        "資料庫每天備份一次，保留 7 天。刪除帳戶會立即刪除你的航班、匯入、工作階段和聯動；備份裡的副本最遲 7 天後隨備份輪換消失。",
      ] },
      { heading: "你可以做甚麼", body: [
        "在帳戶設定裡隨時匯出全部航班、修改資料、改密碼、關閉公開主頁或刪除帳戶。",
      ] },
    ],
  },
  terms: {
    title: "使用條款",
    updated: UPDATED.hant,
    sections: [
      { heading: "服務", body: ["航跡幫你記錄、查看和分享自己飛過的航班。目前免費提供。"] },
      { heading: "帳戶", body: ["請用你能收信的電郵註冊，保管好密碼。帳戶下發生的操作由你負責。"] },
      { heading: "你的內容", body: [
        "你匯入的航班歸你所有。我們只為向你提供服務而保存和處理它們。",
        "請只匯入你有權使用的資料；替別人匯入行程前先徵得對方同意。",
      ] },
      { heading: "分享", body: ["開啟公開主頁或聯動，即表示你同意對應的人看到私隱政策裡寫明的那部分內容。"] },
      { heading: "合理使用", body: ["不要攻擊、批量抓取、濫用或干擾本服務，也不要用它冒充他人。違反的帳戶可能被暫停或刪除。"] },
      { heading: "準確性", body: ["自動識別、機型、距離和時間都可能有誤，請自行核對。本服務不用於航空安全、出行憑證或法律用途。"] },
      { heading: "商標", body: ["航空公司名稱和標誌屬於各自的擁有者，這裡只用來標明你乘坐的航空公司，不代表任何合作或認可。"] },
      { heading: "變更和終止", body: [
        "服務可能調整或停止。影響你資料的重大變更會提前在網站上告知，並保證你能先匯出資料。",
        "你可以隨時刪除帳戶。",
      ] },
      { heading: "責任", body: ["服務按現狀提供。在法律允許的範圍內，我們不對因使用或無法使用本服務造成的間接損失負責。"] },
    ],
  },
  contact: (address) => `有任何問題，寫信到 ${address}。`,
  other: { privacy: "私隱政策", terms: "使用條款" },
};

const en: Legal = {
  privacy: {
    title: "Privacy policy",
    updated: UPDATED.en,
    sections: [
      { heading: "What we keep", body: [
        "Your account: email, the name you give, your route colour, and a salted hash of your password (never the password itself).",
        "A trial: if you import without signing up, your flights sit in a trial account with no email or password. Sign up or sign in within 7 days and they stay; otherwise they are deleted with their import records. Ending the trial deletes them at once.",
        "Your flights: the dates, flight numbers, airlines, routes, times, seats, cabins and aircraft you import or enter, and a record of each import.",
        "Your connections: who you are linked with, what each of you chose to share, and whether your public page is on.",
      ] },
      { heading: "What happens when you import", body: [
        "Uploaded files are read in memory and then dropped; the originals are never stored.",
        "Screenshots, PDFs and anything that can't be parsed directly are sent to Anthropic's Claude to read the flights, under Anthropic's commercial terms. Exports from apps like Flighty, spreadsheets, boarding passes, calendars and barcodes are parsed on our server; for airports and airlines the site doesn't know yet, only their codes (for an airport, with the English city, airport and country names from the site's own airport table) go to Claude for their names in three languages, with no dates, flight numbers or anything about you.",
        "What was read comes back as a draft for you to check, and is saved only when you confirm. Discarding an import deletes the draft.",
      ] },
      { heading: "Who can see your flights", body: [
        "Only you, by default.",
        "Once you link with someone, they see the flights you both logged; only when both of you choose to share all routes do you see each other's other routes. They never see your seats or cabins. Either of you can unlink at any time.",
        "Your public page is off until you turn it on. Then anyone with the link sees the routes you've flown, the trips and cities they make up, their local take-off and landing times and their totals, but not seats, cabins, who you flew with, aircraft registrations or flights still ahead; a flight appears there only 3 days after it lands. Turning it off retires the link at once.",
      ] },
      { heading: "Other services", body: [
        "Aircraft photos load in your browser straight from Planespotters, which sees your IP address and the registration looked up.",
        "Weather for flights and stays is asked of Open-Meteo by this site's server (data under CC BY 4.0), sending only an airport's position and the dates, never your IP address, account or flights.",
        "City imagery is put together by this site's server from EOX's Sentinel-2 cloudless 2024 (contains modified Copernicus Sentinel data 2024, CC BY-NC-SA 4.0), with each city's centre looked up in Open-Meteo's gazetteer; each city is fetched once and kept here, sending only the city's name and position, never your IP address, account or flights. The Earth by day and night is NASA's Blue Marble and Black Marble (public domain).",
        "If you ask to reset your password, the email is sent through Resend, which handles your address and the message.",
        "The map and airline marks are served by this site, text uses your device's own fonts, and no other third-party scripts load.",
      ] },
      { heading: "Cookies", body: [
        "Three that the site needs: your sign-in session, your language, and your time zone (to count days to your next flight on your own calendar). A fourth appears only if you arrived through a tagged link (one with ref= in it): it holds the name of that source for 30 days, and the site keeps daily totals of visits, trials and sign-ups per source, never tied to your account. No ads or cross-site tracking.",
      ] },
      { heading: "Where it lives and for how long", body: [
        "Data is stored on servers in AWS's Tokyo region and encrypted in transit.",
        "The database is backed up daily and backups are kept for 7 days. Deleting your account removes your flights, imports, sessions and links at once; copies in backups are gone within 7 days as the backups roll over.",
      ] },
      { heading: "What you can do", body: [
        "In account settings you can export all your flights, edit your details, change your password, turn off your public page or delete your account at any time.",
      ] },
    ],
  },
  terms: {
    title: "Terms of use",
    updated: UPDATED.en,
    sections: [
      { heading: "The service", body: ["Flyprint helps you keep, explore and share the flights you've taken. It is free for now."] },
      { heading: "Your account", body: ["Sign up with an email address you can receive mail at, and keep your password safe. You are responsible for what happens under your account."] },
      { heading: "Your content", body: [
        "The flights you import are yours. We keep and process them only to provide the service to you.",
        "Import only information you have the right to use, and ask before importing someone else's trips.",
      ] },
      { heading: "Sharing", body: ["Turning on your public page or linking with someone means you agree to them seeing what the privacy policy describes."] },
      { heading: "Fair use", body: ["Don't attack, scrape, abuse or disrupt the service, or use it to impersonate anyone. Accounts that do may be suspended or removed."] },
      { heading: "Accuracy", body: ["Automatic reading, aircraft types, distances and times can be wrong; check them. The service is not for aviation safety, travel documents or legal purposes."] },
      { heading: "Trademarks", body: ["Airline names and logos belong to their owners. They appear only to show which airline you flew and imply no partnership or endorsement."] },
      { heading: "Changes and ending", body: [
        "The service may change or stop. Major changes that affect your data will be announced on the site in advance, with time to export your data first.",
        "You can delete your account at any time.",
      ] },
      { heading: "Liability", body: ["The service is provided as is. To the extent the law allows, we are not liable for indirect losses from using or being unable to use it."] },
    ],
  },
  contact: (address) => `Questions? Write to ${address}.`,
  other: { privacy: "Privacy policy", terms: "Terms of use" },
};

export const legalUi: Record<Locale, Legal> = { "zh-Hans": hans, "zh-Hant": hant, en };

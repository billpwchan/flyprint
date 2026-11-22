# 飞行档案数据契约

输入是一个 UTF-8 JSON 对象，包含机场字典、航班数组与旅客定义。完整可运行的例子是 `app/data/flights.example.json`，机器可读参考为 [flight-archive.schema.json](flight-archive.schema.json)。运行时还验证 JSON Schema 无法单独表达的机场引用、日历日期、唯一航段与旅客关系。

## 最小完整例子

以下为合成记录，不表示真实航班或执飞安排：

```json
{
  "generatedFrom": "my-importer",
  "travellers": [
    { "id": "B", "label": "B", "accent": "cyan" },
    { "id": "Z", "label": "Z", "accent": "violet" }
  ],
  "airports": {
    "VIE": { "name": "维也纳国际", "code": "VIE", "city": "维也纳", "country": "奥地利", "coordinates": [16.5697, 48.1103] },
    "LIS": { "name": "里斯本", "code": "LIS", "city": "里斯本", "country": "葡萄牙", "coordinates": [-9.1359, 38.7742] }
  },
  "flights": [
    {
      "id": "MY-001", "date": "2025-05-13", "year": 2025,
      "airline": "葡萄牙航空", "flight": "TP-DEMO",
      "origin": "VIE", "destination": "LIS",
      "depart": "08:45", "arrive": "11:20", "arrivalDayOffset": 0,
      "durationMinutes": 215, "timeSource": "recorded", "km": 2297,
      "status": "recorded", "source": "my-importer", "confidence": "confirmed",
      "travellerId": "B", "travellerIds": ["B", "Z"]
    }
  ]
}
```

## 顶层与机场

| 字段 | 规则 |
| --- | --- |
| `generatedFrom` | 可选的来源说明，不放个人路径、身份或票据 |
| `travellers` | 一或两位旅客，ID 为 `B`、`Z`；`label` 非空，`accent` 为 `cyan` 或 `violet` |
| `airports` | 至少两个机场；键为三位大写字母或数字代码，与机场 `code` 一致 |
| `flights` | 航班数组，可以为空；准备后按日期倒序 |
| `reconciliation` | 可选的本地整理统计，不应包含原始身份文件 |

每个机场须有非空的 `name`、`code`、`city`、`country` 与 `[经度, 纬度]`。经度范围 −180 到 180，纬度 −90 到 90。不能把经纬度顺序颠倒。

## 航班字段

| 字段 | 类型与规则 |
| --- | --- |
| `id` | 非空字符串，整个档案中唯一 |
| `date` | 真实日历日期 `YYYY-MM-DD`，取当地出发日期 |
| `year` | 整数，与 `date` 的年份一致 |
| `airline`、`flight` | 非空运营商名称与航班编号 |
| `origin`、`destination` | 引用机场字典中不同的机场键 |
| `depart`、`arrive` | 当地机场时刻 `HH:mm`；未知时用 `--:--` |
| `arrivalDayOffset` | 整数，目的地到达日期相对出发日期的日历差；允许负值 |
| `durationMinutes`、`km` | 正整数，分别为经过时间和记录里程/大圆距离 |
| `timeSource` | `recorded` 或 `historical_schedule` |
| `travellerId` | 主要旅客 `B` 或 `Z`，保留兼容 |
| `travellerIds` | 一或两项、不重复，引用已声明旅客且包含主要旅客 |
| `source`、`status`、`confidence` | 非空来源与整理元数据；不在清单中显示 |

旧档案可以省略顶层 `travellers` 或逐航班 `travellerIds`：准备脚本默认旅客 B，并以主要旅客补全数组。`travellerId` 也可省略并默认 B。除此之外，缺失字段需在导入时补齐。

## 多位旅客与去重

档案文件可以包含两位旅客，共同航班在文件里只写一次，`travellerIds: ["B", "Z"]`。导入网站时，每位旅客的航班进各自的账户（`seed.json` 的 `traveller` 选人），共同航班两个账户各有一条；两个账户联动后，同飞页再把它们配成一次同飞。

在文件内，`date + flight + origin + destination` 组成航段去重键。两份导出中有同一航段时，合并旅客数组，不生成两条记录。若同日同编号同航段存在特殊情况，请先讨论模型再扩展契约。

## 时区与跨日

出发和到达时刻分别使用各机场当地时间。时长必须根据日期、时区与夏令时计算，不能直接相减两个钟面时间；跨越日期变更线可能得到 −1 的到达日差。未知时刻也仍需提供经过确认或合理来源的正整数时长，并注明 `timeSource`。

机场历史变更与机型参考不自动刷新。记录距离不等于实际航路长度；平均速度只是里程除以时长的派生表达。

## 可选机型与实际承运

```json
{
  "aircraft": {
    "model": "Airbus A350-900",
    "icao": "A359",
    "source": "typical",
    "body": "widebody"
  },
  "operation": {
    "airline": "实际承运商",
    "flight": "运营航班号",
    "source": "scheduled"
  }
}
```

机型 `source` 为 `operated`、`scheduled` 或 `typical`，`body` 为 `widebody` 或 `narrowbody`。`registration` 只有在实际执飞证据明确时才添加，且必须使用 `source: operated`。`operation` 记录代码共享的实际承运信息，其来源为 `operated` 或 `scheduled`。详细规则见[机型证据](AIRCRAFT_DATA.md)。

## 服务端存储与导出

导入的航班存在 SQLite 的 `flights` 表里，每条属于一个账户，字段与上面的航班字段一一对应（`seat`、`cabin` 为导入时读到的座位与舱位，`import_id` 记下来自哪一次导入，撤销时据此删除）。两人同飞时两个账户各有一条记录；同飞页按导入去重的“确定重复”规则配对（见[架构说明](ARCHITECTURE.md#联动与同飞)），对方的座位、舱位与机型不会出现在你的页面上。

账户表的 `share` 是公开主页的链接名，为空表示没有公开；`resets` 只存找回密码令牌的散列与过期时间。`arrivals` 按天、按来源名（链接里的 `ref`）累计访问数和注册数，不指向任何账户。数据库结构随 `db.ts` 里的迁移前进，迁移只增加列和表，回到旧版本时多出的部分被忽略。

天气缓存是数据目录里单独的 `weather.sqlite`，只有一张表 `days(place, day, data, settled, fetched)`：机场代码、当地日期、Open-Meteo 返回的那一天（每小时的温度、天气码、云量、降水、是否白天，加当天最高最低温和降水总量），`settled` 表示已是 7 天前的再分析数据、不再重取。它不含任何账户信息，删掉只会让天气重新向上游查询；备份可以略过它。

设置页的“导出全部航班”下载当前账户的全部航班：

```json
{
  "format": "flyprint",
  "version": 1,
  "exportedAt": "2026-11-18T08:00:00.000Z",
  "flights": [
    { "id": "f_…", "date": "2025-04-02", "flight": "CX255", "airline": "CX", "origin": "HKG", "destination": "LHR",
      "depart": "23:45", "arrive": "06:25", "arrivalDayOffset": 1, "durationMinutes": 880, "timeSource": "recorded",
      "km": 9631, "seat": "62K", "cabin": "economy" }
  ]
}
```

这个文件可以原样再导入；与已有记录重复的航班会被识别出来，不会重复写入。`timeSource` 为 `recorded`（有起降时刻）或 `estimated`（没有时刻，按距离估算飞行时长）。

## 表格与参考数据工具

表格请从导入页导入：常见的中英文列名直接识别，其他格式交给 Claude 读取。不要将表格或票据加入公开仓库。

公开参考快照生成工具：

- `scripts/build-basemap.mjs`：world-atlas 10m 陆地与国界 → `public/basemap/` 分块矢量瓦片（dev 与 build 前自动执行，`npm run basemap` 强制重建）。
- `scripts/audit-aircraft-evidence.mjs` 与 `scripts/apply-aircraft-evidence.mjs`：私有机型证据审计与应用。

这些工具各有输入假设。更新快照时保留来源与[素材归属](../NOTICE)，验证生成差异，不把私人研究证据作为公开样例。

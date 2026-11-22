# 机型数据与证据规则

航迹将单次航班的历史执飞事实与机型参考资料分开。机队分配看起来合理，不代表某架飞机确实执飞了某个航班。

## 来源等级

| 等级 | 需要的依据 | 展示含义 |
| --- | --- | --- |
| `operated` | 带日期的历史记录，匹配航班号、航线、机型及适用时的注册号 | 实际执飞记录 |
| `scheduled` | 历史时刻表识别计划机型，尚无匹配的实际执飞记录 | 计划机型 |
| `typical` | 航线或机队参考 | 仅作背景，不可声称为实际执飞 |

注册号只有在带日期的历史来源明确识别机身时才保存。缺失保持缺失，不从航司机队猜测。运行时校验会拒绝 `scheduled` 或 `typical` 下的注册号。

逐航班证据与私有档案一同保存在公开仓库之外。应用证据前，工具按 flight id、日期、航班号、出发与到达机场逐项核对；不能仅凭机型名称批量写入。

## 代码共享与实际运营航班

票面或营销航班号未必是提供飞机的运营航班。确认后的关系单独存为 `operation`：

- `airline` 与 `flight` 标识实际承运商和运营航班号。
- `source: operated` 需要该次旅程的带日期运营记录。
- `source: scheduled` 可以记录已确认的共享映射，但机身尚未确定。

只包含 operation 的证据条目有效：先保留已确认的代码共享事实，为后续研究提供正确的运营航班查询键，不假称已找到执飞机身。

## 机型规格来源

界面只展示机型名称、注册号与证据等级，不再展示机型级的尺寸、航程与性能数据。以下制造商资料保留作为核对机型名称与型号的参考：

- [Airbus A320 Family facts and figures](https://mediaassets.airbus.com/pm_38_914_914157-tlwvtuuhjj.pdf?fileName=airbus-a320-family-facts-and-figures-june-2026.pdf)
- [Airbus A320neo](https://www.aircraft.airbus.com/en/aircraft/a320-family/a320neo)
- [Airbus A330-300](https://www.aircraft.airbus.com/en/aircraft/a330/a330-300)
- [Airbus A330-200](https://www.aircraft.airbus.com/en/aircraft/a330/a330-200)
- [Airbus A350 Family](https://www.airbus.com/en/products-services/commercial-aircraft/passenger-aircraft/a350-family)
- [Boeing 737 MAX](https://www.boeing.com/commercial/737max)
- [Boeing 737 Next Generation](https://www.boeing.com/Commercial/737ng/737-next-generation-design-highlights)
- [Boeing 737 Classic airport-planning reference](https://www.boeing.com/content/dam/boeing/v2/airports/acaps/737CL_REV_E.pdf)
- [Boeing 777](https://www.boeing.com/commercial/777)
- [Boeing 787 Dreamliner](https://www.boeing.com/commercial/787)
- [Embraer E195 specification](https://www.embraercommercialaviation.com/wp-content/uploads/2017/02/Embraer_spec_195_web.pdf)


若将来重新展示机型规格，应明确标注为设计参考值：航程随重量、载荷、发动机、选装油箱与制造商修订变化，不能解释为某个航段实际达到的航程。

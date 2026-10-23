# 麦当劳 MCP 接入

官方地址：https://mcp.mcd.cn
官方说明：https://github.com/M-China/mcd-mcp-server
Token 申请入口：https://open.mcd.cn/mcp

使用 Streamable HTTP 与 Bearer Token。初始化后协商协议版本，保留 Mcp-Session-Id，支持 JSON / SSE。每次操作读取当前 tools/list 并检查调用参数；工具调用同时检查 MCP 错误和业务 success 标志。

| Tool | 用途 | 本项目调用 |
| --- | --- | --- |
| query-nearby-stores | 选择当前可用门店 | city、keyword、searchType=2、beType=1 |
| query-meals | 真实餐品变为声音素材 | storeCode、orderType=1、beType=1 |
| query-meal-detail | 核对套餐轮次和替换范围 | 上述字段 + code |
| calculate-price | 为当前门店重新核价 | items、roundList、needTableware=false 等 |

查询流程：连接 → 获取工具 schema → 城市/地标搜索 → 选择门店 → 菜单 → 一键匹配四声部（或逐项选择）→ 餐品详情与套餐选项 → 加入声部 → 核价。一键匹配只使用该店返回的菜单，并逐项读取真实详情；部分失败时不伪装为成功。

分享流程：真实餐品名称、商品编码、套餐选项和音乐参数 → 版本化乐谱 → 朋友无需账号试听 → 复制为独立改编 → 新链接。门店位置和凭据不进入分享。朋友要核价时使用自己的连接和门店；原报价不随乐谱传播。

菜单 currentPrice 是元的展示价格。calculate-price 的 price 单位在当前 outputSchema 中明确为分；只有确认单位且返回的商品编码和数量吻合后才展示总额。每次核价重新查询详情，验证套餐的选项、轮次数量和默认特调。套餐可能变更或下架，此时保留音乐并展示查询错误。

2026-10-23 的真实本地验收：通过正式 Token 初始化，发现全部四个工具；以测试地点「上海 / 人民广场」查询到 5 家门店，选中的测试门店返回 122 个菜单项。巨无霸与圆筒冰淇淋核价为 3050 分；中薯条、可乐和麦香鱼中套餐合计核价为 5650 分。这些仅是当次核价记录，不是固定报价，未创建订单。

请求仅发送至固定官方 endpoint，重定向不跟随，服务端仅允许上述四个工具。Token 不进入源码、日志、localStorage、分享链接或构建产物。页面采用同源 POST，Cookie 为 HttpOnly、SameSite=Strict、HTTPS 下 Secure。连接过期或主动断开后需重新连接。

协议适配与组合结构参考官方说明，并参照公开项目 jumpersun/meal-puzzle 的真实请求结构进行验证；没有复制其实现代码或素材。所有生产查询均由真实 MCP 返回，不使用测试 fixture 兜底。

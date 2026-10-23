---
name: mcbeat
description: 把麦当劳餐品编成可播放的四声部乐谱，生成 McBeat 链接，或帮助用户接着改编朋友的作品。适用于餐盘音乐、食物混音与 McBeat 分享，不用于一般点餐。
---

将用户选择的餐品映射为四条声部：主食为贝斯、小食为鼓组、饮料为旋律、甜品为和声。默认 Lo-fi、96 BPM；支持 pixel（8-bit）、76–124 BPM。每条声部有三个固定音色与节奏，全部使用 mcbeat-1 声音包。

网页入口：https://mcbeat-meal-mixes.woodsy-lime-5011.chatgpt.site

用户要用真实菜单时，先通过已连接的麦当劳 MCP 查询门店和当日菜单，再按需要调用餐品详情。当前 MVP 使用 query-nearby-stores、query-meals、query-meal-detail、calculate-price；参数必须遵循当前 tools/list 的 schema。未连接时引导用户在网页中连接；Token 申请入口为 https://open.mcd.cn/mcp 。不要修改用户的其他 MCP 配置。

从项目根目录运行下列命令，stdin 为 JSON，输出可试听和改编的链接：

```sh
node --experimental-transform-types scripts/create-mix.mjs < meal.json
```

输入示例：

```json
{"title":"午后咖啡时间","mode":"lofi","bpm":96,"foods":[{"name":"巨无霸","source":"demo","variant":0},{"name":"中薯条","source":"demo","variant":0},{"name":"美式咖啡","source":"demo","variant":1},{"name":"苹果派","source":"demo","variant":1}]}
```

真实结果使用 source=mcd 并包含查询返回的 code；套餐保留 selections（round、code、quantity）。缺少真实数据的声部用 source=demo 明确标记。不要编造实时价格；报价需要根据朋友当前选择的门店重新请求 calculate-price。分享内容只包含餐品、套餐选项与编曲，不包含 Token、账号、地址、订单或券信息。

把链接交给用户试听。朋友打开后点击「接着改编」即可得到独立版本，原乐谱保持不变。对朋友的链接优先使用网页改编功能，保留来源关联。当前版本不读取历史订单、不下单或付款。

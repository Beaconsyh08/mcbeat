# McBeat

今天这顿，有点节奏。把餐盘变成一首可分享、可改编的四声部音乐。

适合想玩一点音乐、和朋友交换创意的麦当劳用户。无需音乐基础；示例餐盘无需账号，真实餐品需要自己的麦当劳 MCP Token。

## 玩法

1. 点击「开始演奏」，使用 Lo-fi 或 8-bit 风格。
2. 换一道餐品或静音声部，新编曲在下一小节接上。
3. 点击「分享这顿」，将完整乐谱链接发给朋友。
4. 朋友直接试听，点击「接着改编」生成自己的版本，再次分享。原曲不会被覆盖。
5. 连接麦当劳后选择门店，点击「用真实菜单配满餐盘」一次换入真实餐品；也可以逐项选择、调整套餐选项，并重新核价。

公开网站：https://mcbeat-meal-mixes.woodsy-lime-5011.chatgpt.site

源码：https://github.com/Beaconsyh08/mcbeat

## 本地运行

需要 Node.js 22.13+。

```sh
npm ci
node -e 'const fs=require("node:fs"),c=require("node:crypto"); if(!fs.existsSync(".dev.vars"))fs.writeFileSync(".dev.vars","MCBEAT_SESSION_KEY="+c.randomBytes(32).toString("hex")+"\n",{mode:0o600})'
npm run dev -- --host 127.0.0.1 --port 4173
```

访问 http://127.0.0.1:4173/ 。生产构建使用 `npm run build`；`npm start` 运行构建后的 Worker。

真实 Token：打开 https://open.mcd.cn/mcp → 手机号登录 → 控制台 → 激活 → 同意服务协议 → 复制 Token，在 McBeat 连接框输入。不要放进源码或分享链接。

## 真实餐品与离线试玩

连接 MCP 只代表可以查询，不会把已有的离线餐品标成真实。选择门店后点击「用真实菜单配满餐盘」，会查询餐品详情、保留无糖偏好，并将成功取得的餐品标为「真实餐品」。找不到或查询失败的声部保留原内容并明确提示；菜单选择器也会提供该店的真实餐品。试听和改编仍然不要求登录。

## Skill 入口

将项目中的 `skills/mcbeat/SKILL.md` 作为智能体的技能入口使用，保留项目目录以便运行配套脚本。示例请求：「McBeat，把巨无霸、薯条、咖啡和苹果派做成 96 BPM 的 Lo-fi，给我一个朋友能接着改编的链接。」

`node --experimental-transform-types scripts/create-mix.mjs` 从 stdin 读取餐品 JSON，输出链接。它和网页共用同一份乐谱校验与编码。

## 实现

- React + Vinext，服务端运行在 Cloudflare Workers；标准 Web Audio 合成声音。
- 四声部、十二个编曲预设、两种风格；固定声音包与确定性噪声保证乐谱可复现。
- 版本化乐谱放在 URL fragment 中，打开时不发送给服务器。朋友无需账号和共享数据库。
- 本机草稿与唱片架使用 localStorage；更换设备不自动同步，请保存分享链接。
- MCP Token 仅通过 HTTPS 发送给本站服务端，再转发至固定官方地址；通过 AES-GCM 加密、HttpOnly Cookie 保留 1 小时会话。宿主机密钥作为运行时 secret 配置。
- 仅允许查询门店、菜单、详情和价格，未实现下单、支付或领券。

真实接入及验收记录见 [MCP_INTEGRATION.md](MCP_INTEGRATION.md)，测试与限制见 [VALIDATION.md](VALIDATION.md)。官方参赛声明保留原文。脱敏 MCP 配置见 [mcp-config.example.json](mcp-config.example.json)，`${MCD_MCP_TOKEN}` 需由所用客户端从本机环境变量注入；若客户端不支持插值，请在客户端的私密配置中填写，不要提交真实值。报名状态以官方 Issue 回复为准。

## 检查

```sh
npm test
npm run typecheck
npm run build
```

浏览器验收覆盖 1300 / 390 / 320px，播放、下一小节替换、保存恢复，以及三个独立会话的分享与改编。受无声的测试环境限制，自动化验证的是音频时钟和非零 DSP 信号。

McBeat 为独立创意作品，非麦当劳官方应用。餐品供应和价格以官方实时结果为准。

## 开源许可

McBeat 原创代码采用 MIT 许可，第三方依赖与官方内容保留各自权利，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
